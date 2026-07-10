# -*- coding: utf-8 -*-
"""D 模块：建议生成 + 行动管理 Agent（recommendation_action）。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.action_plan import build_action_plan
from engine.loader import ProtocolError, check_pair, load_envelope
from engine.overall import build_overall_result
from engine.recommender import build_question_list, build_recommendations
from engine.validator import schema_check, structural_check


AGENT_NAME = "recommendation_action"
AGENT_VERSION = "d-0.3.0-scenario"
DISCLAIMER = "本报告仅用于帮助理解合同和识别信息风险，不构成法律、投资或信贷决策意见。"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CST = timezone(timedelta(hours=8))

_SCHEMA_REL = os.path.join("shared", "schemas", "analysis-protocol-v1.schema.json")
SCHEMA_CANDIDATES = [
    os.environ.get("SCHEMA_PATH") or "",
    os.path.join(BASE_DIR, "..", "..", _SCHEMA_REL),
    os.path.join(BASE_DIR, "..", _SCHEMA_REL),
    os.path.join(BASE_DIR, "..", "..", "B", _SCHEMA_REL),
]


def find_schema(explicit: str | None = None) -> str | None:
    for path in ([explicit] if explicit else []) + SCHEMA_CANDIDATES:
        if path and os.path.exists(path):
            return os.path.normpath(path)
    return None


def _now_iso() -> str:
    return datetime.now(CST).isoformat(timespec="seconds")


def _carry_warnings(b_env: dict, c_env: dict, extra: list[dict] | None = None) -> list[dict]:
    warnings = []
    for src, env in (("B", b_env), ("C", c_env)):
        for warning in env.get("warnings") or []:
            warnings.append(
                {
                    "code": f"{src}_{warning.get('code', 'UNKNOWN')}",
                    "message": f"[来自{src}] {warning.get('message', '')}",
                    "fieldPath": warning.get("fieldPath"),
                }
            )
    warnings.extend(extra or [])
    return warnings


def _envelope(
    b_env: dict,
    run_id: str,
    status: str,
    data: dict | None,
    warnings: list[dict],
    errors: list[dict],
) -> dict:
    return {
        "schemaVersion": "1.0.0",
        "taskId": b_env["taskId"],
        "contractId": b_env["contractId"],
        "runId": run_id,
        "agent": AGENT_NAME,
        "agentVersion": AGENT_VERSION,
        "status": status,
        "generatedAt": _now_iso(),
        "inputRunIds": [],
        "data": data,
        "warnings": warnings,
        "errors": errors,
    }


def _load_optional_json(path: str | None) -> dict | None:
    if not path:
        return None
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def run(
    b_path: str,
    c_path: str,
    user_profile: dict | None = None,
    use_llm: bool = False,
    c_trace_path: str | None = None,
) -> tuple[dict, dict | None, tuple[dict, dict]]:
    b_env = load_envelope(b_path, "contract_cost")
    c_env = load_envelope(c_path, "risk_case")
    c_trace = _load_optional_json(c_trace_path)
    run_id = f"run_{AGENT_NAME}_{b_env['taskId']}"

    failed_src = [source for source, env in (("B", b_env), ("C", c_env)) if env["status"] == "failed"]
    if failed_src:
        env = _envelope(
            b_env,
            run_id,
            "failed",
            None,
            [],
            [
                {
                    "code": "UPSTREAM_FAILED",
                    "message": f"上游 {'/'.join(failed_src)} 运行失败，无法生成建议",
                    "fieldPath": None,
                    "recoverable": True,
                }
            ],
        )
        env["inputRunIds"] = [b_env["runId"], c_env["runId"]]
        return env, None, (b_env, c_env)

    pair_problems = check_pair(b_env, c_env)
    if pair_problems:
        env = _envelope(
            b_env,
            run_id,
            "failed",
            None,
            [],
            [
                {
                    "code": "UPSTREAM_LINK_MISMATCH",
                    "message": "B 与 C 不属于同一次分析，已拒绝生成建议：" + "；".join(pair_problems),
                    "fieldPath": None,
                    "recoverable": True,
                }
            ],
        )
        env["inputRunIds"] = [b_env["runId"], c_env["runId"]]
        return env, None, (b_env, c_env)

    risk_items = (c_env.get("data") or {}).get("riskItems") or []
    cost_analysis = (b_env.get("data") or {}).get("costAnalysis") or {}
    recommendations = build_recommendations(
        risk_items,
        user_profile,
        cost_analysis,
        c_output=c_env,
        c_trace=c_trace,
    )

    if use_llm:
        from engine.llm_polish import polish_recommendations

        recommendations, used = polish_recommendations(recommendations)
        if used:
            print("[LLM] 建议文案已由大模型润色（结构与结论未变）")
        else:
            print("[LLM] 未配置 LLM_API_KEY 或调用失败，使用规则模板文案")

    data = {
        "overallResult": build_overall_result(b_env, c_env),
        "recommendations": recommendations,
        "questionList": build_question_list(risk_items),
        "disclaimer": DISCLAIMER,
    }

    upstream_partial = "partial" in (b_env["status"], c_env["status"])
    status = "partial" if upstream_partial else "completed"
    warnings = _carry_warnings(b_env, c_env)

    env = _envelope(b_env, run_id, status, data, warnings, [])
    env["inputRunIds"] = [b_env["runId"], c_env["runId"]]

    plan = build_action_plan(b_env, c_env, run_id, env["generatedAt"])
    return env, plan, (b_env, c_env)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="D 建议生成 + 行动管理 Agent")
    parser.add_argument("--input-b", default=os.path.join(BASE_DIR, "examples", "b-contract-cost-output.json"))
    parser.add_argument("--input-c", default=os.path.join(BASE_DIR, "examples", "c-risk-case-output.json"))
    parser.add_argument("--input-c-trace", default=None, help="C trace JSON，可选；用于读取 scenarioSignals")
    parser.add_argument("--output", default=os.path.join(BASE_DIR, "outputs", "d-recommendation-action-output.json"))
    parser.add_argument("--action-plan", default=os.path.join(BASE_DIR, "outputs", "d-action-plan.json"))
    parser.add_argument("--user-profile", default=None, help="用户画像 JSON 文件（可选）")
    parser.add_argument("--schema", default=None, help="analysis-protocol-v1.schema.json 路径（可选）")
    parser.add_argument("--llm", action="store_true", help="启用大模型润色建议文案（需配置 LLM_API_KEY）")
    args = parser.parse_args()

    profile = _load_optional_json(args.user_profile)

    try:
        d_env, plan, (b_env, c_env) = run(
            args.input_b,
            args.input_c,
            profile,
            use_llm=args.llm,
            c_trace_path=args.input_c_trace,
        )
    except ProtocolError as exc:
        print(f"[错误] 上游输入不符合协议: {exc}")
        sys.exit(1)

    problems = structural_check(d_env, b_env, c_env)
    if problems:
        print("[错误] 输出未通过协议自检：")
        for problem in problems:
            print("  -", problem)
        sys.exit(1)

    schema_path = find_schema(args.schema)
    if schema_path:
        schema_problems = schema_check(d_env, schema_path)
        if schema_problems is None:
            print("[提示] 未安装 jsonschema，跳过 Schema 校验（pip install jsonschema 可启用）")
        elif schema_problems:
            print("[错误] JSON Schema 校验失败：")
            for problem in schema_problems:
                print("  -", problem)
            sys.exit(1)
        else:
            print(f"[通过] A 协议 JSON Schema 校验（{schema_path}）")

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as file:
        json.dump(d_env, file, ensure_ascii=False, indent=2)
    print(f"[完成] 协议输出: {args.output} (status={d_env['status']})")

    if plan is not None:
        os.makedirs(os.path.dirname(args.action_plan), exist_ok=True)
        with open(args.action_plan, "w", encoding="utf-8") as file:
            json.dump(plan, file, ensure_ascii=False, indent=2)
        print(f"[完成] 行动管理扩展: {args.action_plan} (提醒 {len(plan['reminders'])} 项)")

    data = d_env.get("data")
    if data:
        print(
            f"[摘要] overall={data['overallResult']['level']} | "
            f"建议 {len(data['recommendations'])} 条 | "
            f"问题清单 {len(data['questionList'])} 条"
        )


if __name__ == "__main__":
    main()

