import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYSIS_PROTOCOL_VERSION,
  type AgentStatus,
  type ContractCostOutput,
  type ProtocolError,
  type ProtocolWarning,
  type RecommendationActionOutput,
  type RiskCaseOutput,
} from "../../../../shared/analysisProtocol.js";
import type { CostLevel } from "../../../../shared/analysis.js";
import { createAnalysisResult } from "./analysisOrchestrator.js";
import { runDocumentIntakeAgent } from "./documentIntakeAgent.js";
import { createContractCostOutput } from "./protocolAdapter.js";
import { runPythonAgent } from "./pythonAgentRunner.js";
import { createAnalysisTask } from "./taskStore.js";
import {
  getPipelineTask,
  updatePipelineStep,
  updatePipelineTask,
  type PipelineStepStatus,
  type PipelineTask,
} from "./pipelineTaskStore.js";

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

export type PipelineInput = {
  file?: UploadedFile;
  pastedText?: string;
};

type ActionPlanOutput = {
  reminders?: Array<{
    reminderId: string;
    title: string;
    rule: string;
    relatedRiskIds?: string[];
  }>;
  evidenceChecklist?: string[];
  communicationScripts?: Array<string | { scenario?: string; script?: string }>;
  followUpPlan?: Array<{
    stage: string;
    steps: string[];
  }>;
};

const serviceDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(serviceDir, "../../../..");
const defaultRuntimeRoot =
  process.env.NODE_ENV === "production" ? "/tmp/money-agent-runtime" : join(projectRoot, ".runtime");
const riskCaseDir = join(projectRoot, "agents", "risk_case");
const recommendationActionDir = join(projectRoot, "agents", "recommendation_action");
const schemaPath = join(projectRoot, "shared", "schemas", "analysis-protocol-v1.schema.json");

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;

const protocolError = (code: string, message: string, fieldPath: string | null = null): ProtocolError => ({
  code,
  message,
  fieldPath,
  recoverable: true,
});

const sanitizeError = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const setTaskFailure = async (
  task: PipelineTask,
  agent: "contract_cost" | "risk_case" | "recommendation_action",
  message: string,
  errors: ProtocolError[],
  result?: unknown,
) => {
  updatePipelineStep(task.taskId, agent, "failed", message);
  updatePipelineTask(task.taskId, {
    status: "failed",
    currentAgent: "failed",
    currentMessage: message,
    errors,
    result,
  });
};

const stepStatusFromAgent = (status: AgentStatus): PipelineStepStatus => status;

const pipelineStatusFrom = (...statuses: AgentStatus[]) =>
  statuses.includes("failed") ? "failed" : statuses.includes("partial") ? "partial" : "completed";

const costLevelFromRate = (realAnnualRate: number | null | undefined): CostLevel => {
  if (realAnnualRate === null || realAnnualRate === undefined) return "insufficient_information";
  if (realAnnualRate <= 12) return "low";
  if (realAnnualRate <= 20) return "normal";
  if (realAnnualRate <= 24) return "warning";
  return "high";
};

const riskCategoryLabel: Record<string, string> = {
  cost_transparency: "成本透明度",
  interest_fee: "利息与费用",
  repayment: "还款安排",
  prepayment: "提前还款",
  overdue: "逾期处理",
  authorization_privacy: "授权与隐私",
  dispute_resolution: "争议解决",
  other: "其他",
};

const timingToStage = (timing: string) => {
  if (timing === "before_signing") return "before_signing";
  if (timing === "when_overdue") return "when_overdue";
  return "during_repayment";
};

const stageTitle = (stage: string) => {
  const titles: Record<string, string> = {
    before_signing: "签约前",
    during_repayment: "还款期间",
    before_prepayment: "提前还款前",
    when_overdue: "出现逾期时",
    when_dispute: "发生争议时",
  };
  return titles[stage] ?? "还款期间";
};

const communicationScriptText = (script: string | { scenario?: string; script?: string }) =>
  typeof script === "string" ? script : script.script ?? script.scenario ?? "";

const buildReferences = (riskCase: RiskCaseOutput, contractCost: ContractCostOutput) => {
  const riskItems = riskCase.data?.riskItems ?? [];
  const caseItems = riskItems.flatMap((risk) =>
    risk.matchedCases.map((item) => ({
      id: `${risk.id}_${item.caseId}`,
      title: item.title,
      tag: "典型情景" as const,
      summary: item.conclusion,
      sourceLabel: item.sourceUrl ? "查看来源" : undefined,
      sourceUrl: item.sourceUrl,
    })),
  );
  const basisItems = (contractCost.data?.costAnalysis.calculationBasis ?? []).map((basis, index) => ({
    id: `basis_${index + 1}`,
    title: "成本测算依据",
    tag: "规则参考" as const,
    summary: basis,
  }));
  return [
    { id: "similar_cases", title: "相似案例" as const, items: caseItems },
    { id: "regulation_refs", title: "法规参考" as const, items: basisItems },
    { id: "market_rate_refs", title: "市场利率参考" as const, items: [] },
    { id: "product_refs", title: "产品参考" as const, items: [] },
  ];
};

const buildActionSections = (recommendationAction: RecommendationActionOutput, actionPlan: ActionPlanOutput) => {
  const recommendations = recommendationAction.data?.recommendations ?? [];
  const byStage = new Map<string, Array<{ id: string; priority: string; title: string; detail: string; stage: string; relatedRiskIds: string[] }>>();
  const add = (item: { id: string; priority: string; title: string; detail: string; stage: string; relatedRiskIds: string[] }) => {
    const items = byStage.get(item.stage) ?? [];
    items.push(item);
    byStage.set(item.stage, items);
  };

  recommendations.forEach((item) => {
    add({
      id: item.id,
      priority: item.priority,
      title: item.action,
      detail: item.rationale,
      stage: timingToStage(item.timing),
      relatedRiskIds: item.relatedRiskIds,
    });
  });

  (actionPlan.reminders ?? []).forEach((item) => {
    add({
      id: item.reminderId,
      priority: "should",
      title: item.title,
      detail: item.rule,
      stage: item.title.includes("签约") || item.title.includes("提前") ? "before_signing" : "during_repayment",
      relatedRiskIds: item.relatedRiskIds ?? [],
    });
  });

  (actionPlan.followUpPlan ?? []).forEach((section, sectionIndex) => {
    const stage = section.stage === "dispute" ? "when_dispute" : section.stage;
    section.steps.forEach((step, stepIndex) => {
      add({
        id: `follow_${sectionIndex + 1}_${stepIndex + 1}`,
        priority: "optional",
        title: stageTitle(stage),
        detail: step,
        stage,
        relatedRiskIds: [],
      });
    });
  });

  const stages = ["before_signing", "during_repayment", "before_prepayment", "when_overdue", "when_dispute"];
  return stages.map((stage) => ({ stage, title: stageTitle(stage), items: byStage.get(stage) ?? [] }));
};

const buildReport = (
  task: PipelineTask,
  contractCost: ContractCostOutput | null,
  riskCase: RiskCaseOutput | null,
  recommendationAction: RecommendationActionOutput | null,
  actionPlan: ActionPlanOutput | null,
) => {
  const summary = contractCost?.data?.contractSummary;
  const cost = contractCost?.data?.costAnalysis;
  const riskItems = riskCase?.data?.riskItems ?? [];
  const warnings: ProtocolWarning[] = [
    ...(contractCost?.warnings ?? []),
    ...(riskCase?.warnings ?? []),
    ...(recommendationAction?.warnings ?? []),
  ];
  const errors: ProtocolError[] = [
    ...(contractCost?.errors ?? []),
    ...(riskCase?.errors ?? []),
    ...(recommendationAction?.errors ?? []),
    ...task.errors,
  ];
  const totalInterest = cost?.totalInterest ?? null;
  const additionalFees = cost?.additionalFees ?? null;
  const loanAmount = summary?.loanAmount ?? null;
  const actualReceivedAmount = summary?.actualReceivedAmount ?? null;
  const nominalRate = summary?.nominalRate ?? null;
  const realAnnualRate = cost?.realAnnualRate ?? null;
  const actionSections = recommendationAction ? buildActionSections(recommendationAction, actionPlan ?? {}) : [];

  return {
    schemaVersion: ANALYSIS_PROTOCOL_VERSION,
    taskId: task.taskId,
    contractId: task.contractId,
    status: task.status,
    runtimeMode: "INTEGRATED",
    mode: "integrated",
    generatedAt: new Date().toISOString(),
    steps: task.steps,
    contractCost,
    riskCase,
    recommendationAction,
    actionPlan,
    overview: {
      institution: summary?.institution ?? null,
      productType: summary?.productType ?? null,
      loanAmount,
      actualReceivedAmount,
      termMonths: summary?.loanTermMonths ?? null,
      installmentCount: summary?.installmentCount ?? null,
      monthlyPayment: summary?.monthlyPayment ?? null,
      nominalAnnualRate: nominalRate,
      realAnnualRate,
    },
    costAnalysis: {
      totalRepayment: cost?.totalRepayment ?? null,
      totalInterest,
      additionalFees,
      principalGap: loanAmount !== null && actualReceivedAmount !== null ? loanAmount - actualReceivedAmount : null,
      rateGap: realAnnualRate !== null && nominalRate !== null ? realAnnualRate - nominalRate : null,
      costLevel: costLevelFromRate(realAnnualRate),
      calculationBasis: cost?.calculationBasis ?? [],
    },
    risks: riskItems.map((item) => ({
      ...item,
      categoryLabel: riskCategoryLabel[item.category] ?? item.category,
    })),
    references: contractCost && riskCase ? buildReferences(riskCase, contractCost) : [],
    actions: {
      overallLevel: recommendationAction?.data?.overallResult.level ?? "insufficient_information",
      summary: recommendationAction?.data?.overallResult.summary ?? "真实多 Agent 分析未生成完整建议。",
      mustConfirm: actionSections.flatMap((section) => section.items).filter((item) => item.priority === "must"),
      shouldConfirm: actionSections.flatMap((section) => section.items).filter((item) => item.priority === "should"),
      optionalOptimizations: actionSections.flatMap((section) => section.items).filter((item) => item.priority === "optional"),
      questionList: recommendationAction?.data?.questionList ?? [],
      evidenceChecklist: actionPlan?.evidenceChecklist ?? [],
      communicationScripts: (actionPlan?.communicationScripts ?? []).map(communicationScriptText).filter(Boolean),
      actionPlan: actionSections,
    },
    warnings: warnings.map((item) => item.message),
    errors,
    sourceAgentRuns: [
      contractCost && {
        agent: contractCost.agent,
        runId: contractCost.runId,
        agentVersion: contractCost.agentVersion,
        status: contractCost.status,
      },
      riskCase && {
        agent: riskCase.agent,
        runId: riskCase.runId,
        agentVersion: riskCase.agentVersion,
        status: riskCase.status,
      },
      recommendationAction && {
        agent: recommendationAction.agent,
        runId: recommendationAction.runId,
        agentVersion: recommendationAction.agentVersion,
        status: recommendationAction.status,
      },
    ].filter(Boolean),
    completedWithWarnings: warnings.length > 0 || task.status === "partial",
  };
};

export const runIntegratedPipeline = async (taskId: string, input: PipelineInput) => {
  const task = getPipelineTask(taskId);
  if (!task) throw new Error(`Pipeline task not found: ${taskId}`);

  let contractCost: ContractCostOutput | null = null;
  let riskCase: RiskCaseOutput | null = null;
  let recommendationAction: RecommendationActionOutput | null = null;
  let actionPlan: ActionPlanOutput | null = null;

  const bPath = join(task.runtimeDir, "b-output.json");
  const cPath = join(task.runtimeDir, "c-output.json");
  const cTracePath = join(task.runtimeDir, "c-trace.json");
  const cDatabasePath = join(getRuntimeRoot(), "risk_case_agent.db");
  const dPath = join(task.runtimeDir, "d-output.json");
  const dActionPlanPath = join(task.runtimeDir, "d-action-plan.json");

  try {
    await mkdir(task.runtimeDir, { recursive: true });
    updatePipelineStep(taskId, "contract_cost", "processing", "B 正在读取合同并测算真实成本");

    const intake = await runDocumentIntakeAgent({
      taskId,
      file: input.file,
      pastedText: input.pastedText,
    });
    const bTask = createAnalysisTask({
      taskId,
      contractId: task.contractId,
      contractName: intake.contractName,
      contractText: intake.contractText,
      documentIntake: intake.intakeResult,
    });
    updatePipelineTask(taskId, { contractName: intake.contractName });
    const bResult = createAnalysisResult({
      taskId: bTask.taskId,
      contractId: bTask.contractId,
      contractName: bTask.contractName,
      contractText: bTask.contractText,
      documentIntake: bTask.documentIntake,
    });
    contractCost = createContractCostOutput(bTask, bResult);
    await writeJson(bPath, contractCost);
    updatePipelineStep(taskId, "contract_cost", stepStatusFromAgent(contractCost.status), `B 输出 ${contractCost.status}`);

    if (contractCost.status === "failed") {
      const result = buildReport(updatePipelineTask(taskId, { status: "failed" }), contractCost, null, null, null);
      await setTaskFailure(task, "contract_cost", "B 合同解析或成本测算失败，已停止 C/D。", contractCost.errors, result);
      return;
    }

    updatePipelineStep(taskId, "risk_case", "processing", "C 正在识别风险并匹配案例");
    await runPythonAgent({
      cwd: riskCaseDir,
      label: "C 风险识别 Agent",
      args: [
        "main.py",
        "--input",
        bPath,
        "--output",
        cPath,
        "--trace-output",
        cTracePath,
        "--trace",
        "--db",
        cDatabasePath,
      ],
    });
    riskCase = await readJson<RiskCaseOutput>(cPath);
    updatePipelineStep(taskId, "risk_case", stepStatusFromAgent(riskCase.status), `C 输出 ${riskCase.status}`);

    if (riskCase.status === "failed") {
      const result = buildReport(updatePipelineTask(taskId, { status: "failed" }), contractCost, riskCase, null, null);
      await setTaskFailure(task, "risk_case", "C 风险识别失败，已停止 D。", riskCase.errors, result);
      return;
    }

    updatePipelineStep(taskId, "recommendation_action", "processing", "D 正在生成建议与行动方案");
    await runPythonAgent({
      cwd: recommendationActionDir,
      label: "D 建议行动 Agent",
      args: [
        "main.py",
        "--input-b",
        bPath,
        "--input-c",
        cPath,
        "--output",
        dPath,
        "--action-plan",
        dActionPlanPath,
        "--schema",
        process.env.SCHEMA_PATH || schemaPath,
      ],
    });
    recommendationAction = await readJson<RecommendationActionOutput>(dPath);
    actionPlan = await readJson<ActionPlanOutput>(dActionPlanPath);
    updatePipelineStep(
      taskId,
      "recommendation_action",
      stepStatusFromAgent(recommendationAction.status),
      `D 输出 ${recommendationAction.status}`,
    );

    const finalStatus = pipelineStatusFrom(contractCost.status, riskCase.status, recommendationAction.status);
    const currentAgent = finalStatus === "failed" ? "failed" : "completed";
    const currentMessage = finalStatus === "failed" ? "真实多 Agent 分析失败" : "真实多 Agent 分析完成";
    const nextTask = updatePipelineTask(taskId, { status: finalStatus, currentAgent, currentMessage });
    const result = buildReport(nextTask, contractCost, riskCase, recommendationAction, actionPlan);

    if (recommendationAction.status === "failed") {
      updatePipelineTask(taskId, {
        status: "failed",
        currentAgent: "failed",
        currentMessage: "D 建议生成失败，已保留 B/C 输出。",
        errors: recommendationAction.errors,
        result,
      });
      return;
    }

    updatePipelineTask(taskId, { result, warnings: [...contractCost.warnings, ...riskCase.warnings, ...recommendationAction.warnings] });
  } catch (error) {
    console.error(error);
    const message = sanitizeError(error, "真实多 Agent Pipeline 执行失败。");
    const protocolErrors = [protocolError("PIPELINE_EXECUTION_FAILED", message, null)];
    const latestTask = updatePipelineTask(taskId, {
      status: "failed",
      currentAgent: "failed",
      currentMessage: message,
      errors: protocolErrors,
    });
    updatePipelineTask(taskId, { result: buildReport(latestTask, contractCost, riskCase, recommendationAction, actionPlan) });
  }
};

export const getRuntimeRoot = () => resolve(process.env.RUNTIME_ROOT?.trim() || defaultRuntimeRoot);

export const createRuntimeDir = (taskId: string) => join(getRuntimeRoot(), "pipeline", taskId);
