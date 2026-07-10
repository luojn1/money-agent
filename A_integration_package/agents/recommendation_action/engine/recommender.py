# -*- coding: utf-8 -*-
"""建议生成：把 C 的 riskItems 转为符合 A 协议的 recommendations 与 questionList。"""

from __future__ import annotations

from typing import Any

from engine.scenario_recommender import build_scenario_recommendations


PRIORITY_BY_LEVEL = {"high": "must", "medium": "should", "low": "optional"}
PRIORITY_ORDER = {"must": 0, "should": 1, "optional": 2}
LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}

TIMING_BY_CATEGORY = {
    "cost_transparency": "before_signing",
    "interest_fee": "before_signing",
    "prepayment": "before_signing",
    "authorization_privacy": "before_signing",
    "repayment": "during_repayment",
    "overdue": "when_overdue",
    "dispute_resolution": "anytime",
    "other": "anytime",
}

ACTION_TEMPLATE = {
    "cost_transparency": "签约前要求机构书面回复：{q}",
    "interest_fee": "签约前要求机构书面确认：{q}",
    "prepayment": "签约前与机构确认并保留书面答复：{q}",
    "authorization_privacy": "签约前逐条核对授权范围：{q}",
    "repayment": "还款期间主动核对：{q}",
    "overdue": "了解并记录逾期处理规则：{q}",
    "dispute_resolution": "留存证据并确认争议解决途径：{q}",
    "other": "向机构核实：{q}",
}


def _short_reason(risk: dict[str, Any]) -> str:
    reason = (risk.get("reason") or "").strip()
    head = reason.split("。")[0]
    return (head + "。") if head else ""


def _case_support(risk: dict[str, Any]) -> str:
    cases = risk.get("matchedCases") or []
    if not cases:
        return ""
    return f"知识库中有 {len(cases)} 起同类纠纷案例可供参考。"


def build_recommendation(risk: dict[str, Any], seq: int) -> dict[str, Any]:
    category = risk.get("category") or "other"
    question = (risk.get("questionToAsk") or "").strip()
    template = ACTION_TEMPLATE.get(category, ACTION_TEMPLATE["other"])
    action = (
        template.format(q=question)
        if question
        else f"就“{risk.get('title', '该风险')}”向机构索取书面说明。"
    )
    rationale = "".join(
        filter(
            None,
            [
                _short_reason(risk),
                (risk.get("possibleConsequence") or "").strip(),
                _case_support(risk),
            ],
        )
    ) or f"风险项“{risk.get('title', '')}”需要在签约前澄清。"
    return {
        "id": f"action_{seq:03d}_{risk['id']}",
        "priority": PRIORITY_BY_LEVEL.get(risk.get("riskLevel"), "should"),
        "action": action,
        "rationale": rationale,
        "timing": TIMING_BY_CATEGORY.get(category, "anytime"),
        "relatedRiskIds": [risk["id"]],
    }


def build_recommendations(
    risk_items: list[dict[str, Any]],
    user_profile: dict[str, Any] | None = None,
    cost_analysis: dict[str, Any] | None = None,
    c_output: dict[str, Any] | None = None,
    c_trace: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    ordered = sorted(risk_items, key=lambda r: LEVEL_ORDER.get(r.get("riskLevel"), 1))
    recs = [build_recommendation(r, i + 1) for i, r in enumerate(ordered)]

    high_ids = [r["id"] for r in risk_items if r.get("riskLevel") == "high"]
    if high_ids:
        recs.insert(
            0,
            {
                "id": "action_overall_001",
                "priority": "must",
                "action": "在上述高风险问题得到机构书面澄清之前，暂缓签约。",
                "rationale": f"本合同存在 {len(high_ids)} 项高风险条款，书面澄清是后续维权时最重要的证据。",
                "timing": "before_signing",
                "relatedRiskIds": high_ids,
            },
        )

    scenario_input = c_output or {"data": {"riskItems": risk_items}}
    recs.extend(build_scenario_recommendations(scenario_input, c_trace))
    recs.extend(_comparison_recommendation(risk_items, cost_analysis))
    recs.extend(_profile_recommendations(user_profile))

    seen_ids: set[str] = set()
    unique_recs = []
    for rec in recs:
        if rec["id"] in seen_ids:
            continue
        seen_ids.add(rec["id"])
        unique_recs.append(rec)

    unique_recs.sort(key=lambda r: PRIORITY_ORDER[r["priority"]])
    return unique_recs


def _comparison_recommendation(
    risk_items: list[dict[str, Any]],
    cost_analysis: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    cost_analysis = cost_analysis or {}
    real = cost_analysis.get("realAnnualRate")
    if real is None:
        return []
    fee_risk_ids = [r["id"] for r in risk_items if r.get("category") == "interest_fee"]
    return [
        {
            "id": "action_compare_001",
            "priority": "should" if fee_risk_ids else "optional",
            "action": f"签约前用本合同的真实年化利率（约 {real}%）与银行消费贷、信用卡分期等其他渠道的年化成本做横向对比，再决定是否选择本产品。",
            "rationale": "同额度、同期限下不同渠道的真实成本差异可能很大，横向对比是避免高成本借款最直接的方法。",
            "timing": "before_signing",
            "relatedRiskIds": fee_risk_ids,
        }
    ]


def _profile_recommendations(profile: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not profile:
        return []
    recs = []
    if profile.get("firstTimeBorrower"):
        recs.append(
            {
                "id": "action_profile_first_001",
                "priority": "should",
                "action": "第一次贷款，签约前请重点核对“真实年化利率”和“逾期后果”两项，必要时请家人一起把关。",
                "rationale": "首次借款人最容易只看名义利率或“零利息”宣传，而忽略费用折算后的真实成本与逾期代价。",
                "timing": "before_signing",
                "relatedRiskIds": [],
            }
        )
    if profile.get("hasOtherDebts"):
        recs.append(
            {
                "id": "action_profile_debt_001",
                "priority": "should",
                "action": "已有其他负债，请先测算本合同月供加入后的总月供占收入比例，超过 50% 建议暂缓。",
                "rationale": "多笔负债叠加时，现金流断裂风险远高于单笔合同本身的条款风险。",
                "timing": "before_signing",
                "relatedRiskIds": [],
            }
        )
    return recs


def build_question_list(risk_items: list[dict[str, Any]], limit: int = 10) -> list[str]:
    ordered = sorted(risk_items, key=lambda r: LEVEL_ORDER.get(r.get("riskLevel"), 1))
    seen, questions = set(), []
    for risk in ordered:
        q = (risk.get("questionToAsk") or "").strip()
        if q and q not in seen:
            seen.add(q)
            questions.append(q)
        if len(questions) >= limit:
            break
    return questions

