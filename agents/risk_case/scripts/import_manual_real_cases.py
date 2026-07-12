#!/usr/bin/env python
"""Import manually collected real cases from a DOCX source into seed cases.

The importer reads Word paragraphs plus embedded hyperlink targets, converts
case blocks into the existing cases seed schema, deduplicates them against the
current case library, and rewrites JSON/CSV/SQL seed files consistently.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


CASE_DIR = Path("agents/risk_case/knowledge/seed_data/cases")
JSON_PATH = CASE_DIR / "cases.json"
CSV_PATH = CASE_DIR / "cases.csv"
SQL_PATH = CASE_DIR / "cases.sql"
EXTRACTED_PATH = CASE_DIR / "manual_real_cases_extracted.json"

DOC_NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}

CSV_COLUMNS = [
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
class Paragraph:
    text: str
    links: list[str]


def read_docx_paragraphs(path: Path) -> list[Paragraph]:
    with zipfile.ZipFile(path) as archive:
        document_xml = archive.read("word/document.xml")
        rels_xml = archive.read("word/_rels/document.xml.rels")

    rels_root = ET.fromstring(rels_xml)
    relationships = {
        rel.attrib["Id"]: rel.attrib.get("Target", "")
        for rel in rels_root.findall("rel:Relationship", REL_NS)
    }

    doc_root = ET.fromstring(document_xml)
    paragraphs: list[Paragraph] = []
    for para in doc_root.findall(".//w:p", DOC_NS):
        text_parts: list[str] = []
        links: list[str] = []
        for node in para.iter():
            if node.tag == f"{{{DOC_NS['w']}}}t":
                text_parts.append(node.text or "")
            elif node.tag == f"{{{DOC_NS['w']}}}hyperlink":
                rel_id = node.attrib.get(f"{{{DOC_NS['r']}}}id")
                target = relationships.get(rel_id or "", "")
                if target.startswith(("http://", "https://")) and target not in links:
                    links.append(target)
        text = "".join(text_parts).strip()
        if text:
            paragraphs.append(Paragraph(text=text, links=links))
    return paragraphs


def clean_text(value: str) -> str:
    value = re.sub(r"-\d+\b", "", value or "")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" ；;")


def parse_manual_cases(paragraphs: list[Paragraph]) -> list[dict[str, Any]]:
    field_re = re.compile(
        r"^(案号|法院|案由|事实摘要|争议焦点|法律依据|裁判结果|裁判要点|风险类型|来源链接|来源|发布机关|背景)[:：](.*)$"
    )
    cases: list[dict[str, Any]] = []
    scenario_heading = ""
    current: dict[str, Any] | None = None

    for paragraph in paragraphs:
        text = paragraph.text
        if text.startswith("场景"):
            scenario_heading = text
            continue

        case_match = re.match(r"^案例\d+[:：](.+)$", text)
        if case_match:
            if current:
                cases.append(current)
            current = {
                "raw_title": case_match.group(1).strip(),
                "scenario_heading": scenario_heading,
                "fields": {},
                "links": list(paragraph.links),
            }
            continue

        if not current:
            continue

        for link in paragraph.links:
            if link not in current["links"]:
                current["links"].append(link)

        field_match = field_re.match(text)
        if field_match:
            key, value = field_match.group(1), clean_text(field_match.group(2))
            fields = current["fields"]
            fields[key] = f"{fields[key]}；{value}" if key in fields and value else value

    if current:
        cases.append(current)
    return cases


def infer_scenario(text: str) -> str:
    rules = [
        ("医美分期/美容贷", ["医美", "美容贷", "整形", "美容"]),
        ("教育培训贷/培训退费", ["教育", "培训", "助学分期", "包就业"]),
        ("信用卡分期/信用卡逾期", ["信用卡", "虚拟卡", "盗刷"]),
        ("汽车金融/车贷", ["汽车", "购车", "车贷"]),
        ("房贷/抵押担保", ["房贷", "购房", "抵押"]),
        ("消费贷/金融借款", ["消费贷", "金融借款", "小额贷款", "网络贷款"]),
    ]
    for scenario, terms in rules:
        if any(term in text for term in terms):
            return scenario
    return "消费金融"


def infer_risk_type(text: str) -> str:
    rules = [
        ("cost_transparency", ["砍头息", "手续费", "服务费", "预先扣除", "费用不透明"]),
        ("interest_fee", ["高利率", "利率偏高", "年化", "息费过高", "利息过高"]),
        ("overdue", ["逾期", "罚息", "违约金", "催收"]),
        ("repayment", ["退费", "提前收贷", "提前到期", "解除", "连带责任"]),
        ("authorization_privacy", ["盗刷", "征信", "个人信息", "诈骗"]),
    ]
    for risk_type, terms in rules:
        if any(term in text for term in terms):
            return risk_type
    return "other"


def infer_source(url: str) -> str:
    domain = re.sub(r"^https?://", "", url).split("/", 1)[0].lower()
    if "court" in domain or "fy" in domain or "gxcourt" in domain:
        return "manual_court_source"
    if "wechat" in domain or "weixin" in domain:
        return "manual_wechat_source"
    if "chinadaily" in domain or "gmw" in domain or "xinhuanet" in domain:
        return "manual_public_report"
    return "manual_public_source"


def infer_effective_date(text: str) -> str:
    """Extract an exact public date from source text or source URL when present."""
    date_patterns = [
        r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})",
        r"(20\d{2})年(\d{1,2})月(\d{1,2})日",
        r"(20\d{2})(\d{2})(\d{2})",
        r"(20\d{2})(\d{2})/(\d{1,2})",
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        year, month, day = (int(part) for part in match.groups())
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"
    return ""


def needs_manual_review(case: dict[str, Any]) -> bool:
    review_markers = (
        "\u9700\u7ed3\u5408\u539f\u6587\u8fdb\u4e00\u6b65\u590d\u6838",
        "\u4eba\u5de5\u590d\u6838",
        "\u9700\u590d\u6838",
    )
    combined = json.dumps(case, ensure_ascii=False)
    return any(marker in combined for marker in review_markers)


def normalize_manual_case(raw: dict[str, Any]) -> dict[str, Any] | None:
    fields = raw["fields"]
    links = raw["links"]
    source_url = next((link for link in links if link.startswith(("http://", "https://"))), "")
    if not source_url:
        return None

    title = clean_text(raw["raw_title"])
    case_no = clean_text(fields.get("案号", ""))
    court = clean_text(fields.get("法院") or fields.get("发布机关") or "")
    cause = clean_text(fields.get("案由", ""))
    facts = clean_text(fields.get("事实摘要") or fields.get("背景") or "")
    dispute = clean_text(fields.get("争议焦点") or fields.get("裁判要点") or "")
    result = clean_text(fields.get("裁判结果", ""))
    risk_text = clean_text(fields.get("风险类型", ""))

    if not title or not facts:
        return None

    combined = " ".join([title, raw["scenario_heading"], case_no, court, cause, facts, dispute, result, risk_text])
    description_parts = []
    if case_no:
        description_parts.append(f"案号：{case_no}")
    if court:
        description_parts.append(f"审理法院/发布机构：{court}")
    if cause:
        description_parts.append(f"案由：{cause}")
    description_parts.append(f"基本事实摘要：{facts}")

    imported_at = date.today().isoformat()
    effective_date = infer_effective_date(" ".join([combined, source_url])) or imported_at
    case = {
        "title": title,
        "scenario": infer_scenario(combined),
        "risk_type": infer_risk_type(combined),
        "description": " ".join(description_parts),
        "dispute_point": dispute or "围绕消费金融合同费用、还款责任、告知义务或服务履行产生争议。",
        "user_loss": infer_user_loss(combined),
        "handling_result": result or "公开材料未提取到完整裁判结果，需结合原文进一步复核。",
        "rights_path": infer_rights_path(combined),
        "source_url": source_url,
        "embedding": "",
        "version": 1,
        "effective_date": effective_date,
        "expiry_date": "",
        "is_active": 1,
        "source": infer_source(source_url),
        "imported_at": imported_at,
        "review_status": "approved",
        "_dedupe_key": f"{case_no}|{source_url}" if case_no else f"{title}|{source_url}",
    }
    if needs_manual_review(case):
        case["review_status"] = "pending"
    return case


def infer_user_loss(text: str) -> str:
    if any(term in text for term in ["盗刷", "诈骗"]):
        return "消费者可能遭受资金损失、账户安全风险，并面临举证和追偿成本。"
    if any(term in text for term in ["培训", "教育", "退费"]):
        return "消费者可能承担培训费用或贷款还款压力，同时面临退费难、就业承诺落空和维权成本。"
    if any(term in text for term in ["医美", "美容"]):
        return "消费者可能因诱导办理医美分期承担高额贷款，服务失败或承诺落空后仍需继续还款。"
    if any(term in text for term in ["逾期", "罚息", "违约金"]):
        return "消费者可能承担本金、利息、罚息、违约金、律师费及征信影响。"
    return "消费者可能产生额外费用、还款压力、征信影响或后续维权成本。"


def infer_rights_path(text: str) -> str:
    if any(term in text for term in ["信用卡", "盗刷"]):
        return "保存账单、交易提醒、报警记录和银行沟通记录，及时申请争议处理、挂失止付并依法主张银行安全保障责任。"
    if any(term in text for term in ["培训", "教育"]):
        return "保存招生宣传、课程合同、贷款合同、付款记录和沟通记录，向培训机构、平台、消协或法院主张退费和虚假宣传责任。"
    if any(term in text for term in ["医美", "美容"]):
        return "保存医美广告、咨询聊天、贷款合同、服务协议和还款计划，核对真实年化利率并向市场监管、金融监管或法院维权。"
    return "保存合同、付款/扣款记录、催收记录、费用明细和原始链接，先书面投诉，必要时向监管、消协或法院维权。"


def next_case_id(existing: list[dict[str, Any]], offset: int) -> str:
    max_id = 0
    for case in existing:
        match = re.match(r"CASE_REAL_(\d+)$", str(case.get("case_id", "")))
        if match:
            max_id = max(max_id, int(match.group(1)))
    return f"CASE_REAL_{max_id + offset:03d}"


def strip_internal_fields(case: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in case.items() if not key.startswith("_")}


def sql_quote(value: Any) -> str:
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_outputs(cases: list[dict[str, Any]], extracted: list[dict[str, Any]]) -> None:
    JSON_PATH.write_text(json.dumps(cases, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    EXTRACTED_PATH.write_text(json.dumps(extracted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with CSV_PATH.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(CSV_COLUMNS)
        for case in cases:
            writer.writerow([case.get(col, "") for col in CSV_COLUMNS])

    columns_sql = ", ".join(CSV_COLUMNS)
    rows = []
    for case in cases:
        values = ", ".join(sql_quote(case.get(col, "")) for col in CSV_COLUMNS)
        rows.append(f"({values})")
    SQL_PATH.write_text(
        "INSERT OR REPLACE INTO cases (" + columns_sql + ") VALUES\n" + ",\n".join(rows) + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", default=str(CASE_DIR / "manual_real_cases_source.docx"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    existing_urls = {case.get("source_url", "") for case in existing if case.get("source_url")}
    existing_keys = {
        f"{extract_case_no(case.get('description', ''))}|{case.get('source_url', '')}"
        for case in existing
        if case.get("source_url")
    }

    raw_cases = parse_manual_cases(read_docx_paragraphs(Path(args.docx)))
    normalized = [case for raw in raw_cases if (case := normalize_manual_case(raw))]

    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for case in normalized:
        key = case["_dedupe_key"]
        if key in seen or key in existing_keys:
            continue
        seen.add(key)
        # Keep same-url cases only when the case number/title differs; one page
        # can contain multiple real examples.
        if case["source_url"] in existing_urls and not extract_case_no(case["description"]):
            continue
        deduped.append(case)

    appended = []
    for index, case in enumerate(deduped, 1):
        case["case_id"] = next_case_id(existing, index)
        appended.append(strip_internal_fields(case))

    merged = existing + appended
    extracted = [strip_internal_fields(case) for case in normalized]

    print(f"raw_blocks={len(raw_cases)}")
    print(f"normalized_with_url={len(normalized)}")
    print(f"new_cases={len(appended)}")
    print(f"final_cases={len(merged)}")
    if not args.dry_run:
        write_outputs(merged, extracted)
    return 0


def extract_case_no(description: str) -> str:
    match = re.search(r"案号：([^ ]+)", description or "")
    return match.group(1) if match else ""


if __name__ == "__main__":
    raise SystemExit(main())
