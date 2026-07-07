"""CLI for dynamic knowledge ingestion and review workflow."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from db.connection import DEFAULT_DB_PATH, get_connection
from knowledge.init_db import initialize_database
from knowledge.ingestion.config import DataSourceConfig, save_data_source
from knowledge.ingestion.default_sources import DEFAULT_SOURCES, write_default_sources_file
from knowledge.scheduler import run_all_sources, run_api_source, schedule_jobs
from knowledge.versioning import approve_record, expire_due_records, reject_record


def load_sources_from_file(path: Path) -> list[DataSourceConfig]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sources = []
    for item in payload:
        sources.append(
            DataSourceConfig(
                source_id=item["source_id"],
                source_name=item["source_name"],
                source_type=item["source_type"],
                config=item["config"],
                schedule=item.get("schedule"),
                status=item.get("status", "active"),
                field_mapping=item.get("field_mapping") or {},
            )
        )
    return sources


def install_sources(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    sources = load_sources_from_file(Path(args.file)) if args.file else DEFAULT_SOURCES
    with get_connection(args.db) as connection:
        for source in sources:
            save_data_source(connection, source)
        connection.commit()
    print(json.dumps({"installed": len(sources), "db": args.db}, ensure_ascii=False, indent=2))


def write_sources(args: argparse.Namespace) -> None:
    path = write_default_sources_file(Path(args.output))
    print(json.dumps({"written": str(path)}, ensure_ascii=False, indent=2))


def run_once(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    with get_connection(args.db) as connection:
        if args.source_id:
            result = run_api_source(connection, args.source_id)
            results = [result]
        else:
            connection.close()
            results = run_all_sources(args.db)
            print(json.dumps(results, ensure_ascii=False, indent=2))
            return
        connection.commit()
    print(json.dumps(results, ensure_ascii=False, indent=2))


def list_pending(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    with get_connection(args.db) as connection:
        rows = connection.execute(
            """
            SELECT pending_id, table_name, record_id, action, source, submitted_by, submitted_at, review_status
            FROM pending_knowledge_updates
            WHERE review_status = 'pending'
            ORDER BY pending_id DESC
            LIMIT ?
            """,
            (args.limit,),
        ).fetchall()
        print(json.dumps([dict(row) for row in rows], ensure_ascii=False, indent=2))


def review(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    with get_connection(args.db) as connection:
        if args.action == "approve":
            approve_record(connection, args.table, args.record_id, changed_by=args.changed_by)
        else:
            reject_record(connection, args.table, args.record_id, changed_by=args.changed_by)
        connection.commit()
    print(json.dumps({"table": args.table, "recordId": args.record_id, "action": args.action}, ensure_ascii=False, indent=2))


def expire(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    with get_connection(args.db) as connection:
        count = expire_due_records(connection, changed_by=args.changed_by)
        connection.commit()
    print(json.dumps({"expired": count}, ensure_ascii=False, indent=2))


def start_scheduler(args: argparse.Namespace) -> None:
    initialize_database(Path(args.db))
    with get_connection(args.db) as connection:
        scheduler = schedule_jobs(connection, db_path=args.db)
        if isinstance(scheduler, dict):
            print(json.dumps(scheduler, ensure_ascii=False, indent=2))
            return
        scheduler.start()
        jobs = [{"id": job.id, "nextRunTime": str(job.next_run_time)} for job in scheduler.get_jobs()]
    print(json.dumps({"scheduler": "started", "jobs": jobs}, ensure_ascii=False, indent=2))
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        scheduler.shutdown()
        print("scheduler stopped")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Dynamic knowledge ingestion CLI")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("write-default-sources")
    p.add_argument("--output", default=str(Path(__file__).resolve().parents[2] / "config" / "dynamic_sources.json"))
    p.set_defaults(func=write_sources)

    p = sub.add_parser("install-sources")
    p.add_argument("--file", help="JSON data-source config file")
    p.set_defaults(func=install_sources)

    p = sub.add_parser("run-once")
    p.add_argument("--source-id")
    p.set_defaults(func=run_once)

    p = sub.add_parser("pending")
    p.add_argument("--limit", type=int, default=20)
    p.set_defaults(func=list_pending)

    p = sub.add_parser("review")
    p.add_argument("action", choices=["approve", "reject"])
    p.add_argument("table")
    p.add_argument("record_id")
    p.add_argument("--changed-by", default="human-reviewer")
    p.set_defaults(func=review)

    p = sub.add_parser("expire")
    p.add_argument("--changed-by", default="expiry-job")
    p.set_defaults(func=expire)

    p = sub.add_parser("scheduler")
    p.set_defaults(func=start_scheduler)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
