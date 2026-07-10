# -*- coding: utf-8 -*-
"""Local B -> C -> D debug runner.

This tool is intentionally CLI-only. It provides fast regression checks without
starting the frontend or the integrated backend.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEBUG_ROOT = ROOT / "dev_debug"
FIXTURE_DIR = DEBUG_ROOT / "fixtures" / "contracts"
OUTPUT_ROOT = DEBUG_ROOT / "outputs"
LATEST_DIR = OUTPUT_ROOT / "latest"
BASELINE_DIR = DEBUG_ROOT / "baselines"
STATE_FILE = OUTPUT_ROOT / "last_signatures.json"
C_AGENT_DIR = ROOT / "agents" / "risk_case"
C_MAIN = C_AGENT_DIR / "main.py"
CST = timezone(timedelta(hours=8))


@dataclass(frozen=True)
class CaseConfig:
    case_id: str
    fixture: str
    contract_name: str
    institution: str
    product_type: str
    contract_type: str
    loan_amount: float
    actual_received_amount: float
    term_months: int
    installment_count: int
    monthly_payment: float
    nominal_rate: float | None
    real_annual_rate: float | None
    total_repayment: float | None
    total_interest: float | None
    additional_fees: float | None
    scenario_keywords: list[str]


CASES: dict[str, CaseConfig] = {
    "consumer_loan": CaseConfig(
        "consumer_loan",
        "consumer_loan.txt",
        "个人消费贷款合同",
        "安心消费金融有限公司",
        "个人消费贷款",
        "consumer_loan",
        10000,
        9500,
        12,
        12,
        940,
        12.8,
        23.4,
        11280,
        1280,
        500,
        ["消费贷", "服务费", "提前结清", "自动扣款"],
    ),
    "credit_card_installment": CaseConfig(
        "credit_card_installment",
        "credit_card_installment.txt",
        "信用卡账单分期协议",
        "示例银行信用卡中心",
        "信用卡分期",
        "credit_card_installment",
        12000,
        12000,
        12,
        12,
        1032,
        0,
        13.1,
        12384,
        0,
        864,
        ["信用卡", "账单分期", "分期手续费", "最低还款额", "循环利息"],
    ),
    "education_training_loan": CaseConfig(
        "education_training_loan",
        "education_training_loan.txt",
        "教育培训贷合同",
        "示例消费金融公司",
        "教育培训贷",
        "education_training_loan",
        19800,
        19800,
        12,
        12,
        1830,
        10.8,
        20.4,
        21960,
        2160,
        0,
        ["培训", "课程", "学费分期", "退课", "就业承诺"],
    ),
    "medical_beauty_installment": CaseConfig(
        "medical_beauty_installment",
        "medical_beauty_installment.txt",
        "医美分期服务贷款合同",
        "示例消费金融公司",
        "医美分期",
        "medical_beauty_installment",
        30000,
        28500,
        24,
        24,
        1550,
        14.5,
        24.8,
        37200,
        7200,
        1500,
        ["医美", "咨询服务费", "护理服务包", "保证保险", "退费"],
    ),
    "mortgage_loan": CaseConfig(
        "mortgage_loan",
        "mortgage_loan.txt",
        "个人住房按揭贷款合同",
        "示例商业银行",
        "个人住房按揭贷款",
        "mortgage_loan",
        800000,
        800000,
        360,
        360,
        4200,
        4.2,
        4.5,
        None,
        None,
        0,
        ["住房", "按揭", "LPR", "提前还款", "征信"],
    ),
}


CLAUSE_PATTERNS: list[tuple[str, str, list[str]]] = [
    ("fee", "interest_fee", ["服务费", "手续费", "咨询服务费", "分期手续费", "保证保险", "护理服务包"]),
    ("prepayment", "prepayment", ["提前还款", "提前结清"]),
    ("overdue", "overdue", ["逾期", "罚息", "违约金", "征信"]),
    ("repayment", "repayment", ["每月应还", "每期还款", "最低还款额", "循环利息", "还款方式"]),
    ("authorization", "authorization_privacy", ["自动扣款", "授权"]),
    ("refund", "repayment", ["退课", "退费", "取消项目", "贷款合同继续履行"]),
    ("binding", "other", ["绑定", "服务合同", "贷款合同", "专项用于支付"]),
    ("rate", "interest_fee", ["LPR", "利率", "真实年化", "年化"]),
]


def now_iso() -> str:
    return datetime.now(CST).replace(microsecond=0).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_for_signature(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: normalize_for_signature(val)
            for key, val in sorted(value.items())
            if key not in {"generatedAt", "databasePath", "databaseUpdatedAt", "inputPath", "outputPath", "traceOutputPath"}
        }
    if isinstance(value, list):
        return [normalize_for_signature(item) for item in value]
    return value


def stable_hash(value: Any) -> str:
    payload = json.dumps(normalize_for_signature(value), ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def sentence_fragments(text: str) -> list[str]:
    fragments = []
    for raw in re.split(r"[。；;\n]+", text):
        item = raw.strip()
        if item:
            fragments.append(item)
    return fragments


def build_clauses(text: str) -> list[dict[str, Any]]:
    clauses: list[dict[str, Any]] = []
    seen = set()
    for fragment in sentence_fragments(text):
        for clause_type, category, keywords in CLAUSE_PATTERNS:
            if any(keyword in fragment for keyword in keywords):
                key = (clause_type, fragment)
                if key in seen:
                    continue
                seen.add(key)
                index = len(clauses) + 1
                clauses.append(
                    {
                        "clauseId": f"clause_{index:03d}_{clause_type}",
                        "category": category,
                        "heading": clause_type,
                        "text": fragment,
                        "location": {
                            "page": 1,
                            "section": clause_type,
                            "paragraph": index,
                        },
                    }
                )
                break
    return clauses


def build_b_output(case: CaseConfig, text: str) -> dict[str, Any]:
    clauses = build_clauses(text)
    prepayment_rule = "；".join(clause["text"] for clause in clauses if clause["category"] == "prepayment") or None
    overdue_fee = "；".join(clause["text"] for clause in clauses if clause["category"] == "overdue") or None
    scenario_signals = [
        {
            "scenarioId": case.contract_type,
            "scenarioName": case.product_type,
            "confidence": 0.92 if case.contract_type not in {"unknown", "mortgage_loan"} else 0.76,
            "matchedKeywords": case.scenario_keywords,
            "source": "dev_debug.fixture",
        }
    ]
    return {
        "schemaVersion": "1.0.0",
        "taskId": f"debug_task_{case.case_id}",
        "contractId": f"debug_contract_{case.case_id}",
        "runId": f"run_contract_cost_debug_{case.case_id}",
        "agent": "contract_cost",
        "agentVersion": "debug-b-simulator-0.1.0",
        "status": "completed",
        "generatedAt": now_iso(),
        "inputRunIds": [],
        "data": {
            "contract": {
                "contractName": case.contract_name,
                "fileSha256": None,
                "pageCount": 1,
            },
            "contractSummary": {
                "institution": case.institution,
                "productType": case.product_type,
                "contractType": case.contract_type,
                "loanAmount": case.loan_amount,
                "actualReceivedAmount": case.actual_received_amount,
                "loanTermMonths": case.term_months,
                "installmentCount": case.installment_count,
                "monthlyPayment": case.monthly_payment,
                "repaymentMethod": "等额本息/按期还款",
                "nominalRate": case.nominal_rate,
                "prepaymentRule": prepayment_rule,
                "overdueFee": overdue_fee,
                "scenarioSignals": scenario_signals,
            },
            "clauses": clauses,
            "repaymentSchedule": [],
            "costAnalysis": {
                "totalRepayment": case.total_repayment,
                "totalInterest": case.total_interest,
                "additionalFees": case.additional_fees,
                "realAnnualRate": case.real_annual_rate,
                "calculationBasis": [
                    f"dev_debug 模拟 B 输出：productType={case.product_type}",
                    f"合同文本命中关键词：{'、'.join(case.scenario_keywords)}",
                ],
            },
        },
        "warnings": [],
        "errors": [],
    }


def infer_scenarios(b_output: dict[str, Any], c_trace: dict[str, Any]) -> list[str]:
    scenarios = []
    for signal in (b_output.get("data") or {}).get("contractSummary", {}).get("scenarioSignals") or []:
        scenario_id = signal.get("scenarioId")
        if scenario_id and scenario_id not in scenarios:
            scenarios.append(scenario_id)
    for signal in c_trace.get("scenarioSignals") or []:
        scenario_id = signal.get("scenarioId")
        if scenario_id and scenario_id not in scenarios:
            scenarios.append(scenario_id)
    return scenarios


def build_d_output(b_output: dict[str, Any], c_output: dict[str, Any], c_trace: dict[str, Any]) -> dict[str, Any]:
    risk_items = (c_output.get("data") or {}).get("riskItems") or []
    risk_ids = [item["id"] for item in risk_items if item.get("id")]
    recommendations = []

    high_ids = [item["id"] for item in risk_items if item.get("riskLevel") == "high"]
    if high_ids:
        recommendations.append(
            {
                "id": "action_overall_001",
                "priority": "must",
                "action": "在高风险问题得到机构书面澄清之前，暂缓签约。",
                "rationale": f"本合同存在 {len(high_ids)} 项高风险，需要先确认成本、费用和关键条款。",
                "timing": "before_signing",
                "relatedRiskIds": high_ids,
            }
        )

    for index, item in enumerate(risk_items, start=1):
        recommendations.append(
            {
                "id": f"action_{index:03d}_{item['id']}",
                "priority": {"high": "must", "medium": "should", "low": "optional"}.get(item.get("riskLevel"), "should"),
                "action": item.get("questionToAsk") or f"请机构解释风险项：{item.get('title', item['id'])}",
                "rationale": item.get("reason") or item.get("possibleConsequence") or "该风险需要进一步确认。",
                "timing": "before_signing",
                "relatedRiskIds": [item["id"]],
            }
        )

    scenarios = infer_scenarios(b_output, c_trace)
    if "credit_card_installment" in scenarios:
        recommendations.append(
            {
                "id": "action_scene_credit_card_installment_001",
                "priority": "must",
                "action": "信用卡分期建议：确认每期手续费、总手续费、真实年化，以及提前还款时剩余手续费是否退还。",
                "rationale": "信用卡分期常突出“免息”，但真实成本可能藏在手续费、最低还款和循环利息里。",
                "timing": "before_signing",
                "relatedRiskIds": risk_ids,
            }
        )
    if "education_training_loan" in scenarios:
        recommendations.append(
            {
                "id": "action_scene_education_training_loan_001",
                "priority": "must",
                "action": "教育培训贷建议：要求培训机构和贷款机构书面确认退课、停课或机构跑路时贷款如何处理。",
                "rationale": "教育培训贷最常见纠纷是服务停止后贷款仍需继续偿还。",
                "timing": "before_signing",
                "relatedRiskIds": risk_ids,
            }
        )

    question_list = []
    seen_questions = set()
    for item in risk_items:
        question = (item.get("questionToAsk") or "").strip()
        if question and question not in seen_questions:
            seen_questions.add(question)
            question_list.append(question)

    high_count = sum(1 for item in risk_items if item.get("riskLevel") == "high")
    medium_count = sum(1 for item in risk_items if item.get("riskLevel") == "medium")
    level = "high" if high_count else "verify" if medium_count else "low"
    summary = f"识别到 {len(risk_items)} 项风险，其中高风险 {high_count} 项、中风险 {medium_count} 项。"
    return {
        "schemaVersion": "1.0.0",
        "taskId": b_output["taskId"],
        "contractId": b_output["contractId"],
        "runId": f"run_recommendation_action_debug_{b_output['taskId']}",
        "agent": "recommendation_action",
        "agentVersion": "debug-d-simulator-0.1.0",
        "status": "completed" if c_output.get("status") == "completed" else "partial",
        "generatedAt": now_iso(),
        "inputRunIds": [b_output["runId"], c_output["runId"]],
        "data": {
            "overallResult": {"level": level, "summary": summary},
            "recommendations": recommendations,
            "questionList": question_list[:10],
            "disclaimer": "本地调试输出仅用于开发验证，不构成法律或金融建议。",
        },
        "warnings": list(c_output.get("warnings") or []),
        "errors": [],
    }


def run_c_agent(case_dir: Path, b_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    c_path = case_dir / "c-output.json"
    trace_path = case_dir / "c-trace.json"
    db_path = case_dir / "risk_case_debug.db"
    command = [
        sys.executable,
        str(C_MAIN),
        "--input",
        str(b_path),
        "--output",
        str(c_path),
        "--trace-output",
        str(trace_path),
        "--db",
        str(db_path),
    ]
    result = subprocess.run(command, cwd=str(C_AGENT_DIR), text=True, capture_output=True)
    if result.returncode != 0:
        error = {
            "stage": "C risk_case",
            "command": command,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        write_json(case_dir / "error.json", error)
        raise RuntimeError(f"C Agent failed for {case_dir.name}. See {case_dir / 'error.json'}")
    return read_json(c_path), read_json(trace_path)


def summary_signature(case_id: str, b_output: dict[str, Any], c_output: dict[str, Any], c_trace: dict[str, Any], d_output: dict[str, Any]) -> dict[str, Any]:
    risk_items = (c_output.get("data") or {}).get("riskItems") or []
    recommendations = (d_output.get("data") or {}).get("recommendations") or []
    hit_rules = c_trace.get("hitRules") or []
    summary = {
        "caseId": case_id,
        "b": {
            "status": b_output.get("status"),
            "productType": b_output.get("data", {}).get("contractSummary", {}).get("productType"),
            "contractType": b_output.get("data", {}).get("contractSummary", {}).get("contractType"),
            "clauseIds": [clause.get("clauseId") for clause in b_output.get("data", {}).get("clauses", [])],
            "realAnnualRate": b_output.get("data", {}).get("costAnalysis", {}).get("realAnnualRate"),
        },
        "c": {
            "status": c_output.get("status"),
            "riskSummary": (c_output.get("data") or {}).get("riskSummary"),
            "riskItems": [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "category": item.get("category"),
                    "riskLevel": item.get("riskLevel"),
                    "relatedClauseIds": item.get("relatedClauseIds"),
                }
                for item in risk_items
            ],
            "scenarioSignals": [
                {
                    "scenarioId": signal.get("scenarioId"),
                    "matchedClauseIds": signal.get("matchedClauseIds"),
                }
                for signal in c_trace.get("scenarioSignals") or []
            ],
            "hitRules": [
                {
                    "ruleId": rule.get("ruleId"),
                    "riskLevel": rule.get("riskLevel"),
                    "matchedClauseIds": rule.get("matchedClauseIds"),
                }
                for rule in hit_rules
            ],
        },
        "d": {
            "status": d_output.get("status"),
            "overallLevel": (d_output.get("data") or {}).get("overallResult", {}).get("level"),
            "recommendations": [
                {
                    "id": item.get("id"),
                    "priority": item.get("priority"),
                    "relatedRiskIds": item.get("relatedRiskIds"),
                }
                for item in recommendations
            ],
        },
    }
    summary["hash"] = stable_hash(summary)
    return summary


def run_case(case_id: str, update_state: bool = True) -> dict[str, Any]:
    if case_id not in CASES:
        raise KeyError(f"Unknown case: {case_id}. Available: {', '.join(CASES)}")
    case = CASES[case_id]
    text = (FIXTURE_DIR / case.fixture).read_text(encoding="utf-8")
    case_dir = LATEST_DIR / case_id
    if case_dir.exists():
        shutil.rmtree(case_dir)
    case_dir.mkdir(parents=True, exist_ok=True)

    (case_dir / "input-contract.txt").write_text(text, encoding="utf-8")
    b_output = build_b_output(case, text)
    b_path = case_dir / "b-output.json"
    write_json(b_path, b_output)

    c_output, c_trace = run_c_agent(case_dir, b_path)
    d_output = build_d_output(b_output, c_output, c_trace)
    write_json(case_dir / "d-output.json", d_output)

    signature = summary_signature(case_id, b_output, c_output, c_trace, d_output)
    write_json(case_dir / "summary.json", signature)
    if update_state:
        update_last_signatures({case_id: signature})
    return signature


def load_last_signatures() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    return read_json(STATE_FILE)


def update_last_signatures(new_signatures: dict[str, Any]) -> None:
    current = load_last_signatures()
    current.update(new_signatures)
    write_json(STATE_FILE, current)


def run_all() -> dict[str, Any]:
    previous = load_last_signatures()
    signatures: dict[str, Any] = {}
    failures: dict[str, str] = {}
    for case_id in CASES:
        print(f"[RUN] {case_id}")
        try:
            signatures[case_id] = run_case(case_id, update_state=False)
            print_case_line(case_id, signatures[case_id])
        except Exception as exc:
            failures[case_id] = str(exc)
            print(f"[FAIL] {case_id}: {exc}")
    update_last_signatures(signatures)
    report = build_diff_report(previous, signatures, failures)
    write_text(OUTPUT_ROOT / "diff-report.md", report)
    print(f"\n[REPORT] {OUTPUT_ROOT / 'diff-report.md'}")
    if failures:
        raise SystemExit(1)
    return signatures


def print_case_line(case_id: str, signature: dict[str, Any]) -> None:
    risk_summary = signature["c"].get("riskSummary") or {}
    rec_count = len(signature["d"].get("recommendations") or [])
    print(
        f"[OK] {case_id} | B={signature['b']['contractType']} | "
        f"C={signature['c']['status']} high={risk_summary.get('high', 0)} "
        f"medium={risk_summary.get('medium', 0)} low={risk_summary.get('low', 0)} | "
        f"D recommendations={rec_count} | hash={signature['hash']}"
    )


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def unified_json_diff(before: Any, after: Any, from_name: str, to_name: str) -> str:
    before_text = json.dumps(normalize_for_signature(before), ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    after_text = json.dumps(normalize_for_signature(after), ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    return "\n".join(difflib.unified_diff(before_text, after_text, fromfile=from_name, tofile=to_name, lineterm=""))


def build_diff_report(previous: dict[str, Any], current: dict[str, Any], failures: dict[str, str] | None = None) -> str:
    failures = failures or {}
    lines = [
        "# 本地开发调试差异报告",
        "",
        f"生成时间：{now_iso()}",
        "",
        "## 总览",
        "",
        "| 用例 | 状态 | 上次 hash | 本次 hash | 变化 |",
        "|---|---|---|---|---|",
    ]
    for case_id in CASES:
        if case_id in failures:
            lines.append(f"| {case_id} | 失败 | - | - | {failures[case_id]} |")
            continue
        old_hash = (previous.get(case_id) or {}).get("hash", "-")
        if case_id not in current:
            lines.append(f"| {case_id} | 未运行 | {old_hash} | - | 当前 latest 中没有该用例结果 |")
            continue
        new_hash = current[case_id].get("hash", "-")
        changed = "首次运行" if old_hash == "-" else "有变化" if old_hash != new_hash else "无变化"
        lines.append(f"| {case_id} | 通过 | {old_hash} | {new_hash} | {changed} |")

    lines.extend(["", "## 详细差异", ""])
    for case_id, signature in current.items():
        if previous.get(case_id) and previous[case_id].get("hash") != signature.get("hash"):
            lines.append(f"### {case_id}")
            lines.append("")
            lines.append("```diff")
            lines.append(unified_json_diff(previous[case_id], signature, f"previous/{case_id}", f"current/{case_id}"))
            lines.append("```")
            lines.append("")
    if not any(previous.get(case_id) and previous[case_id].get("hash") != current.get(case_id, {}).get("hash") for case_id in current):
        lines.append("没有发现与上次运行不同的稳定签名。")
    return "\n".join(lines) + "\n"


def load_latest_signatures() -> dict[str, Any]:
    signatures = {}
    for case_id in CASES:
        path = LATEST_DIR / case_id / "summary.json"
        if path.exists():
            signatures[case_id] = read_json(path)
    return signatures


def diff_latest() -> None:
    previous = load_last_signatures()
    current = load_latest_signatures()
    report = build_diff_report(previous, current)
    write_text(OUTPUT_ROOT / "diff-report.md", report)
    print(report)


def accept_baseline() -> None:
    signatures = load_latest_signatures()
    if not signatures:
        raise RuntimeError("No latest results. Run `run-all` first.")
    if BASELINE_DIR.exists():
        shutil.rmtree(BASELINE_DIR)
    for case_id in signatures:
        src = LATEST_DIR / case_id
        dst = BASELINE_DIR / case_id
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("*.db", "*.sqlite", "*.sqlite3"))
    write_json(BASELINE_DIR / "baseline-signatures.json", signatures)
    print(f"[BASELINE] accepted {len(signatures)} cases at {BASELINE_DIR}")


def load_baseline_signatures() -> dict[str, Any]:
    path = BASELINE_DIR / "baseline-signatures.json"
    if not path.exists():
        return {}
    return read_json(path)


def kb_file_fingerprints() -> dict[str, str]:
    seed_root = C_AGENT_DIR / "knowledge" / "seed_data"
    files = {}
    if not seed_root.exists():
        return files
    for path in sorted(seed_root.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".json", ".csv", ".sql"}:
            files[str(path.relative_to(C_AGENT_DIR))] = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return files


def kb_impact() -> None:
    baseline = load_baseline_signatures()
    if not baseline:
        raise RuntimeError("No baseline found. Run `run-all`, then `accept-baseline` first.")
    current = run_all()
    affected = []
    for case_id, current_sig in current.items():
        old_sig = baseline.get(case_id)
        if not old_sig or old_sig.get("hash") != current_sig.get("hash"):
            affected.append(case_id)

    lines = [
        "# 知识库变更影响报告",
        "",
        f"生成时间：{now_iso()}",
        "",
        "## 受影响用例",
        "",
    ]
    if affected:
        for case_id in affected:
            lines.append(f"- {case_id}")
    else:
        lines.append("- 无。当前输出与基线稳定签名一致。")
    lines.extend(["", "## 当前知识库文件指纹", ""])
    for path, digest in kb_file_fingerprints().items():
        lines.append(f"- `{path}`: `{digest}`")
    report = "\n".join(lines) + "\n"
    write_text(OUTPUT_ROOT / "kb-impact-report.md", report)
    print(report)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local B -> C -> D debug runner.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run-all", help="Run all preset contracts and compare with previous run.")
    run_one = sub.add_parser("run", help="Run one preset contract.")
    run_one.add_argument("--case", required=True, choices=sorted(CASES))
    sub.add_parser("diff", help="Diff latest results against last recorded signatures.")
    sub.add_parser("accept-baseline", help="Accept latest results as baseline.")
    sub.add_parser("kb-impact", help="Run all cases and compare latest results against accepted baseline.")
    sub.add_parser("list", help="List preset cases.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "run-all":
        run_all()
    elif args.command == "run":
        signature = run_case(args.case)
        print_case_line(args.case, signature)
        print(f"[OUTPUT] {LATEST_DIR / args.case}")
    elif args.command == "diff":
        diff_latest()
    elif args.command == "accept-baseline":
        accept_baseline()
    elif args.command == "kb-impact":
        kb_impact()
    elif args.command == "list":
        for case_id, config in CASES.items():
            print(f"{case_id}: {config.contract_name}")


if __name__ == "__main__":
    main()
