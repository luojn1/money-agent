// 报告内对话编排（分工文档 T3 对话机器人 + T6 工程兜底）。
//
// 设计原则（与全组“规则保底 + LLM 可选”技术路线一致）：
//   - 回答基于“当前这份报告”的上下文，永远带 citation；
//   - 默认走规则模板回答，无需任何外部依赖即可演示；
//   - 配置了 LLM_API_KEY 时用 LLM 润色表达，失败/超时静默回退模板；
//   - 调 LLM 前先对文本脱敏（姓名/手机号/身份证/银行卡）；
//   - DISABLE_CHAT=true 或报告不可用时优雅降级，绝不影响主报告。

import { getPipelineTask } from "./pipelineTaskStore.js";
import {
  buildTemplateAnswer,
  retrieveContext,
  type ChatReport,
  type Citation,
} from "./reportContextRetriever.js";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  citations?: Citation[];
  at: string;
};

export type ChatAnswer = {
  answer: string;
  citations: Citation[];
  suggestedQuestions: string[];
  mode: "template" | "llm" | "disabled";
};

export class ChatError extends Error {
  constructor(
    public readonly code:
      | "TASK_NOT_FOUND"
      | "RESULT_NOT_READY"
      | "EMPTY_MESSAGE"
      | "MESSAGE_TOO_LONG"
      | "RATE_LIMITED",
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

const LLM_TIMEOUT_MS = 15_000;
const MAX_HISTORY = 40;
export const MAX_CHAT_MESSAGE_LENGTH = 500;
export const MAX_CHAT_REQUESTS_PER_WINDOW = 12;
const CHAT_RATE_WINDOW_MS = 60_000;

// 每个 taskId 一段对话历史，存内存（与 pipelineTaskStore 同一路子，演示够用）。
const histories = new Map<string, ChatMessage[]>();
const requestWindows = new Map<string, { count: number; resetAt: number }>();

const isChatDisabled = () => process.env.DISABLE_CHAT?.toLowerCase() === "true";

const nowIso = () => new Date().toISOString();

// —— 隐私脱敏（T6）：LLM 调用前对用户输入与上下文做一次遮蔽 ——
export const desensitize = (text: string): string => {
  if (!text) return text;
  return text
    // 身份证 18 位（含 X），放在手机号前面避免被部分匹配
    .replace(/\b\d{17}[\dXx]\b/g, "[身份证]")
    // 银行卡 16~19 位
    .replace(/\b\d{16,19}\b/g, "[银行卡]")
    // 手机号 11 位
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号]")
    // 显式标注的姓名，如“姓名：张三”“借款人 李四”
    .replace(/(姓名|借款人|甲方|乙方|客户)([:：]?\s*)([一-龥]{2,4})/g, "$1$2[姓名]");
};

const getHistory = (taskId: string): ChatMessage[] => histories.get(taskId) ?? [];

const appendHistory = (taskId: string, message: ChatMessage) => {
  const list = histories.get(taskId) ?? [];
  list.push(message);
  // 只保留最近 MAX_HISTORY 条，防止内存无限增长
  histories.set(taskId, list.slice(-MAX_HISTORY));
};

const enforceRateLimit = (taskId: string) => {
  const now = Date.now();
  const current = requestWindows.get(taskId);
  if (!current || now >= current.resetAt) {
    requestWindows.set(taskId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
    return;
  }
  if (current.count >= MAX_CHAT_REQUESTS_PER_WINDOW) {
    throw new ChatError("RATE_LIMITED", "提问太频繁，请稍后再试。");
  }
  current.count += 1;
};

// —— 可选 LLM 润色层，OpenAI 兼容接口（与 D 的 engine/llm_polish.py 同套 env 约定）——
type LlmConfig = { key: string; base: string; model: string };

const llmConfig = (): LlmConfig | null => {
  if (process.env.ENABLE_CHAT_LLM?.toLowerCase() !== "true") return null;
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    base: (process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.LLM_MODEL?.trim() || "deepseek-v4-flash",
  };
};

// LLM 角色卡：每次调用都随请求下发，行为由这里统一控制，无需任何“训练/调试”。
// 修改语气、人设、边界，改这段文字即可，立即对所有用户生效。
const LLM_SYSTEM_PROMPT = [
  "# 角色",
  "你是《看得懂的钱》的合同助手，帮没有金融背景的普通人看懂消费贷合同的体检报告。",
  "",
  "# 事实边界（最重要）",
  "- 你只知道【报告上下文】里的内容，所有数字、条款、案例必须出自其中，绝不编造或推测。",
  "- 用户主动说出的自身情况（如收入、还款计划）可以结合报告数字帮他粗略估算，但要注明是估算、仅供参考。",
  "- 上下文回答不了的问题，就坦率说明，并建议用户查看报告对应板块或咨询专业人士。",
  "",
  "# 回答格式",
  "- 第一句直接回答问题本身，然后最多补两句依据或提醒，全文不超过 120 字。",
  "- 大白话，像靠谱朋友聊天：说“先扣掉的钱”而不是“前置费用”；专业词第一次出现时顺手解释。",
  "- 标点规范，禁止连续句号；不复述用户问题；不要输出法条、clause_xxx、risk_xxx、合同原文或内部判定过程。",
  "",
  "# 立场与合规",
  "- 中立，不偏向机构也不吓唬用户；不做“签/不签”的决定，只用“建议核实/确认/暂缓”类措辞。",
  "- 不提供法律、投资意见；涉及维权纠纷时建议保留证据并走正规渠道。",
  "- 与这份合同和个人借贷决策都无关的话题（如闲聊、其他领域问题），礼貌说明并把话题带回合同。",
  "",
  "# 多轮对话",
  "- 结合【对话历史】理解追问：用户接着上一轮补充信息（如说出工资数字）时，延续上一轮话题作答，不要当成新话题拒绝。",
].join("\n");

// 带给 LLM 的历史轮数（一问一答算 2 条）。历史入库前已脱敏，这里可直接透传。
const LLM_HISTORY_MESSAGES = 8;

const callLlm = async (
  cfg: LlmConfig,
  contextText: string,
  question: string,
  templateAnswer: string,
  history: ChatMessage[],
): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        max_tokens: 240,
        ...(cfg.base.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}),
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          ...history.slice(-LLM_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user",
            content:
              `【报告上下文】\n${contextText || "（无额外上下文）"}\n\n` +
              `【用户问题】${question}\n\n` +
              `【参考要点（可用可不用）】${templateAnswer}\n\n` +
              "请直接回答用户的问题（不是复述参考要点），事实只能来自报告上下文。",
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content?.trim();
    return answer && answer.length > 0 ? answer : null;
  } catch {
    // 任何异常（网络/超时/解析）都回退模板——增强层绝不阻断对话
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 处理一次对话：检索上下文 -> 模板回答 -> (可选)LLM 润色 -> 落历史。
 * @throws ChatError 当任务不存在 / 报告未就绪 / 问题为空。
 */
export const handleChat = async (taskId: string, rawMessage: unknown): Promise<ChatAnswer> => {
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!message) {
    throw new ChatError("EMPTY_MESSAGE", "请输入你想问的问题。");
  }
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ChatError("MESSAGE_TOO_LONG", `问题请控制在 ${MAX_CHAT_MESSAGE_LENGTH} 字以内。`);
  }

  if (isChatDisabled()) {
    return {
      answer: "对话助手当前已关闭，你仍可以查看上方的完整体检报告。",
      citations: [],
      suggestedQuestions: [],
      mode: "disabled",
    };
  }

  const task = getPipelineTask(taskId);
  if (!task) {
    throw new ChatError("TASK_NOT_FOUND", `找不到分析任务：${taskId}。`);
  }
  if (!task.result) {
    throw new ChatError("RESULT_NOT_READY", "报告尚未生成完成，请稍后再问。");
  }
  enforceRateLimit(taskId);

  const report = task.result as ChatReport;
  const context = retrieveContext(report, message);
  const templateAnswer = buildTemplateAnswer(context, report, message);

  // 先取历史（不含本轮问题），再记录用户消息（脱敏后入库，避免历史里残留 PII）
  const priorHistory = getHistory(taskId);
  appendHistory(taskId, { role: "user", content: desensitize(message), at: nowIso() });

  let answer = templateAnswer;
  let mode: ChatAnswer["mode"] = "template";
  const cfg = llmConfig();
  if (cfg) {
    const polished = await callLlm(cfg, desensitize(context.contextText), desensitize(message), templateAnswer, priorHistory);
    if (polished) {
      answer = polished;
      mode = "llm";
    }
  }
  // 标点兜底：无论来源，连续句号一律合并（用户可见文案不允许“。。”）
  answer = answer.replace(/。{2,}/g, "。");

  const result: ChatAnswer = {
    answer,
    citations: context.citations,
    suggestedQuestions: context.suggestedQuestions,
    mode,
  };
  appendHistory(taskId, { role: "assistant", content: answer, citations: context.citations, at: nowIso() });
  return result;
};

/** 读取某个任务的对话历史（供 GET /chat/history）。 */
export const getChatHistory = (taskId: string): ChatMessage[] => getHistory(taskId);

/** 仅供测试：清空某任务历史。 */
export const resetChatHistory = (taskId: string) => {
  requestWindows.delete(taskId);
  return histories.delete(taskId);
};
