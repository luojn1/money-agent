# B/C/D Agent 联调验收清单

## 分支信息

| 模块 | 分支 | 使用 commit SHA | 结论 |
| --- | --- | --- | --- |
| B 合同与成本 Agent | `origin/b-agents-github-package` | `7b3911d3d2a5db2d59d79b019aad8ac000ecc2ca` | 已 cherry-pick 修复 |
| C 风险与案例 Agent | `origin/c-agents-github-package` | `944bf9c1818ffcd2d91e5a5c2d870c283d2bff0c` | 已迁入 `agents/risk_case` |
| D 建议与行动 Agent | `origin/recommendation_action_agent` | `7eba5c51664b9a226768c4192f7e5f29f6a10e2b` | 已迁入 `agents/recommendation_action` |

## 单模块验收

### B：合同与成本 Agent

- [x] `pnpm run verify:b-agents` 通过。
- [x] `pnpm --filter @money-agent/backend run typecheck` 通过。
- [x] `pnpm --filter @money-agent/backend run build` 通过。
- [x] 空上传不会自动回退示例合同。
- [x] 示例合同只通过 `POST /api/analysis/demo` 创建。
- [x] 未知 `taskId` 返回 404。
- [x] `/api/analysis/:taskId/b-output` 返回 `ContractCostOutput`。
- [x] B 输出失败时 `status = failed`。

### C：风险与案例 Agent

- [x] `python -m compileall .` 通过。
- [x] `python -m pytest` 通过。
- [x] `python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json --trace-output outputs/c-risk-case-output.trace.json --trace` 通过。
- [x] 输出 `agent = risk_case`。
- [x] `inputRunIds` 包含 `B.runId`。
- [x] `data` 只包含 `riskItems`、`riskSummary`。
- [x] 找不到真实条款时跳过风险，不使用第一条条款兜底。
- [x] B failed 时 C failed 且 `data = null`。
- [x] B partial 时 C partial。

### D：建议与行动 Agent

- [x] `python main.py` 通过。
- [x] `python -m pytest` 通过。
- [x] 默认 schema 自动发现 `shared/schemas/analysis-protocol-v1.schema.json`。
- [x] D mismatch 测试返回 `failed`、`data = null`、`UPSTREAM_LINK_MISMATCH`。
- [x] `data` 只包含 `overallResult`、`recommendations`、`questionList`、`disclaimer`。
- [x] `recommendations[].relatedRiskIds` 全部存在于 `C.data.riskItems[].id`。
- [x] C 调用路径默认发现 `agents/risk_case`，支持 `C_DIR` 覆盖。
- [x] 不再向新版 C 传 `--strict-protocol`。

## 端到端验收

- [x] `pnpm run verify:bcd-pipeline` 通过。
- [x] `B.taskId == C.taskId == D.taskId`。
- [x] `B.contractId == C.contractId == D.contractId`。
- [x] `C.inputRunIds` 包含 `B.runId`。
- [x] `D.inputRunIds` 包含 `B.runId` 和 `C.runId`。
- [x] `C.relatedClauseIds` 全部存在于 B clauses。
- [x] `C.evidence[].clauseId` 位于对应 `relatedClauseIds`。
- [x] `D.relatedRiskIds` 全部存在于 C riskItems。
- [x] 最终结果 `runtimeMode = INTEGRATED`。

## 前端模式验收

- [x] `VITE_USE_MOCK_PIPELINE=true` 时，前端显示“演示数据模式”。
- [x] Mock 模式不调用真实 C/D Agent。
- [x] `VITE_USE_MOCK_PIPELINE=false` 时，前端调用真实 `/api/pipeline/*`。
- [x] 真实模式显示“真实多 Agent 分析”与 `runtimeMode = INTEGRATED`。
- [x] 前端风险来自 C，建议来自 D，行动提醒来自 D action plan。

## 当前测试合同结果

使用 `tests/fixtures/integration-demo-contract.txt`：

- 借款金额：10000 元
- 实际到账：9500 元
- 月供：900 元
- 真实年化：24.37%
- 风险数量：7
- 建议数量：9

当前链路结果为 `partial`，原因是 B/C/D 透传了可展示 warning；流程本身完整跑通。
