import type { AnalysisResult, OverallLevel, RiskLevel } from "./analysis.js";

export const ANALYSIS_PROTOCOL_VERSION = "1.0.0" as const;

export type AgentId = "contract_cost" | "risk_case" | "recommendation_action";
export type AgentStatus = "completed" | "partial" | "failed";
export type RiskCategory =
  | "cost_transparency"
  | "interest_fee"
  | "repayment"
  | "prepayment"
  | "overdue"
  | "authorization_privacy"
  | "dispute_resolution"
  | "other";

export type ProtocolWarning = {
  code: string;
  message: string;
  fieldPath: string | null;
};

export type ProtocolError = ProtocolWarning & {
  recoverable: boolean;
};

export type SourceLocation = {
  page: number | null;
  section: string | null;
  paragraph: number | null;
};

export type Evidence = {
  evidenceId: string;
  clauseId: string;
  quote: string;
  location: SourceLocation;
  evidenceStart?: number | null;
  evidenceEnd?: number | null;
};

export type AgentEnvelope<TAgent extends AgentId, TData> = {
  schemaVersion: typeof ANALYSIS_PROTOCOL_VERSION;
  taskId: string;
  contractId: string;
  runId: string;
  agent: TAgent;
  agentVersion: string;
  status: AgentStatus;
  generatedAt: string;
  inputRunIds: string[];
  data: TData | null;
  warnings: ProtocolWarning[];
  errors: ProtocolError[];
};

export type ScenarioSignal = {
  scenarioId:
    | "consumer_loan"
    | "cash_installment"
    | "bill_installment"
    | "merchant_installment"
    | "credit_card_installment"
    | "education_training_loan"
    | "unknown";
  scenarioName: string;
  confidence: number;
  matchedKeywords: string[];
  source: string;
};

export type ContractClause = {
  clauseId: string;
  category: string;
  heading: string | null;
  text: string;
  location: SourceLocation;
  evidenceStart?: number | null;
  evidenceEnd?: number | null;
};

export type RepaymentScheduleItem = {
  period: number;
  dueDate: string | null;
  principal: number | null;
  interest: number | null;
  fees: number | null;
  payment: number | null;
};

export type ContractCostAnalysisV1 = {
  totalRepayment: number | null;
  totalInterest: number | null;
  additionalFees: number | null;
  realAnnualRate: number | null;
  baseRealAnnualRate: number | null;
  baseMonthlyIrr: number | null;
  baseRealAnnualRateCompound: number | null;
  comprehensiveRealAnnualRate: number | null;
  comprehensiveMonthlyIrr: number | null;
  comprehensiveRealAnnualRateCompound: number | null;
  includedFees: AnalysisResult["costAnalysis"]["includedFees"];
  excludedContingentCosts: AnalysisResult["costAnalysis"]["excludedContingentCosts"];
  calculationBasis: string[];
};

export type ContractCostData = {
  contract: {
    contractName: string;
    fileSha256: string | null;
    pageCount: number | null;
  };
  contractSummary: AnalysisResult["contractSummary"] & {
    contractType?: string | null;
    scenarioSignals?: ScenarioSignal[];
  };
  clauses: ContractClause[];
  repaymentSchedule: RepaymentScheduleItem[];
  costAnalysis: ContractCostAnalysisV1;
};

export type ContractCostOutput = AgentEnvelope<"contract_cost", ContractCostData>;

export type MatchedCase = {
  caseId: string;
  title: string;
  similarity: number | null;
  conclusion: string;
  sourceUrl: string | null;
};

export type RiskItemV1 = {
  id: string;
  title: string;
  category: RiskCategory;
  riskLevel: RiskLevel;
  confidence: number | null;
  clauseText: string;
  clauseLocation: string | null;
  relatedClauseIds: string[];
  evidence: Evidence[];
  reason: string;
  possibleConsequence: string;
  matchedCases: MatchedCase[];
  questionToAsk: string;
};

export type RiskCaseData = {
  riskItems: RiskItemV1[];
  riskSummary: {
    high: number;
    medium: number;
    low: number;
  };
};

export type RiskCaseOutput = AgentEnvelope<"risk_case", RiskCaseData>;

export type Recommendation = {
  id: string;
  priority: "must" | "should" | "optional";
  action: string;
  rationale: string;
  timing: "before_signing" | "during_repayment" | "when_overdue" | "anytime";
  relatedRiskIds: string[];
};

export type RecommendationActionData = {
  overallResult: {
    level: OverallLevel;
    summary: string;
  };
  recommendations: Recommendation[];
  questionList: string[];
  disclaimer: string;
};

export type RecommendationActionOutput = AgentEnvelope<
  "recommendation_action",
  RecommendationActionData
>;

export type AgentRunSummary = {
  agent: AgentId;
  runId: string;
  agentVersion: string;
  status: AgentStatus;
};

export type AnalysisTaskCreatedV1 = {
  schemaVersion: typeof ANALYSIS_PROTOCOL_VERSION;
  taskId: string;
  contractId: string;
  status: "processing";
  createdAt: string;
};

export type AnalysisStageStatus = {
  agent: AgentId;
  status: "pending" | "processing" | AgentStatus;
};

export type AnalysisTaskStatusV1 = {
  schemaVersion: typeof ANALYSIS_PROTOCOL_VERSION;
  taskId: string;
  contractId: string;
  status: "processing" | "completed" | "failed";
  currentStage: "queued" | AgentId | "completed" | "failed";
  currentStep: number;
  progress: number;
  contractName: string;
  updatedAt: string;
  stages: AnalysisStageStatus[];
};

export type FinalAnalysisResultV1 = AnalysisResult & {
  schemaVersion: typeof ANALYSIS_PROTOCOL_VERSION;
  generatedAt: string;
  completedWithWarnings: boolean;
  warnings: ProtocolWarning[];
  recommendations: Recommendation[];
  sourceAgentRuns: AgentRunSummary[];
};

export type AnalysisProtocolMessage =
  | AnalysisTaskCreatedV1
  | AnalysisTaskStatusV1
  | ContractCostOutput
  | RiskCaseOutput
  | RecommendationActionOutput
  | FinalAnalysisResultV1;

