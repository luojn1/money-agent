import type {
  CashFlowItem,
  CostAnalysisOutput,
  CostCalculationResult,
  CostLevel,
  ContractParseResult,
  ParsedFee,
  RateUnit,
} from "../../../../shared/analysis.js";
import { findKnowledgeEntries, loadKnowledgeBase } from "./knowledgeBase.js";

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const roundRate = (value: number) => Math.round(value * 100) / 100;

const annualNominalRate = (rate: number | null, unit: RateUnit) => {
  if (rate === null) return null;
  if (unit === "annual") return rate;
  if (unit === "month") return rate * 12;
  if (unit === "day") return rate * 360;
  return null;
};

const monthlyRateFromNominal = (rate: number | null, unit: RateUnit) => {
  if (rate === null) return null;
  if (unit === "annual") return rate / 100 / 12;
  if (unit === "month") return rate / 100;
  if (unit === "day") return (rate / 100) * 30;
  if (unit === "period") return rate / 100;
  return null;
};

const equalInstallmentPayment = (principal: number, monthlyRate: number, periods: number) => {
  if (monthlyRate === 0) return principal / periods;
  const factor = (monthlyRate * (1 + monthlyRate) ** periods) / ((1 + monthlyRate) ** periods - 1);
  return principal * factor;
};

const hasPositiveAndNegativeFlows = (cashFlows: CashFlowItem[]) =>
  cashFlows.some((flow) => flow.amount > 0) && cashFlows.some((flow) => flow.amount < 0);

const calculateMonthlyIrr = (cashFlows: CashFlowItem[]) => {
  if (!hasPositiveAndNegativeFlows(cashFlows)) return null;

  const npv = (rate: number) =>
    cashFlows.reduce((sum, flow) => sum + flow.amount / (1 + rate) ** flow.period, 0);

  let low = -0.9999;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);

  for (let attempts = 0; lowValue * highValue > 0 && attempts < 20; attempts += 1) {
    high *= 2;
    highValue = npv(high);
  }

  if (lowValue * highValue > 0) return null;

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle);
    if (Math.abs(middleValue) < 0.000001) return middle;
    if (middleValue > 0) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }

  return (low + high) / 2;
};

const scheduledPeriodCount = (parseResult: ContractParseResult) =>
  parseResult.installmentCount.value ?? parseResult.termMonths.value;

const upfrontPaidFeeTotal = (fees: ParsedFee[]) =>
  fees
    .filter((fee) => fee.includedInNormalCost && fee.chargeTiming === "upfront_paid" && fee.amount !== null)
    .reduce((sum, fee) => sum + (fee.amount ?? 0), 0);

const normalFeeTotal = (fees: ParsedFee[], periods: number | null | undefined) =>
  fees
    .filter((fee) => fee.includedInNormalCost && fee.amount !== null)
    .reduce((sum, fee) => {
      const amount = fee.amount ?? 0;
      if (fee.chargeTiming === "per_period") return sum + amount * (periods ?? 1);
      if (fee.chargeTiming === "upfront_deducted" || fee.chargeTiming === "upfront_paid" || fee.chargeTiming === "first_period") {
        return sum + amount;
      }
      return sum;
    }, 0);

const normalFeeForPeriod = (fees: ParsedFee[], period: number) =>
  fees
    .filter((fee) => fee.includedInNormalCost && fee.amount !== null)
    .reduce((sum, fee) => {
      if (fee.chargeTiming === "per_period") return sum + (fee.amount ?? 0);
      if (fee.chargeTiming === "first_period" && period === 1) return sum + (fee.amount ?? 0);
      return sum;
    }, 0);

const buildRepaymentFlows = (
  parseResult: ContractParseResult,
  assumptions: string[],
  warnings: string[],
  includeNormalFees: boolean,
): CashFlowItem[] => {
  const actualReceivedAmount = parseResult.actualReceivedAmount.value;
  const periods = scheduledPeriodCount(parseResult);
  const monthlyPayment = parseResult.monthlyPayment.value;
  const principal = parseResult.loanAmount.value;
  const nominalMonthlyRate = monthlyRateFromNominal(parseResult.nominalRate.value, parseResult.nominalRate.unit);

  if (actualReceivedAmount === null) return [];

  const cashFlows: CashFlowItem[] = [
    {
      period: 0,
      date: null,
      amount: roundMoney(actualReceivedAmount),
      description: "第0期：实际到账金额",
    },
  ];

  const upfrontPaid = includeNormalFees ? upfrontPaidFeeTotal(parseResult.fees) : 0;
  if (upfrontPaid > 0) {
    cashFlows.push({
      period: 0,
      date: null,
      amount: -roundMoney(upfrontPaid),
      description: "第0期：放款前/签约时另行支付的正常履约费用",
    });
  }

  if (!periods) return cashFlows;

  if (monthlyPayment !== null) {
    for (let period = 1; period <= periods; period += 1) {
      const periodFees = includeNormalFees ? normalFeeForPeriod(parseResult.fees, period) : 0;
      cashFlows.push({
        period,
        date: null,
        amount: -roundMoney(monthlyPayment + periodFees),
        description:
          periodFees > 0
            ? `第${period}期：合同约定固定还款额 + 正常履约费用`
            : `第${period}期：合同约定固定还款额`,
      });
    }
    assumptions.push(
      includeNormalFees
        ? "综合口径在合同固定月供基础上叠加每月或首期正常履约费用。"
        : "基础口径只使用实际到账金额和合同固定月供/每期还款额。",
    );
    return cashFlows;
  }

  if (principal === null || nominalMonthlyRate === null) {
    return cashFlows;
  }

  if (parseResult.repaymentMethod.value === "equal_installment") {
    const payment = equalInstallmentPayment(principal, nominalMonthlyRate, periods);
    for (let period = 1; period <= periods; period += 1) {
      const periodFees = includeNormalFees ? normalFeeForPeriod(parseResult.fees, period) : 0;
      cashFlows.push({
        period,
        date: null,
        amount: -roundMoney(payment + periodFees),
        description:
          periodFees > 0
            ? `第${period}期：按等额本息公式估算还款额 + 正常履约费用`
            : `第${period}期：按等额本息公式估算还款额`,
      });
    }
    assumptions.push("合同未给固定月供，按本金、名义利率和期数估算等额本息现金流。");
    return cashFlows;
  }

  if (parseResult.repaymentMethod.value === "equal_principal") {
    const principalPerPeriod = principal / periods;
    for (let period = 1; period <= periods; period += 1) {
      const remainingPrincipal = principal - principalPerPeriod * (period - 1);
      const periodFees = includeNormalFees ? normalFeeForPeriod(parseResult.fees, period) : 0;
      cashFlows.push({
        period,
        date: null,
        amount: -roundMoney(principalPerPeriod + remainingPrincipal * nominalMonthlyRate + periodFees),
        description:
          periodFees > 0
            ? `第${period}期：按等额本金公式估算还款额 + 正常履约费用`
            : `第${period}期：按等额本金公式估算还款额`,
      });
    }
    assumptions.push("合同未给固定月供，按等额本金公式估算现金流。");
    return cashFlows;
  }

  warnings.push("当前还款方式需要完整还款计划，MVP 暂不强行估算。");
  return cashFlows;
};

const classifyCostLevel = (realAnnualRate: number | null, lowMax: number, normalMax: number, warningMax: number): CostLevel => {
  if (realAnnualRate === null) return "insufficient_information";
  if (realAnnualRate <= lowMax) return "low";
  if (realAnnualRate <= normalMax) return "normal";
  if (realAnnualRate <= warningMax) return "warning";
  return "high";
};

const outputMissingFields = (parseResult: ContractParseResult, cashFlows: CashFlowItem[]) => {
  const missingFields: string[] = [];
  if (parseResult.actualReceivedAmount.value === null) missingFields.push("actualReceivedAmount");
  if (!scheduledPeriodCount(parseResult)) missingFields.push("installmentCount/termMonths");
  if (cashFlows.length <= 1 && parseResult.monthlyPayment.value === null) missingFields.push("monthlyPayment/repaymentSchedule");
  return missingFields;
};

const countDictionaryTerms = (dictionary: ReturnType<typeof loadKnowledgeBase>["dictionary"]) =>
  Object.values(dictionary.field_aliases).reduce((sum, values) => sum + values.length, 0) +
  Object.values(dictionary.fee_terms).reduce((sum, values) => sum + (values?.length ?? 0), 0) +
  Object.values(dictionary.repayment_method_aliases).reduce((sum, values) => sum + (values?.length ?? 0), 0);

const toCalculationResult = (
  parseResult: ContractParseResult,
  baseCashFlows: CashFlowItem[],
  comprehensiveCashFlows: CashFlowItem[],
  assumptions: string[],
  warnings: string[],
): CostAnalysisOutput => {
  const knowledgeBase = loadKnowledgeBase();
  const scheduledOutflows = comprehensiveCashFlows.filter((flow) => flow.period > 0 && flow.amount < 0);
  const totalRepayment = scheduledOutflows.length
    ? roundMoney(scheduledOutflows.reduce((sum, flow) => sum + Math.abs(flow.amount), 0))
    : null;
  const periods = scheduledPeriodCount(parseResult);
  const totalFees = normalFeeTotal(parseResult.fees, periods);
  const upfrontPaid = upfrontPaidFeeTotal(parseResult.fees);
  const loanAmount = parseResult.loanAmount.value;
  const actualReceivedAmount = parseResult.actualReceivedAmount.value;
  const totalInterest = totalRepayment !== null && loanAmount !== null ? roundMoney(totalRepayment - loanAmount) : null;
  const extraCost =
    totalRepayment !== null && actualReceivedAmount !== null
      ? roundMoney(totalRepayment + upfrontPaid - actualReceivedAmount)
      : null;

  const baseIrrMonthly = calculateMonthlyIrr(baseCashFlows);
  const baseRealAnnualRateSimple = baseIrrMonthly === null ? null : roundRate(baseIrrMonthly * 12 * 100);
  const baseRealAnnualRateCompound = baseIrrMonthly === null ? null : roundRate(((1 + baseIrrMonthly) ** 12 - 1) * 100);
  const comprehensiveIrrMonthly = calculateMonthlyIrr(comprehensiveCashFlows);
  const comprehensiveRealAnnualRateSimple =
    comprehensiveIrrMonthly === null ? null : roundRate(comprehensiveIrrMonthly * 12 * 100);
  const comprehensiveRealAnnualRateCompound =
    comprehensiveIrrMonthly === null ? null : roundRate(((1 + comprehensiveIrrMonthly) ** 12 - 1) * 100);
  const displayAnnualRateMethod = "simple";
  const realAnnualRate = comprehensiveRealAnnualRateSimple;
  const nominalAnnualRate = annualNominalRate(parseResult.nominalRate.value, parseResult.nominalRate.unit);
  const costEntries = findKnowledgeEntries(
    knowledgeBase.productEntries,
    `${parseResult.institution.value ?? ""} ${parseResult.contractType} ${parseResult.repaymentMethod.value ?? ""}`,
    2,
  );
  const missingFields = outputMissingFields(parseResult, comprehensiveCashFlows);
  const thresholds = knowledgeBase.costRules.licensedInstitutionThresholds;

  const calculationResult: CostCalculationResult = {
    taskId: parseResult.taskId,
    actualReceivedAmount,
    totalRepayment,
    totalInterest,
    totalFees: totalFees || null,
    extraCost,
    irrMonthly: comprehensiveIrrMonthly === null ? null : Number(comprehensiveIrrMonthly.toFixed(8)),
    realAnnualRateSimple: comprehensiveRealAnnualRateSimple,
    realAnnualRateCompound: comprehensiveRealAnnualRateCompound,
    baseCashFlows,
    baseIrrMonthly: baseIrrMonthly === null ? null : Number(baseIrrMonthly.toFixed(8)),
    baseRealAnnualRateSimple,
    baseRealAnnualRateCompound,
    comprehensiveCashFlows,
    comprehensiveIrrMonthly: comprehensiveIrrMonthly === null ? null : Number(comprehensiveIrrMonthly.toFixed(8)),
    comprehensiveRealAnnualRateSimple,
    comprehensiveRealAnnualRateCompound,
    displayAnnualRateMethod,
    cashFlows: comprehensiveCashFlows,
    includedFees: parseResult.fees
      .filter((fee) => fee.includedInNormalCost)
      .map((fee) => ({
        name: fee.name,
        amount: fee.amount,
        reason:
          fee.chargeTiming === "upfront_deducted"
            ? "知识库规则：放款时扣除的正常费用通过实际到账金额进入真实成本测算。"
            : "知识库规则：正常履约且与贷款直接相关的费用进入综合真实成本测算。",
      })),
    excludedContingentCosts: parseResult.fees
      .filter((fee) => !fee.includedInNormalCost)
      .map((fee) => ({
        name: fee.name,
        amountOrFormula: fee.amount !== null ? `${fee.amount}元` : fee.rate !== null ? `${fee.rate}%` : fee.evidenceText,
        reason: "知识库规则：提前还款、逾期等或有成本不进入正常履约测算，但会单独提示。",
      })),
    costFlags: {
      aboveLpr4x: realAnnualRate !== null && realAnnualRate > knowledgeBase.costRules.privateLendingProtectedAnnualRate,
      above20Percent: realAnnualRate !== null && realAnnualRate > 20,
      above24Percent: realAnnualRate !== null && realAnnualRate > 24,
    },
    calculationBasis: [
      "REG-001：贷款成本包括利息及直接相关费用，不能只看名义利率。",
      "REG-002/003：正常履约息费按现金流折算年化，逾期等列为或有成本。",
      "REG-006：月度资金成本可转为单利/复利年化，本结果默认展示单利年化。",
      `基础口径：不叠加正常履约费用，单利年化 ${baseRealAnnualRateSimple ?? "信息不足"}%，复利年化 ${baseRealAnnualRateCompound ?? "信息不足"}%。`,
      `综合口径：叠加已识别的正常履约费用，单利年化 ${comprehensiveRealAnnualRateSimple ?? "信息不足"}%，复利年化 ${comprehensiveRealAnnualRateCompound ?? "信息不足"}%。`,
      `REG-005：本地知识库 LPR 最近记录为 ${knowledgeBase.latestLpr.date}，1年期 ${knowledgeBase.latestLpr.oneYear}%。`,
      ...costEntries.map((entry) => `参考产品知识条目：${entry.id}`),
    ],
    missingFields,
    warnings,
  };

  return {
    ...calculationResult,
    additionalFees: totalFees || null,
    feeRatio: loanAmount !== null && totalFees > 0 ? roundRate((totalFees / loanAmount) * 100) : null,
    realAnnualRate,
    monthlyIrr: calculationResult.irrMonthly,
    nominalToRealRateMultiplier:
      nominalAnnualRate !== null && realAnnualRate !== null && nominalAnnualRate > 0
        ? roundRate(realAnnualRate / nominalAnnualRate)
        : null,
    costLevel: classifyCostLevel(realAnnualRate, thresholds.lowMax, thresholds.normalMax, thresholds.warningMax),
    assumptions,
    knowledgeTraining: {
      rootDir: knowledgeBase.rootDir,
      dictionaryTerms: countDictionaryTerms(knowledgeBase.dictionary),
      contractEntryCount: knowledgeBase.contractEntries.length,
      productEntryCount: knowledgeBase.productEntries.length,
      sourceFileCount: knowledgeBase.sourceFileCount,
      sourceCatalogCount: knowledgeBase.sourceCatalogCount,
      matchedProductEntries: costEntries.map((entry) => ({
        id: entry.id,
        title: entry.title ?? entry.product ?? entry.id,
      })),
      ruleSummary: [
        "字段别名与费用词典用于识别金额、期限、利率、还款方式和费用名称。",
        "合同知识库用于判断费用是否属于正常履约成本、提前还款或逾期等或有成本。",
        `LPR 阈值来自本地知识库最近记录：${knowledgeBase.latestLpr.date}，1年期 ${knowledgeBase.latestLpr.oneYear}%。`,
      ],
    },
  };
};

export const runCostCalculatorAgent = (parseResult: ContractParseResult): CostAnalysisOutput => {
  const assumptions = [
    "成本测算采用合同中的结构化字段，不使用大模型自由估算金额。",
  ];
  const warnings: string[] = [];

  if (parseResult.actualReceivedAmount.value !== null && parseResult.loanAmount.value !== null) {
    if (parseResult.actualReceivedAmount.value < parseResult.loanAmount.value) {
      warnings.push("实际到账金额低于合同本金，疑似存在放款前扣费/砍头息情形，真实成本已按实际到账金额计算。");
    }
  }

  const baseCashFlows = buildRepaymentFlows(parseResult, assumptions, warnings, false);
  const comprehensiveCashFlows = buildRepaymentFlows(parseResult, assumptions, warnings, true);
  return toCalculationResult(parseResult, baseCashFlows, comprehensiveCashFlows, assumptions, warnings);
};
