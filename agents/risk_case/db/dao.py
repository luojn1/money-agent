"""Data access layer for rules, RAG knowledge, and Agent outputs."""

from __future__ import annotations

import json
import sqlite3
from typing import Any


KNOWLEDGE_TABLES = {
    "risk_rules",
    "legal_regulations",
    "cases",
    "contract_clause_templates",
    "financial_products",
    "market_rates",
    "financial_glossary",
}


def assert_known_table(table_name: str) -> str:
    """Return a safe table name after whitelist validation."""
    if table_name not in KNOWLEDGE_TABLES:
        raise ValueError(f"Unsupported knowledge table: {table_name}")
    return table_name


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    """Convert SQLite rows to plain dictionaries."""
    return [dict(row) for row in rows]


def active_filter() -> str:
    return "(is_active = 1 OR is_active IS NULL) AND (review_status = 'approved' OR review_status IS NULL)"


def load_risk_rules(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(f"SELECT * FROM risk_rules WHERE {active_filter()} ORDER BY rule_id").fetchall()
    rules = rows_to_dicts(rows)
    for rule in rules:
        rule["condition"] = json.loads(rule["condition"])
    return rules


def load_regulations(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(connection.execute(f"SELECT * FROM legal_regulations WHERE {active_filter()}").fetchall())


def load_cases(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(connection.execute(f"SELECT * FROM cases WHERE {active_filter()}").fetchall())


def load_financial_products(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(connection.execute(f"SELECT * FROM financial_products WHERE {active_filter()}").fetchall())


def load_market_rates(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(connection.execute(f"SELECT * FROM market_rates WHERE {active_filter()} ORDER BY effective_date DESC").fetchall())


def load_financial_glossary(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(connection.execute(f"SELECT * FROM financial_glossary WHERE {active_filter()}").fetchall())


def pending_review_counts(connection: sqlite3.Connection) -> dict[str, int]:
    tables = ["risk_rules", "legal_regulations", "cases", "contract_clause_templates", "financial_products", "market_rates", "financial_glossary"]
    return {
        table: connection.execute(f"SELECT COUNT(*) FROM {assert_known_table(table)} WHERE review_status = 'pending'").fetchone()[0]
        for table in tables
    }


def save_risk_case_output(
    connection: sqlite3.Connection,
    output: dict[str, Any],
    risk_score: int,
) -> None:
    """Persist the C Agent output plus normalized risk item tables."""
    data = output["data"] or {"riskItems": []}
    existing_items = connection.execute("SELECT id FROM risk_items WHERE run_id = ?", (output["runId"],)).fetchall()
    existing_item_ids = [row["id"] for row in existing_items]
    for item_id in existing_item_ids:
        connection.execute("DELETE FROM risk_evidence WHERE risk_item_id = ?", (item_id,))
        connection.execute("DELETE FROM risk_matched_cases WHERE risk_item_id = ?", (item_id,))
    connection.execute("DELETE FROM risk_items WHERE run_id = ?", (output["runId"],))

    connection.execute(
        """
        INSERT OR REPLACE INTO risk_case_outputs
        (run_id, task_id, contract_id, input_run_id, status, risk_score, output_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            output["runId"],
            output["taskId"],
            output["contractId"],
            output["inputRunIds"][0] if output["inputRunIds"] else "",
            output["status"],
            risk_score,
            json.dumps(output, ensure_ascii=False, indent=2),
            output["generatedAt"],
        ),
    )

    for item in data["riskItems"]:
        connection.execute(
            """
            INSERT OR REPLACE INTO risk_items
            (id, run_id, title, category, risk_level, confidence, clause_text, clause_location,
             related_clause_ids, reason, possible_consequence, question_to_ask)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                output["runId"],
                item["title"],
                item["category"],
                item["riskLevel"],
                item["confidence"],
                item["clauseText"],
                item["clauseLocation"],
                json.dumps(item["relatedClauseIds"], ensure_ascii=False),
                item["reason"],
                item["possibleConsequence"],
                item["questionToAsk"],
            ),
        )
        for evidence in item["evidence"]:
            connection.execute(
                """
                INSERT OR REPLACE INTO risk_evidence
                (evidence_id, risk_item_id, clause_id, quote, location_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    evidence["evidenceId"],
                    item["id"],
                    evidence["clauseId"],
                    evidence["quote"],
                    json.dumps(evidence["location"], ensure_ascii=False),
                ),
            )
        for matched_case in item["matchedCases"]:
            connection.execute(
                """
                INSERT INTO risk_matched_cases
                (risk_item_id, case_id, title, similarity, conclusion, source_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    matched_case["caseId"],
                    matched_case["title"],
                    matched_case["similarity"],
                    matched_case["conclusion"],
                    matched_case["sourceUrl"],
                ),
            )
