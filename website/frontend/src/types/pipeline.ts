import type { CostLevel, OverallLevel, RiskLevel } from "../../../../shared/analysis";
import type {
  AgentId,
  ContractCostOutput,
  ProtocolError,
  MatchedCase,
  RecommendationActionOutput,
  RiskCaseOutput,
  RiskCategory,
} from "../../../../shared/analysisProtocol";

export type AgentStepStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed";

export type PipelineMode = "mock" | "integrated" | "real_unconnected";

export type PipelineStep = {
  agent: AgentId;
  label: string;
  status: AgentStepStatus;
  message?: string;
};

export type PipelineTaskCreated = {
  schemaVersion: "1.0.0";
  taskId: string;
  contractId: string;
  status: "processing";
  mode?: PipelineMode;
  runtimeMode?: "INTEGRATED";
  createdAt: string;
};

export type PipelineStatus = {
  schemaVersion: "1.0.0";
  taskId: string;
  contractId: string;
  status: AgentStepStatus;
  mode: PipelineMode;
  runtimeMode?: "INTEGRATED";
  contractName: string;
  currentStage: AgentId | "queued" | "completed" | "failed";
  currentAgent?: AgentId | "queued" | "completed" | "failed";
  currentMessage: string;
  steps: PipelineStep[];
  updatedAt: string;
  error?: string;
  errors?: ProtocolError[];
};

export type DisplayAmount = number | null;

export type ContractOverview = {
  institution: string | null;
  productType: string | null;
  loanAmount: DisplayAmount;
  actualReceivedAmount: DisplayAmount;
  termMonths: number | null;
  installmentCount: number | null;
  monthlyPayment: DisplayAmount;
  nominalAnnualRate: number | null;
  realAnnualRate: number | null;
};

export type CostAnalysisView = {
  totalRepayment: DisplayAmount;
  totalInterest: DisplayAmount;
  additionalFees: DisplayAmount;
  baseMonthlyIrr?: number | null;
  baseRealAnnualRate?: number | null;
  baseRealAnnualRateCompound?: number | null;
  comprehensiveMonthlyIrr?: number | null;
  comprehensiveRealAnnualRate?: number | null;
  comprehensiveRealAnnualRateCompound?: number | null;
  includedFees?: Array<{ name: string; amount: number | null; reason: string }>;
  excludedContingentCosts?: Array<{ name: string; amountOrFormula: string; reason: string }>;
  principalGap: DisplayAmount;
  rateGap: number | null;
  costLevel: CostLevel;
  calculationBasis: string[];
};

export type PipelineRiskItem = {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  category: RiskCategory;
  categoryLabel: string;
  relatedClauseIds: string[];
  clauseText: string;
  clauseLocation: string | null;
  reason: string;
  possibleConsequence: string;
  questionToAsk: string;
  confidence?: number | null;
  matchedCases: MatchedCase[];
};

export type ReferenceItem = {
  id: string;
  title: string;
  tag: "演示案例" | "典型情景" | "规则参考" | "测算依据" | "产品参考";
  summary: string;
  sourceLabel?: string;
  sourceUrl?: string | null;
};

export type ReferenceGroup = {
  id: string;
  title: "相似案例" | "法规参考" | "成本测算依据" | "市场利率参考" | "产品参考";
  items: ReferenceItem[];
};

export type ActionStage =
  | "before_signing"
  | "during_repayment"
  | "before_prepayment"
  | "when_overdue"
  | "when_dispute";

export type ActionPriority = "must" | "should" | "optional";

export type ActionItem = {
  id: string;
  priority: ActionPriority;
  title: string;
  detail: string;
  stage: ActionStage;
  relatedRiskIds: string[];
};

export type ActionSection = {
  stage: ActionStage;
  title: "签约前" | "还款期间" | "提前还款前" | "出现逾期时" | "发生争议时";
  items: ActionItem[];
};

export type RecommendationActionView = {
  overallLevel: OverallLevel;
  summary: string;
  mustConfirm: ActionItem[];
  shouldConfirm: ActionItem[];
  optionalOptimizations: ActionItem[];
  questionList: string[];
  evidenceChecklist: string[];
  communicationScripts: string[];
  actionPlan: ActionSection[];
};

export type PipelineReport = {
  taskId: string;
  contractId: string;
  status: AgentStepStatus;
  mode: PipelineMode;
  runtimeMode?: "LOCAL_PREVIEW" | "INTEGRATED";
  generatedAt: string;
  steps: PipelineStep[];
  contractCost: ContractCostOutput | unknown;
  riskCase: RiskCaseOutput | unknown;
  recommendationAction: RecommendationActionOutput | unknown;
  actionPlan?: unknown;
  overview: ContractOverview;
  costAnalysis: CostAnalysisView;
  risks: PipelineRiskItem[];
  references: ReferenceGroup[];
  actions: RecommendationActionView;
  warnings: string[];
  errors?: ProtocolError[];
};
