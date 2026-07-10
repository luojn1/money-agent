# -*- coding: utf-8 -*-
"""场景化建议生成器。

本文件用于 D 模块 recommendation_action。
它从 C 输出或 C trace 中读取 scenarioSignals，并结合 riskItems 生成
信用卡分期、教育培训贷两个场景的专属建议。
"""

from __future__ import annotations

from typing import Any


SCENARIO_KEYWORDS: dict[str, list[str]] = {
    "credit_card_installment": [
        "信用卡",
        "账单分期",
        "现金分期",
        "消费分期",
        "分期手续费",
        "最低还款额",
        "循环利息",
        "免息分期",
    ],
    "education_training_loan": [
        "培训",
        "教育",
        "课程",
        "学费分期",
        "培训贷",
        "退课",
        "退费",
        "就业承诺",
        "培训机构",
    ],
}


def _risk_items(c_output: dict[str, Any]) -> list[dict[str, Any]]:
    return list((c_output.get("data") or {}).get("riskItems") or [])


def _collect_text(c_output: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in _risk_items(c_output):
        parts.extend(
            [
                str(item.get("id") or ""),
                str(item.get("title") or ""),
                str(item.get("category") or ""),
                str(item.get("reason") or ""),
                str(item.get("possibleConsequence") or ""),
                str(item.get("questionToAsk") or ""),
                str(item.get("clauseText") or ""),
            ]
        )
        for case in item.get("matchedCases") or []:
            parts.extend(
                [
                    str(case.get("title") or ""),
                    str(case.get("conclusion") or ""),
                    str(case.get("sourceUrl") or ""),
                ]
            )
    return " ".join(parts)


def infer_scenarios(c_output: dict[str, Any], c_trace: dict[str, Any] | None = None) -> list[str]:
    """Infer scenarios from C trace, C envelope extension fields, and risk text."""
    scenarios: list[str] = []

    for source in (c_trace or {}, c_output):
        for signal in source.get("scenarioSignals") or []:
            scenario_id = signal.get("scenarioId")
            if scenario_id in SCENARIO_KEYWORDS and scenario_id not in scenarios:
                scenarios.append(scenario_id)

    text = _collect_text(c_output)
    for scenario_id, keywords in SCENARIO_KEYWORDS.items():
        if scenario_id in scenarios:
            continue
        if scenario_id in text or any(keyword in text for keyword in keywords):
            scenarios.append(scenario_id)

    return scenarios


def _risk_ids_for_keywords(c_output: dict[str, Any], keywords: list[str]) -> list[str]:
    ids: list[str] = []
    for item in _risk_items(c_output):
        text = " ".join(
            [
                str(item.get("title") or ""),
                str(item.get("reason") or ""),
                str(item.get("questionToAsk") or ""),
                str(item.get("clauseText") or ""),
            ]
        )
        if any(keyword in text for keyword in keywords):
            ids.append(str(item.get("id")))
    return [item for item in ids if item]


def build_scenario_recommendations(
    c_output: dict[str, Any],
    c_trace: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Build D recommendations for supported scenario signals."""
    recommendations: list[dict[str, Any]] = []
    scenarios = infer_scenarios(c_output, c_trace)
    all_risk_ids = [str(item.get("id")) for item in _risk_items(c_output) if item.get("id")]

    if "credit_card_installment" in scenarios:
        related = _risk_ids_for_keywords(c_output, SCENARIO_KEYWORDS["credit_card_installment"]) or all_risk_ids
        recommendations.append(
            {
                "id": "action_scene_credit_card_installment_001",
                "priority": "must",
                "action": (
                    "信用卡分期建议：签约或办理分期前，请银行同时写明每期手续费、"
                    "总手续费、折算真实年化，以及提前还款时剩余手续费是否退还。"
                ),
                "rationale": (
                    "信用卡分期常把“免息”和“手续费”分开表达，用户容易只看到月供低，"
                    "却低估真实年化、最低还款循环利息和提前结清成本。"
                ),
                "timing": "before_signing",
                "relatedRiskIds": related,
            }
        )

    if "education_training_loan" in scenarios:
        related = _risk_ids_for_keywords(c_output, SCENARIO_KEYWORDS["education_training_loan"]) or all_risk_ids
        recommendations.append(
            {
                "id": "action_scene_education_training_loan_001",
                "priority": "must",
                "action": (
                    "教育培训贷建议：付款前请培训机构和贷款机构书面确认，退课、停课、"
                    "机构跑路或课程质量不符时，贷款是否可以暂停、解除或同步退款。"
                ),
                "rationale": (
                    "教育培训贷最容易出现“服务合同出了问题，但贷款合同还要继续还”的纠纷。"
                    "必须把服务解除和贷款处理的关系写清楚。"
                ),
                "timing": "before_signing",
                "relatedRiskIds": related,
            }
        )

    return recommendations
