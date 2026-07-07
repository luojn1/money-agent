import { ANALYSIS_PROTOCOL_VERSION, type AgentId, type AgentStatus, type ProtocolError, type ProtocolWarning } from "../../../../shared/analysisProtocol.js";

export type PipelineStepStatus = "pending" | "processing" | AgentStatus;
export type PipelineStatus = "pending" | "processing" | "completed" | "partial" | "failed";

export type PipelineStepState = {
  agent: AgentId;
  label: string;
  status: PipelineStepStatus;
  message?: string;
};

export type PipelineTask = {
  taskId: string;
  contractId: string;
  contractName: string;
  status: PipelineStatus;
  runtimeMode: "INTEGRATED";
  currentAgent: AgentId | "queued" | "completed" | "failed";
  currentMessage: string;
  steps: PipelineStepState[];
  runtimeDir: string;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  warnings: ProtocolWarning[];
  errors: ProtocolError[];
};

const tasks = new Map<string, PipelineTask>();

const labels: Record<AgentId, string> = {
  contract_cost: "B 合同与成本 Agent",
  risk_case: "C 风险与案例 Agent",
  recommendation_action: "D 建议与行动 Agent",
};

const initialSteps = (): PipelineStepState[] => [
  {
    agent: "contract_cost",
    label: labels.contract_cost,
    status: "pending",
    message: "等待合同解析与成本测算",
  },
  {
    agent: "risk_case",
    label: labels.risk_case,
    status: "pending",
    message: "等待风险识别与案例匹配",
  },
  {
    agent: "recommendation_action",
    label: labels.recommendation_action,
    status: "pending",
    message: "等待建议与行动方案生成",
  },
];

export const toProtocolDateTime = (date = new Date()) => date.toISOString();

export const createPipelineTask = (input: {
  taskId?: string;
  contractId?: string;
  contractName: string;
  runtimeDir: string;
}): PipelineTask => {
  const now = toProtocolDateTime();
  const taskId = input.taskId ?? `task_${Date.now().toString(36)}`;
  const task: PipelineTask = {
    taskId,
    contractId: input.contractId ?? `contract_${Date.now().toString(36)}`,
    contractName: input.contractName,
    status: "processing",
    runtimeMode: "INTEGRATED",
    currentAgent: "queued",
    currentMessage: "真实多 Agent 分析任务已创建",
    steps: initialSteps(),
    runtimeDir: input.runtimeDir,
    createdAt: now,
    updatedAt: now,
    warnings: [],
    errors: [],
  };
  tasks.set(task.taskId, task);
  return task;
};

export const getPipelineTask = (taskId: string): PipelineTask | null => tasks.get(taskId) ?? null;

export const updatePipelineTask = (taskId: string, patch: Partial<PipelineTask>): PipelineTask => {
  const current = getPipelineTask(taskId);
  if (!current) throw new Error(`Pipeline task not found: ${taskId}`);
  const next = {
    ...current,
    ...patch,
    updatedAt: toProtocolDateTime(),
  };
  tasks.set(taskId, next);
  return next;
};

export const updatePipelineStep = (
  taskId: string,
  agent: AgentId,
  status: PipelineStepStatus,
  message?: string,
) => {
  const task = getPipelineTask(taskId);
  if (!task) throw new Error(`Pipeline task not found: ${taskId}`);
  const steps = task.steps.map((step) => (step.agent === agent ? { ...step, status, message: message ?? step.message } : step));
  updatePipelineTask(taskId, {
    steps,
    currentAgent: status === "processing" ? agent : task.currentAgent,
    currentMessage: message ?? task.currentMessage,
  });
};

export const toTaskCreatedResponse = (task: PipelineTask) => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId: task.taskId,
  contractId: task.contractId,
  status: "processing" as const,
  runtimeMode: task.runtimeMode,
  createdAt: task.createdAt,
});

export const toStatusResponse = (task: PipelineTask) => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId: task.taskId,
  contractId: task.contractId,
  status: task.status,
  runtimeMode: task.runtimeMode,
  mode: "integrated" as const,
  contractName: task.contractName,
  currentAgent: task.currentAgent,
  currentStage: task.currentAgent,
  currentMessage: task.currentMessage,
  steps: task.steps,
  updatedAt: task.updatedAt,
  error: task.errors[0]?.message,
  errors: task.errors,
  warnings: task.warnings,
});
