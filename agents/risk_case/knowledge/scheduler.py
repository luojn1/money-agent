"""Scheduled dynamic knowledge ingestion jobs."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from db.dao import assert_known_table
from db.connection import DEFAULT_DB_PATH, get_connection
from knowledge.ingestion.api_fetcher import build_fetcher
from knowledge.ingestion.config import load_active_data_sources
from knowledge.versioning import expire_due_records, mark_ingestion_seen, should_import_record, stable_content_hash, upsert_versioned_record


def now_iso() -> str:
    return datetime.now(timezone(timedelta(hours=8))).replace(microsecond=0).isoformat()


def run_api_source(connection: sqlite3.Connection, source_id: str) -> dict[str, Any]:
    """Run one configured source once, writing new/changed records to pending review."""
    row = connection.execute("SELECT * FROM data_source_config WHERE source_id = ?", (source_id,)).fetchone()
    if not row:
        raise ValueError(f"Data source not found: {source_id}")
    config = json.loads(row["config"])
    fetcher = build_fetcher(config.get("fetcher_type", row["source_type"]), config)
    records = fetcher.parse(fetcher.fetch())
    table_name = assert_known_table(config["target_table"])
    pk = config.get("primary_key") or primary_key_for_table(table_name)

    imported = 0
    skipped = 0
    pending_ids: list[str] = []
    for record in records:
        record_id = str(record[pk])
        content_hash = stable_content_hash(record)
        if not should_import_record(connection, row["source_id"], table_name, record_id, content_hash):
            mark_ingestion_seen(connection, row["source_id"], table_name, record_id, content_hash, imported=False)
            skipped += 1
            continue
        upsert_versioned_record(connection, table_name, record, changed_by=f"source:{source_id}", require_review=True)
        mark_ingestion_seen(connection, row["source_id"], table_name, record_id, content_hash, imported=True)
        pending_ids.append(record_id)
        imported += 1

    expired = expire_due_records(connection, changed_by=f"source:{source_id}")
    connection.execute("UPDATE data_source_config SET last_run_at = ? WHERE source_id = ?", (now_iso(), source_id))
    return {
        "sourceId": source_id,
        "table": table_name,
        "fetched": len(records),
        "importedToPendingReview": imported,
        "skippedUnchanged": skipped,
        "expiredRecords": expired,
        "pendingRecordIds": pending_ids,
    }


def run_all_sources(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    """Run all active API/JSON sources once."""
    with get_connection(db_path) as connection:
        sources = load_active_data_sources(connection)
        results = []
        for source in sources:
            if source.source_type not in {"api", "json"}:
                continue
            results.append(run_api_source(connection, source.source_id))
        connection.commit()
        return results


def schedule_jobs(connection: sqlite3.Connection, db_path: str | Path | None = None):
    """Create APScheduler jobs for active API/JSON sources.

    Each job opens its own SQLite connection, avoiding cross-thread connection
    reuse. If APScheduler is not installed, returns a descriptive dict.
    """
    db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
    sources = load_active_data_sources(connection)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        return {
            "scheduler": "unavailable",
            "reason": "APScheduler is not installed",
            "jobs": [
                {"sourceId": source.source_id, "schedule": source.schedule}
                for source in sources
                if source.schedule
            ],
        }

    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
    for source in sources:
        if not source.schedule or source.source_type not in {"api", "json"}:
            continue
        minute, hour, day, month, day_of_week = source.schedule.split()
        scheduler.add_job(
            run_source_with_own_connection,
            CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week),
            args=[str(db_path), source.source_id],
            id=f"knowledge_{source.source_id}",
            replace_existing=True,
        )
    return scheduler


def run_source_with_own_connection(db_path: str, source_id: str) -> dict[str, Any]:
    with get_connection(db_path) as connection:
        result = run_api_source(connection, source_id)
        connection.commit()
        return result


def primary_key_for_table(table_name: str) -> str:
    table_name = assert_known_table(table_name)
    mapping = {
        "risk_rules": "rule_id",
        "legal_regulations": "regulation_id",
        "cases": "case_id",
        "contract_clause_templates": "template_id",
        "financial_products": "product_id",
        "market_rates": "rate_id",
        "financial_glossary": "term_id",
    }
    return mapping[table_name]


def default_schedule_plan() -> list[dict[str, str]]:
    """Document the intended production schedule."""
    return [
        {"job": "weekly_regulation_check", "schedule": "0 9 * * 1", "description": "??? 09:00 ????????"},
        {"job": "monthly_lpr_update", "schedule": "0 10 20 * *", "description": "?? 20 ? 10:00 ???? LPR ???????"},
        {"job": "monthly_case_update", "schedule": "0 10 1 * *", "description": "?? 1 ? 10:00 ??????????/????"},
    ]
