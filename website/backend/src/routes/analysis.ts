import { Router } from "express";
import { createMockAnalysisResult } from "../../../../shared/mockAnalysis.js";
import { createDemoTask, getTaskStatus } from "../services/taskStore.js";

export const analysisRouter = Router();

analysisRouter.post("/demo", (_request, response) => {
  const task = createDemoTask();
  response.status(201).json({ taskId: task.taskId, status: "processing" });
});

analysisRouter.get("/:taskId/status", (request, response) => {
  response.json(getTaskStatus(request.params.taskId));
});

analysisRouter.get("/:taskId/result", (request, response) => {
  response.json(createMockAnalysisResult(request.params.taskId));
});
