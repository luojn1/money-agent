# -*- coding: utf-8 -*-
"""D 模块本地预览服务（仅标准库）。

用法：
    cd recommendation_action_agent
    python preview/server.py            # 默认端口 8091
然后浏览器打开 http://127.0.0.1:8091/

接口：
    GET  /api/run?example=high|low      # 用内置示例运行 D
    POST /api/run  body={"b":{...},"c":{...}}   # 用上传的 B/C JSON 运行 D
    POST /api/run  body={"contractFile":{"name":..,"base64":..}}
                                        # 上传真实合同，自动串 B->C->D 全链路
                                        # （需 B 服务已启动：B 目录 pnpm run dev，端口 3001）
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PREVIEW_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(PREVIEW_DIR)
sys.path.insert(0, BASE)

from main import run  # noqa: E402
from engine.loader import ProtocolError  # noqa: E402

EXAMPLES = {
    "high": ("examples/b-contract-cost-output.json",
             "examples/c-risk-case-output.json"),
    "low": ("examples/b-contract-cost-output.lowrisk.json",
            "examples/c-risk-case-output.lowrisk.json"),
}
PORT = 8091

# 全链路编排：B 服务地址与 C 模块目录（可用环境变量覆盖）
B_BASE_URL = os.environ.get("B_BASE_URL", "http://127.0.0.1:3001")

# C 模块目录：环境变量优先，其次按仓库相对路径自动发现
# （合并仓库 agents/risk_case 优先）
_C_CANDIDATES = [
    os.path.join(BASE, "..", "risk_case"),                 # repo/agents/ 下互为兄弟目录
    os.path.join(BASE, "..", "..", "agents", "risk_case"),
]


def _find_c_dir():
    env = os.environ.get("C_DIR")
    if env:
        return os.path.normpath(env)
    for cand in _C_CANDIDATES:
        if os.path.isfile(os.path.join(cand, "main.py")):
            return os.path.normpath(cand)
    return None


C_DIR = _find_c_dir()


class PipelineError(Exception):
    """全链路编排中可直接展示给用户的错误。"""


# B 服务在本机回环地址上，绕过系统代理（否则本机配代理时会 502）
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _call_b(filename, content):
    """把合同文件转发给 B 服务，返回 B 的协议输出（ContractCostOutput）。"""
    boundary = "----dform" + uuid.uuid4().hex
    # 中文文件名按 RFC 2231 编码（filename*），避免 B 端解码乱码
    from urllib.parse import quote
    ascii_name = filename.encode("ascii", "ignore").decode() or "contract.txt"
    part = (f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="contractFile"; '
            f'filename="{ascii_name}"; '
            f"filename*=UTF-8''{quote(filename)}\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode("utf-8")
    body = part + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        B_BASE_URL + "/api/analysis", data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with _OPENER.open(req, timeout=180) as resp:
            task = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError) as exc:
        raise PipelineError(
            "无法连接 B 合同解析服务（{}）。请先在 B 目录运行 pnpm run dev "
            "启动服务（端口 3001）后重试。原因：{}".format(B_BASE_URL, exc))
    task_id = task.get("taskId")
    if not task_id:
        raise PipelineError(f"B 服务未返回 taskId：{task}")
    # 创建任务后立即取 b-output（B 任务存内存，趁服务未重启马上取，
    # 避免 taskId 失效触发 B 的 demo 回退问题）
    with _OPENER.open(
            f"{B_BASE_URL}/api/analysis/{task_id}/b-output", timeout=180) as resp:
        b_env = json.loads(resp.read().decode("utf-8"))
    if b_env.get("taskId") != task_id:
        raise PipelineError(
            "B 返回的任务编号不一致，可能命中了 demo 回退，请重试。")
    return b_env


def _call_c(b_path, c_path):
    """调用 C 模块命令行做风险识别与案例匹配（严格协议输出）。

    返回 C 打印到 stdout 的 trace（含 riskScore 0-100 评分，
    评分由 C 的规则引擎按权重扣分计算，说明书 4.2 功能 5）。
    """
    if not C_DIR or not os.path.isdir(C_DIR):
        raise PipelineError(
            "找不到 C 模块目录（已尝试仓库相对路径 agents/risk_case、"
            "C/risk_case）。可用环境变量 C_DIR 指定，"
            "例如 export C_DIR=/path/to/agents/risk_case")
    cmd = [sys.executable, "main.py", "--input", b_path, "--output", c_path, "--trace"]
    try:
        proc = subprocess.run(
            cmd, cwd=C_DIR, capture_output=True, text=True, encoding="utf-8", timeout=180)
    except subprocess.TimeoutExpired:
        raise PipelineError("C 风险识别运行超时（180 秒），请检查 C 模块后重试。")
    if proc.returncode != 0 or not os.path.exists(c_path):
        detail = (proc.stderr or proc.stdout or "").strip()[-400:]
        raise PipelineError(f"C 风险识别运行失败：{detail}")
    try:
        return json.loads(proc.stdout)
    except ValueError:
        return {}


def _run_full_pipeline(contract, profile=None):
    """真实合同 -> B 解析测算 -> C 风险案例 -> D 建议行动。"""
    filename = contract.get("name") or "contract.txt"
    try:
        content = base64.b64decode(contract.get("base64") or "")
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(f"合同文件解码失败：{exc}")
    if not content:
        raise PipelineError("合同文件为空。")
    b_env = _call_b(filename, content)
    tmpdir = tempfile.mkdtemp(prefix="d_pipeline_")
    b_path = os.path.join(tmpdir, "b-output.json")
    c_path = os.path.join(tmpdir, "c-output.json")
    with open(b_path, "w", encoding="utf-8") as f:
        json.dump(b_env, f, ensure_ascii=False)
    trace = _call_c(b_path, c_path)
    result = _run_with_paths(b_path, c_path, profile)
    if isinstance(trace.get("riskScore"), int):
        result["riskScore"] = trace["riskScore"]
    return result


def _run_with_paths(b_path, c_path, profile=None):
    d_env, plan, (b_env, c_env) = run(b_path, c_path, user_profile=profile)
    return {"output": d_env, "actionPlan": plan, "b": b_env, "c": c_env}


def _run_with_envelopes(b_env, c_env, profile=None):
    tmp = []
    try:
        for env in (b_env, c_env):
            f = tempfile.NamedTemporaryFile(
                "w", suffix=".json", delete=False, encoding="utf-8")
            json.dump(env, f, ensure_ascii=False)
            f.close()
            tmp.append(f.name)
        return _run_with_paths(tmp[0], tmp[1], profile)
    finally:
        for p in tmp:
            try:
                os.unlink(p)
            except OSError:
                pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PREVIEW_DIR, **kwargs)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/run":
            name = (parse_qs(parsed.query).get("example") or ["high"])[0]
            if name not in EXAMPLES:
                return self._send_json({"error": f"未知示例 {name}"}, 400)
            b_rel, c_rel = EXAMPLES[name]
            try:
                result = _run_with_paths(os.path.join(BASE, b_rel),
                                         os.path.join(BASE, c_rel))
                return self._send_json(result)
            except (ProtocolError, Exception) as exc:  # noqa: BLE001
                return self._send_json({"error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/run":
            return self._send_json({"error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            profile = payload.get("profile") or None
            if "example" in payload:
                b_rel, c_rel = EXAMPLES[payload["example"]]
                result = _run_with_paths(os.path.join(BASE, b_rel),
                                         os.path.join(BASE, c_rel), profile)
            elif "contractFile" in payload:
                result = _run_full_pipeline(payload["contractFile"], profile)
            else:
                result = _run_with_envelopes(payload["b"], payload["c"], profile)
            return self._send_json(result)
        except PipelineError as exc:
            return self._send_json({"error": str(exc)}, 502)
        except ProtocolError as exc:
            return self._send_json({"error": f"输入不符合协议: {exc}"}, 400)
        except Exception as exc:  # noqa: BLE001
            return self._send_json({"error": str(exc)}, 400)

    def log_message(self, fmt, *args):  # 安静一点
        pass


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"D 模块预览已启动: http://127.0.0.1:{PORT}/  (Ctrl+C 退出)")
    server.serve_forever()
