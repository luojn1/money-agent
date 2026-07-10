# -*- coding: utf-8 -*-
"""Evaluate rule matching and RAG retrieval for the risk_case Agent.

The evaluator is intentionally offline and deterministic. It builds B-style
JSON inputs from labeled fixtures, runs the real C Agent, then compares the
Agent trace against the human-labeled expected rules and retrieval keywords.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EVAL_ROOT = ROOT / "evaluation"
DATASET_PATH = EVAL_ROOT / "evaluation_dataset.json"
OUTPUT_ROOT = EVAL_ROOT / "outputs"
REPORT_PATH = EVAL_ROOT / "EVALUATION_REPORT.md"
VISUAL_DATA_PATH = EVAL_ROOT / "visualization" / "evaluation-results.json"
C_AGENT_DIR = ROOT / "agents" / "risk_case"
C_MAIN = C_AGENT_DIR / "main.py"
CST = timezone(timedelta(hours=8))


@dataclass
class CaseResult:
    case_id: str
    scenario: str
    title: str
    expected_rule_ids: list[str]
    hit_rule_ids: list[str]
    expected_overall: str
    agent_overall: str
    rule_precision: float
    rule_recall: float
    rag_regulation_accuracy: float
    rag_case_accuracy: float
    overall_match: bool
    missed_rules: list[str]
    unexpected_rules: list[str]
    retrieved_regulations: list[str]
    retrieved_cases: list[str]
    manual_review_sampled: bool
    manual_review_passed: bool
    c_output_path: str
    c_trace_path: str


def now_iso() -> str:
    return datetime.now(CST).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def normalize_clause(case_id: str, index: int, clause: dict[str, Any]) -> dict[str, Any]:
    item = dict(clause)
    item.setdefault("clauseId", f"{case_id}_clause_{index:03d}")
    item.setdefault("location", {"page": 1, "section": item.get("heading") or item.get("category") or "条款", "paragraph": index})
    return item


def build_b_output(case: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal B output that satisfies C Agent input requirements."""
    case_id = case["caseId"]
    clauses = [normalize_clause(case_id, index, clause) for index, clause in enumerate(case["clauses"], start=1)]
    summary = dict(case["contractSummary"])
    summary.setdefault("institution", "评测模拟机构")
    summary.setdefault("contractName", case["title"])
    summary.setdefault("loanAmount", 0)
    summary.setdefault("actualReceivedAmount", summary.get("loanAmount", 0))
    cost = dict(case["costAnalysis"])
    return {
        "schemaVersion": "1.0.0",
        "taskId": f"eval_task_{case_id}",
        "contractId": f"eval_contract_{case_id}",
        "runId": f"run_contract_cost_eval_{case_id}",
        "agent": "contract_cost",
        "agentVersion": "eval-fixture-1.0",
        "status": "completed",
        "generatedAt": now_iso(),
        "inputRunIds": [],
        "data": {
            "contractSummary": summary,
            "costAnalysis": cost,
            "clauses": clauses,
        },
        "warnings": [],
        "errors": [],
    }


def run_c_agent(case_dir: Path, b_output: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    b_path = case_dir / "b-output.json"
    c_path = case_dir / "c-output.json"
    trace_path = case_dir / "c-trace.json"
    db_path = case_dir / "risk_case_eval.db"
    write_json(b_path, b_output)
    cmd = [
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
    completed = subprocess.run(cmd, cwd=str(C_AGENT_DIR), text=True, capture_output=True, encoding="utf-8")
    if completed.returncode != 0:
        raise RuntimeError(
            f"C Agent failed for {case_dir.name}\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
        )
    return read_json(c_path), read_json(trace_path)


def overall_from_output(c_output: dict[str, Any]) -> str:
    data = c_output.get("data") or {}
    summary = data.get("riskSummary") or {}
    if summary.get("high", 0) > 0:
        return "high"
    if summary.get("medium", 0) > 0:
        return "medium"
    return "low"


def precision(hit: set[str], expected: set[str]) -> float:
    if not hit:
        return 1.0 if not expected else 0.0
    return len(hit & expected) / len(hit)


def recall(hit: set[str], expected: set[str]) -> float:
    if not expected:
        return 1.0
    return len(hit & expected) / len(expected)


def unique_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def relevant_ratio(items: list[str], keywords: list[str]) -> float:
    """Estimate RAG relevance with labeled keyword overlap.

    This is not a perfect substitute for human review, but it is transparent:
    each retrieved regulation/case must contain at least one expected keyword.
    """
    if not items:
        return 0.0
    lowered_keywords = [keyword.lower() for keyword in keywords if keyword]
    if not lowered_keywords:
        return 1.0
    relevant = 0
    for item in items:
        text = item.lower()
        if any(keyword in text for keyword in lowered_keywords):
            relevant += 1
    return relevant / len(items)


def hit_rules_from_trace(trace: dict[str, Any]) -> list[str]:
    return unique_strings([item.get("ruleId", "") for item in trace.get("hitRules", [])])


def retrieved_regulations_from_trace(trace: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for hit in trace.get("hitRules", []):
        values.extend(hit.get("regulations") or [])
    return unique_strings(values)


def retrieved_cases_from_trace(trace: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for hit in trace.get("hitRules", []):
        values.extend(hit.get("cases") or [])
    return unique_strings(values)


def should_sample_for_manual_review(index: int, total: int) -> bool:
    """Deterministically sample about 30% of cases for human review."""
    target_count = max(1, round(total * 0.3))
    sample_indexes = {round(i * (total - 1) / max(1, target_count - 1)) for i in range(target_count)}
    return index in sample_indexes


def evaluate_case(case: dict[str, Any], index: int, total: int) -> CaseResult:
    case_dir = OUTPUT_ROOT / "cases" / case["caseId"]
    if case_dir.exists():
        shutil.rmtree(case_dir)
    case_dir.mkdir(parents=True, exist_ok=True)
    b_output = build_b_output(case)
    c_output, trace = run_c_agent(case_dir, b_output)

    hit_rule_ids = hit_rules_from_trace(trace)
    expected_rule_ids = case["expectedRuleIds"]
    hit_set = set(hit_rule_ids)
    expected_set = set(expected_rule_ids)
    rag_keywords = case["expectedRagKeywords"]
    regulations = retrieved_regulations_from_trace(trace)
    cases = retrieved_cases_from_trace(trace)
    agent_overall = overall_from_output(c_output)
    rule_precision = precision(hit_set, expected_set)
    rule_recall = recall(hit_set, expected_set)
    regulation_accuracy = relevant_ratio(regulations, rag_keywords.get("regulations", []))
    case_accuracy = relevant_ratio(cases, rag_keywords.get("cases", []))
    sampled = should_sample_for_manual_review(index, total)
    manual_passed = (
        agent_overall == case["expectedOverall"]
        and rule_precision >= 0.55
        and rule_recall >= 0.55
        and (regulation_accuracy >= 0.35 or not hit_rule_ids)
        and (case_accuracy >= 0.35 or not hit_rule_ids)
    )
    return CaseResult(
        case_id=case["caseId"],
        scenario=case["scenario"],
        title=case["title"],
        expected_rule_ids=expected_rule_ids,
        hit_rule_ids=hit_rule_ids,
        expected_overall=case["expectedOverall"],
        agent_overall=agent_overall,
        rule_precision=rule_precision,
        rule_recall=rule_recall,
        rag_regulation_accuracy=regulation_accuracy,
        rag_case_accuracy=case_accuracy,
        overall_match=agent_overall == case["expectedOverall"],
        missed_rules=sorted(expected_set - hit_set),
        unexpected_rules=sorted(hit_set - expected_set),
        retrieved_regulations=regulations,
        retrieved_cases=cases,
        manual_review_sampled=sampled,
        manual_review_passed=manual_passed if sampled else False,
        c_output_path=str(case_dir / "c-output.json"),
        c_trace_path=str(case_dir / "c-trace.json"),
    )


def average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def group_by_scenario(results: list[CaseResult]) -> dict[str, list[CaseResult]]:
    grouped: dict[str, list[CaseResult]] = {}
    for result in results:
        grouped.setdefault(result.scenario, []).append(result)
    return grouped


def result_to_dict(result: CaseResult) -> dict[str, Any]:
    return {
        "caseId": result.case_id,
        "scenario": result.scenario,
        "title": result.title,
        "expectedRuleIds": result.expected_rule_ids,
        "hitRuleIds": result.hit_rule_ids,
        "expectedOverall": result.expected_overall,
        "agentOverall": result.agent_overall,
        "rulePrecision": round(result.rule_precision, 4),
        "ruleRecall": round(result.rule_recall, 4),
        "ragRegulationAccuracy": round(result.rag_regulation_accuracy, 4),
        "ragCaseAccuracy": round(result.rag_case_accuracy, 4),
        "overallMatch": result.overall_match,
        "missedRules": result.missed_rules,
        "unexpectedRules": result.unexpected_rules,
        "retrievedRegulations": result.retrieved_regulations,
        "retrievedCases": result.retrieved_cases,
        "manualReviewSampled": result.manual_review_sampled,
        "manualReviewPassed": result.manual_review_passed,
        "cOutputPath": result.c_output_path,
        "cTracePath": result.c_trace_path,
    }


def build_metrics(results: list[CaseResult]) -> dict[str, Any]:
    manual_samples = [result for result in results if result.manual_review_sampled]
    return {
        "caseCount": len(results),
        "scenarioCount": len(group_by_scenario(results)),
        "rulePrecision": round(average([result.rule_precision for result in results]), 4),
        "ruleRecall": round(average([result.rule_recall for result in results]), 4),
        "ragRegulationAccuracy": round(average([result.rag_regulation_accuracy for result in results]), 4),
        "ragCaseAccuracy": round(average([result.rag_case_accuracy for result in results]), 4),
        "overallAgreement": round(sum(1 for result in results if result.overall_match) / max(1, len(results)), 4),
        "manualSampleRate": round(len(manual_samples) / max(1, len(results)), 4),
        "manualAgreement": round(
            sum(1 for result in manual_samples if result.manual_review_passed) / max(1, len(manual_samples)),
            4,
        ),
    }


def scenario_metrics(results: list[CaseResult]) -> dict[str, dict[str, Any]]:
    grouped = group_by_scenario(results)
    return {scenario: build_metrics(items) for scenario, items in grouped.items()}


def percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def build_report(dataset: dict[str, Any], results: list[CaseResult], metrics: dict[str, Any]) -> str:
    grouped_metrics = scenario_metrics(results)
    lines = [
        "# RAG/规则评测报告",
        "",
        f"生成时间：{now_iso()}",
        "",
        "## 1. 评测目标",
        "",
        "本报告用于证明 risk_case Agent 的风险判断不是黑盒，而是由规则命中、合同证据、法规检索和案例检索共同支撑。",
        "",
        "## 2. 测试集",
        "",
        f"- 场景数量：{metrics['scenarioCount']} 个",
        f"- 测试合同：{metrics['caseCount']} 份",
        "- 覆盖场景：消费贷、信用卡分期、教育培训贷",
        "- 每份合同均包含标准答案：期望命中规则、期望整体风险、法规/案例检索关键词。",
        "",
        "## 3. 核心指标",
        "",
        "| 指标 | 结果 | 说明 |",
        "|---|---:|---|",
        f"| 规则命中准确率 | {percent(metrics['rulePrecision'])} | Agent 命中的规则中，有多少属于标准答案风险规则 |",
        f"| 规则召回率 | {percent(metrics['ruleRecall'])} | 标准答案中应该命中的规则，有多少被 Agent 找到 |",
        f"| 法规检索准确率 | {percent(metrics['ragRegulationAccuracy'])} | 检索到的法规标题与人工标注关键词的相关比例 |",
        f"| 案例检索准确率 | {percent(metrics['ragCaseAccuracy'])} | 检索到的案例标题与人工标注关键词的相关比例 |",
        f"| 整体结论一致率 | {percent(metrics['overallAgreement'])} | Agent 整体风险判断与人工标注是否一致 |",
        f"| 人工复核抽样比例 | {percent(metrics['manualSampleRate'])} | 固定抽样约 30% 的测试结果进行人工复核模拟 |",
        f"| 人工复核通过率 | {percent(metrics['manualAgreement'])} | 抽样结果中通过复核的比例 |",
        "",
        "## 4. 分场景结果",
        "",
        "| 场景 | 用例数 | 规则准确率 | 规则召回率 | 法规准确率 | 案例准确率 | 结论一致率 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for scenario, item in grouped_metrics.items():
        lines.append(
            f"| {scenario} | {item['caseCount']} | {percent(item['rulePrecision'])} | "
            f"{percent(item['ruleRecall'])} | {percent(item['ragRegulationAccuracy'])} | "
            f"{percent(item['ragCaseAccuracy'])} | {percent(item['overallAgreement'])} |"
        )

    lines.extend(
        [
            "",
            "## 5. 用例明细",
            "",
            "| 用例 | 场景 | 期望风险 | Agent 风险 | 规则准确率 | 规则召回率 | 漏判规则 | 多判规则 |",
            "|---|---|---|---|---:|---:|---|---|",
        ]
    )
    for result in results:
        lines.append(
            f"| {result.case_id} | {result.scenario} | {result.expected_overall} | {result.agent_overall} | "
            f"{percent(result.rule_precision)} | {percent(result.rule_recall)} | "
            f"{', '.join(result.missed_rules) or '-'} | {', '.join(result.unexpected_rules) or '-'} |"
        )

    error_cases = [
        result
        for result in results
        if result.missed_rules or result.unexpected_rules or not result.overall_match
    ]
    lines.extend(["", "## 6. 错误案例分析", ""])
    if not error_cases:
        lines.append("本轮评测未发现明显错误案例。")
    else:
        for result in error_cases:
            lines.extend(
                [
                    f"### {result.case_id}：{result.title}",
                    "",
                    f"- 期望整体风险：{result.expected_overall}",
                    f"- Agent 判断：{result.agent_overall}",
                    f"- 漏判规则：{', '.join(result.missed_rules) or '无'}",
                    f"- 多判规则：{', '.join(result.unexpected_rules) or '无'}",
                    f"- 法规检索：{', '.join(result.retrieved_regulations[:5]) or '无'}",
                    f"- 案例检索：{', '.join(result.retrieved_cases[:5]) or '无'}",
                    "- 改进建议：检查规则条件是否过宽或过窄；补充对应场景的案例关键词；必要时为该场景增加更细的规则。",
                    "",
                ]
            )

    lines.extend(
        [
            "## 7. 人工复核抽样",
            "",
            "| 用例 | 是否抽样 | 复核结论 |",
            "|---|---|---|",
        ]
    )
    for result in results:
        if result.manual_review_sampled:
            lines.append(f"| {result.case_id} | 是 | {'通过' if result.manual_review_passed else '需复核'} |")

    lines.extend(
        [
            "",
            "## 8. 结论",
            "",
            "当前 Agent 已能展示“规则依据 + 合同证据 + 法规/案例检索”的判断链路。评测脚本保留了每个用例的 B 输入、C 输出和 C trace，可以追溯每条风险来自哪个规则、引用了哪些条款、检索到了哪些法规和案例。",
            "",
            "## 9. 后续改进建议",
            "",
            "- 将人工标注集继续扩展到医美分期、保险分期、房贷等场景。",
            "- 对 RAG 检索增加人工相关性评分，而不是仅用关键词相关性近似。",
            "- 为误判较多的规则增加负样本，避免只要出现关键词就命中。",
            "- 增加法规和案例的分场景标签，提高信用卡分期、教育培训贷的检索精度。",
            "",
            "## 10. 输出位置",
            "",
            f"- 机器可读结果：`{VISUAL_DATA_PATH.relative_to(ROOT)}`",
            f"- 用例输出目录：`{(OUTPUT_ROOT / 'cases').relative_to(ROOT)}`",
            f"- 可视化页面：`evaluation/visualization/index.html`",
            "",
        ]
    )
    return "\n".join(lines)


def run_evaluation() -> dict[str, Any]:
    dataset = read_json(DATASET_PATH)
    cases = dataset["cases"]
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    results = [evaluate_case(case, index, len(cases)) for index, case in enumerate(cases)]
    metrics = build_metrics(results)
    payload = {
        "version": dataset["version"],
        "generatedAt": now_iso(),
        "metrics": metrics,
        "scenarioMetrics": scenario_metrics(results),
        "results": [result_to_dict(result) for result in results],
    }
    write_json(OUTPUT_ROOT / "evaluation-results.json", payload)
    write_json(VISUAL_DATA_PATH, payload)
    write_text(REPORT_PATH, build_report(dataset, results, metrics))
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run RAG/rule evaluation for risk_case Agent.")
    parser.add_argument("--output-json", default=str(OUTPUT_ROOT / "evaluation-results.json"), help="Path to copy final JSON result.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = run_evaluation()
    output_json = Path(args.output_json)
    if output_json != OUTPUT_ROOT / "evaluation-results.json":
        write_json(output_json, payload)
    metrics = payload["metrics"]
    print("[evaluation] completed")
    print(f"cases={metrics['caseCount']} scenarios={metrics['scenarioCount']}")
    print(f"rule_precision={percent(metrics['rulePrecision'])} rule_recall={percent(metrics['ruleRecall'])}")
    print(f"rag_regulations={percent(metrics['ragRegulationAccuracy'])} rag_cases={percent(metrics['ragCaseAccuracy'])}")
    print(f"overall_agreement={percent(metrics['overallAgreement'])}")
    print(f"report={REPORT_PATH}")
    print(f"visualization={EVAL_ROOT / 'visualization' / 'index.html'}")


if __name__ == "__main__":
    main()
