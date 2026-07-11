# 看得懂的钱

消费金融合同体检 MVP。当前版本已接入真实 B/C/D 多 Agent Pipeline：

```text
Frontend
→ Express Pipeline
→ B TypeScript：合同解析与成本测算
→ C Python：风险识别与案例匹配
→ D Python：建议与行动方案
→ Final Report
```

## 本地启动

```bash
pnpm install
python -m pip install -r agents/risk_case/requirements.txt
python -m pip install -r agents/recommendation_action/requirements.txt
pnpm run dev
```

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8080
- 健康检查：http://127.0.0.1:8080/api/health

正式整合模式下，后端内部调用 C/D，不需要单独启动 D 的 8091 预览服务。

## 环境变量

```text
VITE_USE_MOCK_PIPELINE
VITE_API_BASE_URL
PORT
SERVE_FRONTEND
FRONTEND_DIST
RUNTIME_ROOT
CORS_ORIGIN
PYTHON_BIN
B_BASE_URL
C_DIR
SCHEMA_PATH
ENABLE_CHAT_LLM
LLM_API_KEY
LLM_BASE_URL
LLM_MODEL
```

- `VITE_USE_MOCK_PIPELINE=true`：前端使用演示数据模式。
- `VITE_USE_MOCK_PIPELINE=false`：前端调用真实 `/api/pipeline/*`。
- `VITE_API_BASE_URL`：前端 API 前缀；生产同源部署留空，本地开发由 Vite 代理 `/api` 到后端。
- `PORT`：后端监听端口，默认 `8080`。
- `SERVE_FRONTEND=true`：后端托管 `website/frontend/dist`，用于单容器部署。
- `FRONTEND_DIST`：前端静态目录，默认 `<repo>/website/frontend/dist`。
- `RUNTIME_ROOT`：真实 Pipeline 的运行文件根目录；本地默认 `.runtime`，生产默认 `/tmp/money-agent-runtime`。
- `CORS_ORIGIN`：跨域允许来源，逗号分隔；同源部署可不配置。
- `PYTHON_BIN`：后端调用 Python Agent 的命令或绝对路径；默认尝试 `python`、`py -3`、`python3`。
- `B_BASE_URL`、`C_DIR`：D 独立预览服务兼容变量。
- `SCHEMA_PATH`：D Schema 校验路径，默认使用 `shared/schemas/analysis-protocol-v1.schema.json`。
- `ENABLE_CHAT_LLM=true`：使用配置的大模型优化“问一问”的通俗表达；调用失败时自动回退到本地回答。
- `LLM_API_KEY`：服务端大模型密钥，只配置在部署平台环境变量中，不写入仓库。
- `LLM_BASE_URL`：兼容 OpenAI Chat Completions 的接口地址，当前默认 `https://api.deepseek.com`。
- `LLM_MODEL`：问答模型名称，当前默认 `deepseek-v4-flash`。

## 单容器部署

腾讯云 CloudBase Run 使用根目录 `Dockerfile` 构建单容器镜像：

```bash
docker build -t money-agent-cloudbase .
docker run --rm -p 8080:8080 money-agent-cloudbase
```

部署时建议设置：

```text
NODE_ENV=production
PORT=8080
SERVE_FRONTEND=true
RUNTIME_ROOT=/tmp/money-agent-runtime
PYTHON_BIN=/opt/venv/bin/python
VITE_USE_MOCK_PIPELINE=false
VITE_API_BASE_URL=
```

健康检查路径为 `GET /api/health`。当前任务状态存储是内存态，只适合单实例 MVP；多实例或容器重启会导致任务状态丢失。CloudBase Run 的详细步骤、资源建议和 0% -> 100% 流量切换说明见 `docs/tencent-cloudbase-deployment.md`。

## 核心接口

真实 BCD Pipeline：

- `POST /api/pipeline/analyze`
- `GET /api/pipeline/:taskId/status`
- `GET /api/pipeline/:taskId/result`
- `POST /api/pipeline/:taskId/chat`
- `GET /api/pipeline/:taskId/chat/history`

B 单模块兼容接口：

- `POST /api/analysis`
- `POST /api/analysis/upload`
- `POST /api/analysis/demo`
- `GET /api/analysis/:taskId/status`
- `GET /api/analysis/:taskId/result`
- `GET /api/analysis/:taskId/b-output`
- `GET /api/analysis/:taskId/contract-cost-output`

## 验证

```bash
pnpm run verify:b-agents
pnpm run verify:bcd-pipeline
pnpm --filter @money-agent/backend run typecheck
pnpm --filter @money-agent/backend run build
pnpm --filter @money-agent/frontend run typecheck
pnpm --filter @money-agent/frontend run build
cd agents/risk_case && python -m pytest
cd ../recommendation_action && python -m pytest
```

`verify:bcd-pipeline` 使用 `tests/fixtures/integration-demo-contract.txt` 运行真实 B→C→D，检查 ID 链路、clause/risk 引用、D mismatch 失败处理和 `runtimeMode = INTEGRATED`。

## 目录

```text
agents/risk_case                         # C Agent
agents/recommendation_action             # D Agent
docs/bcd-integration-plan.md
docs/bcd-integration-checklist.md
shared/analysis.ts
shared/analysisProtocol.ts
shared/schemas/analysis-protocol-v1.schema.json
website/backend/src/routes/pipeline.ts
website/backend/src/services/pipelineOrchestrator.ts
website/frontend/src/services/pipelineApi.ts
tests/fixtures/integration-demo-contract.txt
scripts/verify-b-agents.ts
scripts/verify-bcd-pipeline.ts
```

本地运行文件默认写入 `.runtime/pipeline/<taskId>/`，生产容器默认写入 `/tmp/money-agent-runtime/pipeline/<taskId>/`；`.runtime` 已加入 `.gitignore`。
