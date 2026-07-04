import type { AnalysisResult, DocumentIntakeResult, RiskLevel } from "../../../../shared/analysis.js";
import { ANALYSIS_PROTOCOL_VERSION } from "../../../../shared/analysisProtocol.js";
import { runContractParserAgent } from "./contractParserAgent.js";
import { runCostCalculatorAgent } from "./costCalculatorAgent.js";
import { toProtocolDateTime } from "./taskStore.js";

type AnalysisInput = {
  taskId: string;
  contractId: string;
  contractName: string;
  contractText: string;
  documentIntake: DocumentIntakeResult;
};

const contractTypeLabel = (contractType: AnalysisResult["bAgentOutput"]["contractParseResult"]["contractType"]) => {
  const labels = {
    consumer_loan: "个人消费贷款",
    cash_installment: "信用卡现金分期",
    bill_installment: "信用卡账单分期",
    merchant_installment: "商户/商品分期",
    unknown: "未识别合同类型",
  } satisfies Record<typeof contractType, string>;
  return labels[contractType];
};

const repaymentMethodLabel = (method: string | null) => {
  const labels: Record<string, string> = {
    equal_installment: "等额本息/按月等额还款",
    equal_principal: "等额本金",
    interest_first_principal_later: "先息后本",
    bullet: "到期一次还本付息",
    equal_principal_fee: "等本等费/等本等息",
    revolving_daily_interest: "随借随还/按日计息",
    unknown: "未识别还款方式",
  };
  return method ? labels[method] ?? method : null;
};

const findClauseText = (
  result: AnalysisResult["bAgentOutput"]["contractParseResult"],
  type: "prepayment" | "overdue" | "autoDebit" | "fee",
) => result.clauses.find((clause) => clause.type === type)?.text ?? null;

const riskFromCost = (level: AnalysisResult["costAnalysis"]["costLevel"]): RiskLevel => {
  if (level === "high") return "high";
  if (level === "warning" || level === "normal") return "medium";
  return "low";
};

const buildRiskItems = (analysis: Pick<AnalysisResult, "bAgentOutput" | "costAnalysis">): AnalysisResult["riskItems"] => {
  const parseResult = analysis.bAgentOutput.contractParseResult;
  const costResult = analysis.costAnalysis;
  const riskItems: AnalysisResult["riskItems"] = [];
  const realAnnualRate = costResult.realAnnualRate;
  const feeClause = findClauseText(parseResult, "fee");
  const prepaymentClause = findClauseText(parseResult, "prepayment");
  const autoDebitClause = findClauseText(parseResult, "autoDebit");

  if (realAnnualRate !== null && costResult.costLevel !== "low") {
    riskItems.push({
      id: "real-annual-rate",
      title: "真实年化成本需重点核实",
      riskLevel: riskFromCost(costResult.costLevel),
      clauseText: costResult.calculationBasis.join("；"),
      clauseLocation: "真实成本测算",
      reason: `按实际现金流测算，真实年化约为 ${realAnnualRate.toFixed(2)}%，与合同展示口径可能存在差异。`,
      possibleConsequence: "用户只看名义利率时，可能低估综合融资成本。",
      questionToAsk: "请机构确认该产品对外明示年化是否已包含所有利息和直接相关费用。",
    });
  }

  if (feeClause || parseResult.actualReceivedAmount.value !== parseResult.loanAmount.value) {
    riskItems.push({
      id: "hidden-fees",
      title: "费用可能抬高实际成本",
      riskLevel: parseResult.fees.some((fee) => fee.chargeTiming === "upfront_deducted") ? "high" : "medium",
      clauseText: feeClause ?? parseResult.actualReceivedAmount.evidenceText,
      clauseLocation: parseResult.fees[0]?.location ?? parseResult.actualReceivedAmount.location,
      reason: "知识库规则要求服务费、管理费、咨询费、担保费等正常履约费用进入成本测算，不能只看名义利率。",
      possibleConsequence: "名义本金和实际到账金额不一致时，真实年化会被抬高。",
      questionToAsk: "这些费用是否为获得贷款必须支付，是否已计入明示的综合融资成本？",
    });
  }

  if (prepaymentClause) {
    riskItems.push({
      id: "prepayment-fee",
      title: "提前还款费用为或有成本",
      riskLevel: "medium",
      clauseText: prepaymentClause,
      clauseLocation: parseResult.clauses.find((clause) => clause.type === "prepayment")?.location ?? null,
      reason: "提前还款手续费不是正常按期还款时一定发生的支出，但一旦提前结清，就会影响实际节省下来的利息。",
      possibleConsequence: "未来想提前结清时，节省的利息可能被手续费抵消。",
      questionToAsk: "提前还款手续费是否有减免条件，已经收取的服务费是否退还？",
    });
  }

  if (autoDebitClause) {
    riskItems.push({
      id: "auto-debit",
      title: "自动扣款授权需确认边界",
      riskLevel: "medium",
      clauseText: autoDebitClause,
      clauseLocation: parseResult.clauses.find((clause) => clause.type === "autoDebit")?.location ?? null,
      reason: "合同中出现自动扣款或不可撤销授权表述，需要确认扣款账户、授权期限、取消方式和异常扣款处理规则是否清楚。",
      possibleConsequence: "若扣款授权边界不清，可能出现取消授权困难或重复扣款争议。",
      questionToAsk: "自动扣款授权能否取消或更换银行卡，扣款失败/重复扣款如何处理？",
    });
  }

  return riskItems;
};

const overallLevel = (analysis: Pick<AnalysisResult, "costAnalysis">): AnalysisResult["overallResult"]["level"] => {
  if (analysis.costAnalysis.missingFields.length > 0) return "insufficient_information";
  if (analysis.costAnalysis.costLevel === "high") return "high";
  if (analysis.costAnalysis.costLevel === "warning" || analysis.costAnalysis.costLevel === "normal") return "verify";
  return "low";
};

const buildSummary = (analysis: Pick<AnalysisResult, "costAnalysis" | "bAgentOutput">) => {
  const realAnnualRate = analysis.costAnalysis.realAnnualRate;
  const feeCount = analysis.bAgentOutput.contractParseResult.fees.length;
  if (analysis.costAnalysis.missingFields.length > 0) {
    return `合同关键信息不完整，暂缺 ${analysis.costAnalysis.missingFields.join("、")}，建议补充后再测算真实成本。`;
  }
  if (realAnnualRate === null) return "合同成本信息不足，暂时无法测算真实年化。";

  return `按合同现金流测算，真实年化约为 ${realAnnualRate.toFixed(2)}%，已识别 ${feeCount} 项费用/或有费用，请重点核实费用是否已完整明示。`;
};

export const createAnalysisResult = (input: AnalysisInput): AnalysisResult => {
  const contractParseResult = runContractParserAgent(input);
  const costAnalysis = runCostCalculatorAgent(contractParseResult);
  const bAgentOutput = {
    documentIntakeResult: input.documentIntake,
    contractParseResult,
    costCalculationResult: costAnalysis,
  };
  const riskItems = buildRiskItems({ bAgentOutput, costAnalysis });
  const protocolWarnings = [
    ...input.documentIntake.warnings.map((message, index) => ({
      code: `document_intake_${index + 1}`,
      message,
      fieldPath: "documentIntake.warnings",
    })),
    ...contractParseResult.missingFields.map((field) => ({
      code: "missing_contract_field",
      message: `Missing or low-confidence contract field: ${field}`,
      fieldPath: `bAgentOutput.contractParseResult.${field}`,
    })),
    ...costAnalysis.warnings.map((message, index) => ({
      code: `cost_calculation_${index + 1}`,
      message,
      fieldPath: "costAnalysis.warnings",
    })),
  ];
  const agentStatus = protocolWarnings.length > 0 ? "partial" : "completed";

  return {
    schemaVersion: ANALYSIS_PROTOCOL_VERSION,
    taskId: input.taskId,
    contractId: input.contractId,
    status: "completed",
    generatedAt: toProtocolDateTime(),
    contractName: input.contractName,
    documentIntake: input.documentIntake,
    bAgentOutput,
    contractSummary: {
      institution: contractParseResult.institution.value,
      productType: contractTypeLabel(contractParseResult.contractType),
      loanAmount: contractParseResult.loanAmount.value,
      actualReceivedAmount: contractParseResult.actualReceivedAmount.value,
      loanTermMonths: contractParseResult.termMonths.value,
      installmentCount: contractParseResult.installmentCount.value,
      monthlyPayment: contractParseResult.monthlyPayment.value,
      repaymentMethod: repaymentMethodLabel(contractParseResult.repaymentMethod.value),
      nominalRate: contractParseResult.nominalRate.unit === "annual" ? contractParseResult.nominalRate.value : null,
      prepaymentRule: findClauseText(contractParseResult, "prepayment"),
      overdueFee: findClauseText(contractParseResult, "overdue"),
    },
    costAnalysis,
    riskItems,
    overallResult: {
      level: overallLevel({ costAnalysis }),
      summary: buildSummary({ costAnalysis, bAgentOutput }),
    },
    questionList: riskItems.length
      ? riskItems.map((item) => item.questionToAsk)
      : ["请机构提供完整还款计划、费用明细和明示年化利率说明。"],
    completedWithWarnings: protocolWarnings.length > 0,
    warnings: protocolWarnings,
    recommendations: riskItems.map((item, index) => ({
      id: `rec_${index + 1}_${item.id}`,
      priority: item.riskLevel === "high" ? "must" : item.riskLevel === "medium" ? "should" : "optional",
      action: item.questionToAsk,
      rationale: item.reason,
      timing: "before_signing",
      relatedRiskIds: [item.id],
    })),
    sourceAgentRuns: [
      {
        agent: "contract_cost",
        runId: `run_contract_cost_${input.taskId}`,
        agentVersion: "b-0.1.0",
        status: agentStatus,
      },
      {
        agent: "risk_case",
        runId: `run_risk_case_${input.taskId}`,
        agentVersion: "local-preview-0.1.0",
        status: "completed",
      },
      {
        agent: "recommendation_action",
        runId: `run_recommendation_action_${input.taskId}`,
        agentVersion: "local-preview-0.1.0",
        status: "completed",
      },
    ],
  };
};
