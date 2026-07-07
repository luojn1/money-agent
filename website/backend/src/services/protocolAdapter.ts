import type { AnalysisResult, ParsedContractClause } from "../../../../shared/analysis.js";
import {
  ANALYSIS_PROTOCOL_VERSION,
  type ContractClause,
  type ContractCostOutput,
  type ProtocolError,
  type ProtocolWarning,
  type RepaymentScheduleItem,
  type SourceLocation,
} from "../../../../shared/analysisProtocol.js";
import type { AnalysisTask } from "./taskStore.js";
import { toProtocolDateTime } from "./taskStore.js";

const sourceLocation = (section: string | null): SourceLocation => ({
  page: null,
  section,
  paragraph: null,
});

const clauseCategory = (clause: ParsedContractClause) => {
  const categories: Record<ParsedContractClause["type"], string> = {
    fee: "interest_fee",
    repayment: "repayment",
    prepayment: "prepayment",
    overdue: "overdue",
    autoDebit: "authorization_privacy",
    purpose: "other",
    rateAdjustment: "interest_fee",
    guarantee: "other",
    other: "other",
  };
  return categories[clause.type];
};

const stableClauseId = (clause: ParsedContractClause, index: number) =>
  `clause_${String(index + 1).padStart(3, "0")}_${clause.type}`;

const toProtocolClauses = (clauses: ParsedContractClause[]): ContractClause[] =>
  clauses.map((clause, index) => ({
    clauseId: stableClauseId(clause, index),
    category: clauseCategory(clause),
    heading: clause.location,
    text: clause.text,
    location: sourceLocation(clause.location),
  }));

const toRepaymentSchedule = (result: AnalysisResult): RepaymentScheduleItem[] =>
  result.costAnalysis.cashFlows
    .filter((flow) => flow.period > 0)
    .map((flow) => ({
      period: flow.period,
      dueDate: flow.date,
      principal: null,
      interest: null,
      fees: null,
      payment: flow.amount < 0 ? Math.abs(flow.amount) : flow.amount,
    }));

const toProtocolWarnings = (result: AnalysisResult): ProtocolWarning[] => [
  ...result.warnings,
  ...result.bAgentOutput.contractParseResult.missingFields.map((field) => ({
    code: "missing_contract_field",
    message: `Missing or low-confidence contract field: ${field}`,
    fieldPath: `data.contractSummary.${field}`,
  })),
  ...result.costAnalysis.missingFields.map((field) => ({
    code: "missing_cost_field",
    message: `Missing field for cost calculation: ${field}`,
    fieldPath: `data.costAnalysis.${field}`,
  })),
];

export const createContractCostOutput = (task: AnalysisTask, result: AnalysisResult): ContractCostOutput => {
  const warnings = toProtocolWarnings(result);
  const parseResult = result.bAgentOutput.contractParseResult;
  const costAnalysis = result.costAnalysis;
  const noRecognizedText = !task.contractText.trim();
  const errors: ProtocolError[] = noRecognizedText
    ? [
        {
          code: "document_intake_failed",
          message: "No usable contract text was recognized from the upload or pasted input.",
          fieldPath: "documentIntake.extractedTextLength",
          recoverable: true,
        },
      ]
    : [];

  return {
    schemaVersion: ANALYSIS_PROTOCOL_VERSION,
    taskId: task.taskId,
    contractId: task.contractId,
    runId: `run_contract_cost_${task.taskId}`,
    agent: "contract_cost",
    agentVersion: "b-0.1.0",
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "partial" : "completed",
    generatedAt: toProtocolDateTime(),
    inputRunIds: [],
    data: {
      contract: {
        contractName: task.contractName,
        fileSha256: task.documentIntake.fileSha256,
        pageCount: task.documentIntake.pageCount,
      },
      contractSummary: result.contractSummary,
      clauses: toProtocolClauses(parseResult.clauses),
      repaymentSchedule: toRepaymentSchedule(result),
      costAnalysis: {
        totalRepayment: costAnalysis.totalRepayment,
        totalInterest: costAnalysis.totalInterest,
        additionalFees: costAnalysis.additionalFees,
        realAnnualRate: costAnalysis.realAnnualRate,
        calculationBasis: costAnalysis.calculationBasis.length
          ? costAnalysis.calculationBasis
          : ["Cost calculation is based on recognized contract fields and repayment cash flows."],
      },
    },
    warnings,
    errors,
  };
};
