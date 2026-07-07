import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeDir, runIntegratedPipeline } from "../website/backend/src/services/pipelineOrchestrator.js";
import { createPipelineTask, getPipelineTask } from "../website/backend/src/services/pipelineTaskStore.js";
import { runPythonAgent } from "../website/backend/src/services/pythonAgentRunner.js";
import type { ContractCostOutput, RecommendationActionOutput, RiskCaseOutput } from "../shared/analysisProtocol.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const taskId = `verify_bcd_${Date.now().toString(36)}`;
const runtimeDir = createRuntimeDir(taskId);

const contractText = await readFile(join(projectRoot, "tests", "fixtures", "integration-demo-contract.txt"), "utf8");
const task = createPipelineTask({
  taskId,
  contractName: "integration-demo-contract.txt",
  runtimeDir,
});

await runIntegratedPipeline(task.taskId, { pastedText: contractText });

const completed = getPipelineTask(task.taskId);
assert(completed, "Pipeline task should exist after run");
assert(completed?.status === "completed" || completed?.status === "partial", `Pipeline should complete or partial, got ${completed?.status}`);
assert(completed?.result, "Pipeline result should be available");

const result = completed.result as {
  runtimeMode: string;
  contractCost: ContractCostOutput;
  riskCase: RiskCaseOutput;
  recommendationAction: RecommendationActionOutput;
  overview: {
    loanAmount: number | null;
    actualReceivedAmount: number | null;
    realAnnualRate: number | null;
  };
  risks: unknown[];
};
const b = result.contractCost;
const c = result.riskCase;
const d = result.recommendationAction;

assert(result.runtimeMode === "INTEGRATED", "Final result runtimeMode should be INTEGRATED");
assert(b.status !== "failed", "B output should be usable by C");
assert(c.status !== "failed", "C output should be usable by D");
assert(d.status !== "failed", "D output should be generated");
assert(b.taskId === c.taskId && c.taskId === d.taskId, "B/C/D taskId should match");
assert(b.contractId === c.contractId && c.contractId === d.contractId, "B/C/D contractId should match");
assert(c.inputRunIds.includes(b.runId), "C inputRunIds should contain B.runId");
assert(d.inputRunIds.includes(b.runId), "D inputRunIds should contain B.runId");
assert(d.inputRunIds.includes(c.runId), "D inputRunIds should contain C.runId");

const clauseIds = new Set(b.data?.clauses.map((clause) => clause.clauseId) ?? []);
for (const risk of c.data?.riskItems ?? []) {
  assert(risk.relatedClauseIds.every((id) => clauseIds.has(id)), `${risk.id} has unknown relatedClauseIds`);
  assert(risk.evidence.every((item) => risk.relatedClauseIds.includes(item.clauseId)), `${risk.id} has evidence outside relatedClauseIds`);
}

const riskIds = new Set(c.data?.riskItems.map((risk) => risk.id) ?? []);
for (const recommendation of d.data?.recommendations ?? []) {
  assert(recommendation.relatedRiskIds.every((id) => riskIds.has(id)), `${recommendation.id} has unknown relatedRiskIds`);
}

const bPath = join(runtimeDir, "b-output.json");
const cMismatchPath = join(runtimeDir, "c-output-mismatch.json");
const dMismatchPath = join(runtimeDir, "d-output-mismatch.json");
const dMismatchPlanPath = join(runtimeDir, "d-action-plan-mismatch.json");
await writeFile(cMismatchPath, `${JSON.stringify({ ...c, taskId: `${c.taskId}_mismatch` }, null, 2)}\n`, "utf8");
await runPythonAgent({
  cwd: join(projectRoot, "agents", "recommendation_action"),
  label: "D mismatch verification",
  args: [
    "main.py",
    "--input-b",
    bPath,
    "--input-c",
    cMismatchPath,
    "--output",
    dMismatchPath,
    "--action-plan",
    dMismatchPlanPath,
    "--schema",
    join(projectRoot, "shared", "schemas", "analysis-protocol-v1.schema.json"),
  ],
});
const mismatchD = JSON.parse(await readFile(dMismatchPath, "utf8")) as RecommendationActionOutput;
assert(mismatchD.status === "failed", "D mismatch output should be failed");
assert(mismatchD.data === null, "D mismatch output should have data=null");
assert(mismatchD.errors.some((error) => error.code === "UPSTREAM_LINK_MISMATCH"), "D mismatch output should include UPSTREAM_LINK_MISMATCH");

console.log(JSON.stringify({
  status: "ok",
  taskId: b.taskId,
  contractId: b.contractId,
  runtimeMode: result.runtimeMode,
  pipelineStatus: completed?.status,
  bStatus: b.status,
  cStatus: c.status,
  dStatus: d.status,
  loanAmount: result.overview.loanAmount,
  actualReceivedAmount: result.overview.actualReceivedAmount,
  realAnnualRate: result.overview.realAnnualRate,
  riskCount: c.data?.riskItems.length ?? 0,
  recommendationCount: d.data?.recommendations.length ?? 0,
  mismatchStatus: mismatchD.status,
}, null, 2));
