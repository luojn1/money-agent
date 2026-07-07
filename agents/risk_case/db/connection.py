"""Database connection helpers."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterator


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "risk_case_agent.db"


def get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    """Return a SQLite connection with row dictionaries enabled."""
    path = Path(db_path) if db_path else DEFAULT_DB_PATH
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def transaction(db_path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    """Context manager-like generator for explicit transaction use."""
    connection = get_connection(db_path)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
