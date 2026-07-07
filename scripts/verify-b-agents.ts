import { createAnalysisResult } from "../website/backend/src/services/analysisOrchestrator.js";
import { DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT, DEMO_TASK_ID } from "../website/backend/src/services/demoContract.js";
import { runDocumentIntakeAgent } from "../website/backend/src/services/documentIntakeAgent.js";
import { createContractCostOutput } from "../website/backend/src/services/protocolAdapter.js";
import type { AnalysisTask } from "../website/backend/src/services/taskStore.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const demoTask: AnalysisTask = {
  taskId: DEMO_TASK_ID,
  contractId: "contract_001",
  startedAt: Date.now(),
  contractName: DEMO_CONTRACT_NAME,
  contractText: DEMO_CONTRACT_TEXT,
  documentIntake: {
    taskId: DEMO_TASK_ID,
    contractName: DEMO_CONTRACT_NAME,
    method: "demo",
    sourceFileName: null,
    mimeType: null,
    fileSha256: null,
    pageCount: null,
    extractedTextLength: DEMO_CONTRACT_TEXT.length,
    extractedTextPreview: DEMO_CONTRACT_TEXT.slice(0, 180),
    usedOcr: false,
    confidence: 0.96,
    warnings: [],
  },
};

const result = createAnalysisResult(demoTask);
const contractCostOutput = createContractCostOutput(demoTask, result);

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

assert(contractCostOutput.schemaVersion === "1.0.0", "B output should use protocol v1.0.0");
assert(contractCostOutput.agent === "contract_cost", "B output should use contract_cost agent id");
assert(contractCostOutput.contractId === "contract_001", "B output should carry contractId");
assert(contractCostOutput.data?.clauses.every((clause) => clause.clauseId.startsWith("clause_")), "B output clauses should have stable clauseId");
assert(contractCostOutput.data?.costAnalysis.calculationBasis.length, "B output should expose calculation basis");
assert(contractCostOutput.data?.contractSummary, "B output should include contractSummary");
assert(contractCostOutput.data?.clauses, "B output should include clauses");
assert(contractCostOutput.data?.costAnalysis, "B output should include costAnalysis");
assert(contractCostOutput.warnings, "B output should include warnings array");
assert(contractCostOutput.errors, "B output should include errors array");

assert(result.runtimeMode === "LOCAL_PREVIEW", "Result should expose LOCAL_PREVIEW mode");
assert(result.localPreview.simulatedAgents.includes("risk_case"), "Result should mark C risk output as local preview");
assert(result.localPreview.simulatedAgents.includes("recommendation_action"), "Result should mark D recommendation output as local preview");
assert(result.sourceAgentRuns.some((run) => run.agent === "risk_case" && run.agentVersion.startsWith("local-preview")), "C run should be marked as local-preview");
assert(result.sourceAgentRuns.some((run) => run.agent === "recommendation_action" && run.agentVersion.startsWith("local-preview")), "D run should be marked as local-preview");

const emptyIntake = await runDocumentIntakeAgent({ taskId: "task_empty_input" });
assert(emptyIntake.contractText === "", "Empty upload should not fall back to the demo contract");
assert(emptyIntake.intakeResult.method !== "demo", "Only POST /api/analysis/demo may create demo intake");
assert(emptyIntake.intakeResult.warnings.some((warning) => warning.includes("/api/analysis/demo")), "Empty upload should explain the demo-only path");

console.log(JSON.stringify({
  status: "ok",
  loanAmount: parseResult.loanAmount.value,
  actualReceivedAmount: parseResult.actualReceivedAmount.value,
  monthlyPayment: parseResult.monthlyPayment.value,
  realAnnualRate: costResult.realAnnualRate,
  protocolVersion: contractCostOutput.schemaVersion,
  protocolAgent: contractCostOutput.agent,
  protocolClauseCount: contractCostOutput.data?.clauses.length,
  runtimeMode: result.runtimeMode,
  knowledgeSourceFiles: costResult.knowledgeTraining.sourceFileCount,
  knowledgeCatalogRows: costResult.knowledgeTraining.sourceCatalogCount,
}, null, 2));
