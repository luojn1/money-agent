# -*- coding: utf-8 -*-
"""Local end-to-end demo server for text/file contract analysis.

This server is for classroom/demo use. It simulates B contract parsing from raw
text, calls the real C risk_case Agent, then builds lightweight D suggestions
and a summary report so users can experience the whole chain locally.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DEMO_ROOT = ROOT / "demo"
OUTPUT_ROOT = DEMO_ROOT / "outputs"
C_AGENT_DIR = ROOT / "agents" / "risk_case"
C_DB_PATH = C_AGENT_DIR / "risk_case_agent.db"
CST = timezone(timedelta(hours=8))

sys.path.insert(0, str(C_AGENT_DIR))
sys.path.insert(0, str(ROOT))

from main import run_agent  # noqa: E402
from summary_report.summary_builder import build_summary  # noqa: E402


def now_iso() -> str:
    return datetime.now(CST).replace(microsecond=0).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_request_body(handler: SimpleHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", "0"))
    return handler.rfile.read(length)


def extract_text_from_pdf(raw: bytes) -> str:
    """Extract text from a PDF if pypdf is available."""
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on local env
        raise ValueError("当前环境未安装 pypdf，PDF 请先复制文字或另存为 txt。") from exc

    import io

    reader = PdfReader(io.BytesIO(raw))
    pages = [(page.extract_text() or "") for page in reader.pages]
    text = "\n".join(pages).strip()
    if not text:
        raise ValueError("PDF 未能提取到文字，可能是扫描件。请先 OCR 后再上传。")
    return text


def detect_contract_type(text: str) -> str:
    if any(word in text for word in ["信用卡", "账单分期", "现金分期", "消费分期", "最低还款", "循环利息"]):
        return "credit_card_installment"
    if any(word in text for word in ["培训", "教育", "课程", "学费分期", "培训贷", "退课", "退费"]):
        return "education_training_loan"
    if any(word in text for word in ["医美", "美容", "整形"]):
        return "medical_beauty_installment"
    return "consumer_loan"


def product_name_for(contract_type: str) -> str:
    return {
        "credit_card_installment": "信用卡分期",
        "education_training_loan": "教育培训贷",
        "medical_beauty_installment": "医美分期",
        "consumer_loan": "个人消费贷",
    }.get(contract_type, "个人消费金融合同")


def find_money(text: str, keywords: list[str], default: float | None = None) -> float | None:
    for keyword in keywords:
        pattern = rf"{keyword}[^0-9一二三四五六七八九十百千万]*([0-9]+(?:\.[0-9]+)?)\s*元"
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    return default


def find_rate(text: str, keywords: list[str], default: float | None = None) -> float | None:
    for keyword in keywords:
        pattern = rf"{keyword}[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%"
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    return default


def find_term_months(text: str, default: int = 12) -> int:
    match = re.search(r"([0-9]+)\s*期", text)
    if match:
        return int(match.group(1))
    match = re.search(r"期限[^0-9]*([0-9]+)\s*个月", text)
    if match:
        return int(match.group(1))
    return default


def split_clauses(text: str) -> list[str]:
    parts = re.split(r"[。；;\n]+", text)
    return [part.strip() for part in parts if part.strip()]


CLAUSE_RULES: list[tuple[str, str, list[str]]] = [
    ("fee", "fee", ["服务费", "手续费", "管理费", "咨询费", "平台费", "保证金", "分期费", "一次性扣除"]),
    ("prepayment", "prepayment", ["提前还款", "提前结清", "剩余手续费", "提前还款手续费", "违约金"]),
    ("overdue", "overdue", ["逾期", "罚息", "违约金", "征信", "催收"]),
    ("repayment", "repayment", ["最低还款", "循环利息", "退费", "退课", "贷款仍需偿还", "还款方式"]),
    ("authorization", "authorization_privacy", ["自动扣款", "代扣", "授权", "通讯录", "定位", "个人信息", "共享"]),
    ("dispute", "dispute_resolution", ["管辖", "仲裁", "争议", "单方调整", "不承担任何责任"]),
    ("other", "other", ["绑定", "搭售", "包就业", "贷款合同", "服务合同", "信用卡", "培训"]),
    ("rate", "interest_fee", ["利率", "年化", "免息", "IRR", "LPR", "日利率", "月利率"]),
]


def build_clauses(text: str) -> list[dict[str, Any]]:
    clauses: list[dict[str, Any]] = []
    seen: set[str] = set()
    for fragment in split_clauses(text):
        for suffix, category, keywords in CLAUSE_RULES:
            if any(keyword in fragment for keyword in keywords):
                if fragment in seen:
                    break
                seen.add(fragment)
                index = len(clauses) + 1
                clauses.append(
                    {
                        "clauseId": f"clause_{index:03d}_{suffix}",
                        "category": category,
                        "heading": category,
                        "text": fragment,
                        "location": {"page": 1, "section": category, "paragraph": index},
                    }
                )
                break
    if not clauses:
        for index, fragment in enumerate(split_clauses(text)[:5], start=1):
            clauses.append(
                {
                    "clauseId": f"clause_{index:03d}_raw",
                    "category": "other",
                    "heading": "原文条款",
                    "text": fragment,
                    "location": {"page": 1, "section": "原文条款", "paragraph": index},
                }
            )
    return clauses


def detect_prepayment_rule(text: str) -> str:
    fragments = [item for item in split_clauses(text) if "提前还款" in item or "提前结清" in item]
    return "；".join(fragments) or "合同未清楚说明提前还款规则"


def detect_overdue_fee(text: str) -> str:
    fragments = [item for item in split_clauses(text) if any(keyword in item for keyword in ["逾期", "罚息", "违约金", "征信"])]
    return "；".join(fragments) or "合同未清楚说明逾期费用"


def detect_repayment_method(text: str, contract_type: str) -> str:
    if "最低还款" in text:
        return "最低还款"
    if "等额本息" in text:
        return "等额本息"
    if contract_type == "credit_card_installment":
        return "账单分期"
    if contract_type == "education_training_loan":
        return "学费分期"
    return "按月还款"


def estimate_costs(text: str, contract_type: str) -> dict[str, float | None]:
    loan_amount = find_money(text, ["借款本金", "分期金额", "贷款金额", "学费", "本金"], 10000)
    service_fee = find_money(text, ["服务费", "手续费", "管理费", "咨询费", "分期手续费"], 0) or 0
    actual_received = find_money(text, ["实际到账", "实际放款", "到账金额"], None)
    if actual_received is None:
        actual_received = max((loan_amount or 0) - service_fee if "扣除" in text or "砍头息" in text else (loan_amount or 0), 0)
    term_months = find_term_months(text, 12)
    nominal_rate = find_rate(text, ["名义年化", "名义利率", "年利率"], 0 if contract_type == "credit_card_installment" else 10)
    real_rate = find_rate(text, ["真实年化", "实际年化", "综合年化"], None)
    if real_rate is None:
        if contract_type == "credit_card_installment":
            real_rate = 13.1 if service_fee else 9.0
        elif actual_received and loan_amount and actual_received < loan_amount:
            real_rate = 26.8
        elif contract_type == "education_training_loan":
            real_rate = 18.2
        else:
            real_rate = 16.5
    extra_cost = find_money(text, ["总费用", "额外成本", "多付费用"], None)
    if extra_cost is None:
        extra_cost = round((loan_amount or 0) * (real_rate or 0) / 100 * term_months / 12 + service_fee, 2)
    total_repayment = round((loan_amount or 0) + (extra_cost or 0), 2)
    return {
        "loanAmount": loan_amount,
        "actualReceivedAmount": actual_received,
        "termMonths": term_months,
        "nominalRate": nominal_rate,
        "realAnnualRate": real_rate,
        "additionalFees": service_fee,
        "extraCost": extra_cost,
        "totalRepayment": total_repayment,
    }


def build_b_output(text: str, task_id: str) -> dict[str, Any]:
    contract_type = detect_contract_type(text)
    costs = estimate_costs(text, contract_type)
    clauses = build_clauses(text)
    return {
        "schemaVersion": "1.0.0",
        "taskId": task_id,
        "contractId": f"contract_{task_id}",
        "runId": f"run_contract_cost_{task_id}",
        "agent": "contract_cost",
        "agentVersion": "demo-b-0.1.0",
        "status": "completed",
        "generatedAt": now_iso(),
        "inputRunIds": [],
        "data": {
            "contractSummary": {
                "contractName": product_name_for(contract_type),
                "institution": "本地演示模拟机构",
                "productType": product_name_for(contract_type),
                "contractType": contract_type,
                "loanAmount": costs["loanAmount"],
                "actualReceivedAmount": costs["actualReceivedAmount"],
                "termMonths": costs["termMonths"],
                "nominalRate": costs["nominalRate"],
                "prepaymentRule": detect_prepayment_rule(text),
                "overdueFee": detect_overdue_fee(text),
                "repaymentMethod": detect_repayment_method(text, contract_type),
            },
            "costAnalysis": {
                "realAnnualRate": costs["realAnnualRate"],
                "additionalFees": costs["additionalFees"],
                "totalRepayment": costs["totalRepayment"],
                "extraCost": costs["extraCost"],
            },
            "clauses": clauses,
        },
        "warnings": [],
        "errors": [],
    }


def build_d_output(b_output: dict[str, Any], c_output: dict[str, Any], c_trace: dict[str, Any]) -> dict[str, Any]:
    data = c_output.get("data") or {}
    risk_items = data.get("riskItems") or []
    summary = data.get("riskSummary") or {}
    contract_type = ((b_output.get("data") or {}).get("contractSummary") or {}).get("contractType")
    recommendations = []
    if summary.get("high", 0) >= 2:
        recommendations.append(
            {
                "id": "action_overall_001",
                "priority": "high",
                "title": "先不要急着签",
                "content": "请先让机构把高风险条款逐条写清楚，再决定是否签约。",
                "relatedRiskIds": [item.get("id") for item in risk_items[:5] if item.get("id")],
            }
        )
    elif summary.get("medium", 0):
        recommendations.append(
            {
                "id": "action_overall_001",
                "priority": "medium",
                "title": "谨慎确认后再签",
                "content": "当前合同有需要确认的地方，建议先问清费用、还款和退出规则。",
                "relatedRiskIds": [item.get("id") for item in risk_items[:3] if item.get("id")],
            }
        )
    else:
        recommendations.append(
            {
                "id": "action_overall_001",
                "priority": "low",
                "title": "可以继续核对",
                "content": "暂未发现明显高风险，但签约前仍建议保存合同和还款计划。",
                "relatedRiskIds": [],
            }
        )

    if contract_type == "credit_card_installment":
        recommendations.append(
            {
                "id": "action_credit_card_001",
                "priority": "high",
                "title": "把免息换算成总费用",
                "content": "请银行写明手续费总额、折算后的年化成本，以及提前还款时剩余手续费是否退还。",
                "relatedRiskIds": [item.get("id") for item in risk_items if item.get("category") in {"interest_fee", "prepayment"}],
            }
        )
    if contract_type == "education_training_loan":
        recommendations.append(
            {
                "id": "action_education_001",
                "priority": "high",
                "title": "先确认退课和贷款关系",
                "content": "请机构写明退课、机构停课或服务不达标时，贷款是否停止、已付款如何退。",
                "relatedRiskIds": [item.get("id") for item in risk_items if item.get("category") in {"repayment", "other"}],
            }
        )

    for index, item in enumerate(risk_items[:5], start=1):
        recommendations.append(
            {
                "id": f"action_risk_{index:03d}",
                "priority": item.get("riskLevel", "medium"),
                "title": item.get("title", "确认风险条款"),
                "content": item.get("questionToAsk") or "请机构用书面形式解释这条风险。",
                "relatedRiskIds": [item.get("id")],
            }
        )

    return {
        "schemaVersion": "1.0.0",
        "taskId": b_output["taskId"],
        "contractId": b_output["contractId"],
        "runId": f"run_recommendation_action_{b_output['taskId']}",
        "agent": "recommendation_action",
        "agentVersion": "demo-d-0.1.0",
        "status": "completed",
        "generatedAt": now_iso(),
        "inputRunIds": [b_output["runId"], c_output["runId"]],
        "data": {
            "overallResult": {
                "level": "high" if summary.get("high", 0) else "medium" if summary.get("medium", 0) else "low",
                "summary": f"识别到 {summary.get('high', 0)} 项高风险、{summary.get('medium', 0)} 项中风险。",
            },
            "recommendations": recommendations,
            "questionList": [item.get("questionToAsk") for item in risk_items[:5] if item.get("questionToAsk")],
            "traceRefs": {
                "scenarioSignals": c_trace.get("scenarioSignals", []),
                "knowledgeUsage": c_trace.get("knowledgeUsage", {}),
            },
        },
        "warnings": [],
        "errors": [],
    }


class DemoHandler(SimpleHTTPRequestHandler):
    server_version = "MoneyAgentDemo/0.1"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path in {"", "/"}:
            path = "/demo/index.html"
        self._serve_file(ROOT / path.lstrip("/"))

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/demo/analyze":
            self._send_json({"error": "接口不存在"}, HTTPStatus.NOT_FOUND)
            return
        try:
            payload = json.loads(read_request_body(self).decode("utf-8"))
            text = str(payload.get("contractText") or "").strip()
            filename = str(payload.get("filename") or "")
            file_content = payload.get("fileContent")
            if file_content and filename.lower().endswith(".pdf"):
                import base64

                text = extract_text_from_pdf(base64.b64decode(file_content))
            if not text:
                raise ValueError("请先粘贴合同文本，或上传可读取文字的 txt/pdf 文件。")
            result = run_demo_analysis(text)
            self._send_json(result)
        except Exception as exc:
            self._send_json({"error": str(exc), "errorType": exc.__class__.__name__}, HTTPStatus.BAD_REQUEST)

    def _serve_file(self, path: Path) -> None:
        resolved = path.resolve()
        if ROOT.resolve() not in resolved.parents and resolved != ROOT.resolve():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not resolved.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
        if resolved.suffix in {".html", ".css", ".js", ".json", ".md"}:
            content_type += "; charset=utf-8"
        data = resolved.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run_demo_analysis(text: str) -> dict[str, Any]:
    task_id = f"demo_{datetime.now(CST).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    case_dir = OUTPUT_ROOT / task_id
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "contract.txt").write_text(text, encoding="utf-8")

    b_output = build_b_output(text, task_id)
    b_path = case_dir / "b-output.json"
    c_path = case_dir / "c-output.json"
    trace_path = case_dir / "c-trace.json"
    write_json(b_path, b_output)

    c_output, c_trace = run_agent(b_path, c_path, db_path=C_DB_PATH, trace_output_path=trace_path)
    d_output = build_d_output(b_output, c_output, c_trace)
    summary = build_summary(b_output, c_output, d_output)

    write_json(case_dir / "d-output.json", d_output)
    write_json(case_dir / "summary.json", summary)
    return {
        "taskId": task_id,
        "progress": [
            {"stage": "B", "label": "合同解析与成本测算完成", "status": "completed"},
            {"stage": "C", "label": "风险识别与案例匹配完成", "status": c_output.get("status")},
            {"stage": "D", "label": "建议生成完成", "status": "completed"},
        ],
        "summary": summary,
        "bOutput": b_output,
        "cOutput": c_output,
        "cTrace": c_trace,
        "dOutput": d_output,
        "outputDir": str(case_dir),
    }


def run_server(host: str = "127.0.0.1", port: int = 8091) -> None:
    server = ThreadingHTTPServer((host, port), DemoHandler)
    print(f"Demo running at http://{host}:{port}/demo/index.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local end-to-end demo website.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8091, type=int)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_server(args.host, args.port)
