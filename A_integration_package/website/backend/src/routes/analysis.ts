import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { createAnalysisResult } from "../services/analysisOrchestrator.js";
import { detectScenarioFromKnowledge } from "../services/scenarioDetector.js";
import { runDocumentIntakeAgent } from "../services/documentIntakeAgent.js";
import { createContractCostOutput } from "../services/protocolAdapter.js";
import {
  createAnalysisTask,
  createDemoTask,
  getAnalysisTask,
  getTaskStatus,
  type AnalysisTask,
  toTaskCreatedResponse,
} from "../services/taskStore.js";

export const analysisRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const uploadFields = upload.fields([
  { name: "contractFile", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

type DemoAnalysisRequestBody = {
  contractName?: string;
  contractText?: string;
};

const notFound = (response: Response, taskId: string) =>
  response.status(404).json({
    message: `Analysis task not found: ${taskId}. Create a task with POST /api/analysis or POST /api/analysis/demo first.`,
  });

const createResultForTask = (task: AnalysisTask) =>
  createAnalysisResult({
    taskId: task.taskId,
    contractId: task.contractId,
    contractName: task.contractName,
    contractText: task.contractText,
    documentIntake: task.documentIntake,
  });

const getUploadedFile = (request: Request) => {
  const files = request.files as Record<string, Express.Multer.File[] | undefined> | undefined;
  return files?.contractFile?.[0] ?? files?.file?.[0];
};

const handleUploadAnalysis = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const taskId = `task_${Date.now().toString(36)}`;
    const body = request.body as { contractText?: string };
    const intake = await runDocumentIntakeAgent({
      taskId,
      file: getUploadedFile(request),
      pastedText: body.contractText,
    });
    const task = createAnalysisTask({
      taskId,
      contractName: intake.contractName,
      contractText: intake.contractText,
      documentIntake: intake.intakeResult,
    });

    response.status(201).json(toTaskCreatedResponse(task));
  } catch (error) {
    next(error);
  }
};

const handleScenarioDetect = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const text = typeof request.body?.text === "string" ? request.body.text : "";
    response.json(await detectScenarioFromKnowledge(text));
  } catch (error) {
    next(error);
  }
};

analysisRouter.post("/demo", (request, response) => {
  const body = request.body as DemoAnalysisRequestBody;
  const task = createDemoTask({
    contractName: body.contractName,
    contractText: body.contractText,
  });
  response.status(201).json(toTaskCreatedResponse(task));
});

analysisRouter.post("/", uploadFields, handleUploadAnalysis);
analysisRouter.post("/upload", uploadFields, handleUploadAnalysis);
analysisRouter.post("/scenario-detector", handleScenarioDetect);
analysisRouter.post("/scenario-detect", handleScenarioDetect);

analysisRouter.get("/:taskId/status", (request, response) => {
  const task = getAnalysisTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  response.json(getTaskStatus(request.params.taskId));
});

analysisRouter.get("/:taskId/result", (request, response) => {
  const task = getAnalysisTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  response.json(createResultForTask(task));
});

analysisRouter.get("/:taskId/b-output", (request, response) => {
  const task = getAnalysisTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  const result = createResultForTask(task);
  response.json(createContractCostOutput(task, result));
});

analysisRouter.get("/:taskId/contract-cost-output", (request, response) => {
  const task = getAnalysisTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  const result = createResultForTask(task);
  response.json(createContractCostOutput(task, result));
});

