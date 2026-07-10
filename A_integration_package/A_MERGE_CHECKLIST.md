# A 合并清单

这份清单给整合者 A 使用，按顺序执行即可。

## 1. 先合并公共类型

1. 打开 `shared/analysis.ts`。
2. 按 `shared/analysis-contract-type.patch.ts` 扩展 `ContractType`：
   - `credit_card_installment`
   - `education_training_loan`
3. 按 `shared/analysis-contract-summary.patch.ts` 给 `contractSummary` 增加：
   - `contractType`
   - `scenarioSignals`
4. 合并或替换 `shared/analysisProtocol.ts`。

## 2. 导入 B 知识库

复制以下目录到主仓库同路径：

- `knowledge/seed_data/contract_templates/`
- `knowledge/seed_data/scenario_rules/`

如果主项目使用 SQLite，执行：

```bash
sqlite3 <数据库文件> < knowledge/seed_data/contract_templates/contract_clause_templates.sql
sqlite3 <数据库文件> < knowledge/seed_data/scenario_rules/scenario_recognition_rules.sql
```

如果暂时不用数据库，保留 JSON 文件即可，`scenarioKnowledgeBase.ts` 支持读取 JSON 种子文件。

## 3. 合并 B 代码

复制：

- `website/backend/src/services/scenarioDetector.ts`
- `website/backend/src/services/scenarioKnowledgeBase.ts`

合并补丁：

- `website/backend/src/services/contractParserAgent.scenario-patch.ts`
- `website/backend/src/services/analysisOrchestrator.scenario-patch.ts`

替换或合并：

- `website/backend/src/routes/analysis.ts`

## 4. 合并 D 代码

复制或替换：

- `agents/recommendation_action/engine/scenario_recommender.py`
- `agents/recommendation_action/engine/recommender.py`
- `agents/recommendation_action/main.py`

## 5. 合并 pipeline 参数

打开 `website/backend/src/services/pipelineOrchestrator.ts`，在 D Agent 调用参数中加入：

```ts
"--input-c-trace",
cTracePath,
```

参考：

- `website/backend/src/services/pipelineOrchestrator.d-trace-args.patch.ts`

## 6. 加入样例数据

复制：

- `data_samples/protocol/b-credit-card-installment-output.json`
- `data_samples/protocol/b-education-training-loan-output.json`

## 7. 运行 smoke test

复制 `scripts/smoke_test_integration_package.py` 后，在主仓库根目录运行：

```bash
python scripts/smoke_test_integration_package.py
```

预期看到：

```text
Smoke test passed. The integration package is ready for A to merge.
```

## 8. 最小验收标准

- B 路由 `/api/analysis/scenario-detector` 能识别信用卡分期。
- B 路由 `/api/analysis/scenario-detector` 能识别教育培训贷。
- B 输出中有 `contractSummary.contractType`。
- B 输出中有 `contractSummary.scenarioSignals`。
- C trace 中有 `scenarioSignals`。
- D 输出中有：
  - `action_scene_credit_card_installment_001`
  - `action_scene_education_training_loan_001`
- D 的 `relatedRiskIds` 引用 C 的 `riskItems[].id`。
