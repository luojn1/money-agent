import type { AnalysisTaskStatus, DocumentIntakeResult } from "../../../../shared/analysis.js";
import { DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT, DEMO_TASK_ID } from "./demoContract.js";

type AnalysisTask = {
  taskId: string;
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
  contractName: string;
  contractText: string;
  documentIntake: DocumentIntakeResult;
};

const createDemoIntake = (taskId: string, contractName: string, contractText: string): DocumentIntakeResult => ({
  taskId,
  contractName,
  method: contractText === DEMO_CONTRACT_TEXT ? "demo" : "pasted_text",
  sourceFileName: null,
  mimeType: null,
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
    startedAt: Date.now() - STEP_DURATION_MS * TOTAL_STEPS,
    contractName: DEMO_CONTRACT_NAME,
    contractText: DEMO_CONTRACT_TEXT,
    documentIntake: createDemoIntake(taskId, DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT),
  };

  tasks.set(taskId, task);
  return task;
};

export const getTaskStatus = (taskId: string): AnalysisTaskStatus => {
  const task = getAnalysisTask(taskId);

  const elapsed = Math.max(0, Date.now() - task.startedAt);
  const currentStep = Math.min(TOTAL_STEPS, Math.floor(elapsed / STEP_DURATION_MS));
  const completed = currentStep >= TOTAL_STEPS;

  return {
    taskId,
    status: completed ? "completed" : "processing",
    currentStep,
    progress: completed ? 100 : Math.max(8, Math.round((elapsed / (STEP_DURATION_MS * TOTAL_STEPS)) * 100)),
    contractName: task.contractName,
  };
};
