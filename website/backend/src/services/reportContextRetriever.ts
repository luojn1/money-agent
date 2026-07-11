// 报告上下文检索：从一次分析的最终报告里，按用户问题挑出最相关的
// 风险 / 条款 / 案例片段，产出可引用的 citations 和给模板/LLM 用的上下文文本。
//
// 纯规则实现，不依赖 LLM——这样即使没有配置 LLM_API_KEY，对话也能给出
// 带证据引用的可靠回答（分工文档 T3：回答必须带 citation）。

export type CitationType = "risk" | "clause" | "case";

export type Citation = {
  type: CitationType;
  id: string;
};

// 只声明本模块真正会读到的字段；report 实际是 pipelineOrchestrator.buildReport
// 的产物（存在 task.result 里，类型为 unknown），这里做防御式读取。
type ReportCase = { caseId?: string; title?: string; conclusion?: string };
type ReportRisk = {
  id?: string;
  title?: string;
  riskLevel?: "high" | "medium" | "low";
  category?: string;
  categoryLabel?: string;
  reason?: string;
  possibleConsequence?: string;
  clauseText?: string;
  relatedClauseIds?: string[];
  questionToAsk?: string;
  matchedCases?: ReportCase[];
};
type ReportOverview = {
  institution?: string | null;
  productType?: string | null;
  nominalAnnualRate?: number | null;
  realAnnualRate?: number | null;
  loanAmount?: number | null;
  actualReceivedAmount?: number | null;
  monthlyPayment?: number | null;
  installmentCount?: number | null;
};
type ReportCost = {
  costLevel?: string;
  additionalFees?: number | null;
  totalInterest?: number | null;
  totalRepayment?: number | null;
};
type ReportActions = {
  overallLevel?: string;
  summary?: string;
  questionList?: string[];
};
export type ChatReport = {
  risks?: ReportRisk[];
  overview?: ReportOverview;
  costAnalysis?: ReportCost;
  actions?: ReportActions;
};

export type RetrievedContext = {
  risks: ReportRisk[];
  citations: Citation[];
  contextText: string;
  suggestedQuestions: string[];
};

// 风险类别 -> 用户常用问法里的关键词，用于把口语问题对上专业风险项。
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  interest_fee: ["利息", "利率", "服务费", "手续费", "砍头息", "年化", "费用", "收费", "多还"],
  cost_transparency: ["成本", "名义", "真实", "透明", "到账", "扣", "实际拿到"],
  repayment: ["还款", "月供", "分期", "期数", "每月", "还多少"],
  prepayment: ["提前", "提前还款", "违约金", "结清"],
  overdue: ["逾期", "罚息", "催收", "晚还", "还不上"],
  authorization_privacy: ["授权", "隐私", "个人信息", "通讯录", "查征信", "同意"],
  dispute_resolution: ["争议", "仲裁", "诉讼", "管辖", "打官司", "纠纷"],
  other: [],
};

const RISK_LEVEL_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();

// 中文没有空格分词，这里用 2-gram 子串重叠做一个轻量的相关度信号。
const bigrams = (text: string): string[] => {
  const chars = normalize(text);
  const grams: string[] = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    grams.push(chars.slice(i, i + 2));
  }
  return grams;
};

const scoreRisk = (risk: ReportRisk, message: string): number => {
  const msg = normalize(message);
  let score = 0;

  // 1) 类别关键词命中（最强信号）
  const keywords = CATEGORY_KEYWORDS[risk.category ?? "other"] ?? [];
  for (const kw of keywords) {
    if (msg.includes(normalize(kw))) score += 4;
  }

  // 2) 与风险标题 / 条款原文的 2-gram 重叠
  const haystack = new Set(bigrams([risk.title, risk.clauseText, risk.reason, risk.categoryLabel].filter(Boolean).join("")));
  for (const gram of new Set(bigrams(message))) {
    if (haystack.has(gram)) score += 1;
  }

  // 3) 风险等级作为轻微的排序兜底（同分时高风险优先）
  score += (RISK_LEVEL_WEIGHT[risk.riskLevel ?? "low"] ?? 1) * 0.1;
  return score;
};

const firstNonEmpty = (values: (string | undefined)[]): string | undefined =>
  values.find((value) => typeof value === "string" && value.trim().length > 0);

const summarizeClause = (clauseText: string | undefined, limit = 60): string => {
  if (!clauseText) return "";
  const clean = clauseText.replace(/\s+/g, "");
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
};

const buildContextText = (risks: ReportRisk[], report: ChatReport): string => {
  const lines: string[] = [];
  const overview = report.overview ?? {};
  const cost = report.costAnalysis ?? {};
  if (overview.institution || overview.productType) {
    lines.push(`【合同】${overview.institution ?? "某机构"} · ${overview.productType ?? "消费信贷"}`);
  }
  if (overview.realAnnualRate != null || overview.nominalAnnualRate != null) {
    lines.push(
      `【利率】名义年化 ${overview.nominalAnnualRate ?? "信息不足"}%，真实年化 ${overview.realAnnualRate ?? "信息不足"}%，成本档位 ${cost.costLevel ?? "未知"}`,
    );
  }
  risks.forEach((risk, index) => {
    lines.push(
      [
        `【风险${index + 1}】${risk.title ?? "未命名风险"}（${risk.riskLevel ?? "low"}）`,
        risk.reason ? `原因：${risk.reason}` : "",
        risk.possibleConsequence ? `可能后果：${risk.possibleConsequence}` : "",
        risk.clauseText ? `合同条款：${summarizeClause(risk.clauseText, 80)}` : "",
        risk.matchedCases?.[0]?.conclusion ? `类似案例：${risk.matchedCases[0].conclusion}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });
  return lines.join("\n");
};

const buildCitations = (risks: ReportRisk[]): Citation[] => {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  const push = (type: CitationType, id: string | undefined) => {
    if (!id) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    citations.push({ type, id });
  };
  risks.forEach((risk) => {
    push("risk", risk.id);
    push("clause", risk.relatedClauseIds?.[0]);
    push("case", risk.matchedCases?.[0]?.caseId);
  });
  return citations;
};

const buildSuggestedQuestions = (report: ChatReport, usedRisk?: ReportRisk): string[] => {
  const suggestions: string[] = [];
  const push = (value: string | undefined) => {
    if (value && value.trim() && !suggestions.includes(value.trim())) suggestions.push(value.trim());
  };
  // 优先取 D 汇总出来的签约前问题清单
  (report.actions?.questionList ?? []).forEach(push);
  // 再补一条与当前风险直接相关的追问
  push(usedRisk?.questionToAsk);
  return suggestions.slice(0, 4);
};

/**
 * 根据用户问题从报告里检索最相关的风险，返回上下文与引用。
 * 找不到明显匹配时，回退到风险等级最高的一条（覆盖“为什么这个风险高？”这类泛问）。
 */
export const retrieveContext = (report: ChatReport, message: string): RetrievedContext => {
  const risks = (report.risks ?? []).filter((risk) => risk && risk.id);
  if (risks.length === 0) {
    return {
      risks: [],
      citations: [],
      contextText: buildContextText([], report),
      suggestedQuestions: buildSuggestedQuestions(report),
    };
  }

  const ranked = risks
    .map((risk) => ({ risk, score: scoreRisk(risk, message) }))
    .sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score ?? 0;
  const hasStrongMatch = bestScore >= 1;

  let selected: ReportRisk[];
  if (hasStrongMatch) {
    // 取最相关的 1~2 条（第二条需与第一条明显同档，避免硬凑）
    selected = ranked.filter((entry, index) => index === 0 || entry.score >= bestScore * 0.6).slice(0, 2).map((entry) => entry.risk);
  } else {
    // 泛问：按风险等级挑最高的一条
    selected = [...risks].sort((a, b) => (RISK_LEVEL_WEIGHT[b.riskLevel ?? "low"] ?? 1) - (RISK_LEVEL_WEIGHT[a.riskLevel ?? "low"] ?? 1)).slice(0, 1);
  }

  return {
    risks: selected,
    citations: buildCitations(selected),
    contextText: buildContextText(selected, report),
    suggestedQuestions: buildSuggestedQuestions(report, selected[0]),
  };
};

// —— 句子工具：统一句号处理，杜绝“。。”这类拼接错误 ——
const stripEndPunct = (text: string) => text.trim().replace(/[。．.；;，,、\s]+$/u, "");

/** 把片段规整成以单个句号结尾的句子；空内容返回空串。 */
const asSentence = (text: string | undefined) => {
  const clean = stripEndPunct(text ?? "");
  return clean ? `${clean}。` : "";
};

/** 取一段话里的第一个完整分句（C 的 reason 常是多段机器拼接文本）。 */
const firstClauseOf = (text: string | undefined) =>
  (text ?? "").trim().split(/[。；;\n]/)[0]?.trim() ?? "";

/**
 * 把 C 的 reason 转成一句人话。
 * C 的 reason 常见形态是“命中规则「xxx」。该判断参考《民法典》第677条；……法规摘要：……”，
 * 直接展示会生硬冗长；这里只保留结论 + 最多两个法规出处。
 */
const humanizeReason = (risk: ReportRisk): string => {
  const raw = (risk.reason ?? "").trim();
  if (!raw) return `合同中「${risk.title ?? "该条款"}」需要注意`;
  if (/^命中规则/.test(raw)) {
    const laws = raw.match(/《[^》]{2,20}》(第[一二三四五六七八九十百\d]+条)?/g)?.slice(0, 2) ?? [];
    const base = `合同条款触发了「${risk.title ?? "风险"}」的判定`;
    return laws.length ? `${base}（判断依据：${[...new Set(laws)].join("、")}）` : base;
  }
  return firstClauseOf(raw);
};

// —— 高频术语通俗解释（与 C 模块的术语通俗化方向一致，规则层兜底）——
const GLOSSARY: Record<string, string> = {
  砍头息: "指把利息或费用在放款时先从本金里扣掉。你实际拿到的钱变少了，但还款仍按全额本金计算，变相抬高了真实利率",
  真实年化: "把利息加上所有费用、按你实际拿到手的钱算出来的年化成本，比合同上写的名义利率更能反映真实负担",
  名义利率: "合同上写的利率，通常没把服务费等费用算进去，看起来会比实际便宜",
  罚息: "逾期后按约定加收的利息，通常比正常利率高不少",
  宽限期: "还款日之后允许晚还几天而不算逾期的缓冲时间，有没有、有几天要看合同约定",
  征信: "你的个人信用记录。逾期可能被上报征信，影响以后贷款、办信用卡",
  等额本息: "每月还固定金额的还款方式，前期还的大部分是利息、后期大部分是本金",
  违约金: "违反合同约定（如提前还款、逾期）时按约定要额外支付的钱",
};

// —— 意图识别：让每个问题得到一个对题的回答，而不是千篇一律的风险播报 ——
type ChatIntent = "cost" | "action" | "case" | "glossary" | "decision" | "offtopic" | "why";

const FINANCE_HINT = /(合同|借|贷|款|利|费|还|签|钱|金额|逾期|征信|分期|风险|条款|机构|扣|到账|案例|授权|隐私|违约)/;

const detectIntent = (message: string): ChatIntent => {
  if (/(是什么意思|什么是|啥意思|什么叫|解释一下|听不懂)/.test(message)) return "glossary";
  if (/(能签吗|能不能签|该不该签|可以签吗|签不签|值得签)/.test(message)) return "decision";
  if (/(多少钱?|几个点|是多少|利率是|年化是|月供|每月还|每期还|到账|总共|一共|要还多少|还多少)/.test(message)) return "cost";
  if (/(怎么办|该怎么|要注意什么|如何应对|怎么做|要不要签|建议我|需要做)/.test(message)) return "action";
  if (/(案例|判例|别人遇到|法院|判决|有没有人)/.test(message)) return "case";
  if (!FINANCE_HINT.test(message)) return "offtopic";
  return "why";
};

const findGlossaryTerm = (message: string): [string, string] | null => {
  for (const [term, explain] of Object.entries(GLOSSARY)) {
    if (message.includes(term)) return [term, explain];
  }
  return null;
};

const formatMoney = (value: number) => value.toLocaleString("zh-CN");

/** 数字类问题：直接用 B 的测算结果回答，不绕风险描述。 */
const buildCostAnswer = (report: ChatReport): string => {
  const o = report.overview ?? {};
  const c = report.costAnalysis ?? {};
  const parts: string[] = [];
  if (o.realAnnualRate != null) {
    parts.push(asSentence(
      `这份合同的真实年化利率约 ${o.realAnnualRate}%` +
      (o.nominalAnnualRate != null ? `，比合同写的名义利率 ${o.nominalAnnualRate}% ${o.realAnnualRate > o.nominalAnnualRate ? "高" : "低"}` : ""),
    ));
  }
  if (o.loanAmount != null && o.actualReceivedAmount != null && o.actualReceivedAmount < o.loanAmount) {
    parts.push(asSentence(`借款 ${formatMoney(o.loanAmount)} 元、实际到账 ${formatMoney(o.actualReceivedAmount)} 元，差额 ${formatMoney(o.loanAmount - o.actualReceivedAmount)} 元是被预先扣掉的费用`));
  }
  if (o.monthlyPayment != null) {
    parts.push(asSentence(`每月需还约 ${formatMoney(o.monthlyPayment)} 元${o.installmentCount != null ? `，共 ${o.installmentCount} 期` : ""}`));
  }
  if (c.totalInterest != null) {
    parts.push(asSentence(`利息合计约 ${formatMoney(c.totalInterest)} 元${c.additionalFees ? `，另有各类费用约 ${formatMoney(c.additionalFees)} 元` : ""}`));
  }
  return parts.join("");
};

/** 供模板回答使用（不含 LLM，永远可用）：按问题意图给一个对题、简短的回答。 */
export const buildTemplateAnswer = (context: RetrievedContext, report: ChatReport, message = ""): string => {
  const intent = detectIntent(message);
  const mainRisk = context.risks[0];

  // 0a) 跑题问题：礼貌说明能力边界，不硬答风险
  if (intent === "offtopic") {
    return "我是这份合同报告的解读助手，只能回答和这份合同相关的问题。你可以问我成本、利率、还款安排或某个风险条款，也可以点下面的推荐问题。";
  }

  // 0b) 术语解释：先查内置通俗词典，答不上就引导
  if (intent === "glossary") {
    const hit = findGlossaryTerm(message);
    if (hit) {
      const [term, explain] = hit;
      const related = mainRisk ? asSentence(`这份合同里与之相关的是「${stripEndPunct(mainRisk.title ?? "")}」，可以在“风险识别”一栏查看细节`) : "";
      return asSentence(`「${term}」用大白话说：${explain}`) + related;
    }
    return "这个说法我暂时没有现成的解释。你可以换个问法，或者直接问某个条款、费用或风险是怎么回事。";
  }

  // 0c) 能不能签：按约定不替用户做决定，给整体结论和关键动作
  if (intent === "decision") {
    const summary = firstNonEmpty([report.actions?.summary]);
    const ask = mainRisk?.questionToAsk ? asSentence(`至少先当面确认：${stripEndPunct(mainRisk.questionToAsk)}`) : "";
    return (
      asSentence("签不签需要你自己决定，我可以给你判断依据") +
      (summary ? asSentence(`报告的整体结论是：${stripEndPunct(summary)}`) : "") +
      (ask || asSentence("建议把“建议行动”一栏的必须确认事项逐条问清楚再决定"))
    );
  }

  // 1) 问数字：直接答 B 的测算，再补一句相关风险提示
  if (intent === "cost") {
    const numeric = buildCostAnswer(report);
    if (numeric) {
      const hint = mainRisk
        ? `\n\n另外提醒：报告识别到「${stripEndPunct(mainRisk.title ?? "")}」，${asSentence(firstClauseOf(mainRisk.possibleConsequence)) || "建议签约前核实相关条款。"}`
        : "";
      return numeric + hint;
    }
  }

  // 报告里没有可关联的风险：给整体结论，引导更具体的问题
  if (!mainRisk) {
    const summary = firstNonEmpty([report.actions?.summary]);
    return summary
      ? `${asSentence(`根据这份合同的整体分析：${stripEndPunct(summary)}`)}你可以点下面的问题继续追问，或换个更具体的说法。`
      : "这份报告暂时没有识别到可展开的风险条款。你可以问我合同的成本、利率或还款安排。";
  }

  // 2) 问案例：给匹配案例的结论
  if (intent === "case") {
    const theCase = mainRisk.matchedCases?.[0];
    if (theCase?.conclusion) {
      return (
        asSentence(`和「${stripEndPunct(mainRisk.title ?? "")}」类似的真实情景（${theCase.caseId ?? "案例"}）里，${stripEndPunct(theCase.conclusion)}`) +
        asSentence("具体条款和案例详情可以在报告的“案例依据”一栏查看")
      );
    }
  }

  // 3) 问怎么办：直接给行动建议
  if (intent === "action") {
    const ask = mainRisk.questionToAsk ? asSentence(`建议你在签约前当面确认：${stripEndPunct(mainRisk.questionToAsk)}`) : "";
    const consequence = firstClauseOf(mainRisk.possibleConsequence);
    return (
      asSentence(`目前最需要处理的是「${stripEndPunct(mainRisk.title ?? "")}」${consequence ? `，否则${consequence}` : ""}`) +
      (ask || asSentence("建议保留合同和沟通记录，必要时向平台或监管渠道咨询"))
    );
  }

  // 4) 默认（问为什么/是什么）：原因 + 后果 + 一句条款依据 + 追问建议，最多两条风险
  const parts = context.risks.slice(0, 2).map((risk) => {
    const clauseId = risk.relatedClauseIds?.[0];
    const consequence = firstClauseOf(risk.possibleConsequence);
    return [
      asSentence(`关于「${stripEndPunct(risk.title ?? "该风险")}」：${humanizeReason(risk)}`),
      consequence ? asSentence(`对你的影响：${consequence}`) : "",
      clauseId ? asSentence(`合同原文（${clauseId}）写的是“${summarizeClause(risk.clauseText, 40)}”`) : "",
      risk.questionToAsk ? asSentence(`建议签约前先问清：${stripEndPunct(risk.questionToAsk)}`) : "",
    ].filter(Boolean).join("");
  });

  return parts.join("\n\n");
};
