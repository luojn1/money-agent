"""Knowledge version management and change log support."""

from __future__ import annotations

import json
import sqlite3
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any

from db.dao import assert_known_table


PRIMARY_KEYS = {
    "risk_rules": "rule_id",
    "legal_regulations": "regulation_id",
    "cases": "case_id",
    "contract_clause_templates": "template_id",
    "financial_products": "product_id",
    "market_rates": "rate_id",
    "financial_glossary": "term_id",
}


def now_iso() -> str:
    return datetime.now(timezone(timedelta(hours=8))).replace(microsecond=0).isoformat()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def get_record(connection: sqlite3.Connection, table_name: str, record_id: str) -> dict[str, Any] | None:
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    row = connection.execute(f"SELECT * FROM {table_name} WHERE {pk} = ?", (record_id,)).fetchone()
    return row_to_dict(row)


def stable_content_hash(record: dict[str, Any]) -> str:
    """Hash a knowledge record while ignoring volatile ingestion metadata."""
    ignored = {
        "version",
        "imported_at",
        "review_status",
        "is_active",
        "content_hash",
    }
    payload = {key: value for key, value in record.items() if key not in ignored}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def log_change(connection: sqlite3.Connection, table_name: str, record_id: str, action: str, old_value: dict[str, Any] | None, new_value: dict[str, Any] | None, changed_by: str = "system") -> None:
    assert_known_table(table_name)
    connection.execute(
        """
        INSERT INTO knowledge_change_log
        (table_name, record_id, action, old_value, new_value, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            table_name,
            record_id,
            action,
            json.dumps(old_value, ensure_ascii=False) if old_value is not None else None,
            json.dumps(new_value, ensure_ascii=False) if new_value is not None else None,
            changed_by,
            now_iso(),
        ),
    )


def _insert_pending_update(connection: sqlite3.Connection, table_name: str, record_id: str, action: str, payload: dict[str, Any], old_value: dict[str, Any] | None, changed_by: str, content_hash: str | None = None) -> None:
    connection.execute(
        """
        INSERT INTO pending_knowledge_updates
        (table_name, record_id, action, payload, old_value, content_hash, source, submitted_by, submitted_at, review_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        """,
        (
            table_name,
            record_id,
            action,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(old_value, ensure_ascii=False) if old_value else None,
            content_hash,
            payload.get("source") or "unknown",
            changed_by,
            now_iso(),
        ),
    )
    log_change(connection, table_name, record_id, action, old_value, payload, changed_by)


def expire_old_version(connection: sqlite3.Connection, table_name: str, record_id: str, expiry_date: str, changed_by: str = "system") -> None:
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    old_value = get_record(connection, table_name, record_id)
    if not old_value:
        return
    connection.execute(
        f"UPDATE {table_name} SET is_active = 0, expiry_date = ?, review_status = 'approved' WHERE {pk} = ?",
        (expiry_date, record_id),
    )
    new_value = get_record(connection, table_name, record_id)
    log_change(connection, table_name, record_id, "expire", old_value, new_value, changed_by)


def _write_record(connection: sqlite3.Connection, table_name: str, record: dict[str, Any]) -> None:
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    valid_columns = table_columns(connection, table_name)
    columns = [column for column in record.keys() if column in valid_columns]
    if pk not in columns:
        raise ValueError(f"Record for {table_name} must include primary key {pk}")
    placeholders = ", ".join("?" for _ in columns)
    update_set = ", ".join(f"{column} = excluded.{column}" for column in columns if column != pk)
    sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders}) ON CONFLICT({pk}) DO UPDATE SET {update_set}"
    connection.execute(sql, [record[column] for column in columns])


def upsert_versioned_record(connection: sqlite3.Connection, table_name: str, record: dict[str, Any], changed_by: str = "system", require_review: bool = True) -> str:
    """Insert/update a knowledge record with review-first versioning."""
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    record_id = str(record[pk])
    existing = get_record(connection, table_name, record_id)
    action = "insert" if existing is None else "update"
    next_version = int((existing or {}).get("version") or 0) + 1 if existing else int(record.get("version") or 1)
    record = {**record, "version": next_version, "imported_at": now_iso()}

    content_hash = stable_content_hash(record)

    if require_review and existing:
        record = {**record, "review_status": "pending", "is_active": 0}
        _insert_pending_update(connection, table_name, record_id, "update", record, existing, changed_by, content_hash)
        return record_id

    record = {
        **record,
        "is_active": 0 if require_review else 1,
        "review_status": "pending" if require_review else "approved",
    }
    _write_record(connection, table_name, record)
    if require_review:
        _insert_pending_update(connection, table_name, record_id, "insert", record, existing, changed_by, content_hash)
    log_change(connection, table_name, record_id, action, existing, get_record(connection, table_name, record_id), changed_by)
    return record_id


def get_ingestion_state(connection: sqlite3.Connection, source_id: str, table_name: str, record_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT * FROM knowledge_ingestion_state
        WHERE source_id = ? AND table_name = ? AND record_id = ?
        """,
        (source_id, table_name, record_id),
    ).fetchone()
    return row_to_dict(row)


def mark_ingestion_seen(connection: sqlite3.Connection, source_id: str, table_name: str, record_id: str, content_hash: str, imported: bool) -> None:
    existing = get_ingestion_state(connection, source_id, table_name, record_id)
    current_time = now_iso()
    if existing:
        connection.execute(
            """
            UPDATE knowledge_ingestion_state
            SET content_hash = ?, last_seen_at = ?, last_imported_at = CASE WHEN ? THEN ? ELSE last_imported_at END, status = ?
            WHERE source_id = ? AND table_name = ? AND record_id = ?
            """,
            (
                content_hash,
                current_time,
                1 if imported else 0,
                current_time,
                "imported" if imported else "unchanged",
                source_id,
                table_name,
                record_id,
            ),
        )
        return
    connection.execute(
        """
        INSERT INTO knowledge_ingestion_state
        (source_id, table_name, record_id, content_hash, first_seen_at, last_seen_at, last_imported_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_id,
            table_name,
            record_id,
            content_hash,
            current_time,
            current_time,
            current_time if imported else None,
            "imported" if imported else "unchanged",
        ),
    )


def should_import_record(connection: sqlite3.Connection, source_id: str, table_name: str, record_id: str, content_hash: str) -> bool:
    state = get_ingestion_state(connection, source_id, table_name, record_id)
    return state is None or state.get("content_hash") != content_hash


def expire_due_records(connection: sqlite3.Connection, changed_by: str = "system") -> int:
    """Mark active records expired when expiry_date has passed."""
    today = now_iso()[:10]
    expired = 0
    for table_name, pk in PRIMARY_KEYS.items():
        rows = connection.execute(
            f"SELECT {pk} FROM {table_name} WHERE is_active = 1 AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date < ?",
            (today,),
        ).fetchall()
        for row in rows:
            expire_old_version(connection, table_name, row[pk], today, changed_by)
            expired += 1
    return expired


def table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({assert_known_table(table_name)})").fetchall()
    return {row[1] for row in rows}


def approve_record(connection: sqlite3.Connection, table_name: str, record_id: str, changed_by: str = "reviewer") -> None:
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    pending = connection.execute(
        "SELECT * FROM pending_knowledge_updates WHERE table_name = ? AND record_id = ? AND review_status = 'pending' ORDER BY pending_id DESC LIMIT 1",
        (table_name, record_id),
    ).fetchone()
    if pending:
        payload = json.loads(pending["payload"])
        existing = get_record(connection, table_name, record_id)
        if existing:
            expire_old_version(connection, table_name, record_id, now_iso()[:10], changed_by)
        payload = {**payload, "review_status": "approved", "is_active": 1, "expiry_date": None}
        _write_record(connection, table_name, payload)
        connection.execute("UPDATE pending_knowledge_updates SET review_status = 'approved' WHERE pending_id = ?", (pending["pending_id"],))
        log_change(connection, table_name, record_id, "approve", existing, get_record(connection, table_name, record_id), changed_by)
        return

    old_value = get_record(connection, table_name, record_id)
    connection.execute(f"UPDATE {table_name} SET review_status = 'approved', is_active = 1, expiry_date = NULL WHERE {pk} = ?", (record_id,))
    log_change(connection, table_name, record_id, "approve", old_value, get_record(connection, table_name, record_id), changed_by)


def reject_record(connection: sqlite3.Connection, table_name: str, record_id: str, changed_by: str = "reviewer") -> None:
    table_name = assert_known_table(table_name)
    pk = PRIMARY_KEYS[table_name]
    old_value = get_record(connection, table_name, record_id)
    connection.execute("UPDATE pending_knowledge_updates SET review_status = 'rejected' WHERE table_name = ? AND record_id = ? AND review_status = 'pending'", (table_name, record_id))
    if old_value and old_value.get("review_status") == "pending":
        connection.execute(f"UPDATE {table_name} SET review_status = 'rejected', is_active = 0 WHERE {pk} = ?", (record_id,))
    log_change(connection, table_name, record_id, "reject", old_value, get_record(connection, table_name, record_id), changed_by)


def history(connection: sqlite3.Connection, table_name: str, record_id: str) -> list[dict[str, Any]]:
    table_name = assert_known_table(table_name)
    rows = connection.execute(
        "SELECT * FROM knowledge_change_log WHERE table_name = ? AND record_id = ? ORDER BY log_id",
        (table_name, record_id),
    ).fetchall()
    return [dict(row) for row in rows]


def rollback_to_log(connection: sqlite3.Connection, log_id: int, changed_by: str = "reviewer") -> None:
    row = connection.execute("SELECT * FROM knowledge_change_log WHERE log_id = ?", (log_id,)).fetchone()
    if not row:
        raise ValueError(f"Change log not found: {log_id}")
    log = dict(row)
    old_value = json.loads(log["old_value"]) if log["old_value"] else None
    if old_value is None:
        raise ValueError("Cannot rollback an insert log without old_value.")
    table_name = assert_known_table(log["table_name"])
    _write_record(connection, table_name, old_value)
    log_change(connection, table_name, str(old_value[PRIMARY_KEYS[table_name]]), "rollback", json.loads(log["new_value"]), old_value, changed_by)
