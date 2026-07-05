# risk_case Agent 实现说明

## 1. A 协议读取总结

`RiskCaseOutput` 使用统一 Agent 信封：

- `schemaVersion`: 固定 `1.0.0`
- `taskId`: 与 B 输出一致
- `contractId`: 与 B 输出一致
- `runId`: C 模块本次运行 ID
- `agent`: 固定 `risk_case`
- `agentVersion`: C 模块版本
- `status`: `completed | partial | failed`
- `generatedAt`: ISO 8601 时间，含时区
- `inputRunIds`: 必须包含 B 的 `runId`
- `data`: `RiskCaseData`
- `warnings`: 结构化警告数组
- `errors`: 结构化错误数组

`RiskCaseData`：

```json
{
  "riskItems": [],
  "riskSummary": {
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
```

`RiskItemV1` 必填字段：

- `id`
- `title`
- `category`
- `riskLevel`
- `confidence`
- `clauseText`
- `clauseLocation`
- `relatedClauseIds`
- `evidence`
- `reason`
- `possibleConsequence`
- `matchedCases`
- `questionToAsk`

关联规则：

- `relatedClauseIds` 引用 B 的 `data.clauses[].clauseId`。
- `evidence[].clauseId` 必须同时出现在当前风险项的 `relatedClauseIds` 中。
- `evidence[].quote` 只能放合同原文摘录。
- `matchedCases` 无可靠案例时返回 `[]`，不能编造来源。

枚举：

- `riskLevel`: `high | medium | low`
- `category`: `cost_transparency | interest_fee | repayment | prepayment | overdue | authorization_privacy | dispute_resolution | other`

`riskSummary` 校验规则：必须严格等于 `riskItems` 按 `riskLevel` 的计数，即使没有风险也返回三个字段且值为 `0`。

## 2. B 示例输入总结

B 示例文件：`examples/b-contract-cost-output.json`

`clauses[].clauseId` 在示例中形如：

```text
clause_fee_003
clause_prepay_008
```

注意：B 代码实际生成可能是 `clause_001_fee` 这类格式，因此 C 模块不推断格式，只透传并引用 B 输出里的 `clauseId`。

影响风险判断的 `contractSummary` 字段：

- `institution`
- `productType`
- `loanAmount`
- `actualReceivedAmount`
- `loanTermMonths`
- `installmentCount`
- `monthlyPayment`
- `repaymentMethod`
- `nominalRate`
- `prepaymentRule`
- `overdueFee`

影响风险判断的 `costAnalysis` 字段：

- `totalRepayment`
- `totalInterest`
- `additionalFees`
- `realAnnualRate`
- `calculationBasis`

`realAnnualRate` 是真实年化成本百分数。当前规则中 `realAnnualRate > 24` 可命中“真实年化偏高”；本次 B 示例为 `23.4`，未命中该规则，但仍会因额外费用、砍头息、提前还款手续费和逾期罚息命中风险。

## 3. 知识库表关系

- `risk_rules` 是规则引擎入口，命中后触发法规检索和案例检索。
- `legal_regulations` 通过关键词、适用场景、法规摘要与规则名称进行 RAG 检索。
- `cases` 通过案例描述、争议焦点、风险类型与合同条款进行相似案例检索。
- `contract_clause_templates` 用于后续扩展条款模式识别。
- `financial_products` 用于后续扩展产品费率基准和场景化判断。
- `risk_case_outputs` 保存 C Agent 完整 JSON 输出。
- `risk_items`、`risk_evidence`、`risk_matched_cases` 保存结构化风险结果，便于 D 模块或前端查询。

## 4. 本次示例运行结果

输入：`examples/b-contract-cost-output.json`

输出：`outputs/c-risk-case-output.json`

命中规则：

| 规则 | 风险等级 | 权重 | 证据条款 |
| --- | --- | ---: | --- |
| 费用不透明 | high | 25 | `clause_fee_003` |
| 提前还款限制 | medium | 15 | `clause_prepay_008` |
| 砍头息 | high | 20 | `clause_fee_003` |
| 逾期罚息过高 | medium | 10 | `clause_fee_003` |

风险评分：`100 - 70 = 30`，整体分数映射为高风险。

协议输出计数：

```json
{
  "high": 2,
  "medium": 2,
  "low": 0
}
```

数据库写入结果：

- `risk_case_outputs`: 1
- `risk_items`: 4
- `risk_evidence`: 4
- `risk_matched_cases`: 12

## 5. 启动命令

```bash
cd risk_case_agent
python knowledge/init_db.py
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

检查数据库：

```bash
python -c "import sqlite3; c=sqlite3.connect('risk_case_agent.db'); print(c.execute('select id, category, risk_level from risk_items').fetchall())"
```
