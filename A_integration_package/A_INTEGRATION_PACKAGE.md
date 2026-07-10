# A 整合包：信用卡分期 + 教育培训贷链路打通

生成时间：2026-07-09  
目标：让 B 能识别新场景，让 B 知识库支持新场景，让 C 的 `scenarioSignals` 能传给 D，让 D 生成场景化建议。

## 1. 文件清单

| 文件 | 操作类型 | 放置位置 | 说明 |
|---|---|---|---|
| `website/backend/src/services/scenarioDetector.ts` | 新增/替换 | 主仓库同路径 | B 场景识别服务，输出 `productType`、`contractType`、命中关键词和置信度 |
| `website/backend/src/services/scenarioKnowledgeBase.ts` | 新增 | 主仓库同路径 | B 场景知识库读取与匹配服务，支持数据库/JSON 种子数据 |
| `website/backend/src/routes/analysis.ts` | 替换/合并 | 主仓库同路径 | 新增 `POST /api/analysis/scenario-detector` 和兼容路由 `/scenario-detect` |
| `website/backend/src/services/contractParserAgent.scenario-patch.ts` | 合并补丁 | 合并进 `contractParserAgent.ts` | 让 B 主解析流程实际使用场景识别服务 |
| `website/backend/src/services/analysisOrchestrator.scenario-patch.ts` | 合并补丁 | 合并进 `analysisOrchestrator.ts` | 让 B 输出 `contractSummary.contractType` 和 `scenarioSignals` |
| `website/backend/src/services/pipelineOrchestrator.d-trace-args.patch.ts` | 合并补丁 | 合并进 `pipelineOrchestrator.ts` | 让 A pipeline 调 D 时传入 C trace |
| `agents/recommendation_action/engine/scenario_recommender.py` | 新增/替换 | 主仓库同路径 | D 场景化建议生成器 |
| `agents/recommendation_action/engine/recommender.py` | 替换 | 主仓库同路径 | D 建议主生成器，已接入场景化建议 |
| `agents/recommendation_action/main.py` | 替换 | 主仓库同路径 | D 主入口，新增 `--input-c-trace` 参数 |
| `shared/analysisProtocol.ts` | 替换/合并 | 主仓库同路径 | 协议类型补充 `ScenarioSignal` 和 B 输出扩展字段 |
| `shared/analysis-contract-type.patch.ts` | 合并补丁 | 合并进 `shared/analysis.ts` | 必须扩展 `ContractType` 枚举 |
| `shared/analysis-contract-summary.patch.ts` | 合并补丁 | 合并进 `shared/analysis.ts` | 建议扩展 `AnalysisResult.contractSummary` |
| `data_samples/protocol/b-credit-card-installment-output.json` | 新增 | 主仓库同路径 | 信用卡分期 B 输出测试样例 |
| `data_samples/protocol/b-education-training-loan-output.json` | 新增 | 主仓库同路径 | 教育培训贷 B 输出测试样例 |

## 2. B 知识库新增文件

| 文件 | 操作类型 | 放置位置 | 说明 |
|---|---|---|---|
| `knowledge/seed_data/contract_templates/credit_card_installment_templates.json` | 新增 | 主仓库同路径 | 信用卡分期合同条款模板 |
| `knowledge/seed_data/contract_templates/education_training_loan_templates.json` | 新增 | 主仓库同路径 | 教育培训贷合同条款模板 |
| `knowledge/seed_data/contract_templates/contract_clause_templates.sql` | 新增/执行 | 主仓库同路径；可导入数据库 | 创建/更新 `contract_clause_templates` 表并写入两条模板 |
| `knowledge/seed_data/contract_templates/contract_clause_templates.csv` | 新增 | 主仓库同路径 | 运营可审阅和编辑的合同模板 CSV |
| `knowledge/seed_data/scenario_rules/scenario_recognition_rules.json` | 新增 | 主仓库同路径 | 新场景识别规则 JSON |
| `knowledge/seed_data/scenario_rules/scenario_recognition_rules.sql` | 新增/执行 | 主仓库同路径；可导入数据库 | 创建/更新 `scenario_recognition_rules` 表并写入两条规则 |
| `knowledge/seed_data/scenario_rules/scenario_recognition_rules.csv` | 新增 | 主仓库同路径 | 运营可审阅和编辑的场景识别规则 CSV |

## 3. B 知识库数据内容

### 3.1 合同条款模板库 `contract_clause_templates`

新增 2 条：

1. `tpl_credit_card_installment_001`
   - 场景：`credit_card_installment`
   - 关键词模式：`信用卡分期`、`账单分期`、`消费分期`、`分期手续费`、`信用卡账单`、`分期还款`
   - 典型条款结构：分期金额、期数、手续费率、提前还款规则
   - 字段映射：
     - `installment_amount`
     - `installment_periods`
     - `service_fee_rate`
     - `prepayment_rule`

2. `tpl_education_training_loan_001`
   - 场景：`education_training_loan`
   - 关键词模式：`培训贷`、`教育分期`、`学费分期`、`课程贷款`、`培训机构`、`技能培训`
   - 典型条款结构：培训服务内容、贷款金额、服务绑定说明、退费条款
   - 字段映射：
     - `training_course`
     - `loan_amount`
     - `service_binding`
     - `refund_policy`

### 3.2 场景识别规则表 `scenario_recognition_rules`

新增 2 条：

1. `scene_rule_credit_card_installment_001`
   - 判断逻辑：合同文本包含“信用卡”，并包含“账单分期/消费分期/信用卡分期”之一，并出现“手续费率/分期手续费/每期手续费”之一。
   - 输出：
     - `product_type = 信用卡分期`
     - `contract_type = credit_card_installment`
     - `confidence = 0.92`

2. `scene_rule_education_training_loan_001`
   - 判断逻辑：合同文本包含“培训/课程/教育”之一，并包含“学费/培训费/课程费”之一，并出现“分期贷款/学费分期/教育分期/培训贷”之一。
   - 输出：
     - `product_type = 教育培训贷`
     - `contract_type = education_training_loan`
     - `confidence = 0.94`

## 4. A 的合并顺序

1. 先合并公共协议：
   - 合并 `shared/analysis-contract-type.patch.ts` 到 `shared/analysis.ts`
   - 合并 `shared/analysis-contract-summary.patch.ts` 到 `shared/analysis.ts`
   - 合并或替换 `shared/analysisProtocol.ts`

2. 导入 B 知识库：
   - 执行 `knowledge/seed_data/contract_templates/contract_clause_templates.sql`
   - 执行 `knowledge/seed_data/scenario_rules/scenario_recognition_rules.sql`
   - 如果暂时不用数据库，也可以直接保留 JSON 文件，由 `scenarioKnowledgeBase.ts` 读取。

3. 合并 B 代码：
   - 复制 `website/backend/src/services/scenarioDetector.ts`
   - 复制 `website/backend/src/services/scenarioKnowledgeBase.ts`
   - 合并 `website/backend/src/services/contractParserAgent.scenario-patch.ts`
   - 合并 `website/backend/src/services/analysisOrchestrator.scenario-patch.ts`
   - 替换或合并 `website/backend/src/routes/analysis.ts`

4. 合并 D 代码：
   - 复制 `agents/recommendation_action/engine/scenario_recommender.py`
   - 替换 `agents/recommendation_action/engine/recommender.py`
   - 替换 `agents/recommendation_action/main.py`

5. 合并 pipeline：
   - 将 `website/backend/src/services/pipelineOrchestrator.d-trace-args.patch.ts` 中的 `--input-c-trace cTracePath` 加入 D Agent 调用。

6. 加入测试样例：
   - `data_samples/protocol/b-credit-card-installment-output.json`
   - `data_samples/protocol/b-education-training-loan-output.json`

## 5. B 代码如何读取新知识库

推荐接入方式：

1. 数据库方式：
   - 后端启动时执行两个 SQL seed 文件。
   - B 调用 `loadScenarioRulesFromDatabase(db)` 读取 `scenario_recognition_rules`。
   - B 调用 `loadContractTemplatesFromDatabase(db, scenarioId)` 读取 `contract_clause_templates`。
   - B 调用 `detectScenarioByKnowledgeRules(contractText, rules)` 得到 `contractType/productType`。

2. JSON 文件方式：
   - 保留 `knowledge/seed_data/.../*.json`。
   - B 调用 `loadScenarioRulesFromSeedFiles(projectRoot)`。
   - B 调用 `loadContractTemplatesFromSeedFiles(projectRoot)`。
   - 适合 MVP 快速合并，不依赖数据库连接。

3. 字段提取：
   - B 得到场景后，选中对应 template。
   - 调用 `extractFieldsByContractTemplate(contractText, template)`。
   - 输出示例：

```json
{
  "installment_amount": {
    "value": "分期金额为12000元",
    "matchedAlias": "分期金额"
  },
  "service_fee_rate": {
    "value": "每期手续费率0.6%",
    "matchedAlias": "手续费率"
  }
}
```

## 6. B 输出效果

信用卡分期文本命中后，B 应输出：

```json
{
  "productType": "信用卡分期",
  "contractType": "credit_card_installment",
  "scenarioSignals": [
    {
      "scenarioId": "credit_card_installment",
      "scenarioName": "信用卡分期",
      "matchedKeywords": ["信用卡", "账单分期", "分期手续费"]
    }
  ]
}
```

教育培训贷文本命中后，B 应输出：

```json
{
  "productType": "教育培训贷",
  "contractType": "education_training_loan",
  "scenarioSignals": [
    {
      "scenarioId": "education_training_loan",
      "scenarioName": "教育培训贷",
      "matchedKeywords": ["培训", "课程", "学费分期"]
    }
  ]
}
```

## 7. D 输出效果

D 会在普通风险建议之外追加：

- `action_scene_credit_card_installment_001`
- `action_scene_education_training_loan_001`

两条建议都符合 A 协议中的 `Recommendation` 结构，且 `relatedRiskIds` 引用 C 的 `riskItems[].id`。

## 8. 路由测试

启动后端后可测试：

```bash
curl -X POST http://127.0.0.1:3000/api/analysis/scenario-detector \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"本协议为信用卡账单分期，按每期收取分期手续费，提前结清手续费不退。\"}"
```

预期返回：

```json
{
  "scenarioId": "credit_card_installment",
  "productType": "信用卡分期",
  "contractType": "credit_card_installment"
}
```

## 9. 注意事项

1. `ContractType` 实际定义在 `shared/analysis.ts`，不是只在 `shared/analysisProtocol.ts`，所以 `analysis-contract-type.patch.ts` 必须合并。
2. 如果 A 暂时不想扩展公共协议，可先只把新场景作为 `productType` 和 `scenarioSignals` 输出，但 TypeScript 严格类型下建议扩展 `ContractType`。
3. D 的 `--input-c-trace` 是可选参数；如果 pipeline 暂时没传，D 仍会从 C 的 `riskItems`、`matchedCases` 文本中兜底识别场景。
4. B 知识库 SQL 采用 SQLite 兼容写法；如果主库使用 PostgreSQL，把 `TEXT` JSON 字段改成 `JSONB` 即可。
5. 本包所有文件使用 UTF-8 编码。
