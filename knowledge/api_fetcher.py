"""Dynamic API/HTML fetchers for external knowledge ingestion.

The fetchers are intentionally configurable. Some public Chinese data sources
do not expose a stable open API, so the production endpoint, query parameters,
and field mapping should be configured in `data_source_config`.
"""

from __future__ import annotations

import json
import hashlib
import re
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Any


def now_date() -> str:
    return datetime.now(timezone(timedelta(hours=8))).date().isoformat()


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def stable_id(prefix: str, *parts: Any) -> str:
    raw = "|".join(str(part or "") for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def get_nested(data: dict[str, Any], path: str | None, default: Any = "") -> Any:
    if not path:
        return default
    current: Any = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return default
    return current if current is not None else default


class BaseFetcher(ABC):
    def __init__(self, url: str | None = None, headers: dict[str, str] | None = None, params: dict[str, Any] | None = None, **config: Any):
        self.url = url
        self.headers = headers or {}
        self.params = params or {}
        self.config = config

    def build_url(self) -> str:
        if not self.url:
            raise ValueError("url is required")
        if not self.params:
            return self.url
        separator = "&" if "?" in self.url else "?"
        return self.url + separator + urllib.parse.urlencode(self.params)

    def fetch_text(self) -> str:
        request = urllib.request.Request(
            self.build_url(),
            headers={
                "User-Agent": "money-agent-risk-case/0.1 local-course-project",
                **self.headers,
            },
        )
        with urllib.request.urlopen(request, timeout=int(self.config.get("timeout", 30))) as response:
            charset = response.headers.get_content_charset() or self.config.get("encoding") or "utf-8"
            return response.read().decode(charset, errors="replace")

    @abstractmethod
    def fetch(self) -> Any:
        """Fetch raw data from the remote source."""

    @abstractmethod
    def parse(self, raw_data: Any) -> list[dict[str, Any]]:
        """Parse raw data into normalized target-table records."""


class JsonApiFetcher(BaseFetcher):
    """Generic JSON API fetcher with optional field mapping."""

    def fetch(self) -> Any:
        return json.loads(self.fetch_text())

    def _records(self, raw_data: Any) -> list[dict[str, Any]]:
        if isinstance(raw_data, list):
            return raw_data
        if isinstance(raw_data, dict):
            record_path = self.config.get("record_path")
            if record_path:
                value = get_nested(raw_data, record_path, [])
                if isinstance(value, list):
                    return value
            for key in ("data", "items", "records", "result.list", "result.records"):
                value = get_nested(raw_data, key, None)
                if isinstance(value, list):
                    return value
        raise ValueError("JSON API response must be a list or contain a configured records list")

    def parse(self, raw_data: Any) -> list[dict[str, Any]]:
        mapping = self.config.get("field_mapping") or {}
        defaults = self.config.get("defaults") or {}
        target_table = self.config.get("target_table")
        rows = []
        for record in self._records(raw_data):
            if mapping:
                row = {target: get_nested(record, source) for target, source in mapping.items()}
            else:
                row = dict(record)
            row = {**defaults, **row}
            row.setdefault("source", "api")
            row.setdefault("source_url", self.url or "")
            if target_table:
                row = normalize_for_table(target_table, row)
            rows.append(row)
        return rows


class HtmlRegexFetcher(BaseFetcher):
    """Extract records from HTML using a configured regular expression."""

    def fetch(self) -> str:
        return self.fetch_text()

    def parse(self, raw_data: str) -> list[dict[str, Any]]:
        pattern = self.config.get("record_regex")
        if not pattern:
            raise ValueError("record_regex is required for html_regex fetcher")
        target_table = self.config.get("target_table")
        defaults = self.config.get("defaults") or {}
        rows = []
        for match in re.finditer(pattern, raw_data, flags=re.S | re.I):
            row = {key: normalize_text(value) for key, value in match.groupdict().items()}
            row = {**defaults, **row}
            row.setdefault("source", "api")
            row.setdefault("source_url", self.url or "")
            if target_table:
                row = normalize_for_table(target_table, row)
            rows.append(row)
        return rows


class PbcLprFetcher(JsonApiFetcher):
    """Parse LPR JSON feed into market_rates rows.

    The endpoint may be a team-maintained mirror or an official API if available.
    Expected fields per record: date, one_year / lpr_1y, five_year / lpr_5y.
    """

    def parse(self, raw_data: Any) -> list[dict[str, Any]]:
        rows = []
        for record in self._records(raw_data):
            effective_date = record.get("date") or record.get("effective_date") or record.get("issue_date")
            one_year = record.get("one_year") or record.get("oneYear") or record.get("lpr_1y")
            five_year = record.get("five_year") or record.get("fiveYear") or record.get("lpr_5y")
            if effective_date and one_year is not None:
                rows.append(normalize_for_table("market_rates", {
                    "rate_id": f"LPR_1Y_{str(effective_date)[:7].replace('-', '')}",
                    "rate_type": "LPR_1Y",
                    "rate_value": float(one_year),
                    "effective_date": str(effective_date)[:10],
                    "source": "api",
                    "source_url": self.url or "",
                }))
            if effective_date and five_year is not None:
                rows.append(normalize_for_table("market_rates", {
                    "rate_id": f"LPR_5Y_{str(effective_date)[:7].replace('-', '')}",
                    "rate_type": "LPR_5Y",
                    "rate_value": float(five_year),
                    "effective_date": str(effective_date)[:10],
                    "source": "api",
                    "source_url": self.url or "",
                }))
        return rows


class RegulationFetcher(JsonApiFetcher):
    """Parse law/regulation API records into legal_regulations rows."""

    def parse(self, raw_data: Any) -> list[dict[str, Any]]:
        rows = []
        for record in self._records(raw_data):
            title = record.get("title") or record.get("name") or record.get("lawTitle")
            if not title:
                continue
            issued = record.get("issue_date") or record.get("publishDate") or record.get("promulgationDate") or ""
            effective = record.get("effective_date") or record.get("effectiveDate") or issued or now_date()
            regulation_id = record.get("regulation_id") or record.get("id") or stable_id("LAW_API", title, issued)
            rows.append(normalize_for_table("legal_regulations", {
                "regulation_id": str(regulation_id),
                "title": title,
                "issuing_body": record.get("issuing_body") or record.get("office") or record.get("organ") or "",
                "issue_date": str(issued)[:10] if issued else "",
                "effective_date": str(effective)[:10],
                "status": record.get("status") or "待审核",
                "summary": record.get("summary") or record.get("contentAbstract") or title,
                "full_text": record.get("full_text") or record.get("content") or record.get("text") or title,
                "keywords": record.get("keywords") or title,
                "source_url": record.get("source_url") or record.get("url") or self.url or "",
                "applicable_scenarios": record.get("applicable_scenarios") or record.get("keywords") or title,
                "source": "api",
            }))
        return rows


class CaseFetcher(JsonApiFetcher):
    """Parse public complaint/case API records into cases rows."""

    def parse(self, raw_data: Any) -> list[dict[str, Any]]:
        rows = []
        for record in self._records(raw_data):
            title = record.get("title") or record.get("caseTitle") or record.get("subject")
            if not title:
                continue
            case_id = record.get("case_id") or record.get("id") or stable_id("CASE_API", title, record.get("date", ""))
            rows.append(normalize_for_table("cases", {
                "case_id": str(case_id),
                "title": title,
                "scenario": record.get("scenario") or record.get("category") or "公开案例",
                "risk_type": record.get("risk_type") or record.get("riskType") or "other",
                "description": record.get("description") or record.get("content") or title,
                "dispute_point": record.get("dispute_point") or record.get("focus") or "待人工审核争议焦点",
                "user_loss": record.get("user_loss") or record.get("loss") or "",
                "handling_result": record.get("handling_result") or record.get("result") or "待人工审核处理结果",
                "rights_path": record.get("rights_path") or record.get("suggestion") or "保留证据并向平台、消协或监管渠道投诉。",
                "source_url": record.get("source_url") or record.get("url") or self.url or "",
                "embedding": "",
                "source": "api",
            }))
        return rows


def normalize_for_table(table_name: str, row: dict[str, Any]) -> dict[str, Any]:
    row = {key: value for key, value in row.items() if value is not None}
    row.setdefault("version", 1)
    row.setdefault("effective_date", now_date())
    row.setdefault("expiry_date", "")
    row.setdefault("is_active", 0)
    row.setdefault("review_status", "pending")
    row.setdefault("source", row.get("source") or "api")
    row.setdefault("source_url", row.get("source_url") or "")

    if table_name == "legal_regulations":
        row.setdefault("status", "待审核")
        row.setdefault("summary", row.get("title", ""))
        row.setdefault("full_text", row.get("summary", ""))
        row.setdefault("keywords", row.get("title", ""))
        row.setdefault("applicable_scenarios", row.get("keywords", ""))
    elif table_name == "cases":
        row.setdefault("embedding", "")
        row.setdefault("user_loss", "")
        row.setdefault("handling_result", "")
        row.setdefault("rights_path", "")
    elif table_name == "market_rates":
        row["rate_value"] = float(row["rate_value"])
    return row


FETCHERS = {
    "json": JsonApiFetcher,
    "json_api": JsonApiFetcher,
    "html_regex": HtmlRegexFetcher,
    "national_law": RegulationFetcher,
    "legal_regulation": RegulationFetcher,
    "pbc_lpr": PbcLprFetcher,
    "case_api": CaseFetcher,
    "public_case": CaseFetcher,
}


def build_fetcher(fetcher_type: str, config: dict[str, Any]) -> BaseFetcher:
    cls = FETCHERS.get(fetcher_type)
    if cls is None:
        raise ValueError(f"Unsupported fetcher type: {fetcher_type}")
    fetcher_config = {key: value for key, value in config.items() if key not in {"url", "headers", "params"}}
    return cls(url=config.get("url"), headers=config.get("headers"), params=config.get("params"), **fetcher_config)
