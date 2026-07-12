"""Collect verified public case materials into the risk_case cases JSON format.

This script is intentionally conservative:
- It does not bypass login, captcha, anti-bot, or access controls.
- For China Judgments Online, provide your own lawful session cookie and request
  payload template after logging in manually.
- For local courts, consumer associations, market regulators, financial
  regulators, and case bulletins, provide a list of public article URLs.

Examples:
    python scripts/collect_real_cases.py ^
      --source web ^
      --urls-file urls.txt ^
      --keywords 消费金融 信用卡分期 教育培训贷 医美 ^
      --start-date 2020-01-01 ^
      --end-date 2026-07-12 ^
      --output knowledge/seed_data/cases/collected_cases.json

    python scripts/collect_real_cases.py ^
      --source wenshu ^
      --keywords 消费金融 信用卡分期 教育培训贷 医美 ^
      --start-date 2021-01-01 ^
      --end-date 2026-07-12 ^
      --max-pages 3 ^
      --cookie-file wenshu_cookie.txt ^
      --wenshu-payload-template wenshu_payload_template.json ^
      --output knowledge/seed_data/cases/wenshu_cases.json
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "knowledge" / "seed_data" / "cases" / "collected_real_cases.json"
WENSHU_SEARCH_URL = "https://wenshu.court.gov.cn/website/parse/rest.q4w"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

CASE_COLUMNS = [
    "case_id",
    "title",
    "scenario",
    "risk_type",
    "description",
    "dispute_point",
    "user_loss",
    "handling_result",
    "rights_path",
    "source_url",
    "embedding",
    "version",
    "effective_date",
    "expiry_date",
    "is_active",
    "source",
    "imported_at",
    "review_status",
]


@dataclass
class ExtractedCase:
    title: str
    case_no: str = ""
    court: str = ""
    judgment_date: str = ""
    dispute_point: str = ""
    judgment_result: str = ""
    facts: str = ""
    source_url: str = ""
    source_name: str = ""
    scenario: str = ""
    risk_type: str = ""


class TextExtractor(HTMLParser):
    """Small HTML-to-text extractor for public article pages."""

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3"}:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if tag in {"p", "div", "li", "tr", "h1", "h2", "h3"}:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            text = data.strip()
            if text:
                self._parts.append(text)

    def text(self) -> str:
        raw = html.unescape(" ".join(self._parts))
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r"\n\s*\n+", "\n", raw)
        return raw.strip()


def today_iso() -> str:
    return date.today().isoformat()


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()[:10].upper()
    return f"{prefix}_{digest}"


def normalize_text(text: str, limit: int = 900) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:limit].rstrip()


def parse_date(value: str) -> str:
    if not value:
        return ""
    patterns = [
        r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?",
        r"(\d{4})(\d{2})(\d{2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, value)
        if match:
            y, m, d = match.groups()
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    return ""


def within_date_range(value: str, start_date: str, end_date: str) -> bool:
    parsed = parse_date(value)
    if not parsed:
        return True
    if start_date and parsed < start_date:
        return False
    if end_date and parsed > end_date:
        return False
    return True


def infer_scenario(text: str, keywords: list[str]) -> str:
    haystack = text + " " + " ".join(keywords)
    rules = [
        ("医美分期", ["医美", "美容贷", "整形", "美容"]),
        ("教育培训贷", ["教育培训", "培训贷", "职业培训", "课程", "学费"]),
        ("信用卡分期", ["信用卡", "账单分期", "信用卡分期"]),
        ("汽车金融", ["汽车金融", "车贷", "购车", "金融服务费"]),
        ("租赁贷", ["租金贷", "租赁", "长租公寓"]),
        ("消费贷", ["消费金融", "消费贷", "现金贷", "小额贷款", "网络贷款"]),
    ]
    for scenario, terms in rules:
        if any(term in haystack for term in terms):
            return scenario
    return "消费金融"


def infer_risk_type(text: str) -> str:
    rules = [
        ("cost_transparency", ["服务费", "手续费", "咨询费", "金融服务费", "预扣", "砍头息", "收费", "未披露"]),
        ("interest_fee", ["年化", "利率", "高息", "利息", "综合成本"]),
        ("repayment", ["提前还款", "继续还款", "退费", "解除", "终止", "扣款"]),
        ("overdue", ["逾期", "催收", "罚息", "违约金", "滞纳金"]),
        ("authorization_privacy", ["个人信息", "授权", "征信", "验证码"]),
    ]
    for risk_type, terms in rules:
        if any(term in text for term in terms):
            return risk_type
    return "other"


def extract_first(patterns: list[str], text: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.S)
        if match:
            return normalize_text(match.group(1), 500)
    return ""


def extract_title_from_html(markup: str, fallback_url: str) -> str:
    title = extract_first([r"<title[^>]*>(.*?)</title>", r"<h1[^>]*>(.*?)</h1>"], markup)
    title = re.sub(r"<[^>]+>", "", title)
    title = html.unescape(title).strip()
    if title:
        return title
    return fallback_url.rstrip("/").split("/")[-1] or "公开案例材料"


def fetch_url(url: str, timeout: int, pause_seconds: float) -> str:
    time.sleep(max(pause_seconds, 0))
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc


def extract_case_from_article(url: str, markup: str, keywords: list[str], source_name: str) -> ExtractedCase | None:
    title = extract_title_from_html(markup, url)
    parser = TextExtractor()
    parser.feed(markup)
    text = parser.text()
    if keywords and not any(keyword in text or keyword in title for keyword in keywords):
        return None

    case_no = extract_first([r"(（\d{4}）[^，。\s]{2,60}号)", r"案号[:：]\s*([^，。\n]{3,80})"], text)
    court = extract_first([r"审理法院[:：]\s*([^，。\n]{3,80})", r"由([^，。\n]{2,40法院)[作出审理判决裁定]"], text)
    judgment_date = parse_date(
        extract_first(
            [
                r"裁判日期[:：]\s*([^，。\n]{8,20})",
                r"发布日期[:：]\s*([^，。\n]{8,20})",
                r"发布时间[:：]\s*([^，。\n]{8,20})",
                r"(\d{4}年\d{1,2}月\d{1,2}日)",
            ],
            text,
        )
    )
    dispute = extract_first(
        [
            r"(?:争议焦点|焦点问题|争议在于)[:：]?\s*([^。；\n]{8,220})",
            r"(?:法院认为|本院认为)[:：]?\s*([^。；\n]{20,260})",
        ],
        text,
    )
    result = extract_first(
        [
            r"(?:判决如下|裁判结果|处理结果|处罚结果|调解结果)[:：]?\s*([^。\n]{8,320})",
            r"(?:判处|罚款|责令|退还|赔偿)([^。\n]{8,300})",
        ],
        text,
    )
    facts = extract_first(
        [
            r"(?:基本案情|案情简介|事实摘要|经审理查明)[:：]?\s*([^。]{30,500})",
            r"(" + "|".join(map(re.escape, keywords[:6] or ["消费金融"])) + r".{30,500})",
        ],
        text,
    )
    combined = " ".join([title, text])
    return ExtractedCase(
        title=title,
        case_no=case_no,
        court=court,
        judgment_date=judgment_date,
        dispute_point=dispute or "围绕消费金融合同费用披露、还款责任、服务履行或风险告知是否充分产生争议。",
        judgment_result=result or "公开材料未抽取到明确裁判结果，请人工复核原文后补充。",
        facts=facts or normalize_text(text, 500),
        source_url=url,
        source_name=source_name,
        scenario=infer_scenario(combined, keywords),
        risk_type=infer_risk_type(combined),
    )


def load_urls(path: Path) -> list[str]:
    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)
    return urls


def collect_from_web(args: argparse.Namespace) -> list[ExtractedCase]:
    if not args.urls_file:
        return []
    cases: list[ExtractedCase] = []
    for url in load_urls(Path(args.urls_file)):
        try:
            markup = fetch_url(url, args.timeout, args.pause_seconds)
            extracted = extract_case_from_article(url, markup, args.keywords, args.source_name or "public_web")
            if extracted and within_date_range(extracted.judgment_date, args.start_date, args.end_date):
                cases.append(extracted)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
    return cases


def load_cookie(cookie_file: str | None) -> str:
    if not cookie_file:
        return ""
    return Path(cookie_file).read_text(encoding="utf-8").strip()


def build_wenshu_payload(template: dict[str, Any], keyword: str, page: int, page_size: int, start_date: str, end_date: str) -> dict[str, Any]:
    """Fill a user-provided payload template without assuming private parameters."""

    payload = json.loads(json.dumps(template, ensure_ascii=False))
    replacements = {
        "{keyword}": keyword,
        "{page}": str(page),
        "{page_size}": str(page_size),
        "{start_date}": start_date,
        "{end_date}": end_date,
    }

    def replace_value(value: Any) -> Any:
        if isinstance(value, str):
            for key, replacement in replacements.items():
                value = value.replace(key, replacement)
            if value.isdigit():
                return int(value)
            return value
        if isinstance(value, list):
            return [replace_value(item) for item in value]
        if isinstance(value, dict):
            return {key: replace_value(item) for key, item in value.items()}
        return value

    return replace_value(payload)


def parse_wenshu_records(data: Any, keyword: str) -> list[ExtractedCase]:
    """Parse common JSON shapes returned by lawful/exported judgment data."""

    if isinstance(data, dict):
        candidates = data.get("result") or data.get("data") or data.get("List") or data.get("RelWenshu") or data
    else:
        candidates = data
    if isinstance(candidates, dict):
        for key in ("records", "list", "rows", "items"):
            if isinstance(candidates.get(key), list):
                candidates = candidates[key]
                break
    if not isinstance(candidates, list):
        return []

    extracted: list[ExtractedCase] = []
    for item in candidates:
        if isinstance(item, str):
            try:
                item = json.loads(item)
            except json.JSONDecodeError:
                continue
        if not isinstance(item, dict):
            continue

        title = str(item.get("Title") or item.get("title") or item.get("案件名称") or item.get("caseName") or "")
        case_no = str(item.get("AH") or item.get("案号") or item.get("caseNo") or item.get("case_no") or "")
        court = str(item.get("Court") or item.get("法院名称") or item.get("court") or item.get("审理法院") or "")
        date_text = str(item.get("裁判日期") or item.get("CPRQ") or item.get("judgmentDate") or item.get("date") or "")
        body = str(item.get("裁判要旨") or item.get("全文") or item.get("DocContent") or item.get("content") or item.get("summary") or "")
        url = str(item.get("url") or item.get("Url") or item.get("source_url") or item.get("docUrl") or "")
        text = " ".join([title, case_no, court, date_text, body])
        extracted.append(
            ExtractedCase(
                title=title or f"{keyword}相关裁判文书",
                case_no=case_no,
                court=court,
                judgment_date=parse_date(date_text),
                dispute_point=extract_first([r"(?:争议焦点|本院认为)[:：]?\s*([^。；\n]{8,260})"], body)
                or "围绕消费金融合同费用、利率、还款或服务履行责任产生争议。",
                judgment_result=extract_first([r"(?:判决如下|裁判结果)[:：]?\s*([^。\n]{8,320})"], body)
                or "请结合裁判文书原文复核裁判结果。",
                facts=extract_first([r"(?:经审理查明|基本案情)[:：]?\s*([^。]{30,500})"], body) or normalize_text(body, 500),
                source_url=url or "https://wenshu.court.gov.cn",
                source_name="wenshu_court_gov_cn",
                scenario=infer_scenario(text, [keyword]),
                risk_type=infer_risk_type(text),
            )
        )
    return extracted


def collect_from_wenshu(args: argparse.Namespace) -> list[ExtractedCase]:
    template_path = Path(args.wenshu_payload_template) if args.wenshu_payload_template else None
    if not template_path or not template_path.exists():
        raise SystemExit("--wenshu-payload-template is required for --source wenshu")

    template = json.loads(template_path.read_text(encoding="utf-8"))
    cookie = load_cookie(args.cookie_file)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": "https://wenshu.court.gov.cn/",
    }
    if cookie:
        headers["Cookie"] = cookie

    cases: list[ExtractedCase] = []
    for keyword in args.keywords:
        for page in range(1, args.max_pages + 1):
            payload = build_wenshu_payload(template, keyword, page, args.page_size, args.start_date, args.end_date)
            encoded = urlencode(payload, doseq=True).encode("utf-8")
            request = Request(args.wenshu_url, data=encoded, headers=headers, method="POST")
            time.sleep(max(args.pause_seconds, 0))
            try:
                with urlopen(request, timeout=args.timeout) as response:
                    raw = response.read().decode("utf-8", errors="replace")
                data = json.loads(raw)
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                print(f"Failed wenshu request keyword={keyword} page={page}: {exc}", file=sys.stderr)
                break
            page_cases = parse_wenshu_records(data, keyword)
            cases.extend([case for case in page_cases if within_date_range(case.judgment_date, args.start_date, args.end_date)])
            if not page_cases:
                break
    return cases


def to_case_row(item: ExtractedCase, prefix: str) -> dict[str, Any]:
    case_id = stable_id(prefix, item.title, item.case_no, item.source_url)
    judgment_date = parse_date(item.judgment_date)
    facts = normalize_text(item.facts, 650)
    description_parts = [
        f"案号：{item.case_no}" if item.case_no else "",
        f"审理法院/发布机构：{item.court or item.source_name}" if (item.court or item.source_name) else "",
        f"裁判/发布日期：{judgment_date}" if judgment_date else "",
        f"基本事实摘要：{facts}" if facts else "",
    ]
    description = " ".join(part for part in description_parts if part)
    result = item.judgment_result or "请人工复核原文后补充裁判、处罚、调解或处理结果。"
    rights_path = (
        "保存合同、付款/扣款记录、宣传材料、沟通记录和原始链接；"
        "优先向经营者书面投诉，再向消协、市场监管、金融监管或法院渠道维权。"
    )
    return {
        "case_id": case_id,
        "title": item.title,
        "scenario": item.scenario or "消费金融",
        "risk_type": item.risk_type or "other",
        "description": description or item.title,
        "dispute_point": item.dispute_point or "消费金融合同费用、利率、还款或服务履行责任争议。",
        "user_loss": "可能产生多支付费用、退费困难、逾期压力、征信影响或维权成本。",
        "handling_result": result,
        "rights_path": rights_path,
        "source_url": item.source_url,
        "embedding": "",
        "version": 1,
        "effective_date": judgment_date or today_iso(),
        "expiry_date": "",
        "is_active": 1,
        "source": item.source_name or "collected_public_source",
        "imported_at": today_iso(),
        "review_status": "pending",
    }


def dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    output: list[dict[str, Any]] = []
    for row in rows:
        key = (row.get("title", ""), row.get("source_url", ""))
        if key not in seen:
            seen.add(key)
            output.append(row)
    return output


def write_json(rows: list[dict[str, Any]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    clean_rows = [{column: row.get(column, "") for column in CASE_COLUMNS} for row in rows]
    output.write_text(json.dumps(clean_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect real public consumer-finance cases into cases JSON.")
    parser.add_argument("--source", choices=["web", "wenshu", "all"], default="web")
    parser.add_argument("--keywords", nargs="+", default=["消费金融", "信用卡分期", "教育培训贷", "医美", "租金贷"])
    parser.add_argument("--start-date", default="")
    parser.add_argument("--end-date", default="")
    parser.add_argument("--page-size", type=int, default=10)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--pause-seconds", type=float, default=1.5)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--case-id-prefix", default="CASE_COLLECTED")
    parser.add_argument("--urls-file", help="Text file with one public article URL per line.")
    parser.add_argument("--source-name", default="public_web")
    parser.add_argument("--cookie-file", help="Cookie text file for manually authenticated wenshu session.")
    parser.add_argument("--wenshu-url", default=WENSHU_SEARCH_URL)
    parser.add_argument("--wenshu-payload-template", help="JSON template with {keyword}, {page}, {page_size}, {start_date}, {end_date}.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    extracted: list[ExtractedCase] = []
    if args.source in {"web", "all"}:
        extracted.extend(collect_from_web(args))
    if args.source in {"wenshu", "all"}:
        extracted.extend(collect_from_wenshu(args))

    rows = dedupe([to_case_row(item, args.case_id_prefix) for item in extracted])
    write_json(rows, args.output)
    print(f"Wrote {len(rows)} case rows to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
