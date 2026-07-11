import type { OverallLevel, RiskLevel } from "../../../../shared/analysis";
import type { MatchedCase } from "../../../../shared/analysisProtocol";
import type { ActionItem, PipelineReport, PipelineRiskItem, ReferenceItem } from "../types/pipeline";
import { cleanUserFacingText } from "./userFacingText";

export type ReportViewMode = "summary" | "full";

export type CaseReferenceView = {
  id: string;
  title: string;
  relation: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  documentNumber: string | null;
  summary: string | null;
  similarity: number | null;
  hasVerifiableSource: boolean;
  isLocalSample: boolean;
};

export type CostHighlight = {
  label: string;
  value: string;
  helper: string | null;
  emphasis?: boolean;
};

export type SummaryAction = {
  id: string;
  label: string;
  detail: string | null;
  priority: ActionItem["priority"];
};

const riskWeight: Record<RiskLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const priorityWeight: Record<ActionItem["priority"], number> = {
  must: 3,
  should: 2,
  optional: 1,
};

export const riskLevelLabel: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "需关注",
  low: "低风险",
};

export const overallLevelLabel: Record<OverallLevel, string> = {
  high: "暂不建议直接签约",
  verify: "建议核实后再推进",
  low: "可以继续推进",
  insufficient_information: "先补充关键信息",
};

export const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined ? "信息不足" : `${value.toLocaleString("zh-CN")} 元`;

export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? "信息不足" : `${value.toFixed(1)}%`;

export const shortenText = (text: string | null | undefined, maxLength = 96) => {
  const cleaned = cleanUserFacingText(text, "");
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
};

export const selectTopRisks = (risks: PipelineRiskItem[] | null | undefined, limit = 3) =>
  [...(risks ?? [])]
    .map((risk, index) => ({ risk, index }))
    .sort((left, right) => riskWeight[right.risk.riskLevel] - riskWeight[left.risk.riskLevel] || left.index - right.index)
    .slice(0, limit)
    .map(({ risk }) => risk);

export const getOverallTone = (level: OverallLevel) => {
  if (level === "high") return "risk";
  if (level === "verify" || level === "insufficient_information") return "warn";
  return "ok";
};

export const getCostHighlights = (report: PipelineReport): CostHighlight[] => [
  {
    label: "真实年化",
    value: formatPercent(report.overview.realAnnualRate),
    helper: report.costAnalysis.costLevel === "insufficient_information" ? "关键信息仍需补充" : null,
    emphasis: true,
  },
  {
    label: "实际到账",
    value: formatMoney(report.overview.actualReceivedAmount),
    helper: report.overview.loanAmount !== null ? `合同本金 ${formatMoney(report.overview.loanAmount)}` : null,
  },
  {
    label: "总还款",
    value: formatMoney(report.costAnalysis.totalRepayment),
    helper: report.costAnalysis.totalInterest !== null ? `含利息 ${formatMoney(report.costAnalysis.totalInterest)}` : null,
  },
  {
    label: "额外费用",
    value: formatMoney(report.costAnalysis.additionalFees),
    helper: report.costAnalysis.principalGap !== null ? `到账差额 ${formatMoney(report.costAnalysis.principalGap)}` : null,
    emphasis: (report.costAnalysis.additionalFees ?? 0) > 0,
  },
].filter((item) => item.value !== "信息不足" || item.helper !== null);

const normalizeActionKey = (item: ActionItem) =>
  cleanUserFacingText(`${item.title}${item.detail}`, item.id).replace(/\s+/g, "");

export const selectNextActions = (report: PipelineReport, limit = 3): SummaryAction[] => {
  const directActions = [
    ...(report.actions.mustConfirm ?? []),
    ...(report.actions.shouldConfirm ?? []),
    ...(report.actions.optionalOptimizations ?? []),
    ...(report.actions.actionPlan ?? []).flatMap((section) => section.items ?? []),
  ];
  const seen = new Set<string>();

  return directActions
    .filter((item) => {
      const key = normalizeActionKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => ({ item, index }))
    .sort((left, right) => priorityWeight[right.item.priority] - priorityWeight[left.item.priority] || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => ({
      id: item.id,
      label: cleanUserFacingText(item.title, item.detail),
      detail: cleanUserFacingText(item.detail, ""),
      priority: item.priority,
    }));
};

export const getRiskKeyMetric = (risk: PipelineRiskItem, report: PipelineReport) => {
  const text = `${risk.title}${risk.categoryLabel}${risk.reason}${risk.clauseText}`;
  if (/真实年化|综合年化|利率/.test(text) && report.overview.realAnnualRate !== null) {
    return `真实年化 ${formatPercent(report.overview.realAnnualRate)}`;
  }
  if (/费用|手续费|服务费|实际到账|前置|预扣/.test(text) && report.costAnalysis.additionalFees !== null) {
    return `额外费用 ${formatMoney(report.costAnalysis.additionalFees)}`;
  }
  return risk.clauseLocation ?? risk.categoryLabel;
};

export const getVerifiableSourceUrl = (value: string | null | undefined) => {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    const isPlaceholder = url.hostname === "example.com" || url.hostname.endsWith(".example.com");
    return !isPlaceholder && ["http:", "https:"].includes(url.protocol) ? value.trim() : null;
  } catch {
    return null;
  }
};

const fromMatchedCase = (item: MatchedCase): CaseReferenceView => {
  const sourceUrl = getVerifiableSourceUrl(item.sourceUrl);
  const isLocalSample = Boolean(item.sourceUrl) && !sourceUrl;
  return {
    id: item.caseId,
    title: cleanUserFacingText(item.title, item.caseId),
    relation: cleanUserFacingText(item.conclusion, "") || null,
    sourceName: isLocalSample ? "本地案例样本" : null,
    publishedAt: null,
    sourceUrl,
    documentNumber: null,
    summary: cleanUserFacingText(item.conclusion, "") || null,
    similarity: item.similarity,
    hasVerifiableSource: Boolean(sourceUrl),
    isLocalSample,
  };
};

export const fromReferenceItem = (item: ReferenceItem): CaseReferenceView => {
  const sourceUrl = getVerifiableSourceUrl(item.sourceUrl);
  const isLocalSample = Boolean(item.sourceUrl) && !sourceUrl;
  return {
    id: item.id,
    title: cleanUserFacingText(item.title, item.id),
    relation: item.tag,
    sourceName: cleanUserFacingText(item.sourceLabel, "") || (isLocalSample ? "本地案例样本" : null),
    publishedAt: null,
    sourceUrl,
    documentNumber: null,
    summary: cleanUserFacingText(item.summary, "") || null,
    similarity: null,
    hasVerifiableSource: Boolean(sourceUrl),
    isLocalSample,
  };
};

export const getCaseReferencesForRisk = (risk: PipelineRiskItem) =>
  (risk.matchedCases ?? []).map(fromMatchedCase).filter((item) => item.title);
