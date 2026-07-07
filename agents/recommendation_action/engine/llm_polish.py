# -*- coding: utf-8 -*-
"""可选 LLM 增强层：用大模型润色建议文案（规则保底 + LLM 增强）。

设计原则（与全组技术路线一致）：
- 协议结构、风险关联、优先级、时机全部由规则引擎决定，LLM 只改写
  action / rationale / summary 的文字表达，不允许增删建议、不允许改结论；
- 未配置 API Key、无网络或调用失败时，静默回落到模板文案，主流程不受影响。

启用方式（任选其一，OpenAI 兼容接口均可，如通义/DeepSeek/Kimi）：
    export LLM_API_KEY=sk-xxx
    export LLM_BASE_URL=https://api.openai.com/v1   # 或兼容端点
    export LLM_MODEL=gpt-4o-mini                    # 可选
然后运行：python main.py --llm
"""
import json
import os
import urllib.request

TIMEOUT = 20

PROMPT = (
    "你是消费金融合同助手。下面是 JSON 数组，每项含 action（建议）与 "
    "rationale（理由）。请把文字改写得更通俗、更口语化、对没有金融背景的用户"
    "更友好，但必须遵守：1) 不改变事实与数字；2) 不给出“签/不签”的绝对决策，"
    "只用“建议核实/暂缓/确认”类措辞；3) 保持数组长度与顺序不变；"
    "4) 只返回改写后的 JSON 数组，不要任何其他文字。\n\n"
)


def _config():
    key = os.environ.get("LLM_API_KEY")
    if not key:
        return None
    return {
        "key": key,
        "base": os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    }


def _chat(cfg, content):
    body = json.dumps({
        "model": cfg["model"],
        "temperature": 0.3,
        "messages": [{"role": "user", "content": content}],
    }).encode("utf-8")
    req = urllib.request.Request(
        cfg["base"] + "/chat/completions", data=body,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {cfg['key']}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def polish_recommendations(recommendations):
    """尝试用 LLM 改写建议文案。返回 (recommendations, used_llm: bool)。

    任何异常都回落到原文案 —— 规则保底，增强可选。
    """
    cfg = _config()
    if not cfg or not recommendations:
        return recommendations, False
    try:
        payload = [{"action": r["action"], "rationale": r["rationale"]}
                   for r in recommendations]
        raw = _chat(cfg, PROMPT + json.dumps(payload, ensure_ascii=False))
        if raw.startswith("```"):
            raw = raw.strip("`").lstrip("json").strip()
        rewritten = json.loads(raw)
        if (not isinstance(rewritten, list)
                or len(rewritten) != len(recommendations)):
            return recommendations, False
        out = []
        for rec, new in zip(recommendations, rewritten):
            merged = dict(rec)
            if isinstance(new.get("action"), str) and new["action"].strip():
                merged["action"] = new["action"].strip()
            if isinstance(new.get("rationale"), str) and new["rationale"].strip():
                merged["rationale"] = new["rationale"].strip()
            out.append(merged)
        return out, True
    except Exception:  # noqa: BLE001 —— 增强层绝不阻断主流程
        return recommendations, False
