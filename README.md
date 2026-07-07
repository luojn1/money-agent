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
- 后端：http://127.0.0.1:3001
- 健康检查：http://127.0.0.1:3001/api/health

正式整合模式下，后端内部调用 C/D，不需要单独启动 D 的 8091 预览服务。

## 环境变量

```text
VITE_USE_MOCK_PIPELINE
PYTHON_BIN
B_BASE_URL
C_DIR
SCHEMA_PATH
```

- `VITE_USE_MOCK_PIPELINE=true`：前端使用演示数据模式。
- `VITE_USE_MOCK_PIPELINE=false`：前端调用真实 `/api/pipeline/*`。
- `PYTHON_BIN`：后端调用 Python Agent 的命令或绝对路径；默认尝试 `python`、`py -3`、`python3`。
- `B_BASE_URL`、`C_DIR`：D 独立预览服务兼容变量。
- `SCHEMA_PATH`：D Schema 校验路径，默认使用 `shared/schemas/analysis-protocol-v1.schema.json`。

## 核心接口

真实 BCD Pipeline：

- `POST /api/pipeline/analyze`
- `GET /api/pipeline/:taskId/status`
- `GET /api/pipeline/:taskId/result`

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

运行文件写入 `.runtime/pipeline/<taskId>/`，该目录已加入 `.gitignore`。
