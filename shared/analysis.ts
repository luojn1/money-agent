export type RiskLevel = "low" | "medium" | "high";
export type OverallLevel = "low" | "verify" | "high" | "insufficient_information";

export type ContractType =
  | "consumer_loan"
  | "cash_installment"
  | "bill_installment"
  | "merchant_installment"
  | "credit_card_installment"
  | "education_training_loan"
  | "unknown";

export type RepaymentMethodCode =
  | "equal_installment"
  | "equal_principal"
  | "interest_first_principal_later"
  | "bullet"
  | "equal_principal_fee"
  | "revolving_daily_interest"
  | "unknown";

export type RateUnit = "annual" | "month" | "day" | "period" | "unknown";
export type RateMethod = "simple" | "compound" | "unknown";

export type FeeType =
  | "service_fee"
  | "management_fee"
  | "consulting_fee"
  | "guarantee_fee"
  | "insurance_fee"
  | "installment_fee"
  | "prepayment_fee"
  | "overdue_penalty"
  | "other";

export type FeeRateUnit = "annual" | "month" | "day" | "period" | "once" | "unknown";
export type ChargeTiming =
  | "upfront_deducted"
  | "upfront_paid"
  | "first_period"
  | "per_period"
  | "on_prepayment"
  | "on_overdue"
  | "unknown";

export type ClauseType =
  | "fee"
  | "repayment"
  | "prepayment"
  | "overdue"
  | "autoDebit"
  | "privacy"
  | "contractChange"
  | "disputeResolution"
  | "purpose"
  | "rateAdjustment"
  | "guarantee"
  | "other";

export type ExtractedField<T> = {
  value: T | null;
  evidenceText: string;
  location: string | null;
  confidence: number;
};

export type DocumentIntakeMethod =
  | "demo"
  | "pasted_text"
  | "plain_text"
  | "docx_text"
  | "pdf_text_layer"
  | "image_ocr"
  | "unsupported_file";

export type DocumentIntakeResult = {
  taskId: string;
  contractName: string;
  method: DocumentIntakeMethod;
  sourceFileName: string | null;
  mimeType: string | null;
  fileSha256: string | null;
  pageCount: number | null;
  extractedTextLength: number;
  extractedTextPreview: string;
  usedOcr: boolean;
  confidence: number;
  warnings: string[];
};

export type MoneyField = ExtractedField<number> & {
  unit: "CNY";
};

export type BorrowerField = ExtractedField<string> & {
  masked: boolean;
};

export type NominalRateField = ExtractedField<number> & {
  unit: RateUnit;
  method: RateMethod;
};

export type ParsedFee = {
  name: string;
  type: FeeType;
  amount: number | null;
  rate: number | null;
  rateUnit: FeeRateUnit;
  chargeTiming: ChargeTiming;
  includedInNormalCost: boolean;
  chargedBy: string | null;
  evidenceText: string;
  location: string | null;
  confidence: number;
};

export type ParsedContractClause = {
  type: ClauseType;
  text: string;
  location: string | null;
  page: number | null;
  paragraph: number | null;
  startOffset: number | null;
  endOffset: number | null;
  confidence: number;
};

export type ContractParseResult = {
  taskId: string;
  contractName: string;
  contractType: ContractType;
  institution: ExtractedField<string>;
  borrower: BorrowerField;
  loanAmount: MoneyField;
  actualReceivedAmount: MoneyField;
  termMonths: ExtractedField<number>;
  installmentCount: ExtractedField<number>;
  repaymentMethod: ExtractedField<RepaymentMethodCode>;
  monthlyPayment: MoneyField;
  nominalRate: NominalRateField;
  fees: ParsedFee[];
  clauses: ParsedContractClause[];
  missingFields: string[];
  assumptions: string[];
  needsManualReview: boolean;
};

export type CashFlowItem = {
  period: number;
  amount: number;
  description: string;
  date: string | null;
};

export type CostLevel = "low" | "normal" | "warning" | "high" | "insufficient_information";

export type IncludedFee = {
  name: string;
  amount: number | null;
  reason: string;
};

export type ExcludedContingentCost = {
  name: string;
  amountOrFormula: string;
  reason: string;
};

export type CostFlags = {
  aboveLpr4x: boolean;
  above20Percent: boolean;
  above24Percent: boolean;
};

export type CostCalculationResult = {
  taskId: string;
  actualReceivedAmount: number | null;
  totalRepayment: number | null;
  totalInterest: number | null;
  totalFees: number | null;
  extraCost: number | null;
  irrMonthly: number | null;
  realAnnualRateSimple: number | null;
  realAnnualRateCompound: number | null;
  baseCashFlows: CashFlowItem[];
  baseIrrMonthly: number | null;
  baseRealAnnualRateSimple: number | null;
  baseRealAnnualRateCompound: number | null;
  comprehensiveCashFlows: CashFlowItem[];
  comprehensiveIrrMonthly: number | null;
  comprehensiveRealAnnualRateSimple: number | null;
  comprehensiveRealAnnualRateCompound: number | null;
  displayAnnualRateMethod: "simple" | "compound";
  cashFlows: CashFlowItem[];
  includedFees: IncludedFee[];
  excludedContingentCosts: ExcludedContingentCost[];
  costFlags: CostFlags;
  calculationBasis: string[];
  missingFields: string[];
  warnings: string[];
};

export type CostAnalysisOutput = CostCalculationResult & {
  additionalFees: number | null;
  feeRatio: number | null;
  realAnnualRate: number | null;
  monthlyIrr: number | null;
  nominalToRealRateMultiplier: number | null;
  costLevel: CostLevel;
  assumptions: string[];
  knowledgeTraining: {
    rootDir: string;
    dictionaryTerms: number;
    contractEntryCount: number;
    productEntryCount: number;
    sourceFileCount: number;
    sourceCatalogCount: number;
    matchedProductEntries: Array<{
      id: string;
      title: string;
    }>;
    ruleSummary: string[];
  };
};

export type AnalysisResult = {
  schemaVersion: "1.0.0";
  taskId: string;
  contractId: string;
  status: "completed";
  runtimeMode: "LOCAL_PREVIEW" | "INTEGRATED";
  localPreview: {
    enabled: boolean;
    simulatedAgents: Array<"risk_case" | "recommendation_action">;
    note: string;
  };
  generatedAt: string;
  contractName: string;
  documentIntake: DocumentIntakeResult;
  bAgentOutput: {
    documentIntakeResult: DocumentIntakeResult;
    contractParseResult: ContractParseResult;
    costCalculationResult: CostAnalysisOutput;
  };
  contractSummary: {
    institution: string | null;
    productType: string | null;
    loanAmount: number | null;
    actualReceivedAmount: number | null;
    loanTermMonths: number | null;
    installmentCount: number | null;
    monthlyPayment: number | null;
    repaymentMethod: string | null;
    nominalRate: number | null;
    prepaymentRule: string | null;
    overdueFee: string | null;
  };
  costAnalysis: CostAnalysisOutput;
  riskItems: Array<{
    id: string;
    title: string;
    riskLevel: RiskLevel;
    clauseText: string;
    clauseLocation: string | null;
    reason: string;
    possibleConsequence: string;
    questionToAsk: string;
  }>;
  overallResult: {
    level: OverallLevel;
    summary: string;
  };
  questionList: string[];
  completedWithWarnings: boolean;
  warnings: Array<{
    code: string;
    message: string;
    fieldPath: string | null;
  }>;
  recommendations: Array<{
    id: string;
    priority: "must" | "should" | "optional";
    action: string;
    rationale: string;
    timing: "before_signing" | "during_repayment" | "when_overdue" | "anytime";
    relatedRiskIds: string[];
  }>;
  sourceAgentRuns: Array<{
    agent: "contract_cost" | "risk_case" | "recommendation_action";
    runId: string;
    agentVersion: string;
    status: "completed" | "partial" | "failed";
  }>;
};

export type AnalysisTaskStatus = {
  schemaVersion: "1.0.0";
  taskId: string;
  contractId: string;
  status: "processing" | "completed" | "failed";
  currentStage: "queued" | "contract_cost" | "risk_case" | "recommendation_action" | "completed" | "failed";
  currentStep: number;
  progress: number;
  contractName: string;
  updatedAt: string;
  stages: Array<{
    agent: "contract_cost" | "risk_case" | "recommendation_action";
    status: "pending" | "processing" | "completed" | "partial" | "failed";
  }>;
};
