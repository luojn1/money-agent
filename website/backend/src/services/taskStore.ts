import type { AnalysisTaskStatus } from "../../../../shared/analysis.js";
import { DEMO_TASK_ID } from "../../../../shared/mockAnalysis.js";

type AnalysisTask = {
  taskId: string;
  startedAt: number;
  contractName: string;
};

const STEP_DURATION_MS = 850;
const TOTAL_STEPS = 4;
const tasks = new Map<string, AnalysisTask>();

export const createDemoTask = (): AnalysisTask => {
  const task = {
    taskId: DEMO_TASK_ID,
    startedAt: Date.now(),
    contractName: "示例消费贷合同.pdf",
  };

  tasks.set(task.taskId, task);
  return task;
};

export const getTaskStatus = (taskId: string): AnalysisTaskStatus => {
  const task = tasks.get(taskId) ?? {
    taskId,
    startedAt: Date.now() - STEP_DURATION_MS * TOTAL_STEPS,
    contractName: "示例消费贷合同.pdf",
  };

  tasks.set(taskId, task);

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
