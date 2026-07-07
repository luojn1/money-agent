import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeeType, RepaymentMethodCode } from "../../../../shared/analysis.js";

const EXTERNAL_KNOWLEDGE_ROOT =
  "E:/妖/在中大/学习/大三下/金融科技/小组作业/agent/合同与金融产品知识库";
const serviceDir = dirname(fileURLToPath(import.meta.url));
const inferredProjectRoot = resolve(serviceDir, "../../../..");
export const projectRoot = resolve(process.env.PROJECT_ROOT?.trim() || inferredProjectRoot);
const LOCAL_KNOWLEDGE_ROOT = join(projectRoot, "knowledge_base", "contract_finance");

type FieldAliasDictionary = {
  field_aliases: Record<string, string[]>;
  fee_terms: Partial<Record<FeeType | "interest" | "cancellation_fee", string[]>>;
  repayment_method_aliases: Partial<Record<RepaymentMethodCode, string[]>>;
};

type KnowledgeEntry = {
  id: string;
  type: string;
  title?: string;
  content?: string;
  institution?: string;
  product?: string;
  source_ids?: string[];
  fields?: Record<string, unknown>;
};

type LatestLpr = {
  date: string;
  oneYear: number;
  fiveYear: number;
};

export type KnowledgeBase = {
  rootDir: string;
  dictionary: FieldAliasDictionary;
  contractEntries: KnowledgeEntry[];
  productEntries: KnowledgeEntry[];
  latestLpr: LatestLpr;
  sourceFileCount: number;
  sourceCatalogCount: number;
  costRules: {
    normalCostFeeTypes: FeeType[];
    contingentCostFeeTypes: FeeType[];
    licensedInstitutionThresholds: {
      lowMax: number;
      normalMax: number;
      warningMax: number;
    };
    privateLendingProtectedAnnualRate: number;
  };
};

let cachedKnowledgeBase: KnowledgeBase | null = null;

const readUtf8 = (path: string) => readFileSync(path, "utf8");

const readJson = <T>(path: string): T => JSON.parse(readUtf8(path)) as T;

const readJsonl = (path: string): KnowledgeEntry[] => {
  if (!existsSync(path)) return [];
  return readUtf8(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as KnowledgeEntry);
};

export const hasKnowledgeBundle = (rootDir: string) =>
  existsSync(join(rootDir, "knowledge_base", "字段别名与费用词典.json")) &&
  existsSync(join(rootDir, "knowledge_base", "合同知识库_entries.jsonl")) &&
  existsSync(join(rootDir, "knowledge_base", "金融产品知识库_entries.jsonl"));

export const getKnowledgeRootCandidates = () =>
  [process.env.KNOWLEDGE_BASE_ROOT?.trim(), LOCAL_KNOWLEDGE_ROOT, EXTERNAL_KNOWLEDGE_ROOT].filter(
    (candidate): candidate is string => Boolean(candidate?.trim()),
  );

const resolveKnowledgeRoot = () => {
  const candidates = getKnowledgeRootCandidates();

  const matched = candidates.find(hasKnowledgeBundle);
  if (!matched) {
    throw new Error(`知识库不可用，请设置 KNOWLEDGE_BASE_ROOT，或放置知识库到 ${LOCAL_KNOWLEDGE_ROOT}`);
  }

  return matched;
};

const parseLatestLpr = (rootDir: string): LatestLpr => {
  const fallback = { date: "2026-06-22", oneYear: 3, fiveYear: 3.5 };
  const lprHistoryPath = join(rootDir, "raw_sources", "regulatory", "REG-005_BOC_LPR_history.html");
  if (!existsSync(lprHistoryPath)) return fallback;

  const html = readUtf8(lprHistoryPath);
  const rowMatch = html.match(
    /<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<td>([\d.]+)%<\/td>\s*<td>([\d.]+)%<\/td>/,
  );

  if (!rowMatch?.[1] || !rowMatch[2] || !rowMatch[3]) return fallback;

  return {
    date: rowMatch[1],
    oneYear: Number(rowMatch[2]),
    fiveYear: Number(rowMatch[3]),
  };
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const countFiles = (rootDir: string): number => {
  if (!existsSync(rootDir)) return 0;
  return readdirSync(rootDir).reduce((sum, name) => {
    const path = join(rootDir, name);
    const stat = statSync(path);
    return sum + (stat.isDirectory() ? countFiles(path) : 1);
  }, 0);
};

const countCatalogRows = (rootDir: string) => {
  const csvPath = join(rootDir, "source_catalog.csv");
  if (!existsSync(csvPath)) return 0;
  return Math.max(0, readUtf8(csvPath).split(/\r?\n/).filter(Boolean).length - 1);
};

const normalizeDictionary = (dictionary: FieldAliasDictionary): FieldAliasDictionary => ({
  field_aliases: Object.fromEntries(
    Object.entries(dictionary.field_aliases).map(([key, values]) => [key, unique(values)]),
  ),
  fee_terms: Object.fromEntries(
    Object.entries(dictionary.fee_terms).map(([key, values]) => [key, unique(values ?? [])]),
  ) as FieldAliasDictionary["fee_terms"],
  repayment_method_aliases: Object.fromEntries(
    Object.entries(dictionary.repayment_method_aliases).map(([key, values]) => [key, unique(values ?? [])]),
  ) as FieldAliasDictionary["repayment_method_aliases"],
});

export const loadKnowledgeBase = (): KnowledgeBase => {
  if (cachedKnowledgeBase) return cachedKnowledgeBase;

  const rootDir = resolveKnowledgeRoot();
  const knowledgeDir = join(rootDir, "knowledge_base");
  const dictionary = normalizeDictionary(
    readJson<FieldAliasDictionary>(join(knowledgeDir, "字段别名与费用词典.json")),
  );
  const latestLpr = parseLatestLpr(rootDir);

  cachedKnowledgeBase = {
    rootDir,
    dictionary,
    contractEntries: readJsonl(join(knowledgeDir, "合同知识库_entries.jsonl")),
    productEntries: readJsonl(join(knowledgeDir, "金融产品知识库_entries.jsonl")),
    latestLpr,
    sourceFileCount: countFiles(rootDir),
    sourceCatalogCount: countCatalogRows(rootDir),
    costRules: {
      normalCostFeeTypes: [
        "service_fee",
        "management_fee",
        "consulting_fee",
        "guarantee_fee",
        "insurance_fee",
        "installment_fee",
      ],
      contingentCostFeeTypes: ["prepayment_fee", "overdue_penalty"],
      licensedInstitutionThresholds: {
        lowMax: latestLpr.oneYear * 4,
        normalMax: 20,
        warningMax: 24,
      },
      privateLendingProtectedAnnualRate: latestLpr.oneYear * 4,
    },
  };

  return cachedKnowledgeBase;
};

export const findKnowledgeEntries = (entries: KnowledgeEntry[], query: string, limit = 3): KnowledgeEntry[] => {
  const terms = query
    .split(/\s+|\/|、|，|,|。/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  return entries
    .map((entry) => {
      const haystack = JSON.stringify(entry);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
};
