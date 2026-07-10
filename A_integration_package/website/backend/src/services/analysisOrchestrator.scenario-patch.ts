// 在 website/backend/src/services/analysisOrchestrator.ts 中合并以下改动。

// 1. import 增加：
import { detectScenarioFromText } from "./scenarioDetector.js";

// 2. contractTypeLabel 的 labels 增加两个新场景：
const labels = {
  consumer_loan: "个人消费贷款",
  cash_installment: "信用卡现金分期",
  bill_installment: "信用卡账单分期",
  merchant_installment: "商户/商品分期",
  credit_card_installment: "信用卡分期",
  education_training_loan: "教育培训贷",
  unknown: "未识别合同类型",
} satisfies Record<typeof contractType, string>;

// 3. createAnalysisResult 中，在 return 前增加：
const scenarioSignal = detectScenarioFromText(input.contractText);

// 4. createAnalysisResult 返回对象的 contractSummary 中增加：
contractType: contractParseResult.contractType,
scenarioSignals: [
  {
    scenarioId: scenarioSignal.scenarioId,
    scenarioName: scenarioSignal.productType,
    confidence: scenarioSignal.confidence,
    matchedKeywords: scenarioSignal.matchedKeywords,
    source: "B.contractParserAgent.contractText",
  },
],

