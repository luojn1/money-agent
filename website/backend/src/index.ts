import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import { analysisRouter } from "./routes/analysis.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { getKnowledgeRootCandidates, hasKnowledgeBundle } from "./services/knowledgeBase.js";
import {
  getRuntimeRoot,
  projectRoot,
  recommendationActionMainPath,
  riskCaseMainPath,
  schemaPath,
} from "./services/pipelineOrchestrator.js";

const app = express();
const host = "0.0.0.0";
const port = Number(process.env.PORT ?? 8080);
const corsOrigins =
  process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
const serveFrontend = process.env.SERVE_FRONTEND?.toLowerCase() === "true";
const frontendDist = resolve(process.env.FRONTEND_DIST?.trim() || resolve(process.cwd(), "website", "frontend", "dist"));
const frontendIndex = join(frontendDist, "index.html");
const frontendAvailable = serveFrontend && existsSync(frontendIndex);

const readinessChecks = () => {
  const pythonBin = process.env.PYTHON_BIN?.trim();
  const checks = [
    {
      name: "knowledge_base",
      ok: getKnowledgeRootCandidates().some(hasKnowledgeBundle),
    },
    {
      name: "agents/risk_case/main.py",
      ok: existsSync(riskCaseMainPath),
    },
    {
      name: "agents/recommendation_action/main.py",
      ok: existsSync(recommendationActionMainPath),
    },
    {
      name: "shared/schemas/analysis-protocol-v1.schema.json",
      ok: existsSync(schemaPath),
    },
    {
      name: "PYTHON_BIN",
      ok: Boolean(pythonBin && existsSync(pythonBin)),
    },
  ];

  return {
    checks,
    missing: checks.filter((check) => !check.ok).map((check) => check.name),
  };
};

const logStartupPathChecks = () => {
  const readiness = readinessChecks();
  const byName = new Map(readiness.checks.map((check) => [check.name, check.ok]));

  console.log(`PROJECT_ROOT: ${projectRoot}`);
  console.log(`Knowledge base available: ${byName.get("knowledge_base") ? "yes" : "no"}`);
  console.log(`agents/risk_case/main.py available: ${byName.get("agents/risk_case/main.py") ? "yes" : "no"}`);
  console.log(
    `agents/recommendation_action/main.py available: ${
      byName.get("agents/recommendation_action/main.py") ? "yes" : "no"
    }`,
  );
  console.log(`Schema available: ${byName.get("shared/schemas/analysis-protocol-v1.schema.json") ? "yes" : "no"}`);
  console.log(`PYTHON_BIN available: ${byName.get("PYTHON_BIN") ? "yes" : "no"}`);
};

app.disable("x-powered-by");
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins }));
} else if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
}
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/ready", (_request, response) => {
  const { missing } = readinessChecks();
  if (missing.length === 0) {
    response.json({ status: "ready" });
    return;
  }

  response.status(503).json({ status: "not_ready", missing });
});

app.use("/api/analysis", analysisRouter);
app.use("/api/pipeline", pipelineRouter);

if (frontendAvailable) {
  app.use(express.static(frontendDist));
  app.use((request, response, next) => {
    if (request.path.startsWith("/api")) {
      next();
      return;
    }

    response.sendFile(frontendIndex);
  });
}

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "接口不存在" });
});

app.use((_request, response) => {
  response.status(404).json({ message: "接口不存在" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ message: "文件超过 20MB，请压缩后重新上传，或直接粘贴合同文字。" });
      return;
    }
    response.status(400).json({ message: "合同文件上传失败，请重新选择文件。" });
    return;
  }
  console.error(error);
  response.status(500).json({ message: "服务暂时不可用，请稍后重试" });
});

app.listen(port, host, () => {
  console.log(`Money Agent listening on http://${host}:${port}`);
  console.log("Pipeline task store: in-memory single-instance mode.");
  console.log(`Pipeline runtime root: ${getRuntimeRoot()}`);
  logStartupPathChecks();

  if (frontendAvailable) {
    console.log(`Serving frontend static assets from ${frontendDist}`);
  } else if (serveFrontend) {
    console.warn(`SERVE_FRONTEND=true but frontend build was not found at ${frontendIndex}`);
  } else {
    console.log("Frontend static serving disabled.");
  }
});
