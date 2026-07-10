import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContractType } from "../../../../shared/analysis.js";

export type ContractClauseTemplate = {
  template_id: string;
  scenario_id: ContractType;
  contract_type: ContractType;
  template_name: string;
  keyword_patterns: string[];
  typical_clause_structure: string[];
  field_mapping: Record<string, string[]>;
  risk_indicators: string[];
  created_at?: string;
  updated_at?: string;
};

export type ScenarioRecognitionRule = {
  rule_id: string;
  scenario_id: ContractType;
  rule_name: string;
  description: string;
  match_mode: "all_groups" | "any";
  condition: {
    all_keyword_groups?: string[][];
    any_keywords?: string[];
  };
  product_type: string;
  contract_type: ContractType;
  confidence: number;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DatabaseLike = {
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> | T[];
};

export type ScenarioMatchResult = {
  scenarioId: ContractType;
  productType: string;
  contractType: ContractType;
  confidence: number;
  matchedKeywords: string[];
  matchedRuleId: string | null;
  reason: string;
};

const normalizeText = (text: string) =>
  (text || "")
    .replace(/\s+/g, "")
    .replace(/[，。；：、,.・]/g, "")
    .toLowerCase();

const parseJsonField = <T>(value: unknown, fallback: T): T => {
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) return value as T;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const unique = <T>(items: T[]) => Array.from(new Set(items));

const serviceDir = dirname(fileURLToPath(import.meta.url));

const projectRootCandidates = (projectRoot: string) => [
  resolve(projectRoot),
  resolve(projectRoot, ".."),
  resolve(projectRoot, "../.."),
  resolve(projectRoot, "../../.."),
  resolve(serviceDir, "../../../.."),
];

const seedPathCandidates = (projectRoot: string, relative: string) =>
  projectRootCandidates(projectRoot).map((root) => join(root, "knowledge", "seed_data", relative));

const firstExistingSeedPath = async (projectRoot: string, relative: string) => {
  const candidates = seedPathCandidates(projectRoot, relative);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate. The package must work whether the backend is
      // started from repo root, website/backend, or a runtime directory.
    }
  }
  throw new Error(`Cannot find B knowledge seed file: ${relative}. Tried: ${candidates.join(", ")}`);
};

export const loadScenarioRulesFromSeedFiles = async (
  projectRoot = process.cwd(),
): Promise<ScenarioRecognitionRule[]> => {
  const filePath = await firstExistingSeedPath(projectRoot, "scenario_rules/scenario_recognition_rules.json");
  const raw = await readFile(filePath, "utf8");
  return (JSON.parse(raw) as ScenarioRecognitionRule[]).map((rule) => ({
    ...rule,
    is_active: Boolean(rule.is_active),
  }));
};

export const loadContractTemplatesFromSeedFiles = async (
  projectRoot = process.cwd(),
): Promise<ContractClauseTemplate[]> => {
  const files = [
    "contract_templates/credit_card_installment_templates.json",
    "contract_templates/education_training_loan_templates.json",
  ];
  const templates = await Promise.all(
    files.map(async (file) => JSON.parse(await readFile(await firstExistingSeedPath(projectRoot, file), "utf8"))),
  );
  return templates.flat() as ContractClauseTemplate[];
};

export const loadScenarioRulesFromDatabase = async (
  db: DatabaseLike,
): Promise<ScenarioRecognitionRule[]> => {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM scenario_recognition_rules WHERE is_active = 1 ORDER BY priority DESC, updated_at DESC",
  );
  return rows.map((row) => ({
    rule_id: String(row.rule_id),
    scenario_id: String(row.scenario_id) as ContractType,
    rule_name: String(row.rule_name),
    description: String(row.description),
    match_mode: String(row.match_mode) === "any" ? "any" : "all_groups",
    condition: parseJsonField(row.condition, {}),
    product_type: String(row.product_type),
    contract_type: String(row.contract_type) as ContractType,
    confidence: Number(row.confidence),
    priority: Number(row.priority),
    is_active: Boolean(row.is_active),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }));
};

export const loadContractTemplatesFromDatabase = async (
  db: DatabaseLike,
  scenarioId?: ContractType,
): Promise<ContractClauseTemplate[]> => {
  const rows = await db.all<Record<string, unknown>>(
    scenarioId
      ? "SELECT * FROM contract_clause_templates WHERE scenario_id = ? ORDER BY updated_at DESC"
      : "SELECT * FROM contract_clause_templates ORDER BY updated_at DESC",
    scenarioId ? [scenarioId] : [],
  );
  return rows.map((row) => ({
    template_id: String(row.template_id),
    scenario_id: String(row.scenario_id) as ContractType,
    contract_type: String(row.contract_type) as ContractType,
    template_name: String(row.template_name),
    keyword_patterns: parseJsonField(row.keyword_patterns, []),
    typical_clause_structure: parseJsonField(row.typical_clause_structure, []),
    field_mapping: parseJsonField(row.field_mapping, {}),
    risk_indicators: parseJsonField(row.risk_indicators, []),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }));
};

const matchRule = (contractText: string, rule: ScenarioRecognitionRule) => {
  const text = normalizeText(contractText);
  const matchedKeywords: string[] = [];

  if (rule.match_mode === "all_groups") {
    const groups = rule.condition.all_keyword_groups ?? [];
    const matchedAllGroups = groups.every((group) => {
      const matchedInGroup = group.filter((keyword) => text.includes(normalizeText(keyword)));
      matchedKeywords.push(...matchedInGroup);
      return matchedInGroup.length > 0;
    });
    return matchedAllGroups ? unique(matchedKeywords) : [];
  }

  const anyKeywords = rule.condition.any_keywords ?? [];
  return unique(anyKeywords.filter((keyword) => text.includes(normalizeText(keyword))));
};

export const detectScenarioByKnowledgeRules = (
  contractText: string,
  rules: ScenarioRecognitionRule[],
): ScenarioMatchResult => {
  const candidates = rules
    .filter((rule) => rule.is_active)
    .map((rule) => {
      const matchedKeywords = matchRule(contractText, rule);
      const confidence = Math.min(
        0.99,
        Number((rule.confidence + Math.max(0, matchedKeywords.length - 3) * 0.01).toFixed(2)),
      );
      return {
        scenarioId: rule.scenario_id,
        productType: rule.product_type,
        contractType: rule.contract_type,
        confidence,
        matchedKeywords,
        matchedRuleId: rule.rule_id,
        reason: matchedKeywords.length
          ? `命中场景规则“${rule.rule_name}”：${matchedKeywords.join("、")}`
          : `未命中场景规则“${rule.rule_name}”`,
      };
    })
    .filter((candidate) => candidate.matchedKeywords.length > 0)
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
      matchedRuleId: null,
      reason: "未命中场景识别规则",
    }
  );
};

export const extractFieldsByContractTemplate = (
  contractText: string,
  template: ContractClauseTemplate,
): Record<string, { value: string | null; matchedAlias: string | null }> => {
  const result: Record<string, { value: string | null; matchedAlias: string | null }> = {};

  for (const [field, aliases] of Object.entries(template.field_mapping)) {
    const alias = aliases.find((item) => contractText.includes(item)) ?? null;
    if (!alias) {
      result[field] = { value: null, matchedAlias: null };
      continue;
    }

    const index = contractText.indexOf(alias);
    const snippet = contractText.slice(index, index + 120);
    const value = snippet.split(/[。；;\n]/)[0]?.trim() || snippet.trim();
    result[field] = { value, matchedAlias: alias };
  }

  return result;
};
