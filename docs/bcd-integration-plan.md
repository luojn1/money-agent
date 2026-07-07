# BCD Agent Integration Plan

## 当前真实流程

```text
Frontend
→ Express Pipeline
→ B TypeScript contract_cost
→ C Python risk_case
→ D Python recommendation_action
→ Final Report
```

前端真实模式只调用：

- `POST /api/pipeline/analyze`
- `GET /api/pipeline/:taskId/status`
- `GET /api/pipeline/:taskId/result`

B 的历史接口 `POST /api/analysis`、`/demo`、`/:taskId/b-output` 仍保留，用于 B 单模块验证和兼容联调；正式 BCD 前端不直接调用 C 或 D。

## 本地启动

```bash
pnpm install
python -m pip install -r agents/risk_case/requirements.txt
python -m pip install -r agents/recommendation_action/requirements.txt
pnpm run dev
```

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:3001

正式整合模式下，后端内部通过 Python 子进程调用 C/D，不要求用户单独启动 D 的 8091 预览服务。

## 环境变量

```text
VITE_USE_MOCK_PIPELINE=true|false
PYTHON_BIN=python
B_BASE_URL=http://127.0.0.1:3001
C_DIR=agents/risk_case
SCHEMA_PATH=shared/schemas/analysis-protocol-v1.schema.json
```

- `VITE_USE_MOCK_PIPELINE=true`：前端使用浏览器内静态演示数据。
- `VITE_USE_MOCK_PIPELINE=false`：前端调用真实 `/api/pipeline/*`。
- `PYTHON_BIN`：后端调用 C/D 的 Python，可设为绝对路径；默认依次尝试 `python`、`py -3`、`python3`。
- `B_BASE_URL`、`C_DIR`：D 预览服务兼容变量；正式 Express Pipeline 不要求用户单独配置。
- `SCHEMA_PATH`：D Schema 校验路径，默认自动发现仓库 `shared/schemas/analysis-protocol-v1.schema.json`。

## 运行文件

每个真实任务写入独立目录：

```text
.runtime/pipeline/<taskId>/
├── b-output.json
├── c-output.json
├── c-trace.json
├── d-output.json
└── d-action-plan.json
```

`.runtime/` 已加入 `.gitignore`，不得提交运行文件。

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
