import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { createRuntimeDir, runIntegratedPipeline } from "../services/pipelineOrchestrator.js";
import {
  createPipelineTask,
  getPipelineTask,
  toStatusResponse,
  toTaskCreatedResponse,
} from "../services/pipelineTaskStore.js";

export const pipelineRouter = Router();

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

const notFound = (response: Response, taskId: string) =>
  response.status(404).json({
    message: `Pipeline task not found: ${taskId}. Create a task with POST /api/pipeline/analyze first.`,
  });

const getUploadedFile = (request: Request) => {
  const files = request.files as Record<string, Express.Multer.File[] | undefined> | undefined;
  return files?.contractFile?.[0] ?? files?.file?.[0];
};

pipelineRouter.post("/analyze", uploadFields, (request: Request, response: Response, next: NextFunction) => {
  try {
    const body = request.body as { contractText?: string };
    const file = getUploadedFile(request);
    const pastedText = body.contractText?.trim();
    const taskId = `task_${Date.now().toString(36)}`;
    const task = createPipelineTask({
      taskId,
      contractName: file?.originalname ?? (pastedText ? "粘贴的合同文字" : "未提供合同"),
      runtimeDir: createRuntimeDir(taskId),
    });

    response.status(201).json(toTaskCreatedResponse(task));

    setTimeout(() => {
      void runIntegratedPipeline(task.taskId, {
        file,
        pastedText,
      });
    }, 0);
  } catch (error) {
    next(error);
  }
});

pipelineRouter.get("/:taskId/status", (request, response) => {
  const task = getPipelineTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  response.json(toStatusResponse(task));
});

pipelineRouter.get("/:taskId/result", (request, response) => {
  const task = getPipelineTask(request.params.taskId);
  if (!task) {
    notFound(response, request.params.taskId);
    return;
  }

  if (!task.result) {
    response.status(409).json({ message: "Pipeline result is not ready yet." });
    return;
  }

  response.json(task.result);
});
