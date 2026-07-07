"""Optional lightweight data-management API using FastAPI."""

from __future__ import annotations

from typing import Any

try:
    from fastapi import FastAPI
except ImportError:  # pragma: no cover - optional dependency
    FastAPI = None

from db.connection import get_connection
from db.dao import assert_known_table
from knowledge.versioning import PRIMARY_KEYS, approve_record, log_change, reject_record, upsert_versioned_record


def create_app():
    if FastAPI is None:
        raise RuntimeError("fastapi is not installed. Install fastapi to enable the management API.")

    app = FastAPI(title="risk_case knowledge management API")

    @app.get("/api/knowledge/{table_name}")
    def list_records(table_name: str):
        table_name = assert_known_table(table_name)
        with get_connection() as connection:
            rows = connection.execute(f"SELECT * FROM {table_name} ORDER BY 1").fetchall()
            return [dict(row) for row in rows]

    @app.post("/api/knowledge/{table_name}")
    def create_record(table_name: str, payload: dict[str, Any]):
        with get_connection() as connection:
            record_id = upsert_versioned_record(connection, table_name, payload, changed_by="api", require_review=True)
            connection.commit()
            return {"recordId": record_id, "reviewStatus": "pending"}

    @app.put("/api/knowledge/{table_name}/{record_id}")
    def update_record(table_name: str, record_id: str, payload: dict[str, Any]):
        payload = {**payload, PRIMARY_KEYS[table_name]: record_id}
        with get_connection() as connection:
            upsert_versioned_record(connection, table_name, payload, changed_by="api", require_review=True)
            connection.commit()
            return {"recordId": record_id, "reviewStatus": "pending"}

    @app.delete("/api/knowledge/{table_name}/{record_id}")
    def delete_record(table_name: str, record_id: str):
        table_name = assert_known_table(table_name)
        pk = PRIMARY_KEYS[table_name]
        with get_connection() as connection:
            old_value = connection.execute(f"SELECT * FROM {table_name} WHERE {pk} = ?", (record_id,)).fetchone()
            connection.execute(f"UPDATE {table_name} SET is_active = 0, review_status = 'rejected' WHERE {pk} = ?", (record_id,))
            new_value = connection.execute(f"SELECT * FROM {table_name} WHERE {pk} = ?", (record_id,)).fetchone()
            log_change(
                connection,
                table_name,
                record_id,
                "delete",
                dict(old_value) if old_value else None,
                dict(new_value) if new_value else None,
                changed_by="api",
            )
            connection.commit()
            return {"recordId": record_id, "deleted": True}

    @app.post("/api/knowledge/{table_name}/{record_id}/approve")
    def approve(table_name: str, record_id: str):
        with get_connection() as connection:
            approve_record(connection, table_name, record_id, changed_by="api-reviewer")
            connection.commit()
            return {"recordId": record_id, "reviewStatus": "approved"}

    @app.post("/api/knowledge/{table_name}/{record_id}/reject")
    def reject(table_name: str, record_id: str):
        with get_connection() as connection:
            reject_record(connection, table_name, record_id, changed_by="api-reviewer")
            connection.commit()
            return {"recordId": record_id, "reviewStatus": "rejected"}

    return app


app = create_app() if FastAPI is not None else None
