# B/C/D Agent 联调验收清单

## 分支信息

| 模块 | 分支 | 最新 commit SHA | 是否确认可以整合 | 备注 |
| --- | --- | --- | --- | --- |
| B 合同与成本 Agent | 待填写 | 待填写 | 待确认 | 当前阶段不修改 B 核心逻辑 |
| C 风险与案例 Agent | 待填写 | 待填写 | 待确认 | 当前阶段不 merge C 分支 |
| D 建议与行动 Agent | 待填写 | 待填写 | 待确认 | 当前阶段不 merge D 分支 |

## 单模块验收

### B：合同与成本 Agent

- 服务能启动。
- 上传接口可用。
- 能输出 `ContractCostOutput`。
- `clauseId` 稳定，同一合同重复运行不应随机变化。
- 失败时不会偷偷替换为示例合同或旧 Mock 数据。

### C：风险与案例 Agent

- Python 依赖可安装。
- `main.py` 可运行。
- 能读取真实 B 输出。
- `relatedClauseIds` 能在 B 输出的 `clauses[].clauseId` 中找到。
- 能输出 `RiskCaseOutput`。

### D：建议与行动 Agent

- Python 依赖可安装。
- `main.py` 可运行。
- 能读取真实 B/C 输出。
- `relatedRiskIds` 能在 C 输出的 `riskItems[].id` 中找到。
- 能输出 `RecommendationActionOutput`。

## 端到端验收

- `B.taskId == C.taskId == D.taskId`。
- `B.contractId == C.contractId == D.contractId`。
- `C.inputRunIds` 包含 `B.runId`。
- `D.inputRunIds` 包含 `B.runId` 和 `C.runId`。
- 页面确认合同金额来自 B。
- 页面确认风险来自 C。
- 页面确认建议来自 D。
- 任一 Agent 失败时显示明确错误。
- 不使用旧 Mock 冒充真实运行结果。

## 前端模式验收

- `VITE_USE_MOCK_PIPELINE=true` 时，前端明确显示“Mock 演示模式”。
- Mock 演示模式不调用真实 C/D Agent。
- 真实 Pipeline 模式未接入时，前端明确显示“暂未接入”。
- 真实 Pipeline 模式未接入时，不把旧 Mock 或本地预览结果包装成真实运行结果。

## 验收记录

| 日期 | 验收人 | 模块 | 结论 | 问题记录 |
| --- | --- | --- | --- | --- |
| 待填写 | 待填写 | B/C/D | 待填写 | 待填写 |
