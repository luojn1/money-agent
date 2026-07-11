# -*- coding: utf-8 -*-
"""建议生成：把 C 的 riskItems 转为符合 A 协议的 recommendations 与 questionList。

关联规则（协议第 5 节 / C 交接文档第 3 章）：
- recommendations[].relatedRiskIds 必须引用 C.data.riskItems[].id；
- 不得用标题、条款 ID 或数组下标做关联。
"""

# riskLevel -> priority（C 交接文档 QUICK_START_FOR_D 第 3 节）
PRIORITY_BY_LEVEL = {"high": "must", "medium": "should", "low": "optional"}
PRIORITY_ORDER = {"must": 0, "should": 1, "optional": 2}
LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}

# category -> timing（协议枚举：before_signing | during_repayment | when_overdue | anytime）
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

# category -> 具体行动模板；{title} 为 C 给出的风险标题。
# 问题清单负责“照着问”，建议负责“照着做”，避免两个板块复读。
ACTION_TEMPLATE = {
    "cost_transparency": "把「{title}」涉及的费用逐项列出来加总，与机构宣传口径对照；"
                         "对不上的部分按问题清单当面问清，并让机构在书面答复上盖章或线上留痕。",
    "interest_fee": "用实际到账金额和每期还款额自己核一遍真实年化成本，"
                    "与合同写的名义利率对比；差异大就按问题清单要求机构书面解释，答复留存好。",
    "prepayment": "签约前让客服现场演示一遍提前结清要付多少钱，把演示结果截图；"
                  "与合同条款不一致时，以书面确认为准再签。",
    "authorization_privacy": "把「{title}」的授权条款单独拍照留存，勾选授权时只开必需项；"
                             "撤销授权的入口和流程让机构写进书面答复。",
    "repayment": "设置还款日前 3 天提醒，每期扣款后核对金额与合同还款计划表是否一致，"
                 "扣款凭证保留到结清。",
    "overdue": "把逾期罚息算法和催收方式记录下来；一旦可能逾期，提前主动联系机构协商展期，"
               "所有沟通留下录音或聊天记录。",
    "dispute_resolution": "从现在开始保存合同原件、付款凭证和全部沟通记录；"
                          "发生争议先走合同约定渠道，无果可向当地金融监管部门投诉。",
    "other": "就「{title}」向机构索取书面说明并留存。",
}

GENERIC_CONSEQUENCE = "该条款可能增加用户的资金、履约或维权成本。"
CONSEQUENCE_BY_CATEGORY = {
    "cost_transparency": "费用不透明时，宣传的利率和你实际承担的成本可能差很多。",
    "interest_fee": "这类条款直接抬高你的实际借款成本——到手更少，或多付利息。",
    "prepayment": "提前还款的成本不问清楚，想早点还清反而可能多花一笔钱。",
    "authorization_privacy": "授权范围过宽，你的个人信息和联系人可能在逾期时被波及。",
    "repayment": "还款安排出差错会直接产生罚息，并可能影响征信记录。",
    "overdue": "逾期的实际代价（罚息、催收、征信）通常远高于借款时的预期。",
    "dispute_resolution": "缺少证据和明确渠道时，出了纠纷很难有效维权。",
}

_RULE_PREFIX = "命中规则"


def _short_reason(risk):
    """C 的 reason 很长（含法规摘要），取第一句并去掉机器腔。"""
    reason = (risk.get("reason") or "").strip()
    head = reason.split("。")[0]
    if not head:
        return ""
    if head.startswith(_RULE_PREFIX):
        head = "合同里存在" + head[len(_RULE_PREFIX):] + "的情形"
    return head + "。"


def _consequence(risk):
    """把 C 的通用兜底后果换成分类别的具体说法。"""
    text = (risk.get("possibleConsequence") or "").strip()
    if text == GENERIC_CONSEQUENCE:
        category = risk.get("category") or "other"
        return CONSEQUENCE_BY_CATEGORY.get(category, text)
    return text


def _case_support(risk):
    cases = risk.get("matchedCases") or []
    if not cases:
        return ""
    return f"知识库中有 {len(cases)} 起同类纠纷案例可供参考。"


def build_recommendation(risk, seq):
    """单条风险 -> 单条建议。"""
    category = risk.get("category") or "other"
    title = (risk.get("title") or "该风险").strip()
    template = ACTION_TEMPLATE.get(category, ACTION_TEMPLATE["other"])
    action = template.format(title=title)
    rationale = "".join(filter(None, [
        _short_reason(risk),
        _consequence(risk),
        _case_support(risk),
    ])) or f"风险项“{title}”需要在签约前澄清。"
    return {
        "id": f"action_{seq:03d}_{risk['id']}",
        "priority": PRIORITY_BY_LEVEL.get(risk.get("riskLevel"), "should"),
        "action": action,
        "rationale": rationale,
        "timing": TIMING_BY_CATEGORY.get(category, "anytime"),
        "relatedRiskIds": [risk["id"]],
    }


def _merge_duplicate_actions(recs):
    """合并相同行动，保留全部风险关联并采用最高优先级。"""
    merged, order = {}, []
    for rec in recs:
        key = rec["action"]
        if key in merged:
            keep = merged[key]
            keep["relatedRiskIds"] = list(dict.fromkeys(
                keep["relatedRiskIds"] + rec["relatedRiskIds"]))
            if PRIORITY_ORDER[rec["priority"]] < PRIORITY_ORDER[keep["priority"]]:
                keep["priority"] = rec["priority"]
        else:
            merged[key] = rec
            order.append(key)

    output = []
    for key in order:
        rec = merged[key]
        extra = len(rec["relatedRiskIds"]) - 1
        if extra > 0:
            rec["rationale"] += f"合同中另有 {extra} 处条款存在同类问题，已一并关联。"
        output.append(rec)
    return output


def build_recommendations(risk_items, user_profile=None, cost_analysis=None):
    """全部风险 -> 建议列表（含高风险聚合、产品对比与画像建议）。"""
    ordered = sorted(
        risk_items,
        key=lambda r: LEVEL_ORDER.get(r.get("riskLevel"), 1),
    )
    recs = _merge_duplicate_actions(
        [build_recommendation(r, i + 1) for i, r in enumerate(ordered)])

    high_ids = [r["id"] for r in risk_items if r.get("riskLevel") == "high"]
    if high_ids:
        recs.insert(0, {
            "id": "action_overall_001",
            "priority": "must",
            "action": "在上述高风险问题得到机构书面澄清之前，暂缓签约。",
            "rationale": f"本合同存在 {len(high_ids)} 项高风险条款，"
                         "书面澄清是后续维权时最重要的证据。",
            "timing": "before_signing",
            "relatedRiskIds": high_ids,
        })

    recs.extend(_comparison_recommendation(risk_items, cost_analysis))
    recs.extend(_profile_recommendations(user_profile))
    recs.sort(key=lambda r: PRIORITY_ORDER[r["priority"]])
    return recs


def _comparison_recommendation(risk_items, cost_analysis):
    """“对比其他金融产品”建议（说明书 5.2.5：签约前可对比其他金融产品）。"""
    cost_analysis = cost_analysis or {}
    real = cost_analysis.get("realAnnualRate")
    if real is None:
        return []
    fee_risk_ids = [r["id"] for r in risk_items
                    if r.get("category") == "interest_fee"]
    return [{
        "id": "action_compare_001",
        "priority": "should" if fee_risk_ids else "optional",
        "action": f"签约前用本合同的真实年化利率（约 {real}%）与银行消费贷、"
                  "信用卡分期等其他渠道的年化成本做横向对比，再决定是否选择本产品。",
        "rationale": "同额度、同期限下不同渠道的真实成本差异可能很大，"
                     "横向对比是避免高成本借款最直接的方法。",
        "timing": "before_signing",
        "relatedRiskIds": fee_risk_ids,
    }]


def _profile_recommendations(profile):
    """按用户画像追加个性化建议（说明书 5.2.5）。无画像时返回空。"""
    if not profile:
        return []
    recs = []
    if profile.get("firstTimeBorrower"):
        recs.append({
            "id": "action_profile_first_001",
            "priority": "should",
            "action": "第一次贷款，签约前请重点核对“真实年化利率”和“逾期后果”"
                      "两项，必要时请家人一起把关。",
            "rationale": "首次借款人最容易只看名义利率或“零利息”宣传，"
                         "而忽略费用折算后的真实成本与逾期代价。",
            "timing": "before_signing",
            "relatedRiskIds": [],
        })
    if profile.get("hasOtherDebts"):
        recs.append({
            "id": "action_profile_debt_001",
            "priority": "should",
            "action": "已有其他负债，请先测算本合同月供加入后的总月供占收入比例，"
                      "超过 50% 建议暂缓。",
            "rationale": "多笔负债叠加时，现金流断裂风险远高于单笔合同本身的条款风险。",
            "timing": "before_signing",
            "relatedRiskIds": [],
        })
    scenario = profile.get("scenario")
    if scenario in ("insurance", "training", "medical"):
        label = {"insurance": "保险", "training": "培训", "medical": "医美/医疗"}[scenario]
        recs.append({
            "id": f"action_profile_{scenario}_001",
            "priority": "should",
            "action": f"{label}分期场景：签约前务必确认服务退费/解除条件与贷款合同的关系，"
                      "服务终止后贷款是否同步终止要有书面答复。",
            "rationale": f"{label}分期纠纷的核心多为“服务停了、贷款还在”，"
                         "签约前的书面确认是最有效的预防手段。",
            "timing": "before_signing",
            "relatedRiskIds": [],
        })
    return recs


def build_question_list(risk_items, limit=10):
    """questionToAsk 去重汇总，按 high -> medium -> low 排序。"""
    ordered = sorted(
        risk_items,
        key=lambda r: LEVEL_ORDER.get(r.get("riskLevel"), 1),
    )
    seen, questions = set(), []
    for risk in ordered:
        q = (risk.get("questionToAsk") or "").strip()
        if q and q not in seen:
            seen.add(q)
            questions.append(q)
        if len(questions) >= limit:
            break
    return questions
