import { createMockPipelineReport } from "../mocks/pipelineReport";
import {
  createMockPipelineStatus,
  createMockPipelineTask,
  createRealPipelineUnavailableStatus,
} from "../mocks/pipelineStatus";
import type { PipelineStatus, PipelineTaskCreated } from "../types/pipeline";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const USE_MOCK_PIPELINE = (import.meta.env.VITE_USE_MOCK_PIPELINE as string | undefined)?.toLowerCase() === "true";
const REAL_PIPELINE_UNAVAILABLE_MESSAGE = "真实 Pipeline 模式暂未接入；请设置 VITE_USE_MOCK_PIPELINE=true 查看完整 B/C/D 演示流程。";

type MockTaskState = {
  taskId: string;
  contractName: string;
  startedAt: number;
};

type CreateDemoAnalysisPayload = {
  contractName?: string;
  contractText?: string;
};

type ApiErrorBody = {
  message?: string;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.message ?? `请求失败（${response.status}）`);
  }

  return response.json() as Promise<T>;
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
  health: () => request<{ status: "ok" }>("/api/health"),
  isMockPipelineEnabled: () => USE_MOCK_PIPELINE,
  createDemoAnalysis: (payload?: CreateDemoAnalysisPayload) => {
    if (!USE_MOCK_PIPELINE) return Promise.reject(new Error(REAL_PIPELINE_UNAVAILABLE_MESSAGE));
    return Promise.resolve(createMockAnalysis(payload?.contractName ?? "课程项目测试合同.txt"));
  },
  createUploadAnalysis: (payload: { contractFile?: File; contractText?: string }) => {
    if (!USE_MOCK_PIPELINE) return Promise.reject(new Error(REAL_PIPELINE_UNAVAILABLE_MESSAGE));

    const contractName = payload.contractFile?.name ?? (payload.contractText ? "粘贴的合同文字" : "课程项目测试合同.txt");
    return Promise.resolve(createMockAnalysis(contractName));
  },
  getAnalysisStatus: (taskId: string): Promise<PipelineStatus> => {
    if (!USE_MOCK_PIPELINE) return Promise.resolve(createRealPipelineUnavailableStatus(taskId));
    const task = readMockTask(taskId);
    return Promise.resolve(createMockPipelineStatus(taskId, task.startedAt, task.contractName));
  },
  getAnalysisResult: (taskId: string) =>
    USE_MOCK_PIPELINE
      ? Promise.resolve(createMockPipelineReport(taskId))
      : Promise.reject(new Error(REAL_PIPELINE_UNAVAILABLE_MESSAGE)),
};
