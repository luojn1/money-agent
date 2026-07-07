# -*- coding: utf-8 -*-
"""输出自检：按协议第 8 节“联调验收规则”做结构化校验。

若本机安装了 jsonschema 且能找到 A 的
shared/schemas/analysis-protocol-v1.schema.json，则额外做 Schema 校验。
"""

ALLOWED_DATA_KEYS = {"overallResult", "recommendations", "questionList", "disclaimer"}
LEVELS = {"low", "verify", "high", "insufficient_information"}
PRIORITIES = {"must", "should", "optional"}
TIMINGS = {"before_signing", "during_repayment", "when_overdue", "anytime"}


def structural_check(d_env, b_env, c_env):
    """返回问题列表；为空表示通过。"""
    problems = []
    data = d_env.get("data")

    if d_env["status"] == "failed":
        if data is not None:
            problems.append("status=failed 时 data 必须为 null")
        if not d_env.get("errors"):
            problems.append("status=failed 时 errors 至少一项")
        return problems

    if set(data.keys()) != ALLOWED_DATA_KEYS:
        problems.append(f"data 字段必须恰为 {sorted(ALLOWED_DATA_KEYS)}，"
                        f"实际为 {sorted(data.keys())}")

    if d_env["taskId"] != b_env["taskId"] or d_env["contractId"] != b_env["contractId"]:
        problems.append("taskId/contractId 与上游不一致")

    input_run_ids = d_env.get("inputRunIds") or []
    if b_env["runId"] not in input_run_ids or c_env["runId"] not in input_run_ids:
        problems.append("inputRunIds 必须同时包含 B 和 C 的 runId")

    overall = data.get("overallResult") or {}
    if overall.get("level") not in LEVELS:
        problems.append(f"overallResult.level 非法: {overall.get('level')}")
    if not (overall.get("summary") or "").strip():
        problems.append("overallResult.summary 不能为空")

    risk_ids = {r["id"] for r in (c_env.get("data") or {}).get("riskItems") or []}
    rec_ids = set()
    for rec in data.get("recommendations") or []:
        if rec["id"] in rec_ids:
            problems.append(f"recommendation id 重复: {rec['id']}")
        rec_ids.add(rec["id"])
        if rec.get("priority") not in PRIORITIES:
            problems.append(f"{rec['id']} priority 非法")
        if rec.get("timing") not in TIMINGS:
            problems.append(f"{rec['id']} timing 非法")
        if not (rec.get("action") or "").strip() or not (rec.get("rationale") or "").strip():
            problems.append(f"{rec['id']} action/rationale 不能为空")
        for rid in rec.get("relatedRiskIds") or []:
            if rid not in risk_ids:
                problems.append(f"{rec['id']} 引用了不存在的风险 ID: {rid}")

    for q in data.get("questionList") or []:
        if not (q or "").strip():
            problems.append("questionList 存在空字符串")

    if not (data.get("disclaimer") or "").strip():
        problems.append("disclaimer 不得省略")

    if d_env["status"] == "partial" and not d_env.get("warnings"):
        problems.append("status=partial 时应在 warnings 说明缺失项")
    return problems


def schema_check(d_env, schema_path):
    """可选：用 A 的 JSON Schema 校验。未安装 jsonschema 时返回 None（跳过）。"""
    try:
        import jsonschema
    except ImportError:
        return None
    import json
    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)
    ref_schema = dict(schema)
    ref_schema.pop("oneOf", None)
    ref_schema["$ref"] = "#/$defs/recommendationActionOutput"
    validator_cls = getattr(jsonschema, "Draft202012Validator", None)
    if validator_cls is None:
        # 旧版 jsonschema 不支持 2020-12 草案（$defs/unevaluatedProperties），
        # 无法可靠校验，视为跳过。
        return None
    validator = validator_cls(ref_schema)
    return [f"{'/'.join(map(str, e.path))}: {e.message}"
            for e in validator.iter_errors(d_env)]
