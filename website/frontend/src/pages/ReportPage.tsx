import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Bank } from "@phosphor-icons/react/Bank";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Coins } from "@phosphor-icons/react/Coins";
import { CurrencyCny } from "@phosphor-icons/react/CurrencyCny";
import { FileText } from "@phosphor-icons/react/FileText";
import { HandCoins } from "@phosphor-icons/react/HandCoins";
import { Percent } from "@phosphor-icons/react/Percent";
import { Question } from "@phosphor-icons/react/Question";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { SealWarning } from "@phosphor-icons/react/SealWarning";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Wallet } from "@phosphor-icons/react/Wallet";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { PageShell } from "../components/PageShell";
import { ReportSummary } from "../components/ReportSummary";
import { RiskCard } from "../components/RiskCard";
import { api } from "../services/api";
import type { ActionItem, ActionStage, PipelineReport, PipelineRiskItem } from "../types/pipeline";
import type { ReportViewMode } from "../utils/reportViewModel";
import { cleanUserFacingText } from "../utils/userFacingText";

const money = (value: number | null) => value === null ? "信息不足" : `${value.toLocaleString("zh-CN")} 元`;
const percent = (value: number | null) => value === null ? "信息不足" : `${value.toFixed(1)}%`;

const costLevelLabel: Record<string, string> = {
  low: "成本较低",
  normal: "正常偏上",
  warning: "偏高预警",
  high: "成本偏高",
  insufficient_information: "信息不足",
};

const priorityLabel: Record<ActionItem["priority"], string> = {
  must: "必须确认",
  should: "建议确认",
  optional: "可选优化",
};

const riskLevelLabel: Record<PipelineRiskItem["riskLevel"], string> = {
  high: "高风险",
  medium: "需关注",
  low: "低风险",
};

const riskLevelWeight: Record<PipelineRiskItem["riskLevel"], number> = {
  high: 100,
  medium: 60,
  low: 20,
};

const priorityWeight: Record<ActionItem["priority"], number> = {
  must: 30,
  should: 15,
  optional: 0,
};

const priorityRank: Record<ActionItem["priority"], number> = {
  must: 0,
  should: 1,
  optional: 2,
};

const importantCategoryWeight: Record<string, number> = {
  cost_transparency: 28,
  interest_fee: 27,
  overdue: 26,
  authorization_privacy: 24,
  prepayment: 22,
  dispute_resolution: 21,
  repayment: 18,
  other: 4,
};

const actionStageOrder: ActionStage[] = [
  "before_signing",
  "during_repayment",
  "before_prepayment",
  "when_overdue",
  "when_dispute",
];

type RankedAction = ActionItem & {
  focusKey: string;
  primaryRisk: PipelineRiskItem | null;
  riskTitle: string | null;
  displayTitle: string;
  displayDetail: string;
  score: number;
  topScore: number;
};

type ActionDigest = {
  conclusion: string;
  nextAction: string;
  topActions: RankedAction[];
  stages: Array<{ stage: ActionStage; title: string; items: RankedAction[] }>;
  moreActions: RankedAction[];
  questionList: string[];
  evidenceChecklist: string[];
  communicationScripts: string[];
};

type ReportTab = "overview" | "cost" | "risks" | "references" | "actions";

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "合同概览" },
  { id: "cost", label: "成本分析" },
  { id: "risks", label: "风险识别" },
  { id: "references", label: "案例依据" },
  { id: "actions", label: "建议行动" },
];

const reportStatusLabel: Record<PipelineReport["status"], string> = {
  pending: "等待分析",
  processing: "分析进行中",
  completed: "分析已完成",
  partial: "报告已生成",
  failed: "分析未完成",
};

const reportStatusDescription = (status: PipelineReport["status"]) => {
  if (status === "failed") return "分析未完成，请稍后重试。";
  if (status === "pending" || status === "processing") return "系统正在整理合同分析结果，请稍后查看。";
  return "系统已完成成本、风险和建议分析，结果仅供参考，请结合合同原文核实。";
};

const referenceTagLabel = (tag: string) => tag === "演示案例" ? "典型情景" : tag;

const referenceSummaryFallback = (tag: string) =>
  tag === "产品参考"
    ? "可用于对照还款金额、到账金额和综合成本口径。"
    : "请结合合同原文和风险识别结果核对该项内容。";

type RiskGroupId = "cost" | "exit" | "overdue" | "repayment" | "privacy" | "dispute" | "other";

type DisplayRiskItem = PipelineRiskItem & {
  mergedCount: number;
  mergedRiskTitles: string[];
};

type RiskGroupView = {
  id: RiskGroupId;
  title: string;
  summary: string;
  counts: Record<PipelineRiskItem["riskLevel"], number>;
  items: DisplayRiskItem[];
  defaultOpen: boolean;
};

const riskGroupOrder: RiskGroupId[] = ["cost", "repayment", "overdue", "privacy", "exit", "dispute", "other"];

const riskGroupTitle: Record<RiskGroupId, string> = {
  cost: "费用与真实成本",
  exit: "提前还款 / 退出限制",
  overdue: "逾期与违约责任",
  repayment: "自动扣款与还款安排",
  privacy: "隐私与信息授权",
  dispute: "合同变更与争议解决",
  other: "其他风险",
};

const riskGroupSummary: Record<RiskGroupId, string> = {
  cost: "核心问题：费用、实际到账或真实年化可能影响总成本判断。",
  exit: "核心问题：提前结清、解除或退款条件需要在操作前确认。",
  overdue: "核心问题：逾期后的费用、违约责任或催收边界需要确认。",
  repayment: "核心问题：还款安排、自动扣款或付款义务可能影响资金安全和履约安排。",
  privacy: "核心问题：个人信息授权范围、使用目的或撤回路径需要确认。",
  dispute: "核心问题：合同变更、争议解决或管辖安排可能影响后续维权。",
  other: "核心问题：还有部分条款需要结合合同上下文进一步确认。",
};

const riskImpactWeight: Record<RiskGroupId, number> = {
  cost: 70,
  repayment: 60,
  overdue: 50,
  privacy: 40,
  exit: 30,
  dispute: 20,
  other: 10,
};

const normalizeText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[，。；、,.!！?？:：\s"'“”‘’（）()]/g, "");

const uniqueTextList = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeText(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const riskText = (risk: PipelineRiskItem) =>
  `${risk.title}${risk.categoryLabel}${risk.reason}${risk.possibleConsequence}${risk.questionToAsk}${risk.clauseText}`;

const riskGroupFor = (risk: PipelineRiskItem): RiskGroupId => {
  const text = riskText(risk);
  if (risk.category === "cost_transparency" || risk.category === "interest_fee" || /真实年化|综合年化|名义利率|服务费|手续费|费用|实际到账|前置|预扣|本金/.test(text)) return "cost";
  if (risk.category === "prepayment" || /提前还款|提前结清|提前终止|提前解除|退出|退款|退费|结清/.test(text)) return "exit";
  if (risk.category === "overdue" || /逾期|违约|罚息|违约金|催收|加速到期/.test(text)) return "overdue";
  if (risk.category === "repayment" || /还款|月供|扣款|划扣|银行卡|付款|代扣|账户/.test(text)) return "repayment";
  if (risk.category === "authorization_privacy" || /个人信息|隐私|授权|征信|共享|查询|使用范围|合作机构/.test(text)) return "privacy";
  if (risk.category === "dispute_resolution" || /单方变更|默示同意|合同变更|争议|仲裁|诉讼|管辖|送达|投诉|维权/.test(text)) return "dispute";
  return "other";
};

const riskTopicFor = (risk: PipelineRiskItem) => {
  const text = riskText(risk);
  if (/服务费|手续费|前置|预扣|实际到账|到账|本金/.test(text)) return "upfront_fee";
  if (/真实年化|综合年化|名义利率|利率|资金成本/.test(text)) return "real_rate";
  if (/提前还款|提前结清|提前终止|退款|退费|退出|结清/.test(text)) return "exit";
  if (/逾期|违约|罚息|违约金|催收/.test(text)) return "overdue";
  if (/自动扣款|扣款|划扣|银行卡|代扣/.test(text)) return "debit";
  if (/个人信息|隐私|授权|征信|共享|查询/.test(text)) return "privacy";
  if (/仲裁|管辖|送达|争议|诉讼|投诉|维权/.test(text)) return "dispute";
  if (/单方变更|默示同意|合同变更|调整/.test(text)) return "change";
  return "other";
};

const riskMergeKey = (risk: PipelineRiskItem) => {
  const group = riskGroupFor(risk);
  const topic = riskTopicFor(risk);
  const clauseKey = risk.relatedClauseIds[0] ?? "";
  if (topic !== "other" && clauseKey) return `${group}:${topic}:${clauseKey}`;
  if (clauseKey) return `${group}:clause:${clauseKey}`;
  const consequence = normalizeText(risk.possibleConsequence).slice(0, 24);
  const title = normalizeText(risk.title).slice(0, 24);
  return `${group}:${topic}:${consequence || title}`;
};

const mergedRiskTitle = (group: RiskGroupId, topic: string, primary: PipelineRiskItem, count: number) => {
  if (count === 1) return primary.title;
  if (group === "cost" && topic === "upfront_fee") return "前置费用影响实际到账和真实成本";
  if (group === "cost" && topic === "real_rate") return "真实成本与表面利率差异需确认";
  if (group === "exit") return "提前结清或退出规则需确认";
  if (group === "overdue") return "逾期费用和违约后果需确认";
  if (group === "repayment") return "还款和扣款安排需确认";
  if (group === "privacy") return "信息授权范围需确认";
  if (group === "dispute") return "合同变更或争议处理需确认";
  return `${primary.title}等相关风险`;
};

const mergeDisplayRisks = (risks: PipelineRiskItem[]) => {
  const byKey = new Map<string, PipelineRiskItem[]>();
  risks.forEach((risk) => {
    const key = riskMergeKey(risk);
    byKey.set(key, [...(byKey.get(key) ?? []), risk]);
  });

  return [...byKey.values()].map((items): DisplayRiskItem => {
    const sorted = sortRisks(items);
    const primary = sorted[0]!;
    const group = riskGroupFor(primary);
    const topic = riskTopicFor(primary);
    const titles = uniqueTextList(sorted.map((risk) => risk.title));
    const clauseTexts = uniqueTextList(sorted.map((risk) => risk.clauseText)).slice(0, 2);

    return {
      ...primary,
      title: mergedRiskTitle(group, topic, primary, sorted.length),
      clauseText: clauseTexts.join("\n\n"),
      reason: oneSentence(primary.reason, primary.possibleConsequence),
      possibleConsequence: oneSentence(primary.possibleConsequence, primary.reason),
      questionToAsk: oneSentence(primary.questionToAsk, "请机构书面确认该条款的适用条件、费用边界和处理方式。"),
      mergedCount: sorted.length,
      mergedRiskTitles: titles,
    };
  });
};

function sortRisks<T extends PipelineRiskItem>(risks: T[]) {
  return [...risks].sort((left, right) => {
    const levelDiff = riskLevelWeight[right.riskLevel] - riskLevelWeight[left.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    const impactDiff = riskImpactWeight[riskGroupFor(right)] - riskImpactWeight[riskGroupFor(left)];
    if (impactDiff !== 0) return impactDiff;
    const topicDiff = riskTopicFor(left).localeCompare(riskTopicFor(right), "zh-CN");
    if (topicDiff !== 0) return topicDiff;
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

const buildRiskGroups = (risks: PipelineRiskItem[]): RiskGroupView[] =>
  riskGroupOrder.flatMap((groupId) => {
    const groupRisks = risks.filter((risk) => riskGroupFor(risk) === groupId);
    if (!groupRisks.length) return [];
    const items = sortRisks(mergeDisplayRisks(groupRisks));
    const counts = {
      high: groupRisks.filter((risk) => risk.riskLevel === "high").length,
      medium: groupRisks.filter((risk) => risk.riskLevel === "medium").length,
      low: groupRisks.filter((risk) => risk.riskLevel === "low").length,
    };
    return [{
      id: groupId,
      title: riskGroupTitle[groupId],
      summary: riskGroupSummary[groupId],
      counts,
      items,
      defaultOpen: counts.high > 0,
    }];
  });

const strongerPriority = (left: ActionItem["priority"], right: ActionItem["priority"]) =>
  priorityRank[left] <= priorityRank[right] ? left : right;

const dedupeActions = (items: ActionItem[]) => {
  const byKey = new Map<string, ActionItem>();
  items.forEach((item) => {
    const key = normalizeText(item.title) || normalizeText(item.detail) || item.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, relatedRiskIds: [...new Set(item.relatedRiskIds)] });
      return;
    }

    byKey.set(key, {
      ...existing,
      priority: strongerPriority(existing.priority, item.priority),
      detail: existing.detail.length >= item.detail.length ? existing.detail : item.detail,
      relatedRiskIds: [...new Set([...existing.relatedRiskIds, ...item.relatedRiskIds])],
    });
  });
  return [...byKey.values()];
};

const cleanAdviceText = (text: string) =>
  cleanUserFacingText(text)
    .replace(/命中规则[:：]?[^。；\n]*/g, "")
    .replace(/知识库中?有?\s*\d+\s*起?同类纠纷案例可供参考/g, "")
    .replace(/知识库[^。；\n]*(案例|纠纷|规则|依据|参考)[^。；\n]*/g, "")
    .replace(/同类纠纷案例[^。；\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，。；、:：\s]+|[，；、:：\s]+$/g, "")
    .trim();

const oneSentence = (text: string, fallback: string) => {
  const cleaned = cleanAdviceText(text) || cleanAdviceText(fallback);
  const sentence = cleaned.split(/[。！？；\n]/).map((item) => item.trim()).find(Boolean) ?? "";
  if (!sentence) return "先向机构确认相关规则，并保留书面回复。";
  return /[。！？]$/.test(sentence) ? sentence : `${sentence}。`;
};

const genericAdvicePattern = /该条款可能增加用户的资金、履约或维权成本|可能增加用户的资金、履约或维权成本|资金、履约或维权成本/;

const specificActionDetail = (focusKey: string, primaryRisk: PipelineRiskItem | null) => {
  if (focusKey === "money") return "重点确认所有费用是否计入真实成本，以及实际到账与合同本金是否一致。";
  if (focusKey === "privacy") return "重点确认授权范围、使用目的、共享对象和撤回方式。";
  if (focusKey === "default") return "重点确认逾期费用是否叠加、是否封顶，以及违约后果触发条件。";
  if (focusKey === "exit") return "重点确认提前结清、退款或解除时的费用和条件。";
  if (focusKey === "dispute") return "重点确认投诉、仲裁、诉讼、送达或管辖安排。";
  if (primaryRisk?.category === "repayment") return "重点确认扣款时间、金额、失败处理和异常扣款退款方式。";
  return "";
};

const actionDisplayDetail = (item: ActionItem, primaryRisk: PipelineRiskItem | null, focusKey: string) => {
  const fallbackDetail = primaryRisk?.questionToAsk || primaryRisk?.possibleConsequence || primaryRisk?.reason || "";
  const detail = oneSentence(item.detail, fallbackDetail);
  if (!detail || genericAdvicePattern.test(detail)) return specificActionDetail(focusKey, primaryRisk);
  return detail;
};

const riskFocusKey = (risk: PipelineRiskItem | null, fallbackText = "") => {
  const text = `${risk?.title ?? ""}${risk?.reason ?? ""}${risk?.possibleConsequence ?? ""}${fallbackText}`;
  if (risk?.category === "cost_transparency" || risk?.category === "interest_fee" || risk?.category === "repayment") return "money";
  if (risk?.category === "overdue" || /违约|逾期|罚息|催收/.test(text)) return "default";
  if (risk?.category === "authorization_privacy" || /授权|扣款|个人信息|隐私|银行卡/.test(text)) return "privacy";
  if (risk?.category === "prepayment" || /解除|终止|提前|结清|退出/.test(text)) return "exit";
  if (risk?.category === "dispute_resolution" || /争议|投诉|仲裁|诉讼|管辖/.test(text)) return "dispute";
  return risk?.category ?? "other";
};

const resolveActionStage = (item: ActionItem, primaryRisk: PipelineRiskItem | null): ActionStage => {
  const text = `${item.title}${item.detail}${primaryRisk?.title ?? ""}${primaryRisk?.reason ?? ""}${primaryRisk?.possibleConsequence ?? ""}`;
  if (/(签约前|签署前|申请前|下单前).*(要求|说明|回复|确认|核实|问清|澄清)/.test(text)) return "before_signing";
  if (/单方变更|默示同意|不同意变更|立即结清|合同变更|变更通知|调整条款/.test(text)) return "before_signing";
  if (primaryRisk?.category === "dispute_resolution" || /仲裁|送达|管辖|投诉|维权路径|争议处理|诉讼|调解|异议|证据保存|保存证据/.test(text)) return "when_dispute";
  if (primaryRisk?.category === "prepayment" || /提前还款|提前结清|提前终止|提前解除|退款|退费|退出|结清试算|最终结清|解除条件|终止条件/.test(text)) return "before_prepayment";
  if (primaryRisk?.category === "overdue" || /逾期|违约|催收|罚息|违约金/.test(text)) return "when_overdue";
  if (primaryRisk?.category === "authorization_privacy" && /授权范围|自动扣款授权|个人信息|隐私|解绑银行卡|更换银行卡/.test(text)) return "before_signing";
  return item.stage;
};

const stageFromRisk = (risk: PipelineRiskItem): ActionStage => {
  if (risk.category === "prepayment") return "before_prepayment";
  if (risk.category === "overdue") return "when_overdue";
  if (risk.category === "dispute_resolution") return "when_dispute";
  if (risk.category === "authorization_privacy") return "before_signing";
  return "before_signing";
};

const stageTitleFor = (stage: ActionStage, productType: string | null) => {
  const product = productType ?? "";
  if (/信用卡|分期/.test(product)) {
    const titles: Record<ActionStage, string> = {
      before_signing: "申请/下单前",
      during_repayment: "分期履行期间",
      before_prepayment: "退订/提前结清前",
      when_overdue: "出现违约或逾期时",
      when_dispute: "发生争议时",
    };
    return titles[stage];
  }
  if (/租赁|服务/.test(product)) {
    const titles: Record<ActionStage, string> = {
      before_signing: "签署前",
      during_repayment: "履约期间",
      before_prepayment: "解除/终止前",
      when_overdue: "出现违约时",
      when_dispute: "发生争议时",
    };
    return titles[stage];
  }
  const titles: Record<ActionStage, string> = {
    before_signing: "签约前",
    during_repayment: "履约/还款期间",
    before_prepayment: "提前还款/终止前",
    when_overdue: "出现违约或逾期时",
    when_dispute: "发生争议时",
  };
  return titles[stage];
};

const makeRiskBackedAction = (risk: PipelineRiskItem): ActionItem => ({
  id: `risk_action_${risk.id}`,
  priority: risk.riskLevel === "high" ? "must" : risk.riskLevel === "medium" ? "should" : "optional",
  title: `确认${risk.categoryLabel}问题`,
  detail: risk.questionToAsk || risk.possibleConsequence || risk.reason,
  stage: stageFromRisk(risk),
  relatedRiskIds: [risk.id],
});

const rankActions = (report: PipelineReport) => {
  const riskById = new Map(report.risks.map((risk) => [risk.id, risk]));
  const productType = report.overview.productType ?? "";
  const isLoanLike = /贷|借款|贷款/.test(productType) || !/信用卡|分期|租赁|服务/.test(productType);
  const fromActionPlan = report.actions.actionPlan.flatMap((section) => section.items);
  const baseActions = dedupeActions([
    ...fromActionPlan,
    ...report.actions.mustConfirm,
    ...report.actions.shouldConfirm,
    ...report.actions.optionalOptimizations,
  ]);
  const coveredRiskIds = new Set(baseActions.flatMap((item) => item.relatedRiskIds));
  const fallbackActions = report.risks
    .filter((risk) => !coveredRiskIds.has(risk.id))
    .map(makeRiskBackedAction);
  const costIsElevated = report.costAnalysis.costLevel === "warning" || report.costAnalysis.costLevel === "high";

  return dedupeActions([...baseActions, ...fallbackActions])
    .map((item): RankedAction => {
      const primaryRisk = item.relatedRiskIds
        .map((id) => riskById.get(id) ?? null)
        .filter((risk): risk is PipelineRiskItem => Boolean(risk))
        .sort((left, right) => riskLevelWeight[right.riskLevel] - riskLevelWeight[left.riskLevel])[0] ?? null;
      const stage = resolveActionStage(item, primaryRisk);
      const focusKey = riskFocusKey(primaryRisk, `${item.title}${item.detail}`);
      const text = `${item.title}${item.detail}${primaryRisk?.possibleConsequence ?? ""}`;
      const keywordBoost = /成本|费用|利息|年化|违约|逾期|罚息|授权|扣款|个人信息|隐私|解除|终止|争议|仲裁|诉讼/.test(text) ? 8 : 0;
      const score =
        (primaryRisk ? riskLevelWeight[primaryRisk.riskLevel] : 0) +
        priorityWeight[item.priority] +
        (primaryRisk ? importantCategoryWeight[primaryRisk.category] ?? 0 : 0) +
        (costIsElevated && focusKey === "money" ? 10 : 0) +
        keywordBoost;
      const topScore =
        score +
        (stage === "before_signing" ? 60 : 0) +
        (isLoanLike && focusKey === "money" ? 60 : 0) +
        (focusKey === "privacy" ? 48 : 0) +
        (focusKey === "exit" ? 15 : 0) +
        (stage === "when_overdue" ? -70 : 0) +
        (stage === "when_dispute" ? -55 : 0);
      const cleanRiskTitle = cleanUserFacingText(primaryRisk?.title ?? "", "");

      return {
        ...item,
        stage,
        focusKey,
        primaryRisk,
        riskTitle: cleanRiskTitle || null,
        displayTitle: cleanAdviceText(item.title) || cleanRiskTitle || "确认合同关键问题",
        displayDetail: actionDisplayDetail(item, primaryRisk, focusKey),
        score,
        topScore,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (priorityRank[left.priority] !== priorityRank[right.priority]) return priorityRank[left.priority] - priorityRank[right.priority];
      return left.title.localeCompare(right.title, "zh-CN");
    });
};

const buildTopActions = (actions: RankedAction[]) => {
  const usedFocusKeys = new Set<string>();
  const topActions: RankedAction[] = [];
  const addFromPool = (pool: RankedAction[]) => {
    pool
      .sort((left, right) => right.topScore - left.topScore)
      .forEach((item) => {
        if (!item.primaryRisk || usedFocusKeys.has(item.focusKey) || topActions.length >= 3) return;
        usedFocusKeys.add(item.focusKey);
        topActions.push(item);
      });
  };
  addFromPool(actions.filter((item) => item.stage !== "when_overdue" && item.stage !== "when_dispute"));
  addFromPool(actions);
  return topActions;
};

const buildNaturalConclusion = (report: PipelineReport) => {
  const riskCategories = new Set(report.risks.map((risk) => risk.category));
  const highRiskCount = report.risks.filter((risk) => risk.riskLevel === "high").length;
  const costNeedsAttention = report.costAnalysis.costLevel === "high" || report.costAnalysis.costLevel === "warning";
  const parts: string[] = [];

  if (costNeedsAttention) {
    parts.push(report.overview.realAnnualRate !== null
      ? `真实年化约 ${percent(report.overview.realAnnualRate)}，实际成本需要重点确认`
      : "实际成本需要重点确认");
  }
  if ((report.costAnalysis.principalGap ?? 0) > 0) parts.push(`实际到账比合同本金少 ${money(report.costAnalysis.principalGap)}`);
  if (riskCategories.has("cost_transparency") || riskCategories.has("interest_fee")) parts.push("部分费用说明还不够清楚");
  if (riskCategories.has("prepayment")) parts.push("提前结清或退出规则需要先问清");
  if (riskCategories.has("authorization_privacy")) parts.push("扣款授权和个人信息使用范围需要核实");
  if (riskCategories.has("overdue")) parts.push("逾期后的费用和后果需要留意");
  if (riskCategories.has("dispute_resolution")) parts.push("争议处理路径需要提前确认");

  if (!parts.length) return "这份合同暂未识别出明显高风险，但签约前仍建议把费用、还款和争议处理方式问清楚。";

  const opening = highRiskCount > 0 ? "这份合同签约前需要重点确认。" : "这份合同可以继续评估，但建议先做几项核实。";
  return `${opening}主要问题是${parts.slice(0, 3).join("、")}。`;
};

const buildActionDigest = (report: PipelineReport): ActionDigest => {
  const rankedActions = rankActions(report);
  const topActions = buildTopActions(rankedActions);
  const usedActionIds = new Set(topActions.map((item) => item.id));
  const visibleLimit = 12;
  let visibleCount = topActions.length;
  const moreActions: RankedAction[] = [];

  const stages = actionStageOrder.map((stage) => {
    const items: RankedAction[] = [];
    rankedActions
      .filter((item) => item.stage === stage && !usedActionIds.has(item.id))
      .forEach((item) => {
        if (item.priority === "optional" || items.length >= 3 || visibleCount >= visibleLimit) {
          moreActions.push(item);
          return;
        }
        items.push(item);
        usedActionIds.add(item.id);
        visibleCount += 1;
      });
    return { stage, title: stageTitleFor(stage, report.overview.productType), items };
  }).filter((section) => section.items.length > 0);

  rankedActions.forEach((item) => {
    if (usedActionIds.has(item.id) || moreActions.some((action) => action.id === item.id)) return;
    moreActions.push(item);
  });

  const conclusion = buildNaturalConclusion(report);
  const nextAction = topActions[0]
    ? `优先完成“${topActions[0].displayTitle}”，并保留机构书面回复。`
    : "先补齐合同金额、利率、费用和还款安排，再判断是否签约或继续履行。";

  return {
    conclusion,
    nextAction,
    topActions,
    stages,
    moreActions: dedupeActions(moreActions) as RankedAction[],
    questionList: uniqueTextList(report.actions.questionList.map((item) => cleanUserFacingText(item)).filter(Boolean)),
    evidenceChecklist: uniqueTextList(report.actions.evidenceChecklist.map((item) => cleanUserFacingText(item)).filter(Boolean)),
    communicationScripts: uniqueTextList(report.actions.communicationScripts.map((item) => cleanUserFacingText(item)).filter(Boolean)),
  };
};

export function ReportPage() {
  const { taskId = "mock_bcd_demo" } = useParams();
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [activeTabState, setActiveTabState] = useState<{ taskId: string; tab: ReportTab }>({ taskId, tab: "overview" });
  const [viewMode, setViewMode] = useState<ReportViewMode>("summary");
  const activeTab = activeTabState.taskId === taskId ? activeTabState.tab : "overview";
  const setActiveTab = (tab: ReportTab) => setActiveTabState({ taskId, tab });

  useEffect(() => {
    let disposed = false;
    api.getAnalysisResult(taskId)
      .then((data) => {
        if (!disposed) {
          setReport(data);
          setError("");
        }
      })
      .catch(() => {
        if (!disposed) setError("分析未完成，请稍后重试。");
      });
    return () => { disposed = true; };
  }, [retryKey, taskId]);

  const costRows = useMemo(() => {
    if (!report) return [];
    return [
      { label: "合同本金", value: report.overview.loanAmount, className: "principal" },
      { label: "总利息", value: report.costAnalysis.totalInterest, className: "interest" },
      { label: "额外费用", value: report.costAnalysis.additionalFees, className: "fees" },
    ];
  }, [report]);

  if (!report && !error) {
    return (
      <PageShell compactHeader>
        <main className="state-page"><span className="loading-ring" /><h1>正在整理合同体检报告…</h1></main>
      </PageShell>
    );
  }

  if (error || !report) {
    return (
      <PageShell compactHeader>
        <main className="state-page">
          <SealWarning size={44} weight="duotone" />
          <h1>分析未完成</h1>
          <p>{error || "请稍后重试。"}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setError("");
              setRetryKey((value) => value + 1);
            }}
          >
            重新加载
          </button>
          <Link className="back-link" to="/">返回上传页</Link>
        </main>
      </PageShell>
    );
  }

  const maxCost = Math.max(...costRows.map((row) => row.value ?? 0), 1);
  const overviewDetails = [
    ["金融机构", report.overview.institution, Bank],
    ["产品类型", report.overview.productType, ClipboardText],
    ["借款金额", money(report.overview.loanAmount), CurrencyCny],
    ["实际到账金额", money(report.overview.actualReceivedAmount), Wallet],
    ["期限", report.overview.termMonths ? `${report.overview.termMonths} 个月` : null, CalendarBlank],
    ["分期期数", report.overview.installmentCount ? `${report.overview.installmentCount} 期` : null, Receipt],
    ["月供", money(report.overview.monthlyPayment), HandCoins],
    ["名义利率", percent(report.overview.nominalAnnualRate), Percent],
  ] as const;

  const actionDigest = buildActionDigest(report);
  const riskGroups = buildRiskGroups(report.risks);
  const visibleCalculationBasis = uniqueTextList(
    report.costAnalysis.calculationBasis.map((basis) => cleanUserFacingText(basis)).filter(Boolean),
  );

  return (
    <PageShell compactHeader>
      <main className="report-page">
        <div className="report-toolbar">
          <Link className="back-link" to="/"><ArrowLeft size={18} />重新分析一份合同</Link>
          <span>{reportStatusLabel[report.status]}</span>
        </div>

        <section className="report-intro" aria-labelledby="report-title">
          <div>
            <p className="eyebrow">{reportStatusLabel[report.status]}</p>
            <h1 id="report-title">合同体检结果</h1>
            <p>{reportStatusDescription(report.status)}</p>
          </div>
          <div className="intro-summary" aria-label="真实年化">
            <span>真实年化</span>
            <strong>{percent(report.overview.realAnnualRate)}</strong>
            <small>{costLevelLabel[report.costAnalysis.costLevel]}</small>
          </div>
        </section>

        <div className="report-view-switch" aria-label="报告展示模式">
          <button
            className={viewMode === "summary" ? "is-active" : ""}
            type="button"
            aria-pressed={viewMode === "summary"}
            onClick={() => setViewMode("summary")}
          >
            摘要版
          </button>
          <button
            className={viewMode === "full" ? "is-active" : ""}
            type="button"
            aria-pressed={viewMode === "full"}
            onClick={() => setViewMode("full")}
          >
            完整版
          </button>
        </div>

        {viewMode === "summary" ? (
          <ReportSummary report={report} onShowFull={() => setViewMode("full")} />
        ) : (
        <>
        <nav className="report-tabs" role="tablist" aria-label="报告内容导航">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              id={`report-tab-${tab.id}`}
              className={`report-tab ${activeTab === tab.id ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`report-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
        <section id="report-panel-overview" role="tabpanel" className="report-section metrics-section" aria-labelledby="overview-title">
          <div className="report-section__heading">
            <span className="section-number">A</span>
            <div><h2 id="overview-title">合同概览</h2><p>先核对合同主体、金额、期限、月供和利率口径。</p></div>
          </div>
          <div className="metric-grid">
            <MetricCard label="借款金额" value={money(report.overview.loanAmount)} icon={CurrencyCny} />
            <MetricCard label="实际到账" value={money(report.overview.actualReceivedAmount)} icon={Wallet} />
            <MetricCard label="月供" value={money(report.overview.monthlyPayment)} icon={Receipt} />
            <MetricCard label="真实年化" value={percent(report.overview.realAnnualRate)} icon={Percent} emphasis />
          </div>
          <dl className="detail-grid detail-grid--compact">
            {overviewDetails.map(([label, value, IconComponent]) => (
              <div key={label}>
                <dt><IconComponent size={18} weight="duotone" />{label}</dt>
                <dd>{value ?? "信息不足"}</dd>
              </div>
            ))}
          </dl>
        </section>
        )}

        {activeTab === "cost" && (
        <section id="report-panel-cost" role="tabpanel" className="report-section cost-section" aria-labelledby="cost-title">
          <div className="report-section__heading">
            <span className="section-number">B</span>
            <div><h2 id="cost-title">成本分析</h2><p>把本金、利息、服务费和真实年化放在同一口径核对。</p></div>
          </div>
          <div className="metric-grid metric-grid--three">
            <MetricCard label="总还款额" value={money(report.costAnalysis.totalRepayment)} icon={Receipt} />
            <MetricCard label="总利息" value={money(report.costAnalysis.totalInterest)} icon={Coins} />
            <MetricCard label="额外费用" value={money(report.costAnalysis.additionalFees)} icon={Calculator} emphasis />
          </div>
          <div className="cost-insight-grid">
            <div><span>实际到账与合同本金差额</span><strong>{money(report.costAnalysis.principalGap)}</strong></div>
            <div><span>名义利率与真实年化差异</span><strong>{percent(report.costAnalysis.rateGap)}</strong></div>
            <div><span>成本风险等级</span><strong>{costLevelLabel[report.costAnalysis.costLevel]}</strong></div>
            <div><span>基础资金成本</span><strong>{percent(report.costAnalysis.baseRealAnnualRate ?? null)}</strong></div>
            <div><span>综合资金成本</span><strong>{percent(report.costAnalysis.comprehensiveRealAnnualRate ?? report.overview.realAnnualRate)}</strong></div>
          </div>
          <div className="cost-chart" role="img" aria-label="合同本金、利息和额外费用对比">
            {costRows.map((row) => (
              <div className="cost-row" key={row.label}>
                <div className="cost-row__label"><span>{row.label}</span><strong>{money(row.value)}</strong></div>
                <div className="cost-bar"><span className={`cost-bar__fill cost-bar__fill--${row.className}`} style={{ width: `${Math.max(6, ((row.value ?? 0) / maxCost) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {visibleCalculationBasis.length > 0 && (
            <div className="basis-list">
              {visibleCalculationBasis.map((basis) => <p key={basis}>{basis}</p>)}
            </div>
          )}
        </section>
        )}

        {activeTab === "risks" && (
        <section id="report-panel-risks" role="tabpanel" className="report-section risks-section" aria-labelledby="risk-title">
          <div className="report-section__heading">
            <span className="section-number">C</span>
            <div><h2 id="risk-title">风险识别</h2><p>按风险类型先看概况，再展开查看合同原文、风险说明和参考依据。</p></div>
          </div>
          {riskGroups.length > 0 ? (
            <div className="risk-map">
              {riskGroups.map((group, groupIndex) => {
                const visibleItems = group.items.slice(0, 3);
                const extraItems = group.items.slice(3);
                return (
                  <details
                    key={group.id}
                    className={`risk-group ${groupIndex % 2 === 0 ? "risk-group--tinted" : "risk-group--plain"}`}
                    open={group.defaultOpen}
                  >
                    <summary className="risk-group__summary">
                      <div>
                        <strong className="risk-group__title">
                          <span className="risk-group__index">{groupIndex + 1}.</span>{group.title}
                        </strong>
                        <p>{group.summary}</p>
                      </div>
                      <span>
                        高风险 {group.counts.high} 项｜需关注 {group.counts.medium} 项｜低风险 {group.counts.low} 项
                      </span>
                    </summary>
                    <div className="risk-list">
                      {visibleItems.map((item) => (
                        <RiskCard key={item.id} item={item} />
                      ))}
                    </div>
                    {extraItems.length > 0 && (
                      <details className="risk-group__more">
                        <summary>展开更多风险</summary>
                        <div className="risk-list">
                          {extraItems.map((item) => <RiskCard key={item.id} item={item} />)}
                        </div>
                      </details>
                    )}
                  </details>
                );
              })}
            </div>
          ) : (
            <p className="risk-empty">当前报告暂未识别出明确风险。</p>
          )}
        </section>
        )}

        {activeTab === "references" && (
        <section id="report-panel-references" role="tabpanel" className="report-section references-section" aria-labelledby="references-title">
          <div className="report-section__heading">
            <span className="section-number">D</span>
            <div><h2 id="references-title">案例和依据</h2><p>以下内容用于帮助理解风险来源和判断依据，结果仅供参考。</p></div>
          </div>
          <div className="reference-list">
            {report.references.map((group) => (
              <details key={group.id} className="reference-group" open>
                <summary>{group.title}<span>{group.items.length} 项</span></summary>
                <div className="reference-items">
                  {group.items.map((item) => (
                    <article key={item.id} className="reference-item">
                      <span>{referenceTagLabel(item.tag)}</span>
                      <strong>{cleanUserFacingText(item.title.replace(/演示/g, "参考"), "参考内容")}</strong>
                      <p>{cleanUserFacingText(item.summary, referenceSummaryFallback(item.tag))}</p>
                      {item.sourceUrl ? (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {cleanUserFacingText(item.sourceLabel, "查看来源")}
                        </a>
                      ) : (
                        <details className="reference-source-details">
                          <summary>查看来源</summary>
                          <p>当前依据来自系统内置参考库，暂未提供可打开的外部链接。请以报告摘要和合同原文核对。</p>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
        )}

        {activeTab === "actions" && (
        <section id="report-panel-actions" role="tabpanel" className="report-section actions-section" aria-labelledby="actions-title">
          <div className="report-section__heading">
            <span className="section-number">E</span>
            <div><h2 id="actions-title">建议与行动</h2><p>先看主要问题和前三件要务，再按阶段执行。</p></div>
          </div>

          <article className="action-summary-card">
            <ShieldCheck size={24} weight="duotone" />
            <div>
              <span>一句话结论</span>
              <p>{actionDigest.conclusion}</p>
              <strong className="summary-next-step">{actionDigest.nextAction}</strong>
            </div>
          </article>

          <div className="important-actions">
            <h3>最重要的 3 件事</h3>
            {actionDigest.topActions.length ? (
              <ol className="important-action-list">
                {actionDigest.topActions.map((item) => (
                  <li key={item.id}>
                    <span className={`risk-badge risk-badge--${item.primaryRisk?.riskLevel ?? "medium"}`}>
                      {item.primaryRisk ? riskLevelLabel[item.primaryRisk.riskLevel] : priorityLabel[item.priority]}
                    </span>
                    <div>
                      <strong>{item.displayTitle}</strong>
                      {item.displayDetail && <p>{item.displayDetail}</p>}
                      {item.riskTitle && <small>关联风险：{item.riskTitle}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="stage-empty">暂未从当前风险识别结果中提取出需要优先处理的事项。</p>
            )}
          </div>

          {actionDigest.stages.length > 0 && (
            <div className="stage-action-list">
              {actionDigest.stages.map((section, index) => (
                <article className="stage-action-card" key={section.stage}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{section.title}</h3>
                      <small>{section.items.length} 项</small>
                    </div>
                  </header>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <strong>{item.displayTitle}</strong>
                        {item.displayDetail && <p>{item.displayDetail}</p>}
                        {item.riskTitle && <small>关联风险：{item.riskTitle}</small>}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          <details className="more-actions-panel">
            <summary>
              <span>展开补充建议</span>
              <small>低优先级和已合并的补充内容</small>
            </summary>
            <div className="more-actions-content">
              {actionDigest.moreActions.length > 0 && (
                <ul className="more-actions-list">
                  {actionDigest.moreActions.map((item) => (
                    <li key={item.id}>
                      <strong>{item.displayTitle}</strong>
                      {item.displayDetail && <p>{item.displayDetail}</p>}
                      {item.riskTitle && <small>关联风险：{item.riskTitle}</small>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="supporting-advice-stack">
                {actionDigest.evidenceChecklist.length > 0 && (
                  <article>
                    <h3><FileText size={20} weight="duotone" />证据保存</h3>
                    <ul className="compact-check-list">
                      {actionDigest.evidenceChecklist.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </article>
                )}
                {actionDigest.questionList.length > 0 && (
                  <details className="supporting-advice-details">
                    <summary><Question size={20} weight="duotone" />可追问问题</summary>
                    <ul className="compact-check-list">
                      {actionDigest.questionList.map((question) => <li key={question}>{question}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </details>
        </section>
        )}

        </>
        )}
      </main>
    </PageShell>
  );
}
