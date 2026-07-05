"""Initialize the risk_case Agent SQLite knowledge database."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from knowledge.migration import migrate_dynamic_knowledge_schema


DB_PATH = ROOT_DIR / "risk_case_agent.db"
BASE_SQL_FILES = [
    "schema.sql",
]
SEED_SQL_FILES = [
    "seed_rules.sql",
    "seed_regulations.sql",
    "seed_cases.sql",
    "seed_templates.sql",
    "seed_products.sql",
]
EXPANDED_SEED_FILES = [
    Path("seed_data") / "risk_rules" / "risk_rules.sql",
    Path("seed_data") / "legal_regulations" / "legal_regulations.sql",
    Path("seed_data") / "cases" / "cases.sql",
    Path("seed_data") / "contract_templates" / "contract_templates.sql",
    Path("seed_data") / "financial_products" / "financial_products.sql",
    Path("seed_data") / "market_rates" / "market_rates.sql",
    Path("seed_data") / "financial_glossary" / "financial_glossary.sql",
]


def _table_count(connection: sqlite3.Connection, table_name: str) -> int:
    try:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])
    except sqlite3.Error:
        return 0


def _should_load_seed_data(connection: sqlite3.Connection) -> bool:
    """Load seed data only for an empty knowledge database."""
    return _table_count(connection, "risk_rules") == 0


def initialize_database(db_path: Path = DB_PATH, load_seed: bool | None = None) -> Path:
    """Create tables and migrations without overwriting reviewed knowledge.

    Seed data is loaded only when the knowledge tables are empty unless
    ``load_seed`` is explicitly set.
    """
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        for filename in BASE_SQL_FILES:
            sql_path = Path(__file__).resolve().parent / filename
            connection.executescript(sql_path.read_text(encoding="utf-8"))
        migrate_dynamic_knowledge_schema(connection)
        should_seed = _should_load_seed_data(connection) if load_seed is None else load_seed
        if should_seed:
            for filename in SEED_SQL_FILES:
                sql_path = Path(__file__).resolve().parent / filename
                connection.executescript(sql_path.read_text(encoding="utf-8"))
            for relative_path in EXPANDED_SEED_FILES:
                sql_path = Path(__file__).resolve().parent / relative_path
                if sql_path.exists():
                    connection.executescript(sql_path.read_text(encoding="utf-8"))
        connection.commit()
    return db_path


if __name__ == "__main__":
    path = initialize_database()
    print(f"Initialized database: {path}")
