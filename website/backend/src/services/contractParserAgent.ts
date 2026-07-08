import type {
  ChargeTiming,
  ClauseType,
  ContractParseResult,
  ContractType,
  ExtractedField,
  FeeRateUnit,
  FeeType,
  MoneyField,
  NominalRateField,
  ParsedContractClause,
  ParsedFee,
  RateUnit,
  RepaymentMethodCode,
} from "../../../../shared/analysis.js";
import { type KnowledgeBase, findKnowledgeEntries, loadKnowledgeBase } from "./knowledgeBase.js";

type ParserInput = {
  taskId: string;
  contractName: string;
  contractText: string;
};

type Fragment = {
  text: string;
  location: string;
  page: number | null;
  paragraph: number;
  startOffset: number | null;
  endOffset: number | null;
};

const feeTypes = new Set<FeeType>([
  "service_fee",
  "management_fee",
  "consulting_fee",
  "guarantee_fee",
  "insurance_fee",
  "installment_fee",
  "prepayment_fee",
  "overdue_penalty",
  "other",
]);

const emptyField = <T>(value: T | null = null): ExtractedField<T> => ({
  value,
  evidenceText: "",
  location: null,
  confidence: 0,
});

const emptyMoneyField = (): MoneyField => ({
  ...emptyField<number>(),
  unit: "CNY",
});

const normalizeText = (text: string) =>
  text
    .replace(/\r/g, "\n")
    .replace(/[：:]\s*/g, "：")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?第([0-9一二三四五六七八九十]+)条/g, "\n第$1条")
    .trim();

const fragmentLocation = (text: string, index: number, page: number | null) => {
  const clauseMatch = text.match(/第[0-9一二三四五六七八九十]+条[^。；;\n]*/);
  const paragraph = `段落 ${index + 1}`;
  const pagePrefix = page ? `第${page}页 / ` : "";
  return clauseMatch?.[0]?.trim() ?? `${pagePrefix}${paragraph}`;
};

const pageFromLine = (line: string) => {
  const explicit = line.match(/第\s*([0-9]+)\s*页/);
  if (explicit?.[1]) return Number(explicit[1]);
  const footer = line.match(/^--\s*([0-9]+)\s+of\s+[0-9]+\s*--$/i);
  return footer?.[1] ? Number(footer[1]) : null;
};

const isPageNoise = (line: string) =>
  /^--\s*[0-9]+\s+of\s+[0-9]+\s*--$/i.test(line) ||
  line.startsWith("看得懂的钱") ||
  line.startsWith("系统测试样本 ·") ||
  line.startsWith("特别声明：本文件仅供");

const startsNewFragment = (line: string) =>
  /^\d+\.\s*/.test(line) ||
  /^第[0-9一二三四五六七八九十]+条/.test(line) ||
  /^(合同编号|甲方|乙方|签署日期|签章|日期|签署确认|重要提示|个人消费借款|系统验收测试合同)/.test(line);

const shouldAppendToPrevious = (line: string, previous: Fragment | undefined) =>
  Boolean(previous) && !startsNewFragment(line) && !/[。；;：:]$/.test(previous?.text ?? "");

const splitFragmentSentences = (fragment: Fragment): Fragment[] => {
  const parts = fragment.text
    .split(/。/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [fragment];
  return parts.map((text) => ({
    ...fragment,
    text,
  }));
};

const toFragments = (contractText: string): Fragment[] => {
  const normalized = normalizeText(contractText);
  const fragments: Fragment[] = [];
  let currentPage: number | null = null;

  for (const rawLine of normalized.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const detectedPage = pageFromLine(line);
    if (detectedPage !== null) currentPage = detectedPage;
    if (isPageNoise(line)) continue;

    const startOffset = normalized.indexOf(line);
    const previous = fragments[fragments.length - 1];
    if (previous && shouldAppendToPrevious(line, previous)) {
      previous.text = `${previous.text}${line}`;
      previous.endOffset = startOffset >= 0 ? startOffset + line.length : previous.endOffset;
      continue;
    }

    const paragraph = fragments.length + 1;
    fragments.push({
      text: line,
      location: fragmentLocation(line, fragments.length, currentPage),
      page: currentPage,
      paragraph,
      startOffset: startOffset >= 0 ? startOffset : null,
      endOffset: startOffset >= 0 ? startOffset + line.length : null,
    });
  }

  return fragments.flatMap(splitFragmentSentences).map((fragment, index) => ({
    ...fragment,
    paragraph: index + 1,
    location: fragmentLocation(fragment.text, index, fragment.page),
  }));
};

const findFragment = (fragments: Fragment[], aliases: string[]) =>
  fragments.find((fragment) => aliases.some((alias) => fragment.text.includes(alias))) ?? null;

const findFragments = (fragments: Fragment[], aliases: string[]) =>
  fragments.filter((fragment) => aliases.some((alias) => fragment.text.includes(alias)));

const valueAfterAlias = (text: string, aliases: string[]) => {
  const matchedAlias = aliases.find((alias) => text.includes(alias));
  if (!matchedAlias) return text;

  const start = text.indexOf(matchedAlias) + matchedAlias.length;
  return text.slice(start).replace(/^[为是约：\s]*/, "");
};

const parseMoney = (text: string): number | null => {
  const match = text.replace(/,/g, "").match(/(?:人民币|¥|￥)?\s*([0-9]+(?:\.\d+)?)\s*(万元|万|元)/);
  if (!match?.[1]) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2]?.includes("万") ? value * 10_000 : value;
};

const parseInteger = (text: string): number | null => {
  const match = text.match(/([0-9]+)\s*(个?月|期|年)/);
  if (!match?.[1]) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2]?.includes("年") ? value * 12 : value;
};

const parseRate = (text: string): number | null => {
  const percentMatch = text.match(/([0-9]+(?:\.\d+)?)\s*%/);
  if (percentMatch?.[1]) return Number(percentMatch[1]);

  const perTenThousandMatch = text.match(/万分之([0-9]+(?:\.\d+)?)/);
  if (perTenThousandMatch?.[1]) return Number(perTenThousandMatch[1]) / 100;

  return null;
};

const rateUnitFromText = (text: string): RateUnit => {
  if (text.includes("日利率") || text.includes("按日")) return "day";
  if (text.includes("月利率") || text.includes("每月")) return "month";
  if (text.includes("每期") || text.includes("分期手续费率")) return "period";
  if (text.includes("年") || text.includes("年化")) return "annual";
  return "unknown";
};

const feeRateUnitFromText = (text: string): FeeRateUnit => {
  const unit = rateUnitFromText(text);
  if (unit !== "unknown") return unit;
  if (text.includes("一次性") || text.includes("一次")) return "once";
  return "unknown";
};

const confidenceFor = (value: unknown, fragment: Fragment | null) => {
  if (!fragment) return 0;
  return value === null || value === "" ? 0.55 : 0.9;
};

const extractTextField = (fragments: Fragment[], aliases: string[]): ExtractedField<string> => {
  const fragment = findFragment(fragments, aliases);
  if (!fragment) return emptyField<string>();

  const rawValue = valueAfterAlias(fragment.text, aliases)
    .split(/[，,；;]/)[0]
    ?.trim();

  return {
    value: rawValue || null,
    evidenceText: fragment.text,
    location: fragment.location,
    confidence: confidenceFor(rawValue, fragment),
  };
};

const maskPersonalName = (value: string | null) => {
  if (!value) return null;
  if (value.length <= 1) return "*";
  return `${value.slice(0, 1)}${"*".repeat(Math.max(1, value.length - 1))}`;
};

const extractMoneyField = (fragments: Fragment[], aliases: string[]): MoneyField => {
  const candidates = findFragments(fragments, aliases);
  const fragment = candidates.find((candidate) => parseMoney(valueAfterAlias(candidate.text, aliases)) !== null) ?? candidates[0];
  if (!fragment) return emptyMoneyField();

  const value = parseMoney(valueAfterAlias(fragment.text, aliases));
  return {
    value,
    unit: "CNY",
    evidenceText: fragment.text,
    location: fragment.location,
    confidence: confidenceFor(value, fragment),
  };
};

const extractNumberField = (fragments: Fragment[], aliases: string[]): ExtractedField<number> => {
  const candidates = findFragments(fragments, aliases);
  const fragment = candidates.find((candidate) => parseInteger(valueAfterAlias(candidate.text, aliases)) !== null) ?? candidates[0];
  if (!fragment) return emptyField<number>();

  const value = parseInteger(valueAfterAlias(fragment.text, aliases));
  return {
    value,
    evidenceText: fragment.text,
    location: fragment.location,
    confidence: confidenceFor(value, fragment),
  };
};

const extractInstallmentCount = (fragments: Fragment[], aliases: string[]): ExtractedField<number> => {
  const direct = extractNumberField(fragments, aliases);
  if (direct.value !== null) return direct;

  const fragment = fragments.find((candidate) => /共\s*[0-9]+\s*期/.test(candidate.text));
  if (!fragment) return direct;

  const value = parseInteger(fragment.text);
  return {
    value,
    evidenceText: fragment.text,
    location: fragment.location,
    confidence: confidenceFor(value, fragment),
  };
};

const extractNominalRate = (fragments: Fragment[], aliases: string[]): NominalRateField => {
  const candidates = findFragments(fragments, aliases);
  const fragment = candidates.find((candidate) => parseRate(valueAfterAlias(candidate.text, aliases)) !== null) ?? candidates[0];
  if (!fragment) {
    return {
      ...emptyField<number>(),
      unit: "unknown",
      method: "unknown",
    };
  }

  const sliced = valueAfterAlias(fragment.text, aliases);
  const value = parseRate(sliced);
  return {
    value,
    unit: rateUnitFromText(fragment.text),
    method: fragment.text.includes("复利") ? "compound" : fragment.text.includes("单利") ? "simple" : "unknown",
    evidenceText: fragment.text,
    location: fragment.location,
    confidence: confidenceFor(value, fragment),
  };
};

const detectRepaymentMethod = (
  fragments: Fragment[],
  aliases: KnowledgeBase["dictionary"]["repayment_method_aliases"],
): ExtractedField<RepaymentMethodCode> => {
  for (const [method, methodAliases] of Object.entries(aliases) as Array<[RepaymentMethodCode, string[] | undefined]>) {
    const fragment = findFragment(fragments, methodAliases ?? []);
    if (fragment) {
      return {
        value: method,
        evidenceText: fragment.text,
        location: fragment.location,
        confidence: 0.9,
      };
    }
  }

  return {
    ...emptyField<RepaymentMethodCode>("unknown"),
    confidence: 0,
  };
};

const detectContractType = (text: string): ContractType => {
  if (text.includes("现金分期")) return "cash_installment";
  if (text.includes("账单分期")) return "bill_installment";
  if (text.includes("商品分期") || text.includes("商户分期")) return "merchant_installment";
  if (text.includes("消费贷款") || text.includes("消费贷") || text.includes("借款")) return "consumer_loan";
  return "unknown";
};

const feeChargeTiming = (feeType: FeeType, text: string): ChargeTiming => {
  if (feeType === "prepayment_fee") return "on_prepayment";
  if (feeType === "overdue_penalty") return "on_overdue";
  if (/扣除|放款金额中|发放时|放款时|先扣|一次性扣/.test(text)) return "upfront_deducted";
  if (/首期|第一期|第1期|首月/.test(text)) return "first_period";
  if (/每期|每月|按期/.test(text)) return "per_period";
  if (/一次性|签约时|放款前/.test(text)) return "upfront_paid";
  return "unknown";
};

const shouldSkipFeeCandidate = (feeType: FeeType, term: string, fragment: Fragment) => {
  const text = fragment.text;
  if (feeType === "service_fee" && term === "服务费" && /保障服务费|催收服务费|信息服务费|技术服务费/.test(text)) {
    return true;
  }
  if (feeType === "service_fee" && /实际到账金额|实际收到/.test(text) && !/收取[^。；]*服务费/.test(text)) {
    return true;
  }
  if (feeType !== "overdue_penalty" && /逾期|催收/.test(text) && !/每月|每期|首期|放款|一次性/.test(text)) {
    return true;
  }
  return false;
};

const extractFees = (fragments: Fragment[], knowledgeBase: KnowledgeBase): ParsedFee[] => {
  const parsedFees: ParsedFee[] = [];
  const seen = new Set<string>();

  for (const [rawType, terms] of Object.entries(knowledgeBase.dictionary.fee_terms)) {
    const feeType = feeTypes.has(rawType as FeeType) ? (rawType as FeeType) : "other";
    if (rawType === "interest") continue;

    for (const term of terms ?? []) {
      const matchedFragments = fragments.filter((candidate) => candidate.text.includes(term));

      for (const fragment of matchedFragments) {
        if (shouldSkipFeeCandidate(feeType, term, fragment)) continue;
        const textAfterTerm = valueAfterAlias(fragment.text, [term]);
        const amount = parseMoney(textAfterTerm) ?? parseMoney(fragment.text);
        const rate = parseRate(textAfterTerm) ?? parseRate(fragment.text);
        if (amount === null && rate === null) continue;

        const chargeTiming = feeChargeTiming(feeType, fragment.text);
        const key = `${feeType}:${chargeTiming}:${amount ?? ""}:${rate ?? ""}:${fragment.location}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const includedInNormalCost = knowledgeBase.costRules.normalCostFeeTypes.includes(feeType);

        parsedFees.push({
          name: term,
          type: feeType,
          amount,
          rate,
          rateUnit: feeRateUnitFromText(fragment.text),
          chargeTiming,
          includedInNormalCost,
          chargedBy: null,
          evidenceText: fragment.text,
          location: fragment.location,
          confidence: 0.88,
        });
      }
    }
  }

  return parsedFees;
};

const deriveActualReceivedAmount = (loanAmount: MoneyField, actualReceivedAmount: MoneyField, fees: ParsedFee[]) => {
  if (actualReceivedAmount.value !== null || loanAmount.value === null) return actualReceivedAmount;

  const upfrontFees = fees.filter((fee) => fee.chargeTiming === "upfront_deducted" && fee.amount !== null);
  const upfrontFeeTotal = upfrontFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  if (upfrontFeeTotal <= 0) return actualReceivedAmount;

  return {
    value: loanAmount.value - upfrontFeeTotal,
    unit: "CNY",
    evidenceText: upfrontFees.map((fee) => fee.evidenceText).join("；"),
    location: upfrontFees[0]?.location ?? null,
    confidence: 0.76,
  } satisfies MoneyField;
};

const clauseMatchers: Array<[ClauseType, RegExp]> = [
  ["fee", /服务费|管理费|咨询费|担保费|保险费|保障服务费|短信提醒费|短信费|分期手续费|费用|实际到账|实际收到|计息及还款本金|借款本金中扣除/],
  ["prepayment", /提前还款|提前结清/],
  ["overdue", /逾期|罚息|违约金|复利|滞纳金/],
  ["autoDebit", /自动扣款|扣款授权|不可撤销|绑定账户/],
  ["privacy", /信息收集|个人信息|通讯录|通话记录|短信记录|定位信息|浏览记录|交易信息|关联公司|第三方平台|合作方|授权|征信机构|撤回授权|银行卡信息|设备信息/],
  ["contractChange", /合同变更|服务规则|收费标准|业务流程|继续使用服务|提出书面异议|视为接受|立即结清|还款能力明显下降|解除本协议|立即偿还全部/],
  ["disputeResolution", /争议解决|仲裁委员会|送达方式|有效送达地址|联系方式发生变化|终局裁决|线上方式/],
  ["repayment", /还款方式|每期应还|月供|等额|先息后本|到期一次/],
  ["purpose", /贷款用途|借款用途|资金用途|不得用于/],
  ["rateAdjustment", /LPR|浮动|调整|基点|BP/],
  ["guarantee", /担保|保证保险|增信|连带责任/],
];

const extractClauses = (fragments: Fragment[]): ParsedContractClause[] => {
  const clauses: ParsedContractClause[] = [];
  const seen = new Set<string>();

  for (const fragment of fragments) {
    if (/^第[0-9一二三四五六七八九十]+条\s*[^，,；;。]{0,12}$/.test(fragment.text)) continue;

    const matched = clauseMatchers.find(([, matcher]) => matcher.test(fragment.text));
    if (!matched) continue;

    const [type] = matched;
    const key = `${type}:${fragment.location}`;
    if (seen.has(key)) continue;
    seen.add(key);

    clauses.push({
      type,
      text: fragment.text,
      location: fragment.location,
      page: fragment.page,
      paragraph: fragment.paragraph,
      startOffset: fragment.startOffset,
      endOffset: fragment.endOffset,
      confidence: 0.84,
    });
  }

  return clauses;
};

const detectMissingFields = (result: Omit<ContractParseResult, "missingFields" | "needsManualReview">) => {
  const missingFields: string[] = [];
  if (!result.institution.value) missingFields.push("institution");
  if (!result.loanAmount.value) missingFields.push("loanAmount");
  if (!result.actualReceivedAmount.value) missingFields.push("actualReceivedAmount");
  if (!result.termMonths.value && !result.installmentCount.value) missingFields.push("termMonths/installmentCount");
  if (!result.repaymentMethod.value || result.repaymentMethod.value === "unknown") missingFields.push("repaymentMethod");
  if (!result.monthlyPayment.value && !result.nominalRate.value) missingFields.push("monthlyPayment/nominalRate");
  return missingFields;
};

export const runContractParserAgent = (input: ParserInput): ContractParseResult => {
  const knowledgeBase = loadKnowledgeBase();
  const fragments = toFragments(input.contractText);
  const aliases = knowledgeBase.dictionary.field_aliases;

  const loanAmount = extractMoneyField(fragments, [...(aliases.loanAmount ?? []), "借款本金"]);
  const fees = extractFees(fragments, knowledgeBase);
  const actualReceivedAmount = deriveActualReceivedAmount(
    loanAmount,
    extractMoneyField(fragments, aliases.actualReceivedAmount ?? []),
    fees,
  );
  const repaymentMethod = detectRepaymentMethod(fragments, knowledgeBase.dictionary.repayment_method_aliases);
  const clauses = extractClauses(fragments);
  const contractType = detectContractType(input.contractText);
  const sourceEntries = findKnowledgeEntries(
    knowledgeBase.contractEntries,
    `${contractType} ${repaymentMethod.value ?? ""} 费用 现金流`,
    2,
  );

  const borrower = extractTextField(fragments, aliases.borrower ?? []);
  const partialResult = {
    taskId: input.taskId,
    contractName: input.contractName,
    contractType,
    institution: extractTextField(fragments, [...(aliases.institution ?? []), "签约机构"]),
    borrower: {
      ...borrower,
      value: maskPersonalName(borrower.value),
      masked: true,
    },
    loanAmount,
    actualReceivedAmount,
    termMonths: extractNumberField(fragments, aliases.termMonths ?? []),
    installmentCount: extractInstallmentCount(fragments, aliases.installmentCount ?? []),
    repaymentMethod,
    monthlyPayment: extractMoneyField(fragments, [...(aliases.monthlyPayment ?? []), "每月应还"]),
    nominalRate: extractNominalRate(fragments, [...(aliases.nominalRate ?? []), "名义年化利率", "年化利率"]),
    fees,
    clauses,
    assumptions: [
      "字段别名、费用类型和还款方式枚举来自《字段别名与费用词典.json》。",
      ...sourceEntries.map((entry) => `参考合同知识条目：${entry.id}`),
    ],
  };

  const missingFields = detectMissingFields(partialResult);

  return {
    ...partialResult,
    missingFields,
    needsManualReview: missingFields.length > 0 || fees.some((fee) => fee.confidence < 0.7),
  };
};
