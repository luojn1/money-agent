# 锦上添花优化审查报告

审查时间：2026-07-09  
审查对象：`A_integration_package`

## 1. 本轮实际修复

### 1.1 B 场景识别文件从“补丁式”改为“可替换式”

原问题：

- `scenarioDetector.ts` 只包含内置关键词规则。
- 知识库读取逻辑放在 `scenarioDetector.knowledge-patch.ts`，A 容易漏合并。

已处理：

- 直接重写 `website/backend/src/services/scenarioDetector.ts`。
- 现在该文件同时支持：
  - 内置关键词规则兜底；
  - `detectScenarioFromKnowledge()` 异步读取 `knowledge/seed_data`；
  - 返回 `matchedRuleId`、`templateId`、`extractedFields`。
- 删除 `scenarioDetector.knowledge-patch.ts`，减少 A 的手工合并步骤。

### 1.2 B 知识库路径查找加固

原问题：

- `scenarioKnowledgeBase.ts` 默认用 `process.cwd()` 找知识库。
- 如果 A 从 `website/backend` 启动后端，可能找不到仓库根目录下的 `knowledge/seed_data`。

已处理：

- `scenarioKnowledgeBase.ts` 现在会尝试多个候选路径：
  - 当前 cwd；
  - 上一级；
  - 上两级；
  - 上三级；
  - 当前 service 文件相对仓库根路径。
- 找不到时给出明确错误，并由 `scenarioDetector.ts` fallback 到内置规则。

### 1.3 路由接入知识库识别

原问题：

- `/scenario-detector` 路由只调用同步关键词识别。

已处理：

- `website/backend/src/routes/analysis.ts` 现在调用 `detectScenarioFromKnowledge()`。
- 如果知识库读取失败，服务内部自动 fallback 到内置关键词识别。

## 2. 本轮验证结果

已运行：

```bash
python A_integration_package/scripts/smoke_test_integration_package.py
python -m py_compile A_integration_package/agents/recommendation_action/main.py A_integration_package/agents/recommendation_action/engine/recommender.py A_integration_package/agents/recommendation_action/engine/scenario_recommender.py
```

结果：

- B seed rule 识别信用卡分期：通过
- B seed rule 识别教育培训贷：通过
- 两份 B 样例包含 `contractType`：通过
- 两份 B 样例包含 `scenarioSignals`：通过
- D 生成信用卡分期场景建议：通过
- D 生成教育培训贷场景建议：通过
- D 建议保留 `relatedRiskIds`：通过
- D Python 语法编译：通过

## 3. 仍需 A 合并时注意

1. `contractParserAgent.scenario-patch.ts` 和 `analysisOrchestrator.scenario-patch.ts` 仍是补丁，因为主文件较大，直接替换风险更高。
2. `shared/analysis.ts` 必须合并两个补丁，否则 TypeScript 会不认识新 `ContractType`。
3. 如果 A 的主仓库已有更复杂的数据库层，可以只使用 SQL/CSV/JSON 种子数据，不强制使用 `scenarioKnowledgeBase.ts` 的文件读取方式。

## 4. 下一步锦上添花优先级

### P1：把两个补丁文件改成完整可替换文件

价值：

- A 不需要手动合并大文件，降低出错概率。

代价：

- 需要拿到 A 最新主分支文件，基于最新版本生成完整替换版。

### P2：补前端场景标签展示

价值：

- 报告页能明确显示“信用卡分期”或“教育培训贷”，用户更容易理解。

建议字段：

- `contractCost.data.contractSummary.scenarioSignals[0].scenarioName`
- 或 `overview.productType`

### P3：补两份端到端演示样例

价值：

- 演示时不用现场上传合同，直接走稳定样例。

建议样例：

- 信用卡分期合同文本
- 教育培训贷合同文本

### P4：案例来源展示再打磨

价值：

- 增强“案例支撑”的可信度。

建议：

- 核心演示案例优先替换为 `local://case/...` 或真实公开链接。
- 前端展示时加“典型化案例/公开来源”标签。

### P5：报告摘要版

价值：

- 降低信息过载。

建议：

- 默认展示 3 个最重要风险。
- 法规、案例、知识库命中信息折叠到“查看依据”。

## 5. 当前建议

现在这份整合包已经比上一版更稳，可以交给 A。剩余时间如果还要继续优化，最值得做的是 P1：基于 A 最新主分支把 `contractParserAgent` 和 `analysisOrchestrator` 也生成完整可替换文件。

