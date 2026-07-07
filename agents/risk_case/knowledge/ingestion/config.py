"""Data source configuration for dynamic knowledge ingestion."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DataSourceConfig:
    source_id: str
    source_name: str
    source_type: str
    config: dict[str, Any]
    schedule: str | None = None
    status: str = "active"
    field_mapping: dict[str, str] = field(default_factory=dict)

    def validate(self) -> None:
        if self.source_type not in {"csv", "api", "json"}:
            raise ValueError("source_type must be one of csv/api/json")
        if not self.source_id or not self.source_name:
            raise ValueError("source_id and source_name are required")


def save_data_source(connection: sqlite3.Connection, data_source: DataSourceConfig) -> None:
    data_source.validate()
    payload = {
        **data_source.config,
        "field_mapping": data_source.field_mapping,
    }
    connection.execute(
        """
        INSERT INTO data_source_config
        (source_id, source_name, source_type, config, schedule, last_run_at, status)
        VALUES (?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(source_id) DO UPDATE SET
            source_name = excluded.source_name,
            source_type = excluded.source_type,
            config = excluded.config,
            schedule = excluded.schedule,
            status = excluded.status
        """,
        (
            data_source.source_id,
            data_source.source_name,
            data_source.source_type,
            json.dumps(payload, ensure_ascii=False),
            data_source.schedule,
            data_source.status,
        ),
    )


def load_active_data_sources(connection: sqlite3.Connection) -> list[DataSourceConfig]:
    rows = connection.execute("SELECT * FROM data_source_config WHERE status = 'active'").fetchall()
    sources = []
    for row in rows:
        payload = json.loads(row["config"])
        sources.append(
            DataSourceConfig(
                source_id=row["source_id"],
                source_name=row["source_name"],
                source_type=row["source_type"],
                config={key: value for key, value in payload.items() if key != "field_mapping"},
                schedule=row["schedule"],
                status=row["status"],
                field_mapping=payload.get("field_mapping") or {},
            )
        )
    return sources
