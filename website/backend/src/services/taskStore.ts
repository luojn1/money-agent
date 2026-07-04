import type { AnalysisTaskStatus, DocumentIntakeResult } from "../../../../shared/analysis.js";
import { ANALYSIS_PROTOCOL_VERSION, type AnalysisTaskCreatedV1 } from "../../../../shared/analysisProtocol.js";
import { DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT, DEMO_TASK_ID } from "./demoContract.js";

export type AnalysisTask = {
  taskId: string;
  contractId: string;
  startedAt: number;
  contractName: string;
  contractText: string;
  documentIntake: DocumentIntakeResult;
};

const STEP_DURATION_MS = 850;
const TOTAL_STEPS = 5;
const tasks = new Map<string, AnalysisTask>();

type CreateDemoTaskInput = {
  contractName?: string;
  contractText?: string;
};

type CreateAnalysisTaskInput = {
  taskId?: string;
  contractId?: string;
  contractName: string;
  contractText: string;
  documentIntake: DocumentIntakeResult;
};

export const toProtocolDateTime = (date = new Date()) => date.toISOString();

const createContractId = () => `contract_${Date.now().toString(36)}`;

const createDemoIntake = (taskId: string, contractName: string, contractText: string): DocumentIntakeResult => ({
  taskId,
  contractName,
  method: contractText === DEMO_CONTRACT_TEXT ? "demo" : "pasted_text",
  sourceFileName: null,
  mimeType: null,
  fileSha256: null,
  pageCount: null,
  extractedTextLength: contractText.length,
  extractedTextPreview: contractText.slice(0, 180),
  usedOcr: false,
  confidence: 0.96,
  warnings: [],
});

export const createAnalysisTask = (input: CreateAnalysisTaskInput): AnalysisTask => {
  const taskId = input.taskId ?? `task_${Date.now().toString(36)}`;
  const task = {
    taskId,
    contractId: input.contractId ?? createContractId(),
    startedAt: Date.now(),
    contractName: input.contractName,
    contractText: input.contractText,
    documentIntake: {
      ...input.documentIntake,
      taskId,
    },
  };

  tasks.set(task.taskId, task);
  return task;
};

export const createDemoTask = (input: CreateDemoTaskInput = {}): AnalysisTask => {
  const taskId = input.contractText ? `task_${Date.now().toString(36)}` : DEMO_TASK_ID;
  const contractName = input.contractName ?? DEMO_CONTRACT_NAME;
  const contractText = input.contractText?.trim() || DEMO_CONTRACT_TEXT;
  const task = {
    taskId,
    contractId: input.contractText ? createContractId() : "contract_001",
    startedAt: Date.now(),
    contractName,
    contractText,
    documentIntake: createDemoIntake(taskId, contractName, contractText),
  };

  tasks.set(task.taskId, task);
  return task;
};

export const getAnalysisTask = (taskId: string): AnalysisTask => {
  const task = tasks.get(taskId) ?? {
    taskId,
    contractId: taskId === DEMO_TASK_ID ? "contract_001" : createContractId(),
    startedAt: Date.now() - STEP_DURATION_MS * TOTAL_STEPS,
    contractName: DEMO_CONTRACT_NAME,
    contractText: DEMO_CONTRACT_TEXT,
    documentIntake: createDemoIntake(taskId, DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT),
  };

  tasks.set(taskId, task);
  return task;
};

export const toTaskCreatedResponse = (task: AnalysisTask): AnalysisTaskCreatedV1 => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId: task.taskId,
  contractId: task.contractId,
  status: "processing",
  createdAt: toProtocolDateTime(new Date(task.startedAt)),
});

const currentStageFor = (currentStep: number, completed: boolean): AnalysisTaskStatus["currentStage"] => {
  if (completed) return "completed";
  if (currentStep <= 0) return "queued";
  if (currentStep <= 2) return "contract_cost";
  if (currentStep === 3) return "risk_case";
  return "recommendation_action";
};

const stageStatus = (
  agent: "contract_cost" | "risk_case" | "recommendation_action",
  currentStage: AnalysisTaskStatus["currentStage"],
  completed: boolean,
): AnalysisTaskStatus["stages"][number]["status"] => {
  if (completed) return "completed";
  if (agent === currentStage) return "processing";
  if (agent === "contract_cost") return currentStage === "risk_case" || currentStage === "recommendation_action" ? "completed" : "pending";
  if (agent === "risk_case") return currentStage === "recommendation_action" ? "completed" : "pending";
  return "pending";
};

export const getTaskStatus = (taskId: string): AnalysisTaskStatus => {
  const task = getAnalysisTask(taskId);

  const elapsed = Math.max(0, Date.now() - task.startedAt);
  const currentStep = Math.min(TOTAL_STEPS, Math.floor(elapsed / STEP_DURATION_MS));
  const completed = currentStep >= TOTAL_STEPS;
  const currentStage = currentStageFor(currentStep, completed);

  return {
    schemaVersion: ANALYSIS_PROTOCOL_VERSION,
    taskId,
    contractId: task.contractId,
    status: completed ? "completed" : "processing",
    currentStage,
    currentStep,
    progress: completed ? 100 : Math.max(8, Math.round((elapsed / (STEP_DURATION_MS * TOTAL_STEPS)) * 100)),
    contractName: task.contractName,
    updatedAt: toProtocolDateTime(),
    stages: [
      { agent: "contract_cost", status: stageStatus("contract_cost", currentStage, completed) },
      { agent: "risk_case", status: stageStatus("risk_case", currentStage, completed) },
      { agent: "recommendation_action", status: stageStatus("recommendation_action", currentStage, completed) },
    ],
  };
};
