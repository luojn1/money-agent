# -*- coding: utf-8 -*-
"""overallResult 判定。

协议枚举：low | verify | high | insufficient_information。
判定参考 C 交接文档第 7.4 节：
- riskSummary.high > 0        -> high
- riskSummary.medium > 0      -> verify
- 无风险且信息充分            -> low
- 关键金额/条款不可用         -> insufficient_information
不替用户做绝对的“签/不签”决策，只给行动导向的结论。
"""


def _key_amounts(b_env):
    data = b_env.get("data") or {}
    summary = data.get("contractSummary") or {}
    cost = data.get("costAnalysis") or {}
    return [
        summary.get("loanAmount"),
        summary.get("monthlyPayment"),
        cost.get("realAnnualRate"),
        cost.get("totalRepayment"),
    ]


def _key_amounts_missing(b_env):
    """B 的关键金额是否全部缺失（协议：未知标量为 null）。"""
    return all(v is None for v in _key_amounts(b_env))


def _upstream_warns_on_key_fields(b_env, c_env):
    """B/C 的 warnings 是否指向关键金额或条款字段。"""
    key_hints = ("contractSummary", "costAnalysis", "clauses")
    for env in (b_env, c_env):
        for w in env.get("warnings") or []:
            path = w.get("fieldPath") or ""
            if any(h in path for h in key_hints):
                return True
    return False


def decide_level(b_env, c_env):
    summary = ((c_env.get("data") or {}).get("riskSummary")
               or {"high": 0, "medium": 0, "low": 0})
    if _key_amounts_missing(b_env):
        return "insufficient_information"
    # 关键路径有 warning 且确有关键金额缺失才降级：
    # 上游也会发提示性 warning（如“检测到砍头息，已按实际到账计算”），
    # 金额齐全时不应掩盖真实的风险等级。
    if (_upstream_warns_on_key_fields(b_env, c_env)
            and any(v is None for v in _key_amounts(b_env))):
        return "insufficient_information"
    if summary.get("high", 0) > 0:
        return "high"
    if summary.get("medium", 0) > 0:
        return "verify"
    return "low"


def build_summary_text(level, b_env, c_env):
    data_b = b_env.get("data") or {}
    cost = data_b.get("costAnalysis") or {}
    cs = data_b.get("contractSummary") or {}
    risk_summary = ((c_env.get("data") or {}).get("riskSummary")
                    or {"high": 0, "medium": 0, "low": 0})
    real = cost.get("realAnnualRate")
    nominal = cs.get("nominalRate")

    cost_part = ""
    if real is not None and nominal is not None:
        cost_part = (f"真实年化利率约 {real}%（名义利率 {nominal}%），")
    elif real is not None:
        cost_part = f"真实年化利率约 {real}%，"

    risk_part = (f"共识别出高风险 {risk_summary.get('high', 0)} 项、"
                 f"中风险 {risk_summary.get('medium', 0)} 项、"
                 f"低风险 {risk_summary.get('low', 0)} 项。")

    conclusion = {
        "high": "建议在获得机构对高风险条款的书面澄清之前暂缓签约，"
                "并按建议清单逐项核实。",
        "verify": "合同存在需要核实的条款，建议按问题清单向机构逐项确认后再决定。",
        "low": "未发现明显风险条款，仍建议保留合同与沟通记录以备查。",
        "insufficient_information": "合同关键金额或条款信息不足，无法给出可靠结论，"
                                    "请补充完整合同后重新分析。",
    }[level]
    return cost_part + risk_part + conclusion


def build_overall_result(b_env, c_env):
    level = decide_level(b_env, c_env)
    return {
        "level": level,
        "summary": build_summary_text(level, b_env, c_env),
    }
