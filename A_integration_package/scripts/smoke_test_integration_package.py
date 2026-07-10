# -*- coding: utf-8 -*-
"""Smoke test for the A integration package.

Run from repository root after copying this package into the main repo:
    python scripts/smoke_test_integration_package.py

It does not require Node.js or database access. It verifies the portable parts:
- B scenario rule seed data can recognize credit-card installment.
- B scenario rule seed data can recognize education-training loan.
- B sample outputs carry contractType and scenarioSignals.
- D scenario recommender generates the two expected scene recommendations.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_json(relative: str) -> Any:
    with (ROOT / relative).open(encoding="utf-8") as file:
        return json.load(file)


def normalize(text: str) -> str:
    for item in [" ", "\n", "\r", "\t", "，", "。", "；", "：", "、", ",", "."]:
        text = text.replace(item, "")
    return text.lower()


def match_rule(text: str, rule: dict[str, Any]) -> bool:
    normalized = normalize(text)
    groups = rule.get("condition", {}).get("all_keyword_groups", [])
    return all(any(normalize(keyword) in normalized for keyword in group) for group in groups)


def detect_by_seed_rules(text: str) -> str | None:
    rules = load_json("knowledge/seed_data/scenario_rules/scenario_recognition_rules.json")
    matched = [
        rule
        for rule in rules
        if rule.get("is_active") and match_rule(text, rule)
    ]
    matched.sort(key=lambda item: item.get("priority", 0), reverse=True)
    return matched[0]["contract_type"] if matched else None


def import_scenario_recommender():
    path = ROOT / "agents/recommendation_action/engine/scenario_recommender.py"
    spec = importlib.util.spec_from_file_location("scenario_recommender", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")
    print(f"[PASS] {label}")


def assert_true(value: bool, label: str) -> None:
    if not value:
        raise AssertionError(label)
    print(f"[PASS] {label}")


def main() -> int:
    credit_text = "本协议为信用卡账单分期，按每期手续费率0.6%收取分期手续费。"
    training_text = "本合同用于教育培训课程学费，用户通过学费分期贷款支付培训费。"
    assert_equal(detect_by_seed_rules(credit_text), "credit_card_installment", "B seed rule recognizes credit-card installment")
    assert_equal(detect_by_seed_rules(training_text), "education_training_loan", "B seed rule recognizes education-training loan")

    credit_b = load_json("data_samples/protocol/b-credit-card-installment-output.json")
    training_b = load_json("data_samples/protocol/b-education-training-loan-output.json")
    assert_equal(credit_b["data"]["contractSummary"]["contractType"], "credit_card_installment", "credit-card B sample contractType")
    assert_equal(training_b["data"]["contractSummary"]["contractType"], "education_training_loan", "training-loan B sample contractType")
    assert_true(bool(credit_b["data"]["contractSummary"]["scenarioSignals"]), "credit-card B sample has scenarioSignals")
    assert_true(bool(training_b["data"]["contractSummary"]["scenarioSignals"]), "training-loan B sample has scenarioSignals")

    recommender = import_scenario_recommender()
    c_output = {
        "data": {
            "riskItems": [
                {
                    "id": "risk_credit_001",
                    "title": "信用卡分期手续费未充分明示",
                    "reason": "信用卡账单分期存在分期手续费和提前结清费用。",
                    "questionToAsk": "请确认分期手续费折算真实年化是多少？",
                    "clauseText": "本信用卡账单分期按每期收取手续费。",
                    "matchedCases": [],
                },
                {
                    "id": "risk_training_001",
                    "title": "培训贷退课后贷款处理不清",
                    "reason": "培训课程退费与贷款合同解除关系不明确。",
                    "questionToAsk": "退课时贷款是否同步解除？",
                    "clauseText": "培训机构停止服务后贷款合同仍需另行协商。",
                    "matchedCases": [],
                },
            ]
        }
    }
    c_trace = {
        "scenarioSignals": [
            {"scenarioId": "credit_card_installment"},
            {"scenarioId": "education_training_loan"},
        ]
    }
    recommendations = recommender.build_scenario_recommendations(c_output, c_trace)
    recommendation_ids = {item["id"] for item in recommendations}
    assert_true("action_scene_credit_card_installment_001" in recommendation_ids, "D emits credit-card scene recommendation")
    assert_true("action_scene_education_training_loan_001" in recommendation_ids, "D emits training-loan scene recommendation")
    assert_true(all(item.get("relatedRiskIds") for item in recommendations), "D scene recommendations keep relatedRiskIds")

    sql_contract = (ROOT / "knowledge/seed_data/contract_templates/contract_clause_templates.sql").read_text(encoding="utf-8")
    sql_rules = (ROOT / "knowledge/seed_data/scenario_rules/scenario_recognition_rules.sql").read_text(encoding="utf-8")
    assert_true("contract_clause_templates" in sql_contract, "contract template SQL contains target table")
    assert_true("scenario_recognition_rules" in sql_rules, "scenario rule SQL contains target table")

    print("\nSmoke test passed. The integration package is ready for A to merge.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        raise SystemExit(1)

