# -*- coding: utf-8 -*-
"""Build a one-page plain-language summary report from B/C/D outputs."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


CST = timezone(timedelta(hours=8))
LEVEL_WEIGHT = {"high": 30, "medium": 15, "low": 5}
LEVEL_LABEL = {"high": "高风险", "medium": "中风险", "low": "低风险"}


def now_iso() -> str:
    return datetime.now(CST).replace(microsecond=0).isoformat()


def read_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def money(value: Any) -> str:
    if value is None:
        return "没算出来"
    try:
        return f"{float(value):,.0f}元"
    except (TypeError, ValueError):
        return "没算出来"


def percent(value: Any) -> str:
    if value is None:
        return "没算出来"
    try:
        return f"{float(value):.1f}%"
    except (TypeError, ValueError):
        return "没算出来"


def short_sentence(text: str, limit: int = 20) -> str:
    cleaned = " ".join(str(text or "").replace("\n", " ").split())
    if not cleaned:
        return ""
    first = cleaned.replace("；", "。").split("。")[0].strip()
    if len(first) <= limit:
        return first
    return first[: limit - 1] + "…"


def plain_risk_text(risk: dict[str, Any]) -> str:
    title = risk.get("title") or ""
    text = title
    if any(word in text for word in ["免息", "手续费", "分期手续费"]):
        return "免息不等于免费"
    if any(word in text for word in ["额外费用", "服务费", "管理费", "咨询费"]):
        return "有费用没说清"
    if any(word in text for word in ["真实年化", "年化", "IRR", "利率"]):
        return "实际成本可能更高"
    if any(word in text for word in ["提前还款", "提前结清"]):
        return "提前还也可能收费"
    if any(word in text for word in ["最低还款", "循环利息"]):
        return "少还会继续计息"
    if any(word in text for word in ["自动扣款", "授权"]):
        return "扣款权限可能太大"
    if any(word in text for word in ["培训", "课程", "退课", "退费"]):
        return "退课后还可能还贷"
    if any(word in text for word in ["担保", "连带"]):
        return "你可能要一起负责"
    if any(word in text for word in ["征信", "逾期", "罚息"]):
        return "逾期会影响信用"
    return "这条要问清楚"


def plain_risk_title(risk: dict[str, Any]) -> str:
    text = risk.get("title") or ""
    if any(word in text for word in ["免息", "手续费", "分期手续费"]):
        return "手续费要问清"
    if any(word in text for word in ["费用", "服务费", "管理费", "咨询费"]):
        return "费用要列全"
    if any(word in text for word in ["真实年化", "年化", "IRR", "利率"]):
        return "实际成本偏高"
    if any(word in text for word in ["提前还款", "提前结清"]):
        return "提前还款有门槛"
    if any(word in text for word in ["最低还款", "循环利息"]):
        return "最低还款别轻信"
    if any(word in text for word in ["自动扣款", "授权"]):
        return "扣款授权要收窄"
    if any(word in text for word in ["培训", "课程", "退课", "退费"]):
        return "退课贷款要写清"
    return short_sentence(risk.get("title"), 14)


def risk_score(risk_summary: dict[str, int]) -> int:
    score = 0
    for level, count in risk_summary.items():
        score += LEVEL_WEIGHT.get(level, 0) * int(count or 0)
    return min(score, 100)


def decision_from(summary: dict[str, int], score: int) -> dict[str, str]:
    high = summary.get("high", 0)
    medium = summary.get("medium", 0)
    if high >= 3 or score >= 80:
        return {"level": "do_not_sign", "label": "先别签", "reason": "高风险太多"}
    if high > 0 or medium >= 3 or score >= 45:
        return {"level": "be_careful", "label": "谨慎签", "reason": "有问题要问清"}
    if not summary:
        return {"level": "need_more_info", "label": "信息不够", "reason": "还要补材料"}
    return {"level": "can_sign", "label": "风险较低", "reason": "暂未发现大坑"}


def top_risks(c_output: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    items = (c_output.get("data") or {}).get("riskItems") or []
    order = {"high": 0, "medium": 1, "low": 2}
    picked = sorted(items, key=lambda item: order.get(item.get("riskLevel"), 3))[:limit]
    return [
        {
            "id": item.get("id"),
            "title": plain_risk_title(item),
            "plainText": plain_risk_text(item),
            "level": item.get("riskLevel", "medium"),
            "detailAnchor": f"#risk-{item.get('id')}",
        }
        for item in picked
    ]


def next_actions(c_output: dict[str, Any], d_output: dict[str, Any], limit: int = 3) -> list[dict[str, str]]:
    actions = []
    recommendations = (d_output.get("data") or {}).get("recommendations") or []
    for item in recommendations:
        text = short_sentence(item.get("action"), 20)
        if text:
            actions.append(
                {
                    "id": item.get("id") or f"action_{len(actions) + 1}",
                    "text": text,
                    "detailAnchor": f"#action-{item.get('id')}",
                }
            )
        if len(actions) >= limit:
            return actions

    for risk in (c_output.get("data") or {}).get("riskItems") or []:
        question = short_sentence(risk.get("questionToAsk"), 20)
        if question:
            actions.append(
                {
                    "id": f"ask_{risk.get('id')}",
                    "text": question,
                    "detailAnchor": f"#risk-{risk.get('id')}",
                }
            )
        if len(actions) >= limit:
            return actions

    return actions or [{"id": "ask_basic_001", "text": "先要完整费用表", "detailAnchor": "#actions"}]


def build_summary(b_output: dict[str, Any], c_output: dict[str, Any], d_output: dict[str, Any]) -> dict[str, Any]:
    b_data = b_output.get("data") or {}
    summary = (c_output.get("data") or {}).get("riskSummary") or {"high": 0, "medium": 0, "low": 0}
    cost = b_data.get("costAnalysis") or {}
    rate = cost.get("realAnnualRate")
    extra = cost.get("additionalFees")
    score = risk_score(summary)
    decision = decision_from(summary, score)
    high = summary.get("high", 0)
    headline = f"{decision['label']}：一年实际成本{percent(rate)}，有{high}项高风险"

    return {
        "schemaVersion": "summary-report-v1",
        "taskId": b_output.get("taskId"),
        "contractId": b_output.get("contractId"),
        "generatedAt": now_iso(),
        "headline": headline,
        "decision": decision,
        "coreNumbers": {
            "annualCostRate": {
                "label": "一年实际成本",
                "value": rate,
                "unit": "%",
                "plainText": f"借一年大约多付{percent(rate)}",
                "detailAnchor": "#cost",
            },
            "riskScore": {
                "label": "风险分",
                "value": score,
                "unit": "分",
                "plainText": "分越高越要小心",
                "detailAnchor": "#risks",
            },
            "extraCost": {
                "label": "多付费用",
                "value": extra,
                "unit": "元",
                "plainText": f"除了本金，多付{money(extra)}",
                "detailAnchor": "#cost",
            },
        },
        "topRisks": top_risks(c_output),
        "nextActions": next_actions(c_output, d_output),
        "fullReportLinks": {
            "riskSection": "#risks",
            "costSection": "#cost",
            "actionSection": "#actions",
        },
        "sourceRunIds": {
            "contractCost": b_output.get("runId"),
            "riskCase": c_output.get("runId"),
            "recommendationAction": d_output.get("runId"),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a 30-second summary report.")
    parser.add_argument("--b", required=True, help="B contract_cost output JSON")
    parser.add_argument("--c", required=True, help="C risk_case output JSON")
    parser.add_argument("--d", required=True, help="D recommendation_action output JSON")
    parser.add_argument("--output", required=True, help="Summary report output JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = build_summary(read_json(args.b), read_json(args.c), read_json(args.d))
    write_json(args.output, summary)
    print(f"[summary] {args.output}")


if __name__ == "__main__":
    main()
