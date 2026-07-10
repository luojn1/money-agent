// 在 shared/analysis.ts 的 AnalysisResult.contractSummary 中增加两个可选字段。
// 建议放在 productType 后面。

contractType?: ContractType | null;
scenarioSignals?: Array<{
  scenarioId: ContractType;
  scenarioName: string;
  confidence: number;
  matchedKeywords: string[];
  source: string;
}>;

