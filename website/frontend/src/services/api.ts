import type { AnalysisResult, AnalysisTaskStatus } from "../types/analysis";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

type DemoTaskResponse = {
  taskId: string;
  status: "processing";
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

export const api = {
  health: () => request<{ status: "ok" }>("/api/health"),
  createDemoAnalysis: () => request<DemoTaskResponse>("/api/analysis/demo", { method: "POST" }),
  getAnalysisStatus: (taskId: string) =>
    request<AnalysisTaskStatus>(`/api/analysis/${encodeURIComponent(taskId)}/status`),
  getAnalysisResult: (taskId: string) =>
    request<AnalysisResult>(`/api/analysis/${encodeURIComponent(taskId)}/result`),
};
