# -*- coding: utf-8 -*-
"""行动管理：把建议进一步转化为可跟进的任务（说明书 5.2.6）。

注意：A 协议 v1.0.0 的 RecommendationActionData 只允许
overallResult / recommendations / questionList / disclaimer 四个字段
（additionalProperties: false），因此行动管理结果不进入协议输出，
而是作为扩展文件单独产出（与 C 模块扩展字段 + strict 模式的做法对齐），
供 A 的前端做“行动提醒”板块时选用。
"""


def _reminders(b_env, c_env):
    data_b = b_env.get("data") or {}
    cs = data_b.get("contractSummary") or {}
    risk_items = (c_env.get("data") or {}).get("riskItems") or []
    categories = {r.get("category") for r in risk_items}
    reminders = []
    seq = 1

    def add(title, rule, related_risk_ids=None):
        nonlocal seq
        reminders.append({
            "reminderId": f"reminder_{seq:03d}",
            "title": title,
            "rule": rule,
            "relatedRiskIds": related_risk_ids or [],
        })
        seq += 1

    n = cs.get("installmentCount")
    monthly = cs.get("monthlyPayment")
    if n:
        rule = f"共 {n} 期，每期还款日前 1 天提醒"
        if monthly is not None:
            rule += f"，每期约 {monthly} 元"
        add("按期还款提醒", rule + "。")

    overdue_ids = [r["id"] for r in risk_items if r.get("category") == "overdue"]
    if overdue_ids:
        add("逾期防范提醒",
            "该合同逾期罚息/违约金偏高，还款日当天增加一次二次提醒，"
            "避免因忘记还款触发高额罚息。", overdue_ids)

    prepay_ids = [r["id"] for r in risk_items if r.get("category") == "prepayment"]
    if prepay_ids:
        add("提前还款前置确认",
            "计划提前结清时，提前 5 个工作日向机构书面确认手续费金额及减免条件，"
            "拿到答复后再操作。", prepay_ids)

    if "authorization_privacy" in categories or any(
            "自动" in (r.get("title") or "") + (r.get("clauseText") or "")
            for r in risk_items):
        auto_ids = [r["id"] for r in risk_items
                    if r.get("category") == "authorization_privacy"
                    or "自动" in (r.get("title") or "")]
        add("自动扣款/续费核对",
            "每月扣款日后核对一次扣款金额与合同约定是否一致；"
            "发现多扣立即截图留证并联系机构。", auto_ids)

    # 退费/退订/投诉时限类提醒（说明书 5.2.6）：
    # B 协议无专用字段，从条款文本扫描关键词生成。
    clauses = data_b.get("clauses") or []
    refund_clauses = [c for c in clauses if any(
        k in (c.get("text") or "")
        for k in ("退费", "退订", "退保", "解除合同", "犹豫期", "冷静期"))]
    if refund_clauses:
        locs = "、".join(filter(None, (
            (c.get("location") or {}).get("section") if isinstance(c.get("location"), dict)
            else None for c in refund_clauses[:3])))
        add("退费/退订期限确认",
            "合同含退费/退订/解除相关条款"
            + (f"（{locs}）" if locs else "")
            + "，请在期限届满前提交书面申请并留存回执，逾期可能视为放弃。")

    complaint_clauses = [c for c in clauses if any(
        k in (c.get("text") or "") for k in ("投诉", "异议", "争议", "仲裁"))]
    if complaint_clauses:
        add("投诉/异议时限提醒",
            "合同约定了争议或异议处理方式，发生纠纷时注意条款中的时限要求，"
            "先书面投诉留存工单，再逐级升级。")

    term = cs.get("loanTermMonths")
    if term:
        add("合同到期结清确认",
            f"贷款期限 {term} 个月，到期当月确认合同已结清，"
            "并向机构索取结清证明。")
    return reminders


def _evidence_checklist():
    return [
        "合同全文（PDF 或逐页拍照，含签署页）",
        "费用说明、还款计划等关键页的单独截图",
        "机构对问题清单的书面答复（聊天记录、邮件或纸质说明）",
        "每期扣款凭证 / 银行流水",
        "宣传页面或销售承诺的截图（如“零利息”“免手续费”等）",
    ]


def _communication_scripts(risk_items, limit=3):
    scripts = []
    ordered = sorted(risk_items,
                     key=lambda r: {"high": 0, "medium": 1, "low": 2}
                     .get(r.get("riskLevel"), 1))
    for risk in ordered[:limit]:
        q = (risk.get("questionToAsk") or "").strip()
        if not q:
            continue
        scripts.append({
            "scenario": risk.get("title") or risk.get("id"),
            "script": f"您好，我正在核对这份合同。{q}"
                      "麻烦提供书面说明，谢谢。",
        })
    return scripts


def _follow_up_plan():
    return [
        {
            "stage": "before_signing",
            "steps": [
                "按问题清单逐项向机构确认，并要求书面答复",
                "对照建议清单中的 must 项，未澄清前不签字、不授权扣款",
            ],
        },
        {
            "stage": "during_repayment",
            "steps": [
                "按提醒任务按期还款，并核对每期扣款金额",
                "妥善保存扣款凭证与沟通记录",
            ],
        },
        {
            "stage": "when_overdue",
            "steps": [
                "第一时间与机构协商还款安排，避免罚息滚动",
                "核对罚息计算方式是否与合同约定一致",
            ],
        },
        {
            "stage": "dispute",
            "steps": [
                "先与机构正式投诉并留存工单编号",
                "协商不成时向金融监管部门投诉热线（如 12363 / 12378）反映",
                "必要时凭证据材料申请调解或提起诉讼",
            ],
        },
    ]


def build_action_plan(b_env, c_env, d_run_id, generated_at):
    risk_items = (c_env.get("data") or {}).get("riskItems") or []
    return {
        "type": "action_plan_extension",
        "schemaVersion": "1.0.0",
        "taskId": b_env["taskId"],
        "contractId": b_env["contractId"],
        "runId": d_run_id,
        "agent": "recommendation_action",
        "generatedAt": generated_at,
        "note": "本文件为 D 模块行动管理扩展输出，不属于协议 v1.0.0 "
                "RecommendationActionOutput 的一部分，前端可选用。",
        "reminders": _reminders(b_env, c_env),
        "evidenceChecklist": _evidence_checklist(),
        "communicationScripts": _communication_scripts(risk_items),
        "followUpPlan": _follow_up_plan(),
    }
