import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCostCalculatorAgent } from "../website/backend/src/services/costCalculatorAgent.js";
import { runContractParserAgent } from "../website/backend/src/services/contractParserAgent.js";
import { runDocumentIntakeAgent } from "../website/backend/src/services/documentIntakeAgent.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertClose = (actual: number | null, expected: number, tolerance: number, message: string) => {
  assert(actual !== null && Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const fixturePath = join(projectRoot, "tests", "fixtures", "测试消费借款合同_系统验收样本.pdf");
const taskId = `regression_pdf_${Date.now().toString(36)}`;
process.env.RUNTIME_ROOT = join(projectRoot, ".runtime", `regression_${Date.now().toString(36)}`);
process.env.PIPELINE_DEBUG_TRACE = "1";

const { createRuntimeDir, runIntegratedPipeline } = await import("../website/backend/src/services/pipelineOrchestrator.js");
const { createPipelineTask, getPipelineTask } = await import("../website/backend/src/services/pipelineTaskStore.js");

const buffer = await readFile(fixturePath);
const file = {
  originalname: "测试消费借款合同_系统验收样本.pdf",
  mimetype: "application/pdf",
  buffer,
};

const intake = await runDocumentIntakeAgent({ taskId, file });
assert(intake.intakeResult.pageCount === 5, "PDF intake should preserve the 5-page text layer");
assert(intake.contractText.includes("第十一条 争议解决"), "PDF intake should include later-page dispute clauses");

const parseResult = runContractParserAgent({
  taskId,
  contractName: intake.contractName,
  contractText: intake.contractText,
});
assert(parseResult.loanAmount.value === 10_000, "Should extract loan principal");
assert(parseResult.actualReceivedAmount.value === 9_500, "Should extract actual received amount");
assert(parseResult.installmentCount.value === 12, "Should extract installment count");
assert(parseResult.monthlyPayment.value === 889.19, "Should extract monthly payment");
assert(parseResult.fees.some((fee) => fee.name === "服务费" && fee.amount === 500 && fee.chargeTiming === "upfront_deducted"), "Should extract upfront deducted service fee");
assert(parseResult.fees.some((fee) => fee.name === "管理费" && fee.amount === 10 && fee.chargeTiming === "per_period"), "Should extract monthly account management fee");
assert(parseResult.fees.some((fee) => fee.name === "短信提醒费" && fee.amount === 3 && fee.chargeTiming === "per_period"), "Should extract monthly SMS reminder fee");
assert(parseResult.fees.some((fee) => fee.name === "借款保障服务费" && fee.amount === 120 && fee.chargeTiming === "first_period"), "Should extract first-period protection service fee");
assert(parseResult.clauses.some((clause) => clause.type === "privacy" && clause.page === 3), "Should expose privacy clauses to C input");
assert(parseResult.clauses.some((clause) => clause.type === "disputeResolution" && clause.page === 5), "Should expose dispute clauses to C input");

const cost = runCostCalculatorAgent(parseResult);
assertClose(cost.baseIrrMonthly === null ? null : cost.baseIrrMonthly * 100, 1.8341, 0.01, "Base monthly IRR should match acceptance");
assertClose(cost.baseRealAnnualRateSimple, 22.01, 0.1, "Base simple annual rate should match acceptance");
assertClose(cost.baseRealAnnualRateCompound, 24.37, 0.1, "Base compound annual rate should match acceptance");
assertClose(cost.comprehensiveIrrMonthly === null ? null : cost.comprehensiveIrrMonthly * 100, 2.2735, 0.01, "Comprehensive monthly IRR should match acceptance");
assertClose(cost.comprehensiveRealAnnualRateSimple, 27.28, 0.1, "Comprehensive simple annual rate should match acceptance");
assertClose(cost.comprehensiveRealAnnualRateCompound, 30.97, 0.1, "Comprehensive compound annual rate should match acceptance");
assert(cost.cashFlows[1]?.amount === -1022.19, "First comprehensive repayment should include monthly fees and first-period fee");
assert(cost.cashFlows[2]?.amount === -902.19, "Second comprehensive repayment should include recurring monthly fees");

const pipelineTask = createPipelineTask({
  taskId,
  contractName: file.originalname,
  runtimeDir: createRuntimeDir(taskId),
});
await runIntegratedPipeline(pipelineTask.taskId, { file });
const completed = getPipelineTask(taskId);
assert(completed?.result, "Pipeline should produce a report");
assert(completed.status === "partial", "Any partial upstream agent should keep final report status partial");

const report = completed.result as any;
assert(report.status === "partial", "Report payload should remain partial");
assert(report.overview.realAnnualRate === 27.28, "Report overview should use comprehensive real annual rate");
assert(report.costAnalysis.baseRealAnnualRate === 22.01, "Report should expose base annual cost");
assert(report.costAnalysis.comprehensiveRealAnnualRate === 27.28, "Report should expose comprehensive annual cost");
assert(report.risks.length >= 25, "Pipeline should cover the major independent risk categories");

const bClauses = new Map((report.contractCost.data?.clauses ?? []).map((clause: any) => [clause.clauseId, clause]));
for (const risk of report.risks) {
  const relatedTexts = risk.relatedClauseIds.map((id: string) => bClauses.get(id)?.text).filter(Boolean);
  assert(relatedTexts.includes(risk.clauseText), `${risk.id} clauseText should come from a related B clause`);
  for (const evidence of risk.evidence ?? []) {
    const clause = bClauses.get(evidence.clauseId);
    assert(clause, `${risk.id} evidence should reference an existing B clause`);
    assert(clause.text.includes(evidence.quote), `${risk.id} evidence quote should be in the referenced clause`);
  }
}

const riskKeys = report.risks.map((risk: any) => `${risk.category}:${risk.title}:${risk.relatedClauseIds.join("|")}`);
assert(new Set(riskKeys).size === riskKeys.length, "Risk output should not contain exact duplicate facts");

for (const risk of report.risks) {
  const caseIds = risk.matchedCases.map((item: any) => item.caseId);
  assert(new Set(caseIds).size === caseIds.length, `${risk.id} should not repeat matched case IDs`);
}
const similarCases = report.references.find((group: any) => group.id === "similar_cases")?.items ?? [];
const referenceCaseIds = similarCases.map((item: any) => item.id);
assert(new Set(referenceCaseIds).size === referenceCaseIds.length, "Reference cases should be deduplicated by caseId");

const expectedTitles = [
  "服务费一次性扣除",
  "管理费未纳入成本",
  "提前还款需审批",
  "高额违约金",
  "单方变更条款",
  "管辖法院不便利",
  "个人信息收集过度",
  "电子送达范围过宽",
  "旧联系方式视为有效送达",
  "超额转款不视为提前还款",
];
for (const title of expectedTitles) {
  assert(report.risks.some((risk: any) => risk.title === title), `Missing expected risk: ${title}`);
}

const debugDir = join(projectRoot, "debug", taskId);
for (const fileName of [
  "01_parsed_contract.json",
  "02_extracted_fields.json",
  "03_cost_agent_input.json",
  "04_cost_agent_output.json",
  "05_risk_agent_input.json",
  "06_risk_agent_output.json",
  "07_retrieval_results.json",
  "08_action_agent_input.json",
  "09_action_agent_output.json",
  "10_final_report_payload.json",
  "11_execution_trace.json",
]) {
  assert(existsSync(join(debugDir, fileName)), `Missing debug trace file: ${fileName}`);
}

console.log(JSON.stringify({
  status: "ok",
  taskId,
  pipelineStatus: completed.status,
  baseRealAnnualRate: report.costAnalysis.baseRealAnnualRate,
  comprehensiveRealAnnualRate: report.costAnalysis.comprehensiveRealAnnualRate,
  riskCount: report.risks.length,
  uniqueReferenceCases: referenceCaseIds.length,
  debugDir,
}, null, 2));
