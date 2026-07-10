# 《看得懂的钱》项目最新状态扫描

更新时间：2026-07-09  
扫描对象：GitHub 仓库 `luojn1/money-agent` 的远端分支，重点参考 `main`、`b-agents-github-package`、`c-agents-github-package`、`recommendation_action_agent`、`integration-bcd`、`feature/report-summary-case-source`。

## 1. 当前总体印象

项目已经从“B/C/D 各自开发 Agent”进入整体优化阶段。`main` 分支目前已经包含 B 合同解析与成本测算、C 风险识别与案例匹配、D 建议生成与行动管理、A 前端/协议/集成相关内容；最新新增的 `feature/report-summary-case-source` 分支主要在前端增加报告摘要和案例来源追踪展示。

你现在作为同学 C 的工作已经不是只改 `risk_case`，而是负责“语言通俗化 + 场景知识扩展”这个跨模块功能维度，可以横向修改 B/C/D/A 相关代码与知识库。

你的交付线：

- 30 个术语通俗解释
- 2 个新场景：信用卡分期、教育培训贷
- 每个场景 3 条规则
- 每个场景 3 个案例
- B 模块能识别/输出相关场景信号
- C 模块能使用术语库和场景知识
- D 模块能基于场景输出更贴近用户的建议

## 2. 远端分支状态

| 分支 | 最新提交时间 | 最新提交 | 当前用途判断 |
|---|---:|---|---|
| `main` | 2026-07-08 17:53 | `b1a7e9b Clarify risk group headings` | 当前集成主线，包含 A/B/C/D 第一版 MVP |
| `b-agents-github-package` | 2026-07-07 14:28 | `7b3911d Apply B module revision feedback` | B 合同解析 + 成本测算独立分支 |
| `c-agents-github-package` | 2026-07-07 15:16 | `944bf9c Delete case_database directory` | C 风险识别 + 案例匹配独立分支 |
| `recommendation_action_agent` | 2026-07-07 19:27 | `7eba5c5 Add files via upload` | D 建议生成 + 行动管理独立分支 |
| `integration-bcd` | 2026-07-07 21:03 | `0bf429b test: verify integrated BCD pipeline` | B/C/D 联调验证分支 |
| `deploy/tencent-cloudbase` | 2026-07-07 21:42 | `e04ee8e feat: prepare Tencent CloudBase deployment` | 云部署准备 |
| `feature/report-summary-case-source` | 2026-07-09 00:40 | `00b045b feat(frontend): add report summary and case source tracing` | 最新前端优化分支，报告摘要与案例来源可追溯 |
| `basic-frame-ypy` | 2026-07-02 18:58 | `1849f50 add multi-agent data protocol` | 早期协议/框架分支 |

## 3. 各模块完成度

### A 模块：协议、前端、整合

完成度：较高，且仍在持续优化。

已完成内容：

- 公共协议定义在 `shared/` 与 `docs/`。
- 前端主项目在 `website/frontend/`。
- 后端编排与服务入口在 `website/backend/`。
- `integration-bcd` 已有 B/C/D 联调验证。
- 最新 `feature/report-summary-case-source` 新增：
  - `website/frontend/src/components/ReportSummary.tsx`
  - `website/frontend/src/components/CaseReferenceCard.tsx`
  - `website/frontend/src/utils/reportViewModel.ts`
  - 修改 `RiskCard.tsx`、`ReportPage.tsx`、`UploadPage.tsx`、`styles.css`

对你工作的影响：

- 输出精简和案例来源可追溯已有前端同学/整合者在做，避免重复大改。
- 你如果要展示“通俗解释”和“场景标签”，应优先通过已有 view model 或风险卡片字段扩展，而不是直接改协议。

### B 模块：合同解析 + 成本测算

完成度：较高，但场景识别仍偏“信用卡分期/消费贷基础枚举”，不够覆盖教育培训贷。

关键位置：

- `website/backend/src/services/contractParserAgent.ts`
- `website/backend/src/services/costCalculatorAgent.ts`
- `website/backend/src/services/knowledgeBase.ts`
- `knowledge_base/contract_finance/`
- 示例数据在 `data_samples/protocol/`、`agents/risk_case/examples/`、`agents/recommendation_action/examples/` 等位置可见

B 当前公共合同类型枚举来自 `shared/analysis.ts`：

```ts
export type ContractType =
  | "consumer_loan"
  | "cash_installment"
  | "bill_installment"
  | "merchant_installment"
  | "unknown";
```

B 当前 `detectContractType()` 识别逻辑大致为：

- 文本含“现金分期” → `cash_installment`
- 文本含“账单分期” → `bill_installment`
- 文本含“商品分期”或“商户分期” → `merchant_installment`
- 文本含“消费贷款”“消费贷”“借款” → `consumer_loan`
- 否则 → `unknown`

现状判断：

- 信用卡分期已有部分基础识别：现金分期、账单分期、商户分期都属于信用卡分期子类。
- 教育培训贷目前没有独立 `contractType` 或 `productType` 枚举。
- B 的条款识别已有 fee、prepayment、overdue、autoDebit、privacy、contractChange、disputeResolution、repayment、guarantee 等 matcher，可复用扩展。

B 知识库现状：

- `knowledge_base/contract_finance/raw_sources/` 下约 134 个原始来源文件。
- 已包含大量信用卡材料，例如 `raw_sources/credit_card/CARD-001` 至 `CARD-026`。
- 已包含合同、产品、监管材料，例如 `raw_sources/contracts/`、`raw_sources/products/`、`raw_sources/regulatory/`。
- `knowledge_base/contract_finance/knowledge_base/` 下包含：
  - `B输出Schema草案.json`
  - `合同知识库.md`
  - `合同知识库_entries.jsonl`
  - `字段别名与费用词典.json`
  - `金融产品知识库.md`
  - `金融产品知识库_entries.jsonl`
  - `资料有效性校验.md`

缺口：

- 信用卡分期的原始资料很多，但 B 的场景输出还没有统一到“信用卡分期场景”层。
- 教育培训贷在 B 侧缺少合同模板、关键词、费用字段和服务合同/贷款合同联动识别。

### C 模块：风险识别 + 案例匹配

完成度：较高，知识库规模已明显扩充，RAG 与规则引擎已接入主流程。

关键位置：

- `agents/risk_case/main.py`
- `agents/risk_case/rules/engine.py`
- `agents/risk_case/rag/retriever.py`
- `agents/risk_case/rag/embeddings.py`
- `agents/risk_case/db/dao.py`
- `agents/risk_case/knowledge/schema.sql`
- `agents/risk_case/knowledge/seed_data/`
- `agents/risk_case/tests/`
- `agents/risk_case/HANDOVER_TO_D.md`
- `agents/risk_case/KNOWLEDGE_AGENT_INTEGRATION_REPORT.md`

知识库统计来自 `agents/risk_case/knowledge/seed_data/manifest.json`：

| 知识库 | 表名 | 当前数据量 |
|---|---|---:|
| 风险规则库 | `risk_rules` | 64 |
| 法规库 | `legal_regulations` | 32 |
| 案例库 | `cases` | 55 |
| 合同条款模板库 | `contract_clause_templates` | 24 |
| 金融产品库 | `financial_products` | 24 |
| 市场利率库 | `market_rates` | 48 |
| 金融术语库 | `financial_glossary` | 32 |

C 场景覆盖现状：

- 案例库覆盖：医美分期、教育培训贷、信用卡分期、消费贷、保险纠纷、租赁贷、汽车融资租赁、互联网平台贷、P2P 网贷、现金贷。
- 合同模板覆盖：消费贷合同、信用卡分期协议、教育培训贷款合同、医美分期合同、租房贷款合同、车贷合同、保险保单、担保合同、融资租赁合同等。
- 金融产品覆盖：银行消费贷、消费金融公司、互联网平台贷、信用卡分期、平台分期、商户分期、车贷等。

C 目前对你任务的基础很好，但仍有三个缺口：

- `financial_glossary` 虽然已有 32 条，但还需要确认解释是否足够“给普通用户看懂”，不只是字段存在。
- 风险规则里已有若干信用卡/培训相关规则，如“名义免息但有手续费”“退费条件苛刻”“服务合同解除但贷款继续”“冷静期缺失”，但还没有清晰打包成“每个新增场景 3 条规则”的交付说明。
- 当前代码未发现稳定输出 `scenarioSignals` 的主流程字段，说明场景判断更多停留在知识库匹配层，还没有形成跨 B/C/D 可复用的场景信号。

### D 模块：建议生成 + 行动管理

完成度：中高，核心建议链路可用，但场景化程度有限。

关键位置：

- `agents/recommendation_action/engine/recommender.py`
- `agents/recommendation_action/engine/action_plan.py`
- `agents/recommendation_action/main.py`
- `agents/recommendation_action/examples/`
- `agents/recommendation_action/tests/test_agent.py`
- `agents/recommendation_action/preview/index.html`

D 当前建议生成逻辑：

- 核心建议主要基于 C 输出的 `riskItems[].category` 和 `riskLevel`。
- `recommender.py` 内置按风险类别的行动模板，例如费用、利率、提前还款、逾期、授权隐私、争议解决等。
- 有一个 `user-profile.json`，支持 `scenario` 字段：`insurance | training | medical | general`。
- `_profile_recommendations()` 对 `insurance`、`training`、`medical` 会生成一个场景提示。

现状判断：

- D 已经有“场景建议”的雏形，但不是自动从 B/C 场景识别结果流入。
- 信用卡分期目前只在“横向对比”话术里被提到，不是独立场景策略。
- 教育培训贷有 `training` profile 支持，但需要和 B/C 的场景信号打通。

## 4. 已有知识库内容位置与数量

### B 知识库

位置：

- `knowledge_base/contract_finance/raw_sources/`
- `knowledge_base/contract_finance/knowledge_base/`

规模：

- 原始来源文件约 134 个。
- 信用卡分期资料较丰富，`raw_sources/credit_card/` 下至少包含 26 份信用卡费用、现金分期、账单分期、商户分期、提前还款规则等资料。
- 教育培训贷资料在 B 知识库中没有形成独立目录或结构化知识。

主要作用：

- 供 B 的合同解析、费用字段识别、产品对照、LPR/年化口径解释使用。

### C 知识库

位置：

- `agents/risk_case/knowledge/schema.sql`
- `agents/risk_case/knowledge/seed_data/`
- `agents/risk_case/knowledge/seed_data/manifest.json`

详细文件：

- `risk_rules/risk_rules.{sql,csv,json}`
- `legal_regulations/legal_regulations.{sql,csv,json}`
- `cases/cases.{sql,csv,json}`
- `contract_templates/contract_templates.{sql,csv,json}`
- `financial_products/financial_products.{sql,csv,json}`
- `market_rates/market_rates.{sql,csv,json}`
- `financial_glossary/financial_glossary.{sql,csv,json}`

当前数量：

- 风险规则 64 条
- 法规 32 条
- 案例 55 个
- 合同条款模板 24 条
- 金融产品 24 条
- 市场利率 48 条
- 金融术语 32 条

### D 知识与模板

位置：

- `agents/recommendation_action/engine/recommender.py`
- `agents/recommendation_action/engine/action_plan.py`
- `agents/recommendation_action/examples/user-profile.json`

现状：

- 主要是代码内置策略模板，不是独立知识库。
- 场景相关只支持 `insurance`、`training`、`medical` 三类 profile。

## 5. 金融术语库现状

术语库表名：`financial_glossary`

位置：

- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.json`
- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.csv`
- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.sql`

当前数量：32 条。

已包含术语：

- 等额本息
- 等额本金
- 等本等息
- IRR
- APR
- 砍头息
- 服务费
- 管理费
- 担保费
- 保证金
- 连带责任
- 保证期间
- 提前结清
- 提前还款违约金
- 逾期罚息
- 违约金
- 复利
- 循环利息
- 最低还款
- 自动扣款
- 自动续费
- 征信授权
- 敏感个人信息
- 格式条款
- 免责条款
- 协议管辖
- 捆绑销售
- 冷静期
- 退保现金价值
- 融资租赁
- LPR
- 真实年化

代码接入位置：

- `agents/risk_case/db/dao.py`：`load_financial_glossary`
- `agents/risk_case/rag/retriever.py`：`retrieve_glossary_terms`
- `agents/risk_case/rules/engine.py`：命中风险后调用术语检索
- `agents/risk_case/main.py`：把术语信息写入扩展信息和 trace

结论：

- 术语库“有数据且已接入 C”，但你的交付重点应从“补数量”转为“让解释真正通俗、跨 B/C/D 可用、前端可展示”。

## 6. 场景覆盖现状

### 已支持或已有数据的场景

从 C 知识库可以看出，项目已经有这些场景数据：

- 消费贷
- 信用卡分期
- 教育培训贷
- 医美分期
- 保险纠纷
- 租赁贷
- 汽车融资租赁
- 互联网平台贷
- P2P 网贷
- 现金贷

### B 侧真正可识别的合同类型

从 `shared/analysis.ts` 和 `contractParserAgent.ts` 看，B 侧当前正式枚举只有：

- `consumer_loan`
- `cash_installment`
- `bill_installment`
- `merchant_installment`
- `unknown`

判断依据：

- `shared/analysis.ts` 的 `ContractType` 枚举。
- `website/backend/src/services/contractParserAgent.ts` 的 `detectContractType()`。

结论：

- 信用卡分期可以映射到 `cash_installment`、`bill_installment`、`merchant_installment`。
- 教育培训贷目前没有正式枚举，需要新增或通过 `productType`/场景信号表达。

### C 侧场景使用方式

判断依据：

- `cases.scenario`
- `contract_clause_templates.contract_type`
- `financial_products.product_type`
- `risk_rules.condition` 中的关键词条件
- `retriever.py` 的案例、法规、产品、术语检索

结论：

- C 的知识库具备场景数据，但缺少统一的“场景识别结果”输出字段。
- 若不改公共协议，建议在 trace 或扩展结果里增加 `scenarioSignals`；若要进正式协议，需要 A 同意修改 `shared/analysisProtocol.ts` 和 JSON Schema。

### D 侧场景化建议

判断依据：

- `agents/recommendation_action/README.md`
- `agents/recommendation_action/engine/recommender.py`
- `agents/recommendation_action/examples/user-profile.json`

现状：

- `user-profile.json` 支持 `scenario`: `insurance | training | medical | general`
- `recommender.py` 有针对 `insurance`、`training`、`medical` 的 profile 建议
- 信用卡分期尚未作为独立 profile 场景
- 建议主链路仍主要基于风险类别，而不是自动基于合同场景

## 7. 你需要新增/修改的文件清单

以下清单基于你负责的“语言通俗化 + 场景知识扩展”跨模块任务。

### 必改：C 知识库与检索

| 文件 | 修改目的 |
|---|---|
| `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.json` | 补充/优化至少 30 个普通用户能看懂的术语解释 |
| `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.csv` | 与 JSON 保持一致，便于人工审阅 |
| `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.sql` | 与 JSON 保持一致，便于数据库导入 |
| `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.json` | 明确新增信用卡分期 3 条、教育培训贷 3 条场景规则 |
| `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.csv` | 与 JSON 保持一致 |
| `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.sql` | 与 JSON 保持一致 |
| `agents/risk_case/knowledge/seed_data/cases/cases.json` | 明确新增/修订每个场景 3 个案例，补充来源与可追溯字段 |
| `agents/risk_case/knowledge/seed_data/cases/cases.csv` | 与 JSON 保持一致 |
| `agents/risk_case/knowledge/seed_data/cases/cases.sql` | 与 JSON 保持一致 |
| `agents/risk_case/knowledge/seed_data/contract_templates/contract_templates.*` | 增强信用卡分期、教育培训贷条款模板 |
| `agents/risk_case/knowledge/seed_data/financial_products/financial_products.*` | 补充信用卡分期、教育培训贷相关产品参考 |
| `agents/risk_case/knowledge/seed_data/manifest.json` | 更新数据量统计 |
| `agents/risk_case/rag/retriever.py` | 优化术语检索、场景案例检索、产品对比检索 |
| `agents/risk_case/rules/engine.py` | 支持更清晰的场景规则命中与 questionToAsk |
| `agents/risk_case/main.py` | 如不改协议，可在 trace 中输出 `scenarioSignals` 与 `plainLanguageTerms` |
| `agents/risk_case/tests/` | 增加信用卡分期、教育培训贷、术语通俗化测试 |

### 必改：B 场景识别与字段解析

| 文件 | 修改目的 |
|---|---|
| `website/backend/src/services/contractParserAgent.ts` | 增加教育培训贷关键词识别，强化信用卡分期统一场景识别 |
| `website/backend/src/services/costCalculatorAgent.ts` | 确认信用卡手续费折算真实年化、培训贷服务费/退费成本能进入成本提示 |
| `website/backend/src/services/knowledgeBase.ts` | 如新增 B 知识条目，需要保证能加载 |
| `knowledge_base/contract_finance/knowledge_base/字段别名与费用词典.json` | 增加培训费、课程服务费、退课扣费、分期手续费、账单分期手续费等别名 |
| `knowledge_base/contract_finance/knowledge_base/合同知识库_entries.jsonl` | 增加教育培训贷合同条款知识 |
| `knowledge_base/contract_finance/knowledge_base/金融产品知识库_entries.jsonl` | 增加信用卡分期/培训贷参考产品或费用口径 |

### 建议改：D 场景建议

| 文件 | 修改目的 |
|---|---|
| `agents/recommendation_action/engine/recommender.py` | 增加 `credit_card_installment`、`education_training_loan` 场景建议 |
| `agents/recommendation_action/engine/action_plan.py` | 增加对应行动计划，例如联系银行确认手续费折算、联系培训机构确认服务失败后的贷款处理 |
| `agents/recommendation_action/examples/user-profile.json` | 增加新场景示例 |
| `agents/recommendation_action/tests/test_agent.py` | 增加场景化建议测试 |

### 可能涉及 A 控制/需协调

| 文件 | 协调原因 |
|---|---|
| `shared/analysis.ts` | 若新增正式 `ContractType` 枚举，例如 `education_training_loan`、`credit_card_installment`，属于公共类型，需 A 同意 |
| `shared/analysisProtocol.ts` | 若要把 `scenarioSignals` 或 `plainLanguageTerms` 放入正式协议，需 A 同意 |
| `shared/schemas/analysis-protocol-v1.schema.json` | 协议 Schema 需与 TypeScript 类型同步 |
| `docs/data-protocol-v1.md` | 协议文档需同步 |
| `website/frontend/src/utils/reportViewModel.ts` | 最新 feature 分支正在改，容易冲突，需和 A/前端同学协调 |
| `website/frontend/src/components/RiskCard.tsx` | 展示通俗解释/术语解释时可能要改，最新 feature 分支已改 |
| `website/frontend/src/components/CaseReferenceCard.tsx` | 案例来源展示已在 feature 分支新增，建议复用 |

建议策略：

- 不优先改公共协议。
- 先通过 B 的 `productType`、C 的 trace/扩展字段、D 的 user profile/内部场景推断实现功能。
- 只有当 A 明确要求“场景信号进入正式协议”时，再修改 `shared/`。

## 8. 公共协议位置与控制边界

公共协议位置：

- `shared/analysisProtocol.ts`
- `shared/schemas/analysis-protocol-v1.schema.json`
- `docs/data-protocol-v1.md`
- B 内部类型还涉及 `shared/analysis.ts`

当前判断：

- 这些文件属于 A/整合者控制的公共接口。
- C 可以提出字段需求或开小 PR，但不应在未协调的情况下直接大改正式协议。
- 你的功能优先通过已有字段、trace 文件、前端 view model 或 D 内部 profile 承接。

## 9. 你的工作起点判断

### 已经具备的基础

- 术语库已有 32 条，满足“数量底线”，但需要优化通俗表达质量。
- 信用卡分期和教育培训贷在 C 案例库中已有数据，各自超过 3 个案例。
- C 风险规则中已有若干相关规则，但需要明确整理为场景交付。
- B 已有大量信用卡原始材料。
- D 已有 training 场景建议雏形。
- 前端最新 feature 分支已经开始做报告摘要和案例来源卡片。

### 真正需要补的部分

1. 让 B 输出更明确的场景信号：
   - 信用卡分期：统一识别现金分期、账单分期、商户分期。
   - 教育培训贷：新增关键词与条款识别。

2. 让 C 的知识库从“已有数据”变成“可验收交付”：
   - 明确标注信用卡分期 3 条规则、3 个案例。
   - 明确标注教育培训贷 3 条规则、3 个案例。
   - 优化 30 个术语解释，使其适合普通用户。

3. 让 C 输出或 trace 中能看到知识命中：
   - `glossaryTerms`
   - `scenarioSignals`
   - matched cases with source

4. 让 D 能基于场景生成建议：
   - 信用卡分期建议：确认手续费折算年化、提前结清手续费、最低还款/循环利息。
   - 教育培训贷建议：确认退课退款、服务终止后贷款是否同步处理、培训机构和贷款机构责任边界。

5. 避免和 A/前端最新分支冲突：
   - 前端展示尽量复用 `feature/report-summary-case-source` 的 `ReportSummary`、`CaseReferenceCard` 和 `reportViewModel`。

## 10. 推荐开发顺序

### 第一步：C 知识库整理

先整理 `financial_glossary`、`risk_rules`、`cases`，把你的 7 条交付线变成明确可检查的数据。

优先文件：

- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.*`
- `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.*`
- `agents/risk_case/knowledge/seed_data/cases/cases.*`
- `agents/risk_case/knowledge/seed_data/manifest.json`

### 第二步：B 场景识别

改 `contractParserAgent.ts`，增加教育培训贷和信用卡分期统一场景识别逻辑。

优先文件：

- `website/backend/src/services/contractParserAgent.ts`
- `knowledge_base/contract_finance/knowledge_base/字段别名与费用词典.json`
- `knowledge_base/contract_finance/knowledge_base/合同知识库_entries.jsonl`

### 第三步：C 检索与 trace

让 C 能在运行日志或 trace 中清楚展示：命中了哪个场景、用了哪些术语、匹配了哪些案例。

优先文件：

- `agents/risk_case/rag/retriever.py`
- `agents/risk_case/rules/engine.py`
- `agents/risk_case/main.py`

### 第四步：D 场景建议

在不改协议的前提下，基于 C 输出中的风险类别、案例场景、产品类型、profile 场景生成对应建议。

优先文件：

- `agents/recommendation_action/engine/recommender.py`
- `agents/recommendation_action/engine/action_plan.py`
- `agents/recommendation_action/tests/test_agent.py`

### 第五步：前端展示协调

如需展示术语解释和场景标签，先看 `feature/report-summary-case-source` 是否已合入 main；若未合入，避免直接改相同文件，交给 A 统一合并。

可能涉及：

- `website/frontend/src/utils/reportViewModel.ts`
- `website/frontend/src/components/RiskCard.tsx`
- `website/frontend/src/components/CaseReferenceCard.tsx`

## 11. 验收口径建议

你的 3 天交付可以按下面口径验收：

1. 术语通俗化：
   - `financial_glossary` 至少 30 条。
   - 每条有普通用户能理解的 `definition` 和 `example`。
   - C 运行 trace 能看到术语命中记录。

2. 信用卡分期场景：
   - B 能识别账单分期/现金分期/商户分期。
   - C 至少有 3 条信用卡分期相关风险规则。
   - C 至少有 3 个信用卡分期案例。
   - D 能生成至少 1 条信用卡分期场景建议。

3. 教育培训贷场景：
   - B 能识别“培训贷/课程分期/教育分期/退课退费”等关键词。
   - C 至少有 3 条教育培训贷相关风险规则。
   - C 至少有 3 个教育培训贷案例。
   - D 能生成至少 1 条教育培训贷场景建议。

4. 不破坏公共协议：
   - 如果没有 A 同意，不修改 `shared/analysisProtocol.ts` 与 JSON Schema。
   - 正式输出仍符合 A 协议。
   - 扩展信息放在 trace 或前端 view model。

5. 集成验证：
   - B 示例输入能跑到 C。
   - C 输出能被 D 读取。
   - 对信用卡分期和教育培训贷样例至少各跑通一条链路。

