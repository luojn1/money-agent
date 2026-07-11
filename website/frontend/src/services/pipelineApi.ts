import type { PipelineReport, PipelineStatus, PipelineTaskCreated } from "../types/pipeline";

export type ChatCitationType = "risk" | "clause" | "case";
export type ChatCitation = { type: ChatCitationType; id: string };
export type ChatAnswer = {
  answer: string;
  citations: ChatCitation[];
  suggestedQuestions: string[];
  mode: "template" | "llm" | "disabled";
};
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  at: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

type ApiErrorBody = {
  message?: string;
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
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

const requestForm = async <T>(path: string, formData: FormData): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.message ?? `请求失败（${response.status}）`);
  }

  return response.json() as Promise<T>;
};

export const pipelineApi = {
  createAnalysis: (payload: { contractFile?: File; contractText?: string }) => {
    const formData = new FormData();
    if (payload.contractFile) formData.append("contractFile", payload.contractFile);
    if (payload.contractText?.trim()) formData.append("contractText", payload.contractText.trim());
    return requestForm<PipelineTaskCreated>("/api/pipeline/analyze", formData);
  },
  getStatus: (taskId: string) => requestJson<PipelineStatus>(`/api/pipeline/${taskId}/status`),
  getResult: (taskId: string) => requestJson<PipelineReport>(`/api/pipeline/${taskId}/result`),
  sendChat: (taskId: string, message: string) =>
    requestJson<ChatAnswer>(`/api/pipeline/${taskId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  getChatHistory: (taskId: string) =>
    requestJson<{ taskId: string; messages: ChatMessage[] }>(`/api/pipeline/${taskId}/chat/history`),
};
