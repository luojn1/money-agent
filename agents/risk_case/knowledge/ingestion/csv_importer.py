"""CSV ingestion for dynamic knowledge tables."""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path
from typing import Any

from knowledge.versioning import PRIMARY_KEYS, upsert_versioned_record


TABLE_FIELDS = {
    "risk_rules": [
        "rule_id", "rule_name", "category", "condition", "risk_level", "weight", "legal_basis",
        "question_to_ask", "created_at", "updated_at", "effective_date", "expiry_date", "source_url",
    ],
    "legal_regulations": [
        "regulation_id", "title", "issuing_body", "issue_date", "effective_date", "status",
        "summary", "full_text", "keywords", "source_url", "applicable_scenarios", "expiry_date",
    ],
    "cases": [
        "case_id", "title", "scenario", "risk_type", "description", "dispute_point",
        "user_loss", "handling_result", "rights_path", "source_url", "effective_date", "expiry_date",
    ],
    "financial_products": [
        "product_id", "product_name", "product_type", "institution", "typical_rate_range",
        "common_fees", "prepayment_policy", "overdue_policy", "effective_date", "expiry_date", "source_url",
    ],
    "market_rates": [
        "rate_id", "rate_type", "rate_value", "effective_date", "source", "expiry_date", "source_url",
    ],
    "financial_glossary": [
        "term_id", "term", "definition", "category", "example", "effective_date", "expiry_date", "source_url",
    ],
}

REQUIRED_FIELDS = {
    "risk_rules": ["rule_id", "rule_name", "category", "condition", "risk_level", "weight"],
    "legal_regulations": ["regulation_id", "title", "status", "summary", "full_text", "keywords"],
    "cases": ["case_id", "title", "scenario", "risk_type", "description", "dispute_point"],
    "financial_products": ["product_id", "product_name", "product_type"],
    "market_rates": ["rate_id", "rate_type", "rate_value", "effective_date"],
    "financial_glossary": ["term_id", "term", "definition", "category"],
}


def generate_template(table_name: str, output_path: Path, rows: list[dict[str, Any]] | None = None) -> Path:
    """Generate an operator-facing CSV template."""
    if table_name not in TABLE_FIELDS:
        raise ValueError(f"Unsupported table: {table_name}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=TABLE_FIELDS[table_name])
        writer.writeheader()
        for row in rows or []:
            writer.writerow({field: row.get(field, "") for field in TABLE_FIELDS[table_name]})
    return output_path


def validate_row(table_name: str, row: dict[str, Any]) -> list[str]:
    """Validate required fields and simple enum constraints."""
    errors = []
    for field in REQUIRED_FIELDS[table_name]:
        if not str(row.get(field, "")).strip():
            errors.append(f"{field} is required")
    if table_name == "risk_rules" and row.get("risk_level") not in {"high", "medium", "low"}:
        errors.append("risk_level must be high/medium/low")
    return errors


def import_csv(
    connection: sqlite3.Connection,
    table_name: str,
    csv_path: Path,
    changed_by: str = "csv_importer",
    require_review: bool = True,
) -> dict[str, Any]:
    """Import a CSV file incrementally into a knowledge table."""
    if table_name not in TABLE_FIELDS:
        raise ValueError(f"Unsupported table: {table_name}")
    imported = 0
    failed: list[dict[str, Any]] = []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for index, row in enumerate(reader, start=2):
            clean_row = {key: (value.strip() if isinstance(value, str) else value) for key, value in row.items()}
            errors = validate_row(table_name, clean_row)
            if errors:
                failed.append({"line": index, "errors": errors})
                continue
            clean_row["source"] = "csv"
            clean_row["review_status"] = "pending" if require_review else "approved"
            clean_row["is_active"] = 0 if require_review else 1
            upsert_versioned_record(connection, table_name, clean_row, changed_by=changed_by, require_review=require_review)
            imported += 1

    return {"table": table_name, "imported": imported, "failed": failed, "primaryKey": PRIMARY_KEYS[table_name]}
