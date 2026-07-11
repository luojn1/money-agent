# -*- coding: utf-8 -*-
"""D 模块单元测试。运行：在 recommendation_action_agent 目录执行 python -m pytest"""
import copy
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

import pytest

from main import run, DISCLAIMER
from engine.validator import structural_check, ALLOWED_DATA_KEYS
from engine.recommender import PRIORITY_BY_LEVEL, build_recommendations

B_PATH = os.path.join(BASE, "examples", "b-contract-cost-output.json")
C_PATH = os.path.join(BASE, "examples", "c-risk-case-output.json")


@pytest.fixture(scope="module")
def result():
    return run(B_PATH, C_PATH)


def _write_tmp(tmp_path, env, name):
    p = tmp_path / name
    p.write_text(json.dumps(env, ensure_ascii=False), encoding="utf-8")
    return str(p)


def test_completed_and_protocol_shape(result):
    d_env, plan, (b_env, c_env) = result
    assert d_env["status"] == "completed"
    assert d_env["agent"] == "recommendation_action"
    assert set(d_env["data"].keys()) == ALLOWED_DATA_KEYS
    assert d_env["data"]["disclaimer"] == DISCLAIMER
    assert structural_check(d_env, b_env, c_env) == []


def test_input_run_ids(result):
    d_env, _, (b_env, c_env) = result
    assert b_env["runId"] in d_env["inputRunIds"]
    assert c_env["runId"] in d_env["inputRunIds"]
    assert d_env["taskId"] == b_env["taskId"] == c_env["taskId"]


def test_related_risk_ids_resolve(result):
    d_env, _, (_, c_env) = result
    risk_ids = {r["id"] for r in c_env["data"]["riskItems"]}
    for rec in d_env["data"]["recommendations"]:
        for rid in rec["relatedRiskIds"]:
            assert rid in risk_ids


def test_priority_mapping(result):
    d_env, _, (_, c_env) = result
    level_by_id = {r["id"]: r["riskLevel"] for r in c_env["data"]["riskItems"]}
    for rec in d_env["data"]["recommendations"]:
        if len(rec["relatedRiskIds"]) == 1:
            level = level_by_id[rec["relatedRiskIds"][0]]
            assert rec["priority"] == PRIORITY_BY_LEVEL[level]


def test_aggregate_must_when_high_risk(result):
    d_env, _, (_, c_env) = result
    assert c_env["data"]["riskSummary"]["high"] > 0
    first = d_env["data"]["recommendations"][0]
    assert first["id"] == "action_overall_001"
    assert first["priority"] == "must"
    assert first["timing"] == "before_signing"


def test_overall_level_high(result):
    d_env, _, _ = result
    assert d_env["data"]["overallResult"]["level"] == "high"
    assert d_env["data"]["overallResult"]["summary"].strip()


def test_question_list(result):
    d_env, _, (_, c_env) = result
    questions = d_env["data"]["questionList"]
    assert questions == list(dict.fromkeys(questions))  # 无重复
    source = {r["questionToAsk"] for r in c_env["data"]["riskItems"]}
    assert all(q in source for q in questions)


def test_action_plan(result):
    _, plan, _ = result
    assert plan["type"] == "action_plan_extension"
    assert len(plan["reminders"]) >= 1
    assert plan["evidenceChecklist"]
    assert plan["communicationScripts"]
    assert {s["stage"] for s in plan["followUpPlan"]} == {
        "before_signing", "during_repayment", "when_overdue", "dispute"}


def test_partial_propagation(tmp_path):
    c_env = json.load(open(C_PATH, encoding="utf-8"))
    c_env["status"] = "partial"
    c_env["warnings"] = [{"code": "MISSING_CASE_DB", "message": "案例库部分缺失",
                          "fieldPath": "data.riskItems"}]
    c_path = _write_tmp(tmp_path, c_env, "c_partial.json")
    d_env, _, _ = run(B_PATH, c_path)
    assert d_env["status"] == "partial"
    assert any(w["code"].startswith("C_") for w in d_env["warnings"])


def test_upstream_failed(tmp_path):
    c_env = json.load(open(C_PATH, encoding="utf-8"))
    c_env["status"] = "failed"
    c_env["data"] = None
    c_env["errors"] = [{"code": "X", "message": "boom", "fieldPath": None,
                        "recoverable": False}]
    c_path = _write_tmp(tmp_path, c_env, "c_failed.json")
    d_env, plan, _ = run(B_PATH, c_path)
    assert d_env["status"] == "failed"
    assert d_env["data"] is None
    assert d_env["errors"]
    assert plan is None


def test_upstream_link_mismatch_returns_failed(tmp_path):
    c_env = json.load(open(C_PATH, encoding="utf-8"))
    c_env["taskId"] = "task_mismatch"
    c_path = _write_tmp(tmp_path, c_env, "c_mismatch.json")

    d_env, plan, _ = run(B_PATH, c_path)

    assert d_env["status"] == "failed"
    assert d_env["data"] is None
    assert d_env["errors"][0]["code"] == "UPSTREAM_LINK_MISMATCH"
    assert plan is None


def test_insufficient_information(tmp_path):
    b_env = json.load(open(B_PATH, encoding="utf-8"))
    for k in ("loanAmount", "monthlyPayment"):
        b_env["data"]["contractSummary"][k] = None
    b_env["data"]["costAnalysis"]["realAnnualRate"] = None
    b_env["data"]["costAnalysis"]["totalRepayment"] = None
    b_path = _write_tmp(tmp_path, b_env, "b_missing.json")
    d_env, _, _ = run(b_path, C_PATH)
    assert d_env["data"]["overallResult"]["level"] == "insufficient_information"


def test_user_profile_recommendations():
    d_env, _, _ = run(B_PATH, C_PATH, user_profile={
        "firstTimeBorrower": True, "hasOtherDebts": True, "scenario": "medical"})
    ids = {r["id"] for r in d_env["data"]["recommendations"]}
    assert {"action_profile_first_001", "action_profile_debt_001",
            "action_profile_medical_001"} <= ids


def test_comparison_recommendation(result):
    """说明书 5.2.5：签约前对比其他金融产品。"""
    d_env, _, (_, c_env) = result
    recs = {r["id"]: r for r in d_env["data"]["recommendations"]}
    assert "action_compare_001" in recs
    rec = recs["action_compare_001"]
    assert rec["timing"] == "before_signing"
    interest_ids = {r["id"] for r in c_env["data"]["riskItems"]
                    if r["category"] == "interest_fee"}
    assert set(rec["relatedRiskIds"]) == interest_ids


def test_duplicate_actions_merge_and_keep_all_risk_links():
    risks = [
        {
            "id": "risk_repayment_high",
            "title": "扣款金额待核对",
            "category": "repayment",
            "riskLevel": "high",
            "reason": "命中规则“还款安排不明确”。",
            "possibleConsequence": "该条款可能增加用户的资金、履约或维权成本。",
            "matchedCases": [],
            "questionToAsk": "每期具体扣款多少？",
        },
        {
            "id": "risk_repayment_medium",
            "title": "还款日待确认",
            "category": "repayment",
            "riskLevel": "medium",
            "reason": "命中规则“还款日期不明确”。",
            "possibleConsequence": "该条款可能增加用户的资金、履约或维权成本。",
            "matchedCases": [],
            "questionToAsk": "每月几号还款？",
        },
    ]

    recommendations = build_recommendations(risks)
    repayment_actions = [
        item for item in recommendations
        if item["action"].startswith("设置还款日前 3 天提醒")
    ]

    assert len(repayment_actions) == 1
    assert repayment_actions[0]["priority"] == "must"
    assert set(repayment_actions[0]["relatedRiskIds"]) == {
        "risk_repayment_high", "risk_repayment_medium"}
    assert "另有 1 处条款" in repayment_actions[0]["rationale"]
    assert "该条款可能增加用户的资金、履约或维权成本" not in repayment_actions[0]["rationale"]
    assert all(risk["questionToAsk"] not in repayment_actions[0]["action"]
               for risk in risks)


def test_refund_reminder_from_clauses(tmp_path):
    """说明书 5.2.6：退费/退订期限提醒（从条款文本识别）。"""
    b_env = json.load(open(B_PATH, encoding="utf-8"))
    b_env["data"]["clauses"].append({
        "clauseId": "clause_refund_099",
        "category": "other",
        "text": "乙方可在服务开始前申请退费，退费申请须在合同签订后 7 日内提出。",
        "location": {"page": 6, "section": "退费条款", "paragraph": 1},
    })
    b_path = _write_tmp(tmp_path, b_env, "b_refund.json")
    _, plan, _ = run(b_path, C_PATH)
    titles = [r["title"] for r in plan["reminders"]]
    assert "退费/退订期限确认" in titles


def test_jsonschema_if_available():
    # 与 main.py 相同的自动发现：仓库 shared/schemas/，不依赖个人电脑 A/xxx 目录
    from main import find_schema
    schema_path = find_schema()
    if not schema_path:
        pytest.skip("仓库 shared/schemas/ 下未找到协议 schema")
    try:
        import jsonschema  # noqa: F401
    except ImportError:
        pytest.skip("未安装 jsonschema")
    from engine.validator import schema_check
    d_env, _, _ = run(B_PATH, C_PATH)
    assert schema_check(d_env, schema_path) == []
