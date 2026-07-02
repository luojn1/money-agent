import { createAnalysisResult } from "../website/backend/src/services/analysisOrchestrator.js";
import { DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT, DEMO_TASK_ID } from "../website/backend/src/services/demoContract.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const result = createAnalysisResult({
  taskId: DEMO_TASK_ID,
  contractName: DEMO_CONTRACT_NAME,
  contractText: DEMO_CONTRACT_TEXT,
  documentIntake: {
    taskId: DEMO_TASK_ID,
    contractName: DEMO_CONTRACT_NAME,
    method: "demo",
    sourceFileName: null,
    mimeType: null,
    extractedTextLength: DEMO_CONTRACT_TEXT.length,
    extractedTextPreview: DEMO_CONTRACT_TEXT.slice(0, 180),
    usedOcr: false,
    confidence: 0.96,
    warnings: [],
  },
});

const parseResult = result.bAgentOutput.contractParseResult;
const costResult = result.costAnalysis;

assert(parseResult.loanAmount.value === 10_000, "合同解析应识别借款金额 10000 元");
assert(parseResult.actualReceivedAmount.value === 9_500, "合同解析应识别实际到账金额 9500 元");
assert(parseResult.installmentCount.value === 12, "合同解析应识别 12 期");
assert(parseResult.monthlyPayment.value === 940, "合同解析应识别每期还款 940 元");
assert(parseResult.fees.some((fee) => fee.name === "服务费" && fee.amount === 500 && fee.includedInNormalCost), "服务费应计入真实成本");
assert(parseResult.fees.some((fee) => fee.type === "prepayment_fee" && !fee.includedInNormalCost), "提前还款费用应作为或有成本");
assert(costResult.cashFlows[0]?.amount === 9_500, "第0期现金流应使用实际到账金额");
assert(costResult.totalRepayment === 11_280, "总还款金额应为 11280 元");
assert(costResult.realAnnualRate !== null && costResult.realAnnualRate > 32 && costResult.realAnnualRate < 34, "真实年化应落在 32%-34% 区间");
assert(costResult.knowledgeTraining.sourceFileCount >= 100, "知识库应包含完整原始资料文件");
assert(costResult.knowledgeTraining.sourceCatalogCount >= 100, "知识库来源目录应包含完整记录");

console.log(JSON.stringify({
  status: "ok",
  loanAmount: parseResult.loanAmount.value,
  actualReceivedAmount: parseResult.actualReceivedAmount.value,
  monthlyPayment: parseResult.monthlyPayment.value,
  realAnnualRate: costResult.realAnnualRate,
  knowledgeSourceFiles: costResult.knowledgeTraining.sourceFileCount,
  knowledgeCatalogRows: costResult.knowledgeTraining.sourceCatalogCount,
}, null, 2));
