# “看得懂的钱”多 Agent 数据协议 v1.0.0

状态：**冻结，可供 B/C/D 联调**

协议版本：`1.0.0`

机器可读 Schema：[`../shared/schemas/analysis-protocol-v1.schema.json`](../shared/schemas/analysis-protocol-v1.schema.json)

TypeScript 类型：[`../shared/analysisProtocol.ts`](../shared/analysisProtocol.ts)

## 1. 目标与数据流

本协议同时约束 Agent 之间的交接数据和最终前端接口，避免各模块用不同字段重复转换。

```text
合同文件
  -> B 合同解析 + 成本测算（contract_cost）
  -> C 风险识别 + 案例匹配（risk_case）
  -> D 建议生成 + 行动管理（recommendation_action）
  -> 后端汇总 FinalAnalysisResultV1
  -> A 的前端报告页
```

- B 输出合同摘要、条款、还款计划和成本结果。C、D 均可消费。
- C 必须用 B 的 `clauseId` 关联证据，输出 `riskItems[].relatedClauseIds`。
- D 必须用 C 的风险 `id` 关联建议，输出 `recommendations[].relatedRiskIds`。
- 后端只向前端暴露 `FinalAnalysisResultV1`；各 Agent 的中间推理过程不进入前端响应。

## 2. 全局约定

| 项目 | 约定 |
|---|---|
| 编码/格式 | UTF-8 JSON，字段名使用 `camelCase` |
| 版本 | 所有 Agent 包必须携带 `schemaVersion: "1.0.0"` |
| 时间 | ISO 8601，必须含时区，如 `2026-07-02T15:30:00+08:00` |
| 金额 | 单位统一为人民币元，JSON number，最多两位小数；不使用“万元” |
| 利率 | 单位统一为百分数，例如 `23.4` 表示 `23.4%`，不是 `0.234` |
| 置信度/相似度 | `0` 到 `1`，例如 `0.86`；无法计算时为 `null` |
| 未知标量 | 字段必须保留并填 `null`，不得猜测，不得用空串、`0` 或 `-1` 代替 |
| 未知列表 | 使用空数组 `[]` |
| ID | 同一任务内稳定且唯一；关联必须使用 ID，不得靠标题或数组下标 |
| 扩展 | v1 内不得修改字段语义；新增必填字段须升级协议版本 |

### 2.1 通用 Agent 信封

B/C/D 的输出均使用同一外层结构：

```json
{
  "schemaVersion": "1.0.0",
  "taskId": "task_20260702_001",
  "contractId": "contract_001",
  "runId": "run_b_001",
  "agent": "contract_cost",
  "agentVersion": "b-0.1.0",
  "status": "completed",
  "generatedAt": "2026-07-02T15:30:00+08:00",
  "inputRunIds": [],
  "data": {},
  "warnings": [],
  "errors": []
}
```

`agent` 只能取：

- B：`contract_cost`
- C：`risk_case`
- D：`recommendation_action`

`status` 语义：

- `completed`：必需产物完整，`data` 非空。
- `partial`：仍可继续汇总，`data` 非空，并在 `warnings` 说明缺失项。
- `failed`：本次运行不可用，`data` 必须为 `null`，`errors` 至少一项。

错误与警告统一结构：

```json
{
  "code": "MISSING_REPAYMENT_TABLE",
  "message": "合同未提供完整还款计划表",
  "fieldPath": "data.repaymentSchedule",
  "recoverable": true
}
```

`recoverable` 仅存在于 `errors`；`fieldPath` 无明确字段时填 `null`。

## 3. B：合同解析与成本测算

`data` 类型为 `ContractCostData`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `contract` | object | 是 | 文件名称、SHA-256、页数 |
| `contractSummary` | object | 是 | 前端合同关键信息的唯一来源 |
| `clauses` | array | 是 | C 风险识别的条款输入；每条必须有稳定 `clauseId` |
| `repaymentSchedule` | array | 是 | 逐期本金、利息、费用和还款额；合同无明细时为 `[]` |
| `costAnalysis` | object | 是 | 总还款、总利息、额外费用、真实年化利率及计算依据 |

`contractSummary` 固定字段：

```json
{
  "institution": "安心消费金融有限公司",
  "productType": "个人消费贷款",
  "loanAmount": 10000,
  "actualReceivedAmount": 9500,
  "loanTermMonths": 12,
  "installmentCount": 12,
  "monthlyPayment": 940,
  "repaymentMethod": "按月等额还款",
  "nominalRate": 12.8,
  "prepaymentRule": "提前结清需支付剩余本金 2% 的手续费",
  "overdueFee": "逾期罚息为正常利率的 1.5 倍"
}
```

成本口径：

- `totalRepayment`：借款人全周期需支付的全部金额。
- `totalInterest`：合同明确列示或按还款计划计算的利息合计。
- `additionalFees`：服务费、担保费、会员费等非利息费用合计。
- `realAnnualRate`：基于实际到账金额与实际现金流计算的年化成本百分数。
- `calculationBasis`：计算公式、假设或缺失条件的自然语言列表，禁止只给数字不说明口径。

完整示例见 [`../data_samples/protocol/b-contract-cost-output.json`](../data_samples/protocol/b-contract-cost-output.json)。

## 4. C：风险识别与案例匹配

C 读取 B 的完整信封，并把 B 的 `runId` 放入 `inputRunIds`。`data.riskItems[]` 的关键关联规则：

- `relatedClauseIds`：引用 B 的 `clauses[].clauseId`，至少一项。
- `evidence[].quote`：合同原文短摘录；不得放模型推断。
- `evidence[].clauseId`：必须同时出现在 `relatedClauseIds` 中。
- `matchedCases`：没有可靠案例时用 `[]`，不得编造案号或来源。
- `riskLevel`：`high | medium | low`。
- `category`：`cost_transparency | interest_fee | repayment | prepayment | overdue | authorization_privacy | dispute_resolution | other`。

`riskSummary` 必须等于 `riskItems` 按风险等级的计数；即使没有风险也返回三个值为 `0`。

完整示例见 [`../data_samples/protocol/c-risk-case-output.json`](../data_samples/protocol/c-risk-case-output.json)。

## 5. D：建议生成与行动管理

D 读取 B、C 两份完整信封，并将二者 `runId` 放入 `inputRunIds`。建议通过 `relatedRiskIds` 引用 C 的 `riskItems[].id`。

| 字段 | 说明 |
|---|---|
| `overallResult.level` | `low | verify | high | insufficient_information` |
| `recommendations[].priority` | `must | should | optional` |
| `recommendations[].timing` | `before_signing | during_repayment | when_overdue | anytime` |
| `questionList` | 面向用户、可直接向机构询问的简短问题 |
| `disclaimer` | 报告免责声明，不得省略 |

如 B 或 C 为 `partial`，D 可以继续生成建议，但自身必须为 `partial`，并在 `warnings` 传递对结论有影响的缺失项。若关键金额和条款均不可用，`overallResult.level` 必须为 `insufficient_information`。

完整示例见 [`../data_samples/protocol/d-recommendation-output.json`](../data_samples/protocol/d-recommendation-output.json)。

## 6. A/后端：创建任务与查询进度

正式合同使用 `multipart/form-data` 上传，避免把文件转成 base64 塞进 JSON：

```http
POST /api/analysis
Content-Type: multipart/form-data

file=<PDF、PNG 或 JPG 文件>
```

演示合同可继续使用 `POST /api/analysis/demo`。两个接口成功时均返回 `AnalysisTaskCreatedV1`：

```json
{
  "schemaVersion": "1.0.0",
  "taskId": "task_20260702_001",
  "contractId": "contract_001",
  "status": "processing",
  "createdAt": "2026-07-02T15:29:00+08:00"
}
```

轮询接口：

```http
GET /api/analysis/{taskId}/status
```

`currentStep` 为 `0` 到 `4`，`progress` 为整数 `0` 到 `100`。`currentStage` 取 `queued | contract_cost | risk_case | recommendation_action | completed | failed`。`stages` 固定包含 B/C/D 三项，使前端可以显示逐阶段进度。

完整示例见 [`../data_samples/protocol/task-status.json`](../data_samples/protocol/task-status.json)。

## 7. A/后端：最终前端响应

D 完成后，由后端汇总为 `FinalAnalysisResultV1`。该结构保留现有页面使用的 `contractSummary`、`costAnalysis`、`riskItems`、`overallResult` 和 `questionList`，新增协议追踪字段，现有前端可以直接兼容额外字段。

```http
GET /api/analysis/{taskId}/result
Content-Type: application/json
```

必需的追踪字段：

- `schemaVersion`：固定 `1.0.0`。
- `generatedAt`：汇总时间。
- `completedWithWarnings`：任一来源 Agent 为 `partial` 或存在警告时为 `true`。
- `warnings`：仅放可安全展示或记录的结构化警告，不放模型思维过程。
- `sourceAgentRuns`：B/C/D 的版本、运行 ID 和状态。

最终示例见 [`../data_samples/protocol/final-analysis-result.json`](../data_samples/protocol/final-analysis-result.json)。

## 8. 联调验收规则

1. 所有消息先通过 JSON Schema 校验，再进入下一 Agent。
2. `taskId`、`contractId` 在整条链路中必须一致。
3. C 的 `inputRunIds` 必须包含 B 的 `runId`；D 必须包含 B、C 的 `runId`。
4. 所有 `relatedClauseIds`、`evidence[].clauseId`、`relatedRiskIds` 必须能解析到来源对象。
5. `riskSummary` 必须与 `riskItems` 实际计数一致。
6. 未知值遵守 `null`/`[]` 规则，禁止用占位文案污染机器字段。
7. 前端只依赖最终响应；中间 Agent 增加内部字段不得影响前端。

## 9. v1 冻结范围

以下内容在 `1.0.x` 内冻结：字段名称、枚举值、金额/费率单位、ID 关联方式和缺失值语义。文案、数组顺序和非必填展示逻辑可以调整。任何删除字段、修改单位或新增必填字段的变更升级到 `2.0.0`。
