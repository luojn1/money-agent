# 《看得懂的钱》项目总览与端到端链路检查

更新时间：2026-07-09  
视角：项目总览 / 合并前链路审查  
本次实际验证：

- `agents/risk_case`：`python -m pytest`，8 passed。
- `A_integration_package`：`python scripts/smoke_test_integration_package.py`，全部通过。

## 第一部分：我们做了什么

### 1. 项目启动阶段

| 项目 | 内容 |
|---|---|
| 输入 | 课程项目要求、产品设计说明书、MVP 分工文档、老师反馈 |
| 主要工作 | 明确项目定位为“消费金融合同全流程避坑智能体网站”；确定 B -> C -> D -> A/前端的数据流；明确 C 负责风险识别 + 案例匹配 |
| 输出 | 项目目录、README、开发计划、分工方案、MVP 并行计划 |
| 完成度 | 95% |
| 文件位置 | `README.md`、`docs/`、`PARALLEL_WORK_PLAN_4PPL.md`、`TASK_LIST_FOR_C_SYSTEM_OPTIMIZATION.md` |

### 2. 协议定义阶段

| 项目 | 内容 |
|---|---|
| 输入 | A 定义的多 Agent 协作协议 |
| 主要工作 | 阅读并按协议实现 B/C/D 的输入输出结构；明确 `taskId`、`contractId`、`runId`、`inputRunIds`、`clauses[].clauseId`、`riskItems[].id` 的关联关系 |
| 输出 | C 严格协议输出、B/D/A 整合包协议扩展 |
| 完成度 | 85% |
| 文件位置 | GitHub 主仓库 `shared/analysisProtocol.ts`、`shared/schemas/analysis-protocol-v1.schema.json`、`docs/data-protocol-v1.md`；本地整合包 `A_integration_package/shared/` |

说明：新场景 `credit_card_installment`、`education_training_loan` 已在整合包中给出 shared 补丁，但仍需要 A 合并进主仓库。

### 3. B 模块：合同解析 + 成本测算

| 项目 | 内容 |
|---|---|
| 输入 | 合同文本/文件，OCR 或文本抽取结果 |
| 主要工作 | 合同字段抽取、条款切分、费用识别、现金流测算、IRR/真实年化计算、B 输出协议适配 |
| 输出 | `ContractCostOutput`，包含 `contractSummary`、`clauses`、`repaymentSchedule`、`costAnalysis` |
| 完成度 | 80% |
| 文件位置 | GitHub 主仓库 `website/backend/src/services/contractParserAgent.ts`、`costCalculatorAgent.ts`、`protocolAdapter.ts`；B 分支 `b-agents-github-package` |

新增优化：

- 已生成 B 新场景识别代码：`A_integration_package/website/backend/src/services/scenarioDetector.ts`
- 已生成 B 场景知识库读取代码：`A_integration_package/website/backend/src/services/scenarioKnowledgeBase.ts`
- 已生成 B 知识库种子数据：`A_integration_package/knowledge/seed_data/`

当前状态：B 主仓库原始版本能做合同解析和成本测算，但信用卡分期/教育培训贷场景识别还需要 A 合并整合包。

### 4. C 模块：风险识别 + 案例匹配

| 项目 | 内容 |
|---|---|
| 输入 | B 的 `ContractCostOutput` JSON |
| 主要工作 | 规则引擎、RAG 检索、法规/案例/产品/术语知识库、风险证据组装、协议输出、trace 输出、动态知识库导入框架 |
| 输出 | `RiskCaseOutput`，包含 `riskItems`、`riskSummary`；trace 包含 `glossaryTerms`、`scenarioSignals`、知识库使用情况 |
| 完成度 | 92% |
| 文件位置 | `agents/risk_case/main.py`、`rules/engine.py`、`rag/retriever.py`、`rag/embeddings.py`、`knowledge/seed_data/` |

当前知识库规模：

- 风险规则：约 80 条
- 法规：约 50 条
- 案例：约 80 个
- 术语：约 52 条
- 支持场景：消费贷、现金分期、账单分期、商户分期、信用卡分期、教育培训贷等

验证结果：`agents/risk_case` 下 `python -m pytest`，8 passed。

### 5. D 模块：建议生成 + 行动管理

| 项目 | 内容 |
|---|---|
| 输入 | B 输出 + C 输出，可选 C trace |
| 主要工作 | 将 C 的 `riskItems` 转为 `recommendations`、`questionList`、行动计划；按风险等级和风险类别生成建议 |
| 输出 | `RecommendationActionOutput`，包含 `overallResult`、`recommendations`、`questionList`、`disclaimer` |
| 完成度 | 78% |
| 文件位置 | GitHub 主仓库 `agents/recommendation_action/`；整合包 `A_integration_package/agents/recommendation_action/` |

新增优化：

- 已生成场景化建议器：`scenario_recommender.py`
- 已修改 D 主流程：`main.py` 支持 `--input-c-trace`
- 已修改推荐主逻辑：`recommender.py` 会追加信用卡分期/教育培训贷场景建议

当前状态：整合包 smoke test 已验证 D 场景建议生成逻辑可用；需要 A 合并进主仓库。

### 6. 场景扩展

| 场景 | 已完成内容 | 完成度 |
|---|---|---:|
| 信用卡分期 | B 场景识别规则、B 合同模板、C 风险规则与案例、D 场景建议、B 示例输出 | 85% |
| 教育培训贷 | B 场景识别规则、B 合同模板、C 风险规则与案例、D 场景建议、B 示例输出 | 85% |

文件位置：

- C 知识库：`agents/risk_case/knowledge/seed_data/`
- B 知识库扩展：`A_integration_package/knowledge/seed_data/`
- B/D/A 代码整合包：`A_integration_package/`

### 7. 前端 / Demo

| 项目 | 内容 |
|---|---|
| 输入 | C 输出 JSON、B/C/D pipeline 输出 |
| 主要工作 | C 风险展示静态预览页、可上传 JSON 的风险报告页面、Web 服务包装、A 前端报告摘要与案例来源组件 |
| 输出 | 可视化风险报告、报告摘要、案例来源展示 |
| 完成度 | 75% |
| 文件位置 | `preview_demo/`、`agents/risk_case/web_server.py`、GitHub `feature/report-summary-case-source` |

当前状态：C 静态/本地 Web 预览可用；A 侧完整前端展示需要合并最终 pipeline 字段。

### 8. 文档与交接

| 文档 | 用途 |
|---|---|
| `HANDOVER_TO_D.md` | C -> D 交接 |
| `QUICK_START_FOR_D.md` | D 快速上手 |
| `KNOWLEDGE_AGENT_INTEGRATION_REPORT.md` | C 知识库接入报告 |
| `DYNAMIC_KNOWLEDGE_GUIDE.md` | 动态知识库说明 |
| `FINAL_SELF_REVIEW.md` | 最终自查 |
| `A_integration_package/A_INTEGRATION_PACKAGE.md` | 给 A 的整合包说明 |
| `A_integration_package/A_MERGE_CHECKLIST.md` | A 合并清单 |
| `A_integration_package/FINAL_QA_REPORT.md` | 整合包最终质检 |
| `A_integration_package/POLISH_REVIEW_REPORT.md` | 锦上添花审查 |
| `A_integration_package/DEMO_FALLBACK_PLAN.md` | 演示兜底 |

完成度：90%。

## 第二部分：链路是否连通

### 端到端链路检查

| 环节 | 预期输入 | 预期输出 | 当前状态 |
|---|---|---|---|
| 用户上传合同 | 文件或粘贴文本 | 文本/OCR 结果 | GitHub A/B 主线已有文档读取与上传接口；本地未重新完整运行 |
| B OCR + 解析 + 成本测算 | 合同文本 | B JSON：`contractSummary`、`clauses`、`costAnalysis` | 主线已有；新场景需合并整合包 |
| B -> C | `ContractCostOutput` | C 可读取 B `runId`、`clauses[].clauseId`、`costAnalysis.realAnnualRate` | C 已实现并测试通过 |
| C 风险识别 | B JSON + 知识库 | C JSON：`riskItems`、`riskSummary`；trace：知识库和场景信号 | 已实现，8 个测试通过 |
| C -> D | C JSON + B JSON + 可选 C trace | D 读取 `riskItems[].id` 生成 `relatedRiskIds` | D 主线已有；场景化增强已在整合包中验证 |
| D 建议生成 | B/C 输出 | D JSON：`recommendations`、`questionList`、`overallResult` | 普通建议主线已有；新场景建议需 A 合并整合包 |
| A 汇总 | B/C/D JSON | 前端报告模型 | GitHub 主线已有 pipeline；需合并新场景字段和 D trace 参数 |
| 前端展示 | 汇总报告 | 成本、风险、案例、建议页面 | 可展示基础报告；新场景标签和摘要展示需最终合并校验 |

### 输入输出格式匹配

整体是匹配的：

- B 输出 `taskId`、`contractId`、`runId`。
- C 输出 `inputRunIds = [B.runId]`。
- D 输出 `inputRunIds = [B.runId, C.runId]`。
- B `clauses[].clauseId` -> C `riskItems[].relatedClauseIds` / `evidence[].clauseId`。
- C `riskItems[].id` -> D `recommendations[].relatedRiskIds`。

需要注意：

- 新场景的 `contractType` 需要合并 shared 类型补丁，否则 TypeScript 类型会不认。
- `scenarioSignals` 当前主要通过 C trace 和 B contractSummary 扩展字段传递，需要 A 在 pipeline 中传 `--input-c-trace`。

### 新电脑能否直接跑通

分两层看：

1. C 模块单独运行：可以，前提是安装 `agents/risk_case/requirements.txt`。本地测试已通过。
2. 完整 B -> C -> D -> 前端：**需要 A 合并整合包后再验证**。当前不是“无人工介入即可从 clone 一键跑完整新场景”的状态。

## 第三部分：断点分析

| 断点 | 位置 | 严重程度 | 怎么补 | 负责人 |
|---|---|---|---|---|
| 新场景 `ContractType` 未进入主仓库 shared 类型 | `shared/analysis.ts` | 🔴 阻塞 | 合并 `A_integration_package/shared/analysis-contract-type.patch.ts` | A |
| B 主流程尚未正式调用新场景识别 | `contractParserAgent.ts` | 🔴 阻塞 | 合并 `contractParserAgent.scenario-patch.ts`，或按整合包直接接入 `scenarioDetector.ts` | A/B |
| B contractSummary 尚未正式输出 `contractType/scenarioSignals` | `analysisOrchestrator.ts` | 🔴 阻塞 | 合并 `analysisOrchestrator.scenario-patch.ts` | A/B |
| D pipeline 未必传 C trace | `pipelineOrchestrator.ts` | 🟡 弱连接 | 加入 `--input-c-trace cTracePath` | A |
| D 场景建议尚未并入主仓库 | `agents/recommendation_action/` | 🟡 弱连接 | 替换整合包中的 `main.py`、`recommender.py`、`scenario_recommender.py` | A/D |
| 前端是否展示新场景标签未最终验证 | 前端报告页 | 🟢 可优化 | 使用 `scenarioSignals[0].scenarioName` 或 `overview.productType` 展示 | A |
| 动态知识库真实外部 API 接入 | C ingestion | 🟢 可优化 | 当前有框架和模拟/导入，真实监管 API 需后续接入 | C/后续 |

## 第四部分：整体评估

### 项目整体完成度

综合完成度：**82%**

拆分：

- 第一版 MVP 基础链路：85%
- C 风险识别与知识库：92%
- B 成本测算主能力：80%
- D 普通建议生成：78%
- 新场景扩展：85% 已有代码包，待合并
- 前端展示：75%
- 文档交接：90%

### 当前可演示的端到端场景

严格来说，当前“已验证可演示”的层级有三种：

1. **C 单模块演示**
   - 输入 B 示例 JSON。
   - 输出 C 风险报告和 trace。
   - 已测试通过。

2. **整合包 smoke test 演示**
   - 信用卡分期：B seed rule -> B sample -> D scene recommendation。
   - 教育培训贷：B seed rule -> B sample -> D scene recommendation。
   - 已验证通过。

3. **完整 Web 端到端演示**
   - 需要 A 合并 `A_integration_package` 后再确认。
   - 预计可演示：消费贷基础场景、信用卡分期、教育培训贷。

### 明天演示最大风险

最大风险不是 C 的风险识别，而是 **A 合并时漏掉 shared/B/D/pipeline 中任意一个接入点**。

最容易漏的点：

- `shared/analysis.ts` 的 `ContractType` 扩展。
- `contractParserAgent.ts` 中调用新 `scenarioDetector`。
- `analysisOrchestrator.ts` 输出 `scenarioSignals`。
- `pipelineOrchestrator.ts` 给 D 传 `--input-c-trace`。

### 最值得展示的 3 个亮点

1. **真实成本 + 风险识别联动**
   - B 算真实年化，C 用 `realAnnualRate` 和条款证据识别风险。

2. **知识库增强，而不是单纯硬编码**
   - C 有规则、法规、案例、术语、市场利率、产品参考。
   - B 新增合同模板和场景识别规则。

3. **从风险到行动建议闭环**
   - C 输出风险项和证据。
   - D 用 `riskItems[].id` 生成 `relatedRiskIds` 关联建议。
   - 用户能看到“哪里有风险、为什么、该问什么、怎么做”。

## 最终判断

项目已经从“模块堆叠”进入“可整合 MVP”阶段。C 模块本身较稳，整合包也通过了轻量 smoke test；但完整 B -> C -> D -> 前端链路仍依赖 A 合并 shared、B、D、pipeline 的几个关键补丁。

建议下一步不是继续加知识库数量，而是让 A 按 `A_MERGE_CHECKLIST.md` 合并，并用两份场景样例跑一次真实 pipeline。只要这一步跑通，项目就可以比较自信地演示。
