"""Main entry for the risk_case Agent."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from db.connection import get_connection
from db.dao import load_risk_rules, pending_review_counts, save_risk_case_output
from knowledge.init_db import initialize_database
from knowledge.scheduler import schedule_jobs
from knowledge.versioning import expire_due_records
from rag.retriever import KnowledgeRetriever
from rules.engine import RuleHit, level_from_score, possible_consequence, question_to_ask, run_rule_engine


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT_DIR / "examples" / "b-contract-cost-output.json"
DEFAULT_OUTPUT = ROOT_DIR / "outputs" / "c-risk-case-output.json"
DEFAULT_TRACE_OUTPUT = ROOT_DIR / "outputs" / "c-risk-case-output.trace.json"
STANDARD_RISK_ITEM_FIELDS = {
    "id",
    "title",
    "category",
    "riskLevel",
    "confidence",
    "clauseText",
    "clauseLocation",
    "relatedClauseIds",
    "evidence",
    "reason",
    "possibleConsequence",
    "matchedCases",
    "questionToAsk",
}


class AgentInputError(ValueError):
    """Raised when B Agent output does not satisfy the minimum C input contract."""


def now_iso() -> str:
    """Return ISO 8601 datetime with +08:00 timezone."""
    return datetime.now(timezone(timedelta(hours=8))).replace(microsecond=0).isoformat()


def clause_location_text(clause: dict[str, Any] | None) -> str | None:
    if not clause:
        return None
    location = clause.get("location") or {}
    return location.get("section") or clause.get("heading")


def evidence_from_clauses(item_index: int, clauses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build evidence objects that directly reference B clause IDs."""
    evidence = []
    for index, clause in enumerate(clauses, start=1):
        clause_id = clause.get("clauseId")
        if not clause_id:
            continue
        evidence.append(
            {
                "evidenceId": f"evidence_{item_index:03d}_{index:02d}",
                "clauseId": clause_id,
                "quote": clause.get("text") or "",
                "location": clause.get("location") or {},
                "evidenceStart": clause.get("evidenceStart"),
                "evidenceEnd": clause.get("evidenceEnd"),
            }
        )
    return evidence


def title_for_hit(hit: RuleHit) -> str:
    return hit.rule["rule_name"]


def confidence_for_hit(hit: RuleHit) -> float:
    base = 0.72
    if hit.matched_clauses:
        base += 0.12
    if hit.regulations:
        base += 0.08
    if hit.cases:
        base += 0.05
    return min(round(base, 2), 0.97)


def build_risk_item(hit: RuleHit, item_index: int) -> dict[str, Any] | None:
    """Convert one rule hit into A protocol RiskItemV1."""
    clauses = [clause for clause in hit.matched_clauses if clause.get("clauseId")]
    if not clauses:
        return None
    first_clause = clauses[0]
    related_clause_ids = [clause["clauseId"] for clause in clauses if clause.get("clauseId")]
    clause_text = first_clause.get("text", "")
    regulations_text = "；".join(reg["summary"] for reg in hit.regulations[:2])
    reason_parts = [hit.reason]
    if regulations_text:
        reason_parts.append(f"法规摘要：{regulations_text}")
    if hit.market_rates:
        latest_lpr = hit.market_rates[0]
        reason_parts.append(f"市场基准参考：{latest_lpr['rateType']} {latest_lpr['rateValue']}%（{latest_lpr['effectiveDate']}）。")

    seen_case_ids = set()
    matched_cases = []
    for case in hit.cases:
        case_id = case.get("caseId")
        if not case_id or case_id in seen_case_ids:
            continue
        seen_case_ids.add(case_id)
        matched_cases.append(case)

    return {
        "id": f"risk_{item_index:03d}_{hit.rule['rule_id'].lower()}",
        "title": title_for_hit(hit),
        "category": hit.rule["category"],
        "riskLevel": hit.rule["risk_level"],
        "confidence": confidence_for_hit(hit),
        "clauseText": clause_text,
        "clauseLocation": clause_location_text(first_clause),
        "relatedClauseIds": related_clause_ids,
        "evidence": evidence_from_clauses(item_index, clauses),
        "reason": " ".join(reason_parts),
        "possibleConsequence": possible_consequence(hit.rule),
        "matchedCases": matched_cases,
        "legalReferences": hit.regulations,
        "productReferences": hit.products,
        "marketReferences": hit.market_rates,
        "glossaryTerms": hit.glossary_terms,
        "ruleEvidence": {
            "ruleId": hit.rule["rule_id"],
            "ruleName": hit.rule["rule_name"],
            "condition": hit.rule["condition"],
            "legalBasis": hit.rule.get("legal_basis"),
            "weight": hit.rule["weight"],
        },
        "questionToAsk": question_to_ask(hit.rule),
    }


def risk_dedupe_key(item: dict[str, Any]) -> tuple[Any, ...]:
    first_evidence = (item.get("evidence") or [{}])[0]
    return (
        item.get("category"),
        item.get("title"),
        tuple(item.get("relatedClauseIds") or []),
        first_evidence.get("evidenceStart"),
        first_evidence.get("evidenceEnd"),
    )


def deduplicate_risk_items(risk_items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen = set()
    unique_items = []
    for item in risk_items:
        key = risk_dedupe_key(item)
        if key in seen:
            continue
        seen.add(key)
        unique_items.append(item)
    return unique_items, len(risk_items) - len(unique_items)


def summarize_risks(risk_items: list[dict[str, Any]]) -> dict[str, int]:
    """Count risk items by level exactly as required by A protocol."""
    summary = {"high": 0, "medium": 0, "low": 0}
    for item in risk_items:
        summary[item["riskLevel"]] += 1
    return summary


def validate_relationships(output: dict[str, Any]) -> list[dict[str, str | None]]:
    """Validate C protocol relationships before returning output."""
    warnings = []
    data = output.get("data") or {}
    for item in data.get("riskItems", []):
        related = set(item["relatedClauseIds"])
        if not related:
            warnings.append(
                {
                    "code": "missing_related_clause",
                    "message": f"Risk item {item['id']} has no related clause ids.",
                    "fieldPath": f"data.riskItems.{item['id']}.relatedClauseIds",
                }
            )
        for evidence in item["evidence"]:
            if evidence["clauseId"] not in related:
                warnings.append(
                    {
                        "code": "evidence_clause_not_related",
                        "message": f"Evidence {evidence['evidenceId']} references a clause not in relatedClauseIds.",
                        "fieldPath": f"data.riskItems.{item['id']}.evidence",
                    }
                )
    return warnings


def is_completion_blocking_warning(warning: dict[str, Any]) -> bool:
    code = warning.get("code")
    if code in {"missing_related_clause", "evidence_clause_not_related", "missing_cost_field"}:
        return True
    if code == "missing_contract_field":
        text = f"{warning.get('fieldPath') or ''} {warning.get('message') or ''}"
        critical_fields = (
            "loanAmount",
            "actualReceivedAmount",
            "termMonths",
            "installmentCount",
            "repaymentMethod",
            "monthlyPayment",
            "nominalRate",
        )
        return any(field in text for field in critical_fields)
    return False


def has_completion_blocking_warning(warnings: list[dict[str, Any]]) -> bool:
    return any(is_completion_blocking_warning(warning) for warning in warnings)


def build_output(
    b_output: dict[str, Any],
    risk_items: list[dict[str, Any]],
    knowledge_usage: dict[str, Any] | None = None,
    include_extensions: bool = False,
    status: str = "completed",
    inherited_warnings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build RiskCaseOutput according to A protocol."""
    output_risk_items = risk_items if include_extensions else [
        {key: item[key] for key in STANDARD_RISK_ITEM_FIELDS if key in item}
        for item in risk_items
    ]
    data = {
        "riskItems": output_risk_items,
        "riskSummary": summarize_risks(output_risk_items),
    }
    if include_extensions:
        data["knowledgeUsage"] = knowledge_usage or {}
    output = {
        "schemaVersion": "1.0.0",
        "taskId": b_output["taskId"],
        "contractId": b_output["contractId"],
        "runId": f"run_risk_case_{b_output['taskId']}",
        "agent": "risk_case",
        "agentVersion": "c-0.2.0-dynamic-kb",
        "status": status,
        "generatedAt": now_iso(),
        "inputRunIds": [b_output["runId"]],
        "data": data,
        "warnings": list(inherited_warnings or []),
        "errors": [],
    }
    output["warnings"].extend(validate_relationships(output))
    if has_completion_blocking_warning(output["warnings"]) and output["status"] == "completed":
        output["status"] = "partial"
    return output


def build_passthrough_output(b_output: dict[str, Any], status: str, message: str | None = None) -> dict[str, Any]:
    """Build a C output for upstream failed/partial inputs that cannot be analyzed."""
    errors = list(b_output.get("errors") or [])
    if message and not errors:
        errors.append({"code": "upstream_status", "message": message, "fieldPath": "status"})
    return {
        "schemaVersion": b_output.get("schemaVersion", "1.0.0"),
        "taskId": b_output.get("taskId"),
        "contractId": b_output.get("contractId"),
        "runId": f"run_risk_case_{b_output.get('taskId', 'unknown')}",
        "agent": "risk_case",
        "agentVersion": "c-0.2.0-dynamic-kb",
        "status": status,
        "generatedAt": now_iso(),
        "inputRunIds": [b_output["runId"]] if b_output.get("runId") else [],
        "data": None,
        "warnings": list(b_output.get("warnings") or []),
        "errors": errors,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def default_trace_path(output_path: Path) -> Path:
    return output_path.with_suffix(".trace.json")


def validate_b_output(b_output: dict[str, Any]) -> None:
    """Validate the minimum fields C needs from B contract_cost output."""
    required_top_level = ["taskId", "contractId", "runId", "data"]
    missing = [field for field in required_top_level if field not in b_output]
    if missing:
        raise AgentInputError(f"B 输出缺少顶层字段：{', '.join(missing)}")
    data = b_output.get("data")
    if not isinstance(data, dict):
        raise AgentInputError("B 输出 data 必须是对象。")
    if not isinstance(data.get("contractSummary"), dict):
        raise AgentInputError("B 输出 data.contractSummary 必须是对象。")
    if not isinstance(data.get("costAnalysis"), dict):
        raise AgentInputError("B 输出 data.costAnalysis 必须是对象。")
    if not isinstance(data.get("clauses"), list):
        raise AgentInputError("B 输出 data.clauses 必须是数组。")


def run_agent(
    input_path: Path,
    output_path: Path,
    db_path: Path | None = None,
    start_scheduler: bool = False,
    trace_output_path: Path | None = None,
    include_extensions: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run risk_case Agent from B output JSON and persist the result."""
    b_output = json.loads(input_path.read_text(encoding="utf-8-sig"))

    trace_path = trace_output_path or default_trace_path(output_path)
    upstream_status = b_output.get("status", "completed")
    if upstream_status == "failed":
        output = build_passthrough_output(b_output, "failed", "B Agent 返回 failed，C Agent 不执行风险识别。")
        trace = {
            "upstreamStatus": "failed",
            "message": "B Agent failed; C Agent returned failed with data=null.",
            "inputPath": str(input_path),
            "outputPath": str(output_path),
        }
        write_json(output_path, output)
        write_json(trace_path, trace)
        return output, trace

    validate_b_output(b_output)
    scheduler_info: Any = None

    initialize_database(db_path or ROOT_DIR / "risk_case_agent.db")
    with get_connection(db_path) as connection:
        expired_count = expire_due_records(connection, changed_by="agent-startup")
        pending_counts = pending_review_counts(connection)
        if start_scheduler:
            scheduler_info = schedule_jobs(connection)
            if hasattr(scheduler_info, "start"):
                scheduler_info.start()
                scheduler_info = "started"

        rules = load_risk_rules(connection)
        retriever = KnowledgeRetriever(connection)
        hits, risk_score, skipped_rules = run_rule_engine(b_output, rules, retriever)
        risk_items = []
        unlinked_hit_warnings = []
        for index, hit in enumerate(hits, start=1):
            item = build_risk_item(hit, index)
            if item is None:
                unlinked_hit_warnings.append(
                    {
                        "code": "missing_related_clause",
                        "message": f"规则 {hit.rule['rule_id']} 命中，但未能在 B 输出的 clauses 中找到带 clauseId 的真实条款，已跳过该风险项。",
                        "fieldPath": f"rules.{hit.rule['rule_id']}",
                    }
                )
                continue
            risk_items.append(item)
        risk_items, duplicate_risk_count = deduplicate_risk_items(risk_items)
        unique_regulations = {reg["regulationId"] for hit in hits for reg in hit.regulations}
        unique_cases = {case["caseId"] for hit in hits for case in hit.cases}
        unique_products = {product["productId"] for hit in hits for product in hit.products}
        unique_terms = {term["termId"] for hit in hits for term in hit.glossary_terms}
        latest_rate_date = None
        market_dates = [rate["effectiveDate"] for hit in hits for rate in hit.market_rates]
        if market_dates:
            latest_rate_date = max(market_dates)
        knowledge_usage = {
            "riskRulesLoaded": len(rules),
            "riskRulesHit": len(hits),
            "regulationsRetrieved": len(unique_regulations),
            "casesRetrieved": len(unique_cases),
            "productsRetrieved": len(unique_products),
            "marketRatesRetrieved": len({rate["rateId"] for hit in hits for rate in hit.market_rates}),
            "glossaryTermsRetrieved": len(unique_terms),
            "knowledgeSource": "local_sqlite_database",
            "databasePath": str(db_path or ROOT_DIR / "risk_case_agent.db"),
            "databaseUpdatedAt": latest_rate_date or now_iso(),
        }
        inherited_warnings = list(b_output.get("warnings") or [])
        inherited_warnings.extend(unlinked_hit_warnings)
        inherited_warnings.extend(
            {
                "code": "missing_related_clause",
                "message": skipped.reason,
                "fieldPath": f"rules.{skipped.rule_id}",
            }
            for skipped in skipped_rules
        )
        output_status = "partial" if upstream_status == "partial" or has_completion_blocking_warning(inherited_warnings) else "completed"
        output = build_output(
            b_output,
            risk_items,
            knowledge_usage,
            include_extensions=include_extensions,
            status=output_status,
            inherited_warnings=inherited_warnings,
        )
        save_risk_case_output(connection, output, risk_score)
        connection.commit()

    trace = {
        "inputPath": str(input_path),
        "upstreamStatus": upstream_status,
        "riskScore": risk_score,
        "overallRiskLevelByScore": level_from_score(risk_score),
        "expiredKnowledgeRecords": expired_count,
        "pendingReviewCounts": pending_counts,
        "scheduler": scheduler_info,
        "activeRuleCount": len(rules),
        "riskItemsBeforeDedup": len(hits) - len(unlinked_hit_warnings),
        "riskItemsAfterDedup": len(risk_items),
        "duplicateRiskItemsRemoved": duplicate_risk_count,
        "retrievalResults": [
            {
                "ruleId": hit.rule["rule_id"],
                "caseCountBeforeDedup": len(hit.cases),
                "caseCountAfterDedup": len({case.get("caseId") for case in hit.cases if case.get("caseId")}),
                "cases": hit.cases,
                "regulations": hit.regulations,
                "marketRates": hit.market_rates,
            }
            for hit in hits
        ],
        "hitRules": [
            {
                "ruleId": hit.rule["rule_id"],
                "ruleName": hit.rule["rule_name"],
                "category": hit.rule["category"],
                "riskLevel": hit.rule["risk_level"],
                "weight": hit.rule["weight"],
                "matchedClauseIds": [clause["clauseId"] for clause in hit.matched_clauses],
                "regulations": [reg["title"] for reg in hit.regulations],
                "cases": [case["title"] for case in hit.cases],
                "products": [product["productName"] for product in hit.products],
                "marketRates": [f"{rate['rateType']}={rate['rateValue']}@{rate['effectiveDate']}" for rate in hit.market_rates],
                "glossaryTerms": [term["term"] for term in hit.glossary_terms],
            }
            for hit in hits
        ],
        "skippedRules": [
            {
                "ruleId": skipped.rule_id,
                "ruleName": skipped.rule_name,
                "category": skipped.category,
                "reason": skipped.reason,
            }
            for skipped in skipped_rules
        ],
        "knowledgeUsage": knowledge_usage,
        "outputPath": str(output_path),
        "traceOutputPath": str(trace_path),
    }
    write_json(output_path, output)
    write_json(trace_path, trace)
    return output, trace


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the risk_case Agent.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Path to B contract_cost output JSON.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Path for C risk_case output JSON.")
    parser.add_argument("--db", default=str(ROOT_DIR / "risk_case_agent.db"), help="SQLite database path.")
    parser.add_argument("--start-scheduler", action="store_true", help="Start background knowledge ingestion scheduler.")
    parser.add_argument("--trace-output", default=None, help="Path for trace/debug JSON. Defaults to <output>.trace.json.")
    parser.add_argument("--trace", action="store_true", help="Print trace JSON to stdout after writing the trace file.")
    parser.add_argument("--verbose", action="store_true", help="Alias of --trace.")
    return parser.parse_args()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = parse_args()
    _, trace = run_agent(
        Path(args.input),
        Path(args.output),
        Path(args.db),
        start_scheduler=args.start_scheduler,
        trace_output_path=Path(args.trace_output) if args.trace_output else None,
    )
    if args.trace or args.verbose:
        print(json.dumps(trace, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
