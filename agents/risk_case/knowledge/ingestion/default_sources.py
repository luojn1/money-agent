"""Default dynamic data-source configuration.

These entries are templates for real external access. Replace `url` with the
team-confirmed public API, mirror endpoint, or school-hosted proxy before using
in production demos.
"""

from __future__ import annotations

import json
from pathlib import Path

from knowledge.ingestion.config import DataSourceConfig


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SOURCES_PATH = ROOT_DIR / "config" / "dynamic_sources.json"


DEFAULT_SOURCES = [
    DataSourceConfig(
        source_id="national_law_weekly",
        source_name="国家法律法规数据库法规更新",
        source_type="api",
        schedule="0 9 * * 1",
        status="paused",
        config={
            "fetcher_type": "national_law",
            "target_table": "legal_regulations",
            "primary_key": "regulation_id",
            "url": "https://example.com/api/national-laws",
            "params": {"keyword": "消费金融 贷款 合同 个人信息", "pageSize": 50},
            "record_path": "data.records",
        },
    ),
    DataSourceConfig(
        source_id="pbc_lpr_monthly",
        source_name="央行/LPR 市场利率更新",
        source_type="api",
        schedule="0 10 20 * *",
        status="paused",
        config={
            "fetcher_type": "pbc_lpr",
            "target_table": "market_rates",
            "primary_key": "rate_id",
            "url": "https://example.com/api/pbc-lpr",
            "record_path": "data",
        },
    ),
    DataSourceConfig(
        source_id="public_complaint_cases_monthly",
        source_name="公开投诉/纠纷案例更新",
        source_type="api",
        schedule="0 10 1 * *",
        status="paused",
        config={
            "fetcher_type": "case_api",
            "target_table": "cases",
            "primary_key": "case_id",
            "url": "https://example.com/api/consumer-finance-cases",
            "params": {"keyword": "消费金融 分期 贷款 退费 催收", "pageSize": 50},
            "record_path": "items",
        },
    ),
    DataSourceConfig(
        source_id="court_cases_proxy_monthly",
        source_name="裁判文书/司法案例代理源",
        source_type="api",
        schedule="0 11 1 * *",
        status="paused",
        config={
            "fetcher_type": "case_api",
            "target_table": "cases",
            "primary_key": "case_id",
            "url": "https://example.com/api/judgement-cases-proxy",
            "params": {"keyword": "金融借款合同 消费贷 分期", "pageSize": 50},
            "record_path": "records",
        },
    ),
]


def write_default_sources_file(path: Path = DEFAULT_SOURCES_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [
        {
            "source_id": source.source_id,
            "source_name": source.source_name,
            "source_type": source.source_type,
            "schedule": source.schedule,
            "status": source.status,
            "config": source.config,
            "field_mapping": source.field_mapping,
        }
        for source in DEFAULT_SOURCES
    ]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
