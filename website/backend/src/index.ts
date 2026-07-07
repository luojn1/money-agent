import cors from "cors";
import express from "express";
import { analysisRouter } from "./routes/analysis.js";
import { pipelineRouter } from "./routes/pipeline.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/analysis", analysisRouter);
app.use("/api/pipeline", pipelineRouter);

app.use((_request, response) => {
  response.status(404).json({ message: "接口不存在" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next;
  console.error(error);
  response.status(500).json({ message: "服务暂时不可用，请稍后重试" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Money Agent API listening on http://127.0.0.1:${port}`);
});
