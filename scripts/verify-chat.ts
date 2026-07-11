// D 模块 T3 对话机器人 + T6 工程兜底的验证脚本。
// 运行：pnpm --filter @money-agent/backend exec tsx ../../scripts/verify-chat.ts
//
// 用合成报告注入内存 task store（不跑 python，确定性、秒级），覆盖：
//   - 隐私脱敏（手机号/身份证/银行卡/姓名）
//   - 命中式检索：服务费问题 -> interest_fee 风险，回答带 citation
//   - 泛问兜底：“为什么这个风险高” -> 最高等级风险
//   - 错误处理：空问题 / 未知任务 / DISABLE_CHAT 降级
//   - 对话历史记录且入库前脱敏

import {
  ChatError,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_REQUESTS_PER_WINDOW,
  desensitize,
  getChatHistory,
  handleChat,
  resetChatHistory,
} from "../website/backend/src/services/chatOrchestrator.js";
import { createPipelineTask, updatePipelineTask } from "../website/backend/src/services/pipelineTaskStore.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`❌ ${message}`);
  console.log(`✓ ${message}`);
};

// —— 合成一份最小报告，结构对齐 pipelineOrchestrator.buildReport 的产物 ——
const syntheticReport = {
  overview: {
    institution: "示例消费金融公司",
    productType: "个人消费信用贷款",
    nominalAnnualRate: 12,
    realAnnualRate: 34.5,
  },
  costAnalysis: { costLevel: "high", additionalFees: 2000, totalInterest: 5600 },
  risks: [
    {
      id: "risk_fee_001",
      title: "服务费在放款时先行扣除",
      riskLevel: "high",
      category: "interest_fee",
      categoryLabel: "利息与费用",
      reason: "合同约定服务费在放款时一次性从本金中扣除，导致实际到账金额低于借款金额，真实年化利率被抬高",
      possibleConsequence: "你实际拿到的钱变少，但仍按全额本金计息还款",
      clauseText: "乙方应支付相当于贷款本金3%的服务费，该费用于放款时从放款金额中直接扣除。",
      relatedClauseIds: ["clause_fee_003"],
      questionToAsk: "服务费具体多少钱？是否从放款金额里先扣？",
      matchedCases: [
        { caseId: "CASE007", title: "砍头息纠纷案", conclusion: "法院认定先扣服务费属于变相提高利率，超出部分不予支持" },
      ],
    },
    {
      id: "risk_privacy_002",
      title: "授权查询并共享个人征信与通讯录",
      riskLevel: "medium",
      category: "authorization_privacy",
      categoryLabel: "授权与隐私",
      reason: "合同授权机构查询征信并读取通讯录用于催收",
      possibleConsequence: "逾期时联系人可能被批量通知",
      clauseText: "借款人同意授权甲方查询其征信报告并读取通讯录信息。",
      relatedClauseIds: ["clause_auth_009"],
      questionToAsk: "授权范围能否限定？是否必须开放通讯录？",
      matchedCases: [],
    },
  ],
  actions: {
    overallLevel: "high",
    summary: "该合同真实年化偏高且存在先扣服务费，建议签约前重点核实费用口径",
    questionList: ["服务费到底怎么收？", "真实年化利率是多少？", "逾期会怎样？"],
  },
};

const makeTask = (): string => {
  const taskId = `verify_chat_${Date.now().toString(36)}`;
  createPipelineTask({ taskId, contractName: "verify-chat-synthetic.txt", runtimeDir: "/tmp/verify-chat" });
  updatePipelineTask(taskId, { status: "completed", result: syntheticReport });
  resetChatHistory(taskId);
  return taskId;
};

// —— 1) 隐私脱敏 ——
const pii = "借款人 张三，手机号 13812345678，身份证 11010119900307461X，银行卡 6222020200112233445。";
const masked = desensitize(pii);
assert(!masked.includes("13812345678"), "脱敏：手机号被遮蔽");
assert(!masked.includes("11010119900307461X"), "脱敏：身份证被遮蔽");
assert(!masked.includes("6222020200112233445"), "脱敏：银行卡被遮蔽");
assert(masked.includes("[姓名]") && !masked.includes("张三"), "脱敏：显式标注的姓名被遮蔽");

// —— 2) 命中式检索：服务费问题 ——
const taskId = makeTask();
const feeAnswer = await handleChat(taskId, "为什么我的服务费有风险？");
assert(feeAnswer.answer.trim().length > 0, "服务费问题：返回非空回答");
assert(feeAnswer.mode === "template", "服务费问题：无 LLM_API_KEY 时走模板回答");
assert(feeAnswer.citations.length > 0, "服务费问题：回答必须带 citation（T3 验收）");
assert(feeAnswer.citations.some((c) => c.type === "risk" && c.id === "risk_fee_001"), "服务费问题：命中 interest_fee 风险");
assert(feeAnswer.citations.some((c) => c.type === "clause" && c.id === "clause_fee_003"), "服务费问题：引用对应条款");
assert(feeAnswer.citations.some((c) => c.type === "case" && c.id === "CASE007"), "服务费问题：引用相似案例");

// —— 3) 泛问兜底：为什么这个风险高 ——
const genericAnswer = await handleChat(taskId, "为什么这个风险高？");
assert(genericAnswer.citations.some((c) => c.type === "risk" && c.id === "risk_fee_001"), "泛问：兜底到最高等级风险");
assert(Array.isArray(genericAnswer.suggestedQuestions), "泛问：返回 suggestedQuestions 数组");

// —— 3.5) 回答质量（文案规范 + 对题回答）——
for (const [label, answer] of [["服务费问题", feeAnswer.answer], ["泛问", genericAnswer.answer]] as const) {
  assert(!/。{2,}/.test(answer), `质量：${label} 无连续句号`);
  assert(answer.length <= 400, `质量：${label} 回答不超过 400 字（实际 ${answer.length}）`);
  assert(!answer.includes("命中规则"), `质量：${label} 不直接暴露“命中规则”等内部术语`);
}
const rateAnswer = await handleChat(taskId, "真实年化利率是多少？");
assert(rateAnswer.answer.includes("34.5"), "对题：问利率直接回答真实年化数字");
assert(!/。{2,}/.test(rateAnswer.answer), "质量：利率回答无连续句号");
const privacyAnswer = await handleChat(taskId, "通讯录授权有什么问题？");
assert(privacyAnswer.citations.some((c) => c.type === "risk" && c.id === "risk_privacy_002"), "对题：问隐私命中隐私风险而非费用风险");
const actionAnswer = await handleChat(taskId, "那我该怎么办？");
assert(/确认|建议/.test(actionAnswer.answer) && actionAnswer.answer.length <= 300, "对题：问怎么办给出行动建议且简短");
const offtopicAnswer = await handleChat(taskId, "今天天气怎么样");
assert(offtopicAnswer.answer.includes("只能回答") && !offtopicAnswer.answer.includes("关于「"), "边界：跑题问题礼貌拒答而非硬答风险");
const glossaryAnswer = await handleChat(taskId, "砍头息是什么意思？");
assert(glossaryAnswer.answer.includes("大白话") && glossaryAnswer.answer.includes("本金"), "边界：术语问题给通俗解释");
const decisionAnswer = await handleChat(taskId, "这个合同能不能签？");
assert(decisionAnswer.answer.includes("你自己决定"), "边界：签约决定不替用户做，只给依据");

// —— 4) 对话历史：记录且入库前脱敏 ——
const historyTask = makeTask();
await handleChat(historyTask, "我叫李四，手机号 13900001111，请问服务费为什么高？");
const history = getChatHistory(historyTask);
assert(history.length === 2, "历史：一问一答共 2 条");
assert(history[0].role === "user" && history[1].role === "assistant", "历史：顺序为 user->assistant");
assert(!history[0].content.includes("13900001111"), "历史：用户消息入库前已脱敏");

// —— 5) 错误处理 ——
let emptyThrew = false;
try {
  await handleChat(taskId, "   ");
} catch (error) {
  emptyThrew = error instanceof ChatError && error.code === "EMPTY_MESSAGE";
}
assert(emptyThrew, "错误处理：空问题抛 EMPTY_MESSAGE");

let notFoundThrew = false;
try {
  await handleChat("task_does_not_exist", "你好");
} catch (error) {
  notFoundThrew = error instanceof ChatError && error.code === "TASK_NOT_FOUND";
}
assert(notFoundThrew, "错误处理：未知任务抛 TASK_NOT_FOUND");

let tooLongThrew = false;
try {
  await handleChat(makeTask(), "问".repeat(MAX_CHAT_MESSAGE_LENGTH + 1));
} catch (error) {
  tooLongThrew = error instanceof ChatError && error.code === "MESSAGE_TOO_LONG";
}
assert(tooLongThrew, "错误处理：超长问题抛 MESSAGE_TOO_LONG");

const rateLimitedTask = makeTask();
for (let index = 0; index < MAX_CHAT_REQUESTS_PER_WINDOW; index += 1) {
  await handleChat(rateLimitedTask, "服务费有什么问题？");
}
let rateLimitedThrew = false;
try {
  await handleChat(rateLimitedTask, "还能继续问吗？");
} catch (error) {
  rateLimitedThrew = error instanceof ChatError && error.code === "RATE_LIMITED";
}
assert(rateLimitedThrew, "限流：一分钟内超出次数抛 RATE_LIMITED");

// —— 6) 降级开关 DISABLE_CHAT ——
process.env.DISABLE_CHAT = "true";
const disabled = await handleChat(taskId, "为什么服务费高？");
assert(disabled.mode === "disabled" && disabled.citations.length === 0, "降级：DISABLE_CHAT=true 时优雅关闭");
delete process.env.DISABLE_CHAT;

console.log("\n✅ verify-chat 全部通过");
