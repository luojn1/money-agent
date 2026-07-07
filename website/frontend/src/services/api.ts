import { createMockPipelineReport } from "../mocks/pipelineReport";
import {
  createMockPipelineStatus,
  createMockPipelineTask,
} from "../mocks/pipelineStatus";
import type { PipelineStatus, PipelineTaskCreated } from "../types/pipeline";
import { pipelineApi, requestJson } from "./pipelineApi";

const USE_MOCK_PIPELINE = (import.meta.env.VITE_USE_MOCK_PIPELINE as string | undefined)?.toLowerCase() === "true";

type MockTaskState = {
  taskId: string;
  contractName: string;
  startedAt: number;
};

type CreateDemoAnalysisPayload = {
  contractName?: string;
  contractText?: string;
};

const mockTaskStore = new Map<string, MockTaskState>();

const storeMockTask = (state: MockTaskState) => {
  mockTaskStore.set(state.taskId, state);
  window.sessionStorage.setItem(`pipeline:${state.taskId}`, JSON.stringify(state));
};

const readMockTask = (taskId: string): MockTaskState => {
  const cached = mockTaskStore.get(taskId);
  if (cached) return cached;

  const raw = window.sessionStorage.getItem(`pipeline:${taskId}`);
  if (raw) {
    const parsed = JSON.parse(raw) as MockTaskState;
    mockTaskStore.set(taskId, parsed);
    return parsed;
  }

  const fallback = {
    taskId,
    contractName: "课程项目测试合同.txt",
    startedAt: Date.now(),
  };
  storeMockTask(fallback);
  return fallback;
};

const createMockAnalysis = (contractName: string): PipelineTaskCreated => {
  const task = createMockPipelineTask();
  storeMockTask({
    taskId: task.taskId,
    contractName,
    startedAt: Date.now(),
  });
  return task;
};

export const api = {
  health: () => requestJson<{ status: "ok" }>("/api/health"),
  isMockPipelineEnabled: () => USE_MOCK_PIPELINE,
  createDemoAnalysis: (payload?: CreateDemoAnalysisPayload) => {
    if (!USE_MOCK_PIPELINE) return Promise.reject(new Error("真实模式请上传合同文件或粘贴合同文字；示例合同仅用于演示数据模式。"));
    return Promise.resolve(createMockAnalysis(payload?.contractName ?? "课程项目测试合同.txt"));
  },
  createUploadAnalysis: (payload: { contractFile?: File; contractText?: string }) => {
    if (!USE_MOCK_PIPELINE) return pipelineApi.createAnalysis(payload);

    const contractName = payload.contractFile?.name ?? (payload.contractText ? "粘贴的合同文字" : "课程项目测试合同.txt");
    return Promise.resolve(createMockAnalysis(contractName));
  },
  getAnalysisStatus: (taskId: string): Promise<PipelineStatus> => {
    if (!USE_MOCK_PIPELINE) return pipelineApi.getStatus(taskId);
    const task = readMockTask(taskId);
    return Promise.resolve(createMockPipelineStatus(taskId, task.startedAt, task.contractName));
  },
  getAnalysisResult: (taskId: string) =>
    USE_MOCK_PIPELINE
      ? Promise.resolve(createMockPipelineReport(taskId))
      : pipelineApi.getResult(taskId),
};
