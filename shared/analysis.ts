export type RiskLevel = "low" | "medium" | "high";
export type OverallLevel = "low" | "verify" | "high" | "insufficient_information";

export type AnalysisResult = {
  taskId: string;
  status: "completed";
  contractName: string;
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
  costAnalysis: {
    totalRepayment: number | null;
    totalInterest: number | null;
    additionalFees: number | null;
    realAnnualRate: number | null;
  };
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
};

export type AnalysisTaskStatus = {
  taskId: string;
  status: "processing" | "completed";
  currentStep: number;
  progress: number;
  contractName: string;
};
