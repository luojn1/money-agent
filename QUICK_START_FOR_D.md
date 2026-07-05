# D 同学快速上手清单

## 最新快速路径（2026-07-04）

```bash
cd risk_case_agent
pip install -r requirements.txt
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

如果需要完全贴合 A 的协议字段进行校验，请运行：

```bash
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.strict.json --strict-protocol
```

如果只想看可视化效果，可在项目根目录运行：

```bash
preview_demo\open_preview_demo.bat
```

然后访问 `http://127.0.0.1:8090/preview_demo/index.html`。

## 1. 三步启动

```bash
git clone <项目仓库>
cd risk_case_agent
pip install -r requirements.txt
```

初始化并运行 C：

```bash
python knowledge/init_db.py
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

验证：

```bash
python -m pytest
```

## 2. C 输出文件

D 优先读取：

```text
risk_case_agent/outputs/c-risk-case-output.json
```

也可以从数据库读：

```text
risk_case_outputs.output_json
risk_items
risk_evidence
risk_matched_cases
```

## 3. 关键字段速查

| C 字段 | D 用途 |
| --- | --- |
| `runId` | 放入 D 的 `inputRunIds` |
| `data.riskItems[].id` | D 的 `recommendations[].relatedRiskIds[]` 必须引用它 |
| `data.riskItems[].riskLevel` | 决定建议优先级：high -> must，medium -> should，low -> optional |
| `data.riskItems[].title` | 建议标题或风险概述 |
| `data.riskItems[].reason` | 建议理由 `rationale` |
| `data.riskItems[].possibleConsequence` | 用户后果说明 |
| `data.riskItems[].questionToAsk` | 可转为 `questionList` 或 `recommendations[].action` |
| `data.riskItems[].matchedCases` | 案例支撑 |
| `data.riskItems[].evidence` | 合同原文证据 |
| `data.riskSummary` | D 的 `overallResult.level` 参考 |

## 4. C -> D 数据流

```text
B 输出 contract_cost JSON
  -> C 读取 B.data.contractSummary / clauses / costAnalysis
  -> C 生成 RiskCaseOutput
  -> D 读取 C.data.riskItems
  -> D 生成 RecommendationActionOutput
```

ID 关联：

```text
B.data.clauses[].clauseId
  -> C.data.riskItems[].evidence[].clauseId

C.data.riskItems[].id
  -> D.data.recommendations[].relatedRiskIds[]
```

## 5. 一句话示例

D 可以这样处理：

```text
遍历 C.data.riskItems；每个风险生成一条 recommendation；
recommendation.relatedRiskIds = [riskItem.id]；
recommendation.action 优先使用 riskItem.questionToAsk；
recommendation.rationale 结合 riskItem.reason、possibleConsequence 和 matchedCases。
```

## 6. 注意事项

- C 没有输出顶层 `questionList`，D 应从 `riskItems[].questionToAsk` 汇总生成。
- C 没有输出 `recommendations`，D 必须自己生成。
- C 没有标准 `overallResult`，D 应参考 `riskSummary`、B/C warnings 和风险详情自行判断。
- 不要用风险标题或数组下标做关联，必须用 `riskItems[].id`。

## 7. 可直接给 Codex 的提示词

```text
请读取 risk_case_agent/outputs/c-risk-case-output.json，基于其中 riskItems 生成符合 A 协议的 RecommendationActionOutput，recommendations[].relatedRiskIds 必须引用 riskItems[].id。
```

```text
请验证 C 的 RiskCaseOutput：riskSummary 是否等于 riskItems 计数，evidence[].clauseId 是否都存在于 relatedClauseIds 中，inputRunIds 是否包含 B 的 runId。
```

```text
请把 C 的 riskItems[].questionToAsk 汇总为 D 的 questionList，并按 riskLevel 从 high 到 medium 到 low 排序。
```
