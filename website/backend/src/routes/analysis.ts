import { Router } from "express";
import multer from "multer";
import { createAnalysisResult } from "../services/analysisOrchestrator.js";
import { runDocumentIntakeAgent } from "../services/documentIntakeAgent.js";
import { createAnalysisTask, createDemoTask, getAnalysisTask, getTaskStatus } from "../services/taskStore.js";

export const analysisRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

type DemoAnalysisRequestBody = {
  contractName?: string;
  contractText?: string;
};

const createResultForTask = (taskId: string) => {
  const task = getAnalysisTask(taskId);
  return createAnalysisResult({
    taskId: task.taskId,
    contractName: task.contractName,
    contractText: task.contractText,
    documentIntake: task.documentIntake,
  });
};

analysisRouter.post("/demo", (request, response) => {
  const body = request.body as DemoAnalysisRequestBody;
  const task = createDemoTask({
    contractName: body.contractName,
    contractText: body.contractText,
  });
  response.status(201).json({ taskId: task.taskId, status: "processing" });
});

analysisRouter.post("/upload", upload.single("contractFile"), async (request, response, next) => {
  try {
    const taskId = `task_${Date.now().toString(36)}`;
    const body = request.body as { contractText?: string };
    const intake = await runDocumentIntakeAgent({
      taskId,
      file: request.file,
      pastedText: body.contractText,
    });
    const task = createAnalysisTask({
      taskId,
      contractName: intake.contractName,
      contractText: intake.contractText,
      documentIntake: intake.intakeResult,
    });

    response.status(201).json({
      taskId: task.taskId,
      status: "processing",
      documentIntake: task.documentIntake,
    });
  } catch (error) {
    next(error);
  }
});

analysisRouter.get("/:taskId/status", (request, response) => {
  response.json(getTaskStatus(request.params.taskId));
});

analysisRouter.get("/:taskId/result", (request, response) => {
  response.json(createResultForTask(request.params.taskId));
});

analysisRouter.get("/:taskId/b-output", (request, response) => {
  const result = createResultForTask(request.params.taskId);
  response.json(result.bAgentOutput);
});
