# -*- coding: utf-8 -*-
"""D 模块：建议生成 + 行动管理 Agent（recommendation_action）。

读取 B（contract_cost）与 C（risk_case）的完整协议信封，
生成符合《多 Agent 数据协议 v1.0.0》的 RecommendationActionOutput，
并额外输出行动管理扩展文件（提醒任务 / 证据清单 / 沟通话术 / 跟进计划）。

用法：
    python main.py                                  # 使用 examples 下的示例输入
    python main.py --input-b <B输出.json> --input-c <C输出.json> \
                   --output outputs/d-recommendation-action-output.json
可选：
    --action-plan outputs/d-action-plan.json        # 行动管理扩展文件路径
    --user-profile examples/user-profile.json       # 用户画像（个性化建议）
    --schema <仓库 shared/schemas/analysis-protocol-v1.schema.json>
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.loader import ProtocolError, check_pair, load_envelope
from engine.recommender import build_question_list, build_recommendations
from engine.overall import build_overall_result
from engine.action_plan import build_action_plan
from engine.validator import schema_check, structural_check

AGENT_NAME = "recommendation_action"
AGENT_VERSION = "d-0.2.0"
DISCLAIMER = ("本报告仅用于帮助理解合同和识别信息风险，"
              "不构成法律、投资或信贷决策意见。")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CST = timezone(timedelta(hours=8))

# 协议 Schema 自动发现：环境变量优先，其次仓库相对路径
# （只找仓库中的 shared/schemas/，不依赖个人电脑上的 A/xxx 目录）
_SCHEMA_REL = os.path.join("shared", "schemas", "analysis-protocol-v1.schema.json")
SCHEMA_CANDIDATES = [
    os.environ.get("SCHEMA_PATH") or "",
    os.path.join(BASE_DIR, "..", "..", _SCHEMA_REL),          # 合并仓库：repo/agents/recommendation_action -> repo/shared/...
    os.path.join(BASE_DIR, "..", _SCHEMA_REL),                # D 直接位于仓库根的子目录时
    os.path.join(BASE_DIR, "..", "..", "B", _SCHEMA_REL),     # 本地开发布局：B 即仓库主体
]


def find_schema(explicit=None):
    """返回可用的协议 Schema 路径；找不到返回 None（跳过 Schema 校验）。"""
    for path in ([explicit] if explicit else []) + SCHEMA_CANDIDATES:
        if path and os.path.exists(path):
            return os.path.normpath(path)
    return None


def _now_iso():
    return datetime.now(CST).isoformat(timespec="seconds")


def _carry_warnings(b_env, c_env, extra=None):
    """透传上游中影响结论的警告，code 前缀标明来源。"""
    warnings = []
    for src, env in (("B", b_env), ("C", c_env)):
        for w in env.get("warnings") or []:
            warnings.append({
                "code": f"{src}_{w.get('code', 'UNKNOWN')}",
                "message": f"[来自{src}] {w.get('message', '')}",
                "fieldPath": w.get("fieldPath"),
            })
    warnings.extend(extra or [])
    return warnings


def _envelope(b_env, run_id, status, data, warnings, errors):
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


def run(b_path, c_path, user_profile=None, use_llm=False):
    """核心流程：返回 (D 信封, 行动管理扩展 dict 或 None)。"""
    b_env = load_envelope(b_path, "contract_cost")
    c_env = load_envelope(c_path, "risk_case")
    run_id = f"run_{AGENT_NAME}_{b_env['taskId']}"

    # 上游 failed：D 本次运行不可用（协议：data 必须为 null）
    failed_src = [s for s, e in (("B", b_env), ("C", c_env))
                  if e["status"] == "failed"]
    if failed_src:
        env = _envelope(b_env, run_id, "failed", None, [], [{
            "code": "UPSTREAM_FAILED",
            "message": f"上游 {'/'.join(failed_src)} 运行失败，无法生成建议",
            "fieldPath": None,
            "recoverable": True,
        }])
        env["inputRunIds"] = [b_env["runId"], c_env["runId"]]
        return env, None, (b_env, c_env)

    # B/C 必须属于同一次分析（taskId/contractId 一致、C 引用 B 的 runId），
    # 任何一项不一致都直接 failed，绝不把两份不同合同的数据拼在一起生成建议
    pair_problems = check_pair(b_env, c_env)
    if pair_problems:
        env = _envelope(b_env, run_id, "failed", None, [], [{
            "code": "UPSTREAM_LINK_MISMATCH",
            "message": "B 与 C 不属于同一次分析，已拒绝生成建议：" + "；".join(pair_problems),
            "fieldPath": None,
            "recoverable": True,
        }])
        env["inputRunIds"] = [b_env["runId"], c_env["runId"]]
        return env, None, (b_env, c_env)

    risk_items = (c_env.get("data") or {}).get("riskItems") or []
    cost_analysis = (b_env.get("data") or {}).get("costAnalysis") or {}
    recommendations = build_recommendations(risk_items, user_profile,
                                            cost_analysis)
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

    # 上游 partial -> D partial 并透传警告（协议第 5 节）
    upstream_partial = "partial" in (b_env["status"], c_env["status"])
    status = "partial" if upstream_partial else "completed"
    warnings = _carry_warnings(b_env, c_env)

    env = _envelope(b_env, run_id, status, data, warnings, [])
    env["inputRunIds"] = [b_env["runId"], c_env["runId"]]

    plan = build_action_plan(b_env, c_env, run_id, env["generatedAt"])
    return env, plan, (b_env, c_env)


def main():
    parser = argparse.ArgumentParser(description="D 建议生成 + 行动管理 Agent")
    parser.add_argument("--input-b",
                        default=os.path.join(BASE_DIR, "examples",
                                             "b-contract-cost-output.json"))
    parser.add_argument("--input-c",
                        default=os.path.join(BASE_DIR, "examples",
                                             "c-risk-case-output.json"))
    parser.add_argument("--output",
                        default=os.path.join(BASE_DIR, "outputs",
                                             "d-recommendation-action-output.json"))
    parser.add_argument("--action-plan",
                        default=os.path.join(BASE_DIR, "outputs",
                                             "d-action-plan.json"))
    parser.add_argument("--user-profile", default=None,
                        help="用户画像 JSON 文件（可选）")
    parser.add_argument("--schema", default=None,
                        help="analysis-protocol-v1.schema.json 路径（可选，"
                             "默认在仓库 shared/schemas/ 下自动查找，"
                             "也可用环境变量 SCHEMA_PATH 指定）")
    parser.add_argument("--llm", action="store_true",
                        help="启用大模型润色建议文案（需配置 LLM_API_KEY）")
    args = parser.parse_args()

    profile = None
    if args.user_profile:
        with open(args.user_profile, encoding="utf-8") as f:
            profile = json.load(f)

    try:
        d_env, plan, (b_env, c_env) = run(args.input_b, args.input_c, profile,
                                          use_llm=args.llm)
    except ProtocolError as exc:
        print(f"[错误] 上游输入不符合协议: {exc}")
        sys.exit(1)

    problems = structural_check(d_env, b_env, c_env)
    if problems:
        print("[错误] 输出未通过协议自检：")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    schema_path = find_schema(args.schema)
    if schema_path:
        schema_problems = schema_check(d_env, schema_path)
        if schema_problems is None:
            print("[提示] 未安装 jsonschema，跳过 Schema 校验"
                  "（pip install jsonschema 可启用）")
        elif schema_problems:
            print("[错误] JSON Schema 校验失败：")
            for p in schema_problems:
                print("  -", p)
            sys.exit(1)
        else:
            print(f"[通过] A 协议 JSON Schema 校验（{schema_path}）")

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(d_env, f, ensure_ascii=False, indent=2)
    print(f"[完成] 协议输出: {args.output} (status={d_env['status']})")

    if plan is not None:
        os.makedirs(os.path.dirname(args.action_plan), exist_ok=True)
        with open(args.action_plan, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        print(f"[完成] 行动管理扩展: {args.action_plan} "
              f"(提醒 {len(plan['reminders'])} 项)")

    data = d_env.get("data")
    if data:
        print(f"[摘要] overall={data['overallResult']['level']} | "
              f"建议 {len(data['recommendations'])} 条 | "
              f"问题清单 {len(data['questionList'])} 条")


if __name__ == "__main__":
    main()
