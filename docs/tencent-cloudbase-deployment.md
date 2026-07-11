# Tencent CloudBase Run Deployment

本分支把 Money Agent 准备成 CloudBase Run 单容器部署：同一个容器内运行 Express 后端、托管前端静态资源，并由后端按需调用本地 B/C/D Agent。报告聊天默认使用本地规则模板，不依赖外部 LLM、API Key 或云数据库。

## 架构

```text
Browser
-> CloudBase Run container :8080
-> Express backend
-> B TypeScript Agent
-> C Python risk_case Agent
-> D Python recommendation_action Agent
-> /tmp runtime files
```

前端生产包由 Express 静态托管，浏览器对 `/api/*` 使用同源请求，因此默认不需要单独配置跨域。

## 构建

```bash
docker build -t money-agent-cloudbase .
```

Dockerfile 使用两阶段构建：

- `build`：安装 pnpm workspace 依赖，构建 `website/frontend/dist` 和 `website/backend/dist`。
- `runtime`：安装 Node.js 运行时、Python venv、C/D requirements，并复制 `agents`、`shared`、`knowledge_base`、`scripts`、`tests` 与构建产物。

本镜像必须包含真实 Pipeline 所需目录；不要在 `.dockerignore` 中排除 `agents`、`shared`、`knowledge_base`、`tests`、`scripts` 或 `pnpm-lock.yaml`。

## 本地容器验证

```bash
docker run --rm -p 8080:8080 money-agent-cloudbase
curl http://127.0.0.1:8080/api/health
```

打开 `http://127.0.0.1:8080` 后上传或粘贴合同文本，应该进入真实多 Agent 分析模式，报告中可看到 `runtimeMode = INTEGRATED`。

## CloudBase Run 配置

建议配置：

- 容器端口：`8080`
- CPU：至少 `1 vCPU`
- 内存：至少 `2 GB`，如合同较长或 OCR 使用较多可提高到 `4 GB`
- 实例数：先使用 `1`
- 健康检查：HTTP `GET /api/health`
- 发布流量：新版本先 `0%`，健康检查和手动验证通过后再切换到 `100%`

推荐环境变量：

```text
NODE_ENV=production
PORT=8080
SERVE_FRONTEND=true
RUNTIME_ROOT=/tmp/money-agent-runtime
PYTHON_BIN=/opt/venv/bin/python
VITE_USE_MOCK_PIPELINE=false
VITE_API_BASE_URL=
```

可选环境变量：

```text
CORS_ORIGIN=https://your-domain.example
FRONTEND_DIST=/app/website/frontend/dist
SCHEMA_PATH=/app/shared/schemas/analysis-protocol-v1.schema.json
```

同源部署时不需要 `CORS_ORIGIN`。如果前端将来迁到另一个域名，再用逗号分隔配置允许来源。

## 单实例限制

当前 Pipeline task store 是内存态，任务状态只存在于当前 Node.js 进程内。这意味着：

- 适合单实例 MVP 和小流量验证。
- 多实例扩容后，同一个任务的 status/result 请求可能打到不同实例而查不到状态。
- 容器重启后，历史任务状态会丢失。

上生产多实例前，需要把 task store 换成 Redis、数据库或 CloudBase 可持久化存储，并考虑粘性会话或任务 ID 到存储的稳定路由。

## 运行时文件

真实 B/C/D Pipeline 的中间 JSON 写入：

```text
/tmp/money-agent-runtime/pipeline/<taskId>/
```

C Agent 的 SQLite 运行库会在缺失时用 seed SQL 初始化到：

```text
/tmp/money-agent-runtime/risk_case_agent.db
```

这些文件只用于当前容器的运行排查，不应依赖为长期持久化数据。

## 安全说明

- 默认不需要外部 LLM Key；只有同时设置 `ENABLE_CHAT_LLM=true` 和后端 `LLM_API_KEY` 时，聊天回答才会调用外部模型。
- 不要把 `.env`、`.env.local`、数据库文件、`.runtime` 或日志打进镜像。
- 若未来接入 Tencent SecretId/SecretKey 或第三方 API Key，应使用 CloudBase 环境变量/密钥管理，不要提交到仓库。
