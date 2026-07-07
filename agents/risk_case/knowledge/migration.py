"""Schema migration helpers for dynamic knowledge ingestion."""

from __future__ import annotations

import sqlite3


COMMON_COLUMNS = {
    "version": "INTEGER NOT NULL DEFAULT 1",
    "effective_date": "TEXT",
    "expiry_date": "TEXT",
    "is_active": "INTEGER NOT NULL DEFAULT 1",
    "source": "TEXT NOT NULL DEFAULT 'manual'",
    "source_url": "TEXT",
    "imported_at": "TEXT",
    "review_status": "TEXT NOT NULL DEFAULT 'approved'",
}

KNOWLEDGE_TABLES = [
    "risk_rules",
    "legal_regulations",
    "cases",
    "contract_clause_templates",
    "financial_products",
    "market_rates",
    "financial_glossary",
]


def table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    """Return current column names for a SQLite table."""
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def add_column_if_missing(connection: sqlite3.Connection, table_name: str, column_name: str, column_spec: str) -> None:
    """Add one column if it is missing."""
    if column_name in table_columns(connection, table_name):
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_spec}")


def migrate_dynamic_knowledge_schema(connection: sqlite3.Connection) -> None:
    """Make the existing MVP schema support dynamic knowledge ingestion."""
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS market_rates (
            rate_id TEXT PRIMARY KEY,
            rate_type TEXT NOT NULL,
            rate_value REAL NOT NULL,
            effective_date TEXT NOT NULL,
            source TEXT
        );

        CREATE TABLE IF NOT EXISTS financial_glossary (
            term_id TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            definition TEXT NOT NULL,
            category TEXT NOT NULL,
            example TEXT
        );
        """
    )
    add_column_if_missing(connection, "risk_rules", "question_to_ask", "TEXT")

    for table_name in KNOWLEDGE_TABLES:
        existing = table_columns(connection, table_name)
        for column_name, column_spec in COMMON_COLUMNS.items():
            if column_name == "source_url" and column_name in existing:
                continue
            add_column_if_missing(connection, table_name, column_name, column_spec)

    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS knowledge_change_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'approve', 'reject', 'rollback', 'expire')),
            old_value TEXT,
            new_value TEXT,
            changed_by TEXT NOT NULL,
            changed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS data_source_config (
            source_id TEXT PRIMARY KEY,
            source_name TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'api', 'json')),
            config TEXT NOT NULL,
            schedule TEXT,
            last_run_at TEXT,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS pending_knowledge_updates (
            pending_id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
            payload TEXT NOT NULL,
            old_value TEXT,
            content_hash TEXT,
            source TEXT NOT NULL,
            submitted_by TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            review_status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS knowledge_ingestion_state (
            source_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            last_imported_at TEXT,
            status TEXT NOT NULL DEFAULT 'seen',
            PRIMARY KEY (source_id, table_name, record_id)
        );
        """
    )
    add_column_if_missing(connection, "pending_knowledge_updates", "content_hash", "TEXT")
