import type { ContractType } from "../../../../shared/analysis.js";
import {
  detectScenarioByKnowledgeRules,
  extractFieldsByContractTemplate,
  loadContractTemplatesFromSeedFiles,
  loadScenarioRulesFromSeedFiles,
} from "./scenarioKnowledgeBase.js";

export type ScenarioSignal = {
  scenarioId: ContractType;
  productType: string;
  contractType: ContractType;
  confidence: number;
  matchedKeywords: string[];
  reason: string;
  matchedRuleId?: string | null;
  templateId?: string | null;
  extractedFields?: Record<string, { value: string | null; matchedAlias: string | null }>;
};

type ScenarioRule = {
  scenarioId: ContractType;
  productType: string;
  keywords: string[];
  boost?: number;
};

const BUILTIN_SCENARIO_RULES: ScenarioRule[] = [
  {
    scenarioId: "education_training_loan",
    productType: "教育培训贷",
    keywords: [
      "培训贷",
      "教育分期",
      "学费分期",
      "课程分期",
      "培训分期",
      "教育培训",
      "培训机构",
      "课程服务",
      "退课",
      "退费",
      "就业承诺",
      "包就业",
      "职业培训",
      "技能培训",
    ],
    boost: 0.14,
  },
  {
    scenarioId: "credit_card_installment",
    productType: "信用卡分期",
    keywords: [
      "信用卡分期",
      "信用卡",
      "账单分期",
      "现金分期",
      "消费分期",
      "商户分期",
      "分期手续费",
      "每期手续费",
      "最低还款额",
      "循环利息",
      "账单日",
      "还款日",
      "免息分期",
    ],
    boost: 0.12,
  },
  {
    scenarioId: "cash_installment",
    productType: "信用卡现金分期",
    keywords: ["现金分期"],
  },
  {
    scenarioId: "bill_installment",
    productType: "信用卡账单分期",
    keywords: ["账单分期"],
  },
  {
    scenarioId: "merchant_installment",
    productType: "商户/商品分期",
    keywords: ["商品分期", "商户分期", "医美分期", "服务分期", "消费分期服务"],
  },
  {
    scenarioId: "consumer_loan",
    productType: "个人消费贷款",
    keywords: ["消费贷款", "消费贷", "个人消费借款", "借款合同", "贷款合同"],
  },
];

const normalizeText = (text: string) =>
  (text || "")
    .replace(/\s+/g, "")
    .replace(/[，。；：、,.・]/g, "")
    .toLowerCase();

const unique = <T>(items: T[]) => Array.from(new Set(items));

export const detectScenarioFromText = (inputText: string): ScenarioSignal => {
  const normalized = normalizeText(inputText);
  const candidates = BUILTIN_SCENARIO_RULES.map((rule) => {
    const matchedKeywords = unique(
      rule.keywords.filter((keyword) => normalized.includes(normalizeText(keyword))),
    );
    const base = matchedKeywords.length === 0 ? 0 : 0.56;
    const confidence = Math.min(
      0.98,
      Number((base + matchedKeywords.length * 0.08 + (rule.boost ?? 0)).toFixed(2)),
    );
    return {
      scenarioId: rule.scenarioId,
      productType: rule.productType,
      contractType: rule.scenarioId,
      confidence,
      matchedKeywords,
      reason: matchedKeywords.length
        ? `命中关键词：${matchedKeywords.join("、")}`
        : "未命中该场景关键词",
      matchedRuleId: null,
      templateId: null,
      extractedFields: {},
    };
  })
    .filter((item) => item.matchedKeywords.length > 0)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return right.matchedKeywords.length - left.matchedKeywords.length;
    });

  return (
    candidates[0] ?? {
      scenarioId: "unknown",
      productType: "未识别合同类型",
      contractType: "unknown",
      confidence: 0.3,
      matchedKeywords: [],
      reason: "未命中信用卡分期、教育培训贷或消费贷相关关键词",
      matchedRuleId: null,
      templateId: null,
      extractedFields: {},
    }
  );
};

export const detectScenarioFromKnowledge = async (
  inputText: string,
  projectRoot = process.cwd(),
): Promise<ScenarioSignal> => {
  try {
    const rules = await loadScenarioRulesFromSeedFiles(projectRoot);
    const templates = await loadContractTemplatesFromSeedFiles(projectRoot);
    const scenario = detectScenarioByKnowledgeRules(inputText, rules);
    const template = templates.find((item) => item.scenario_id === scenario.scenarioId);
    return {
      scenarioId: scenario.scenarioId,
      productType: scenario.productType,
      contractType: scenario.contractType,
      confidence: scenario.confidence,
      matchedKeywords: scenario.matchedKeywords,
      reason: scenario.reason,
      matchedRuleId: scenario.matchedRuleId,
      templateId: template?.template_id ?? null,
      extractedFields: template ? extractFieldsByContractTemplate(inputText, template) : {},
    };
  } catch {
    return detectScenarioFromText(inputText);
  }
};

export const detectContractTypeFromText = (inputText: string): ContractType =>
  detectScenarioFromText(inputText).contractType;

export const detectProductTypeFromText = (inputText: string): string =>
  detectScenarioFromText(inputText).productType;

