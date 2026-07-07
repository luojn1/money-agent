import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "cors";
import express from "express";
import { analysisRouter } from "./routes/analysis.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { getRuntimeRoot } from "./services/pipelineOrchestrator.js";

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
  console.error(error);
  response.status(500).json({ message: "服务暂时不可用，请稍后重试" });
});

app.listen(port, host, () => {
  console.log(`Money Agent listening on http://${host}:${port}`);
  console.log("Pipeline task store: in-memory single-instance mode.");
  console.log(`Pipeline runtime root: ${getRuntimeRoot()}`);

  if (frontendAvailable) {
    console.log(`Serving frontend static assets from ${frontendDist}`);
  } else if (serveFrontend) {
    console.warn(`SERVE_FRONTEND=true but frontend build was not found at ${frontendIndex}`);
  } else {
    console.log("Frontend static serving disabled.");
  }
});
