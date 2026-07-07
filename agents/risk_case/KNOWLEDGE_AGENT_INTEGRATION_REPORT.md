# Knowledge Agent Integration Report

## 1. 知识库构建统计

本次将 C 模块知识库从 MVP 种子数据扩展为可用于本地演示和规则/RAG 检索的多表知识体系。

| 知识库 | 表名 | 当前条目数 | 覆盖范围 |
|---|---|---:|---|
| 风险规则库 | `risk_rules` | 52 | 费用、利率、还款、合同条款、授权、担保、捆绑销售、个人信息、催收、退出 |
| 法律法规库 | `legal_regulations` | 32 | 民法典、消保法、个保法、征信、央行公告、金融消费者保护、司法解释等 |
| 案例库 | `cases` | 55 | 医美分期、培训贷、信用卡分期、消费贷、保险、租房贷、平台贷、现金贷/P2P |
| 合同条款模板库 | `contract_clause_templates` | 24 | 消费贷、信用卡分期、医美、培训贷、租房贷、车贷、保险、担保、融资租赁 |
| 金融产品库 | `financial_products` | 24 | 银行消费贷、消费金融公司、互联网平台贷、信用卡分期、医美分期、车贷 |
| 市场利率库 | `market_rates` | 48 | 近两年 LPR 1Y / LPR 5Y 月度参考数据 |
| 金融术语库 | `financial_glossary` | 32 | IRR、真实年化、砍头息、等额本息、征信授权、格式条款等 |

数据文件已按 SQL / CSV / JSON 三种格式生成：

```text
risk_case_agent/knowledge/seed_data/
├── risk_rules/
├── legal_regulations/
├── cases/
├── contract_templates/
├── financial_products/
├── market_rates/
└── financial_glossary/
```

说明：本批数据用于课程 MVP、本地演示和知识库启动。正式上线前，法规全文、LPR 历史值和产品费率应通过动态接入流程再次核验来源。

## 2. Agent 接入改造清单

### 新增文件

| 文件 | 作用 |
|---|---|
| `risk_case_agent/scripts/generate_knowledge_seed_data.py` | 批量生成扩展知识库 SQL/CSV/JSON |
| `risk_case_agent/KNOWLEDGE_AGENT_INTEGRATION_REPORT.md` | 本报告 |

### 修改文件

| 文件 | 改造内容 |
|---|---|
| `knowledge/schema.sql` | 新增 `market_rates`、`financial_glossary` 表；为 `risk_rules` 增加 `question_to_ask` |
| `knowledge/migration.py` | 支持新表迁移；为新增表加入 version、effective_date、review_status 等动态字段 |
| `knowledge/versioning.py` | 为 `market_rates`、`financial_glossary` 增加主键映射 |
| `knowledge/init_db.py` | 初始化时自动导入 `knowledge/seed_data` 扩展数据 |
| `knowledge/ingestion/csv_importer.py` | CSV 导入支持新表和 `question_to_ask` |
| `db/dao.py` | 新增金融产品、市场利率、术语表加载函数 |
| `rag/retriever.py` | 增加产品参考、市场利率、术语解释检索 |
| `rules/engine.py` | 增强 JSON 条件解析器；每条命中规则触发法规、案例、产品、LPR、术语检索 |
| `main.py` | 输出每条风险的多源溯源信息；新增 `knowledgeUsage` 使用统计 |

## 3. 当前 Agent 调用链路

```text
读取 B 的 contract_cost JSON
  -> initialize_database()
  -> load_risk_rules() 从 risk_rules 动态加载 active + approved 规则
  -> run_rule_engine()
     -> evaluate_condition() 解析 JSON 条件
     -> retrieve_regulations() 检索法规依据
     -> retrieve_similar_cases() 检索 Top 3 相似案例
     -> retrieve_products() 检索同类金融产品参考
     -> retrieve_market_rates() 检索 LPR 市场基准
     -> retrieve_glossary_terms() 检索术语通俗解释
  -> build_risk_item() 组装风险项和 evidence
  -> build_output() 生成 RiskCaseOutput + knowledgeUsage
  -> save_risk_case_output() 写入 risk_case_outputs / risk_items / risk_evidence / risk_matched_cases
```

## 4. B 示例数据测试结果

测试命令：

```bash
cd risk_case_agent
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

运行日志已保存：

```text
risk_case_agent/outputs/knowledge_agent_run_log.json
```

输出样例已保存：

```text
risk_case_agent/outputs/c-risk-case-output.json
```

### 本次运行摘要

| 指标 | 结果 |
|---|---:|
| 从数据库加载 active 风险规则 | 52 |
| 命中风险规则 | 7 |
| 生成风险项 | 7 |
| 高风险 | 4 |
| 中风险 | 3 |
| 低风险 | 0 |
| 检索法规 | 10 |
| 检索案例 | 12 |
| 检索产品参考 | 5 |
| 检索市场利率 | 3 |
| 引用术语解释 | 7 |

命中规则包括：

- RR001 费用不透明-存在额外费用
- RR002 服务费一次性扣除
- RR007 砍头息-到账低于本金
- RR012 真实年化高于名义利率10个百分点
- RR015 LPR倍数偏高
- RR017 提前还款收手续费
- RR022 高额违约金

## 5. 输出样例字段

每条 `riskItems[]` 已包含原协议核心字段，并额外补充知识库溯源字段：

```json
{
  "id": "risk_001_rr001",
  "title": "费用不透明-存在额外费用",
  "riskLevel": "high",
  "relatedClauseIds": ["clause_fee_003"],
  "evidence": [
    {
      "evidenceId": "evidence_001_01",
      "clauseId": "clause_fee_003",
      "quote": "合同原文摘录",
      "location": {}
    }
  ],
  "legalReferences": [],
  "matchedCases": [],
  "productReferences": [],
  "marketReferences": [],
  "glossaryTerms": [],
  "ruleEvidence": {
    "ruleId": "RR001",
    "condition": {
      "field": "data.costAnalysis.additionalFees",
      "operator": ">",
      "value": 0
    }
  },
  "questionToAsk": "请机构列明所有费用项目，并说明是否计入明示年化利率。"
}
```

本次输出还在 `data.knowledgeUsage` 中增加知识库使用统计：

```json
{
  "riskRulesLoaded": 52,
  "riskRulesHit": 7,
  "regulationsRetrieved": 10,
  "casesRetrieved": 12,
  "productsRetrieved": 5,
  "marketRatesRetrieved": 3,
  "glossaryTermsRetrieved": 7,
  "knowledgeSource": "local_sqlite_database",
  "databaseUpdatedAt": "2026-06-20"
}
```

## 6. 验证结果

已执行：

```bash
python -m pytest
```

结果：

```text
4 passed
```

已验证：

- Agent 从数据库加载 52 条 active 规则，而不是硬编码规则。
- 规则命中后触发法规、案例、产品、市场利率、术语多源检索。
- 输出风险项包含合同原文 evidence、规则依据、法规依据、案例依据、产品参考和术语解释。
- 运行结果写入 SQLite 结果表。

## 7. 后续优化建议

1. 将 LPR 数据源替换为官方或团队确认的自动更新接口。
2. 将案例库中的典型化案例逐步替换为有来源编号、裁判文书号、投诉编号或监管通报链接的真实案例。
3. 把 `contract_clause_templates` 接入 B 输出的条款分类阶段，提升 `relatedClauseIds` 精准度。
4. 用更强的 embedding 模型替换当前离线词频向量，提升案例相似度质量。
5. 对 `data.knowledgeUsage` 与 A 协议 schema 做正式扩展，避免未来严格校验时出现额外字段争议。
6. 将命中规则去重和风险合并做得更细，避免同一费用条款触发过多相近风险项。
