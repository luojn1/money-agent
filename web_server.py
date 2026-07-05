"""Local interactive web server for the risk_case preview demo."""

from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from main import ROOT_DIR, AgentInputError, run_agent


PROJECT_ROOT = ROOT_DIR.parent
WEB_INPUT_DIR = ROOT_DIR / "outputs" / "web_inputs"
WEB_OUTPUT_DIR = ROOT_DIR / "outputs" / "web_outputs"
DB_PATH = ROOT_DIR / "risk_case_agent.db"


class RiskCaseDemoHandler(SimpleHTTPRequestHandler):
    """Serve preview files and expose a JSON API for local Agent runs."""

    server_version = "RiskCaseDemo/0.2"

    def do_GET(self) -> None:  # noqa: N802 - stdlib API name
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path in {"/", ""}:
            path = "/preview_demo/index.html"
        self._serve_file(PROJECT_ROOT / path.lstrip("/"))

    def do_POST(self) -> None:  # noqa: N802 - stdlib API name
        parsed = urlparse(self.path)
        if parsed.path != "/api/analyze":
            self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()
            b_output = payload.get("bOutput") if isinstance(payload, dict) else None
            if not isinstance(b_output, dict):
                raise AgentInputError("请求体必须包含 bOutput 对象。")
            result = self._run_analysis(b_output)
            self._send_json(result)
        except AgentInputError as exc:
            self._send_json(
                {"error": "输入数据格式不符合 C Agent 要求。", "hint": str(exc)},
                status=HTTPStatus.BAD_REQUEST,
            )
        except Exception as exc:  # pragma: no cover - defensive for local UI
            self.log_error("analysis failed: %s", exc)
            self._send_json(
                {
                    "error": "分析失败，请检查本地服务日志。",
                    "hint": "请确认输入的是 B Agent 生成的 contract_cost JSON，且本地知识库已初始化。",
                    "errorType": exc.__class__.__name__,
                },
                status=HTTPStatus.BAD_REQUEST,
            )

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        if not raw:
            raise AgentInputError("请求体为空。")
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise AgentInputError(f"请求体不是合法 JSON：{exc.msg}") from exc

    def _run_analysis(self, b_output: dict[str, Any]) -> dict[str, Any]:
        WEB_INPUT_DIR.mkdir(parents=True, exist_ok=True)
        WEB_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        task_id = str(b_output.get("taskId") or "manual_task")
        safe_task_id = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in task_id)
        input_path = WEB_INPUT_DIR / f"{safe_task_id}-b-input.json"
        output_path = WEB_OUTPUT_DIR / f"{safe_task_id}-c-risk-case-output.json"

        input_path.write_text(json.dumps(b_output, ensure_ascii=False, indent=2), encoding="utf-8")
        output, trace = run_agent(input_path=input_path, output_path=output_path, db_path=DB_PATH)
        return {"output": output, "trace": trace, "outputPath": str(output_path)}

    def _serve_file(self, path: Path) -> None:
        resolved = path.resolve()
        root = PROJECT_ROOT.resolve()
        if root not in resolved.parents and resolved != root:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not resolved.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
        if resolved.suffix in {".html", ".css", ".js", ".json", ".md"}:
            content_type = f"{content_type}; charset=utf-8"
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


def run_server(host: str = "127.0.0.1", port: int = 8090) -> None:
    server = ThreadingHTTPServer((host, port), RiskCaseDemoHandler)
    print(f"RiskCase interactive demo is running at http://{host}:{port}/preview_demo/index.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the local interactive risk_case demo server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8090, type=int)
    args = parser.parse_args()
    run_server(args.host, args.port)
