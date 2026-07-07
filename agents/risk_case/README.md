# risk_case Agent

本目录是《看得懂的钱》同学 C 负责的风险识别 + 案例匹配 Agent。它读取 B 模块 `contract_cost` 输出，结合风险规则库、法规库、案例库、合同模板库和金融产品库，通过规则引擎和 RAG 检索生成符合 A 协议的 `RiskCaseOutput`。

## 协议要点

C 输出外层是 `RiskCaseOutput`：

- `schemaVersion`: 固定 `1.0.0`
- `taskId`、`contractId`: 沿用 B 输出
- `runId`: C 本次运行 ID
- `agent`: 固定 `risk_case`
- `agentVersion`: 当前为 `c-0.2.0-dynamic-kb`
- `status`: `completed | partial | failed`
- `generatedAt`: 带时区的 ISO 时间
- `inputRunIds`: 必须包含 B 的 `runId`
- `data.riskItems`: 风险项数组
- `data.riskSummary`: 高中低风险计数
- `warnings`、`errors`: 结构化警告与错误

`RiskItemV1` 必填字段包括 `id`、`title`、`category`、`riskLevel`、`confidence`、`clauseText`、`clauseLocation`、`relatedClauseIds`、`evidence`、`reason`、`possibleConsequence`、`matchedCases`、`questionToAsk`。

关联规则：

- `relatedClauseIds` 必须引用 B 的 `data.clauses[].clauseId`。
- `evidence[].clauseId` 必须同时存在于本风险项的 `relatedClauseIds` 中。
- `evidence[].quote` 必须来自合同原文短摘录，不能放模型推断。
- `riskSummary` 必须等于 `riskItems` 按 `riskLevel` 的实际计数。

风险等级：`high | medium | low`

风险类别：`cost_transparency | interest_fee | repayment | prepayment | overdue | authorization_privacy | dispute_resolution | other`

## 知识库结构

- `risk_rules`: 风险规则表，保存规则条件、风险类别、等级、权重和法律依据。
- `legal_regulations`: 法律法规知识库，保存法规标题、发文机关、摘要、全文、关键词和适用场景。
- `cases`: 典型案例库，保存场景、风险类型、争议焦点、用户损失、处理结果和维权路径。
- `contract_clause_templates`: 合同条款模板库，保存常见条款模式、字段映射和风险指示词。
- `financial_products`: 金融产品库，保存产品类型、典型费率、常见费用和还款/逾期政策。

输出结果会写入：

- `risk_case_outputs`
- `risk_items`
- `risk_evidence`
- `risk_matched_cases`

## 启动

```bash
cd agents/risk_case
python knowledge/init_db.py
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json --trace-output outputs/c-risk-case-output.trace.json
```

运行后会打印命中的规则、检索到的法规和案例，并生成：

```text
outputs/c-risk-case-output.json
risk_case_agent.db
```

## 风险评分

初始分为 `100`，每命中一条风险规则按 `weight` 扣分：

- `0-40`: 高风险
- `41-70`: 中风险
- `71-100`: 低风险

注意：A 协议的 `riskItems[].riskLevel` 是每条风险自己的等级；本项目同时在运行 trace 中输出整体分数等级，供 D 模块或报告页参考。
