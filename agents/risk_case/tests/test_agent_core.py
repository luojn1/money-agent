"""Core Agent regression tests."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from db.dao import save_risk_case_output
from knowledge.init_db import initialize_database
from main import AgentInputError, STANDARD_RISK_ITEM_FIELDS, build_output, validate_b_output


def test_validate_b_output_reports_missing_fields() -> None:
    with pytest.raises(AgentInputError, match="taskId"):
        validate_b_output({"data": {}})


def test_save_output_does_not_duplicate_matched_cases(tmp_path: Path) -> None:
    db_path = tmp_path / "risk_case_agent.db"
    initialize_database(db_path)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    output = {
        "runId": "run_test",
        "taskId": "task_test",
        "contractId": "contract_test",
        "inputRunIds": ["run_b"],
        "status": "completed",
        "generatedAt": "2026-07-04T00:00:00+08:00",
        "data": {
            "riskItems": [
                {
                    "id": "risk_test",
                    "title": "测试风险",
                    "category": "other",
                    "riskLevel": "low",
                    "confidence": 0.8,
                    "clauseText": "测试条款",
                    "clauseLocation": "第1条",
                    "relatedClauseIds": ["clause_1"],
                    "reason": "测试原因",
                    "possibleConsequence": "测试后果",
                    "questionToAsk": "测试问题",
                    "evidence": [
                        {
                            "evidenceId": "evidence_test",
                            "clauseId": "clause_1",
                            "quote": "测试条款",
                            "location": {},
                        }
                    ],
                    "matchedCases": [
                        {
                            "caseId": "CASE_TEST",
                            "title": "测试案例",
                            "similarity": 0.9,
                            "conclusion": "测试结论",
                            "sourceUrl": "https://example.com",
                        }
                    ],
                }
            ]
        },
    }

    save_risk_case_output(connection, output, risk_score=90)
    save_risk_case_output(connection, output, risk_score=90)
    connection.commit()

    count = connection.execute("SELECT COUNT(*) FROM risk_matched_cases WHERE risk_item_id = 'risk_test'").fetchone()[0]
    assert count == 1
    stored = json.loads(connection.execute("SELECT related_clause_ids FROM risk_items WHERE id = 'risk_test'").fetchone()[0])
    assert stored == ["clause_1"]
    connection.close()


def test_build_output_can_omit_extension_fields() -> None:
    b_output = {"taskId": "task", "contractId": "contract", "runId": "run_b", "data": {"contractSummary": {}, "costAnalysis": {}, "clauses": []}}
    item = {
        "id": "risk_1",
        "title": "风险",
        "category": "other",
        "riskLevel": "low",
        "confidence": 0.8,
        "clauseText": "条款",
        "clauseLocation": "第1条",
        "relatedClauseIds": ["clause_1"],
        "evidence": [{"evidenceId": "e1", "clauseId": "clause_1", "quote": "条款", "location": {}}],
        "reason": "原因",
        "possibleConsequence": "后果",
        "matchedCases": [],
        "questionToAsk": "问题",
        "legalReferences": [{"title": "扩展字段"}],
        "ruleEvidence": {"ruleId": "RR"},
    }

    output = build_output(b_output, [item], knowledge_usage={"riskRulesLoaded": 1}, include_extensions=False)

    assert "knowledgeUsage" not in output["data"]
    assert set(output["data"]["riskItems"][0]) <= STANDARD_RISK_ITEM_FIELDS
