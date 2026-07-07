"""Tests for dynamic knowledge ingestion."""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from knowledge.init_db import initialize_database
from knowledge.ingestion.config import DataSourceConfig, save_data_source
from knowledge.ingestion.csv_importer import import_csv
from knowledge.scheduler import default_schedule_plan, run_api_source, schedule_jobs
from knowledge.versioning import approve_record, expire_old_version, history, upsert_versioned_record


def make_db(tmp_path: Path) -> sqlite3.Connection:
    db_path = tmp_path / "risk_case_agent.db"
    initialize_database(db_path)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def write_rule_csv(path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "rule_id",
                "rule_name",
                "category",
                "condition",
                "risk_level",
                "weight",
                "legal_basis",
                "created_at",
                "updated_at",
                "effective_date",
                "expiry_date",
                "source_url",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "rule_id": "RR_TEST",
                "rule_name": "测试规则",
                "category": "other",
                "condition": '{"clauses_contains_any":["测试"]}',
                "risk_level": "low",
                "weight": "5",
                "legal_basis": "测试依据",
                "created_at": "2026-07-04T00:00:00+08:00",
                "updated_at": "2026-07-04T00:00:00+08:00",
                "effective_date": "2026-07-04",
                "expiry_date": "",
                "source_url": "https://example.com/rule",
            }
        )


def test_csv_import_creates_pending_record(tmp_path: Path) -> None:
    connection = make_db(tmp_path)
    csv_path = tmp_path / "rules.csv"
    write_rule_csv(csv_path)

    result = import_csv(connection, "risk_rules", csv_path, require_review=True)
    connection.commit()

    assert result["imported"] == 1
    row = connection.execute("SELECT review_status, is_active FROM risk_rules WHERE rule_id = 'RR_TEST'").fetchone()
    assert row["review_status"] == "pending"
    assert row["is_active"] == 0


def test_approve_pending_record_makes_it_active(tmp_path: Path) -> None:
    connection = make_db(tmp_path)
    record = {
        "rule_id": "RR_APPROVE",
        "rule_name": "待审核规则",
        "category": "other",
        "condition": '{"clauses_contains_any":["审核"]}',
        "risk_level": "low",
        "weight": 5,
        "legal_basis": "测试依据",
        "created_at": "2026-07-04T00:00:00+08:00",
        "updated_at": "2026-07-04T00:00:00+08:00",
        "source": "api",
    }

    upsert_versioned_record(connection, "risk_rules", record, require_review=True)
    approve_record(connection, "risk_rules", "RR_APPROVE")
    connection.commit()

    row = connection.execute("SELECT review_status, is_active FROM risk_rules WHERE rule_id = 'RR_APPROVE'").fetchone()
    assert row["review_status"] == "approved"
    assert row["is_active"] == 1


def test_expire_old_version_and_history(tmp_path: Path) -> None:
    connection = make_db(tmp_path)

    expire_old_version(connection, "legal_regulations", "LAW001", "2026-07-04")
    logs = history(connection, "legal_regulations", "LAW001")
    connection.commit()

    row = connection.execute("SELECT is_active, expiry_date FROM legal_regulations WHERE regulation_id = 'LAW001'").fetchone()
    assert row["is_active"] == 0
    assert row["expiry_date"] == "2026-07-04"
    assert any(log["action"] == "expire" for log in logs)


def test_scheduler_configuration_without_running_jobs(tmp_path: Path) -> None:
    connection = make_db(tmp_path)
    plan = default_schedule_plan()
    scheduler = schedule_jobs(connection)

    assert len(plan) == 3
    assert scheduler is not None


def test_api_ingestion_creates_pending_and_skips_unchanged(tmp_path: Path) -> None:
    connection = make_db(tmp_path)
    fixture = Path(__file__).resolve().parent / "fixtures" / "lpr_feed.json"
    source = DataSourceConfig(
        source_id="test_lpr",
        source_name="测试 LPR 数据源",
        source_type="api",
        config={
            "fetcher_type": "pbc_lpr",
            "target_table": "market_rates",
            "primary_key": "rate_id",
            "url": fixture.as_uri(),
            "record_path": "data",
        },
        schedule="0 10 20 * *",
        status="active",
    )
    save_data_source(connection, source)

    first = run_api_source(connection, "test_lpr")
    second = run_api_source(connection, "test_lpr")
    connection.commit()

    assert first["fetched"] == 2
    assert first["importedToPendingReview"] == 2
    assert second["skippedUnchanged"] == 2
    row = connection.execute("SELECT review_status, is_active FROM market_rates WHERE rate_id = 'LPR_1Y_202607'").fetchone()
    assert row["review_status"] == "pending"
    assert row["is_active"] == 0

    approve_record(connection, "market_rates", "LPR_1Y_202607")
    connection.commit()
    approved = connection.execute("SELECT review_status, is_active FROM market_rates WHERE rate_id = 'LPR_1Y_202607'").fetchone()
    assert approved["review_status"] == "approved"
    assert approved["is_active"] == 1
