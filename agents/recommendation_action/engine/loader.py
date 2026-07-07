# -*- coding: utf-8 -*-
"""加载并校验上游 B/C 的协议信封。"""
import json


class ProtocolError(Exception):
    """上游输入不符合协议 v1.0.0 时抛出。"""


ENVELOPE_FIELDS = [
    "schemaVersion", "taskId", "contractId", "runId", "agent",
    "agentVersion", "status", "generatedAt", "inputRunIds",
    "data", "warnings", "errors",
]


def load_envelope(path, expected_agent):
    """读取一个 Agent 信封 JSON，做最基本的协议检查。"""
    with open(path, encoding="utf-8") as f:
        env = json.load(f)
    missing = [k for k in ENVELOPE_FIELDS if k not in env]
    if missing:
        raise ProtocolError(f"{path} 缺少信封字段: {missing}")
    if env["agent"] != expected_agent:
        raise ProtocolError(
            f"{path} 的 agent 为 {env['agent']}，期望 {expected_agent}")
    if str(env["schemaVersion"]).split(".")[0] != "1":
        raise ProtocolError(
            f"{path} 协议版本 {env['schemaVersion']} 与 v1.x 不兼容")
    if env["status"] not in ("completed", "partial", "failed"):
        raise ProtocolError(f"{path} status 非法: {env['status']}")
    return env


def check_pair(b_env, c_env):
    """B、C 两份信封的一致性检查，返回问题列表（不抛异常，交给调用方决定）。"""
    problems = []
    if b_env["taskId"] != c_env["taskId"]:
        problems.append("B 与 C 的 taskId 不一致")
    if b_env["contractId"] != c_env["contractId"]:
        problems.append("B 与 C 的 contractId 不一致")
    if b_env["runId"] not in (c_env.get("inputRunIds") or []):
        problems.append("C.inputRunIds 未包含 B.runId")
    return problems
