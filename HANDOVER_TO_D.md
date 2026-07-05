# C 模块移交文档：risk_case Agent -> D 建议生成 Agent

## 2026-07-04 最新状态补充

本交接文档已同步到 C 模块当前实现状态。C Agent 已接入动态知识库、严格协议输出、可交互 Web 预览和自动化测试。

- 当前知识库规模：52 条风险规则、32 条法规、55+ 个案例、24 条合同条款模板、24 条金融产品、48 条市场利率、32 条金融术语。
- 默认输出 `outputs/c-risk-case-output.json` 会保留 C 模块扩展溯源字段，例如 `legalReferences`、`productReferences`、`marketReferences`、`glossaryTerms`、`ruleEvidence`、`knowledgeUsage`，便于 D 做解释增强。
- 如 A 的 JSON Schema 需要严格校验，请使用 `--strict-protocol` 生成 `outputs/c-risk-case-output.strict.json`，该模式会去除非协议扩展字段。
- 动态知识库接入已实现，配置文件在 `config/dynamic_sources.json`，使用说明见 `DYNAMIC_INGESTION_IMPLEMENTATION.md`。默认外部 URL 是模板/示例源，接真实 API 前需要替换 URL 并启用数据源。
- 本地 Web 预览已升级为可调用 Agent 的交互式页面：运行 `preview_demo/open_preview_demo.bat`，访问 `http://127.0.0.1:8090/preview_demo/index.html`。
- 当前验证结果：在 `risk_case_agent` 目录执行 `python -m pytest`，8 个测试通过。
- D 对接时优先读取协议字段：`riskItems[].id`、`riskItems[].title`、`riskItems[].riskLevel`、`riskItems[].reason`、`riskItems[].possibleConsequence`、`riskItems[].evidence`、`riskItems[].matchedCases`、`riskItems[].questionToAsk`、`riskSummary`。扩展字段可用于增强建议，但不要作为必需协议依赖。

## 第1章：概述

C 模块一句话职责：读取 B 的合同解析与成本测算结果，基于风险规则库和 RAG 知识检索识别风险，并输出带合同证据、法规依据和相似案例的 `RiskCaseOutput`。

整体链路位置：

```text
B contract_cost
  -> C risk_case
    -> D recommendation_action
```

C 不直接生成最终签约结论，也不输出 D 协议里的 `recommendations`。C 的核心交付是 `riskItems[]`、`riskSummary`、每条风险的 `questionToAsk`、`evidence` 和 `matchedCases`。

## 第2章：已完成工作清单

### 2.1 模块列表

| 模块 | 文件 | 功能 |
| --- | --- | --- |
| 主流程 | `main.py` | 初始化数据库、读取 B JSON、加载生效知识、运行规则引擎、生成 C JSON、写入数据库 |
| 风险规则引擎 | `rules/engine.py` | 解析规则条件，匹配 B 的结构化字段和条款，计算风险分，触发 RAG 检索 |
| RAG 检索 | `rag/retriever.py` | 检索相似案例和相关法规 |
| 本地向量化 | `rag/embeddings.py` | 使用中文单字 + 英文词元的 TF 向量和余弦相似度，支持离线演示 |
| 数据访问 | `db/dao.py` | 只加载 `approved + active` 的规则、法规和案例，保存风险输出 |
| 数据库初始化 | `knowledge/init_db.py` | 建表、加载种子数据、执行动态知识库迁移 |
| 动态迁移 | `knowledge/migration.py` | 给知识表补版本、审核、来源字段，并创建日志/数据源/待审核表 |
| 版本管理 | `knowledge/versioning.py` | 变更日志、过期、审核、拒绝、历史和回滚 |
| CSV 导入 | `knowledge/ingestion/csv_importer.py` | 导入运营 CSV，校验必填字段，支持待审核 |
| API 拉取 | `knowledge/ingestion/api_fetcher.py` | 支持通用 JSON API、法规库适配预留、LPR 数据适配 |
| 调度器 | `knowledge/scheduler.py` | APScheduler 定时拉取骨架，未安装时优雅降级 |
| 可选管理 API | `knowledge/api.py` | 提供知识库 CRUD、审核、拒绝接口骨架 |
| 测试 | `tests/test_dynamic_ingestion.py` | 覆盖 CSV 导入、审核、过期、历史、调度配置 |

### 2.2 目录结构

```text
risk_case_agent/
├── config/config.yaml
├── db/
├── examples/b-contract-cost-output.json
├── knowledge/
│   ├── ingestion/
│   ├── init_db.py
│   ├── migration.py
│   ├── scheduler.py
│   ├── schema.sql
│   ├── seed_*.sql
│   └── versioning.py
├── rag/
├── rules/
├── templates/
├── tests/
├── main.py
├── README.md
├── DYNAMIC_KNOWLEDGE_GUIDE.md
└── outputs/c-risk-case-output.json
```

### 2.3 预置知识库统计

- 风险规则：8 条
- 法规依据：6 条
- 历史案例：5 个
- 金融产品参考：3 条
- 合同模板：5 条

### 2.4 当前规则

| 规则 | 判断逻辑 |
| --- | --- |
| 费用不透明 | `data.costAnalysis.additionalFees > 0` |
| 真实年化偏高 | `data.costAnalysis.realAnnualRate > 24` |
| 提前还款限制 | `data.contractSummary.prepaymentRule` 包含“手续费”或“违约金” |
| 砍头息 | `actualReceivedAmount < loanAmount` |
| 自动续费/扣款 | `clauses[].text` 包含“自动续费”“自动扣款”“扣款授权” |
| 担保责任不清 | `clauses[].text` 同时涉及“担保”并包含“连带责任/保证责任/责任不清” |
| 逾期罚息过高 | `data.contractSummary.overdueFee` 包含“1.5倍”“高额违约金”“违约金” |
| 捆绑销售 | `clauses[].text` 包含“强制购买”“捆绑”“搭售”“保险费” |

### 2.5 预置法规和案例

法规：

- 《民法典》第496条
- 《民法典》第670条
- 《民法典》第677条
- 中国人民银行公告〔2021〕第3号
- 《消费者权益保护法实施条例》第10条
- 《银行保险机构消费者权益保护管理办法》第26条

案例：

- 医美分期服务费披露不足纠纷
- 培训贷退费与贷款合同分离纠纷
- 信用卡分期免息但手续费偏高纠纷
- 保险退保贷款捆绑纠纷
- 租房贷合同与租赁服务纠纷

## 第3章：输入输出规范

### 3.1 输入：B 的 ContractCostOutput

C 读取 B 的完整 JSON 信封。示例输入文件：

```text
examples/b-contract-cost-output.json
```

C 必须依赖的 B 字段：

```text
taskId
contractId
runId
data.contractSummary
data.clauses
data.clauses[].clauseId
data.clauses[].text
data.clauses[].location
data.costAnalysis
```

重点字段：

```json
{
  "contractSummary": {
    "loanAmount": 10000,
    "actualReceivedAmount": 9500,
    "prepaymentRule": "提前结清需支付剩余本金 2% 的手续费",
    "overdueFee": "逾期罚息为正常利率的 1.5 倍，并可能收取违约金"
  },
  "clauses": [
    {
      "clauseId": "clause_fee_003",
      "category": "fee",
      "text": "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。"
    }
  ],
  "costAnalysis": {
    "additionalFees": 500,
    "realAnnualRate": 23.4
  }
}
```

注意：B 示例里的 `clauseId` 是 `clause_fee_003`、`clause_prepay_008`。B 代码里可能生成 `clause_001_fee` 这类格式。C/D 都不要猜格式，只使用实际 JSON 中的 `clauseId`。

### 3.2 输出：C 的 RiskCaseOutput

示例输出文件：

```text
outputs/c-risk-case-output.json
```

核心结构：

```json
{
  "schemaVersion": "1.0.0",
  "taskId": "task_20260702_001",
  "contractId": "contract_001",
  "runId": "run_risk_case_task_20260702_001",
  "agent": "risk_case",
  "agentVersion": "c-0.2.0-dynamic-kb",
  "inputRunIds": ["run_b_001"],
  "data": {
    "riskItems": [],
    "riskSummary": {
      "high": 2,
      "medium": 2,
      "low": 0
    }
  },
  "warnings": [],
  "errors": []
}
```

D 重点使用：

- `data.riskItems[].id`
- `data.riskItems[].title`
- `data.riskItems[].category`
- `data.riskItems[].riskLevel`
- `data.riskItems[].reason`
- `data.riskItems[].possibleConsequence`
- `data.riskItems[].questionToAsk`
- `data.riskItems[].matchedCases`
- `data.riskItems[].evidence`
- `data.riskSummary`

### 3.3 ID 关联规则

D 生成建议时必须使用：

```text
C.data.riskItems[].id -> D.data.recommendations[].relatedRiskIds[]
```

不要用标题、数组下标或条款 ID 作为 D 的建议关联键。

C 内部证据关联：

```text
B.data.clauses[].clauseId
  -> C.data.riskItems[].relatedClauseIds[]
  -> C.data.riskItems[].evidence[].clauseId
```

## 第4章：如何使用

### 4.1 环境

建议 Python 3.10+。当前已在 Python 3.13.9 下测试通过。

安装依赖：

```bash
cd risk_case_agent
pip install -r requirements.txt
```

### 4.2 初始化数据库

```bash
python knowledge/init_db.py
```

### 4.3 运行 C Agent

```bash
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

可选启动知识库调度器：

```bash
python main.py --start-scheduler
```

### 4.4 测试

```bash
python -m pytest
```

当前测试结果：

```text
4 passed
```

### 4.5 配置

配置文件：

```text
config/config.yaml
```

包含数据库路径、RAG 检索 top_k、Agent 版本、评分阈值等。

## 第5章：接口说明

### 5.1 文件输出

D 最推荐读取：

```text
outputs/c-risk-case-output.json
```

### 5.2 数据库表

如果 D 需要直接查数据库，可读：

- `risk_case_outputs`：完整 C 输出 JSON
- `risk_items`：风险项
- `risk_evidence`：合同证据
- `risk_matched_cases`：相似案例

知识库表可复用：

- `risk_rules`
- `legal_regulations`
- `cases`
- `contract_clause_templates`
- `financial_products`

动态接入治理表：

- `knowledge_change_log`
- `data_source_config`
- `pending_knowledge_updates`

### 5.3 可选管理 API

文件：

```text
knowledge/api.py
```

接口骨架：

- `GET /api/knowledge/{table_name}`
- `POST /api/knowledge/{table_name}`
- `PUT /api/knowledge/{table_name}/{record_id}`
- `DELETE /api/knowledge/{table_name}/{record_id}`
- `POST /api/knowledge/{table_name}/{record_id}/approve`
- `POST /api/knowledge/{table_name}/{record_id}/reject`

## 第6章：知识库维护

### 6.1 新增风险规则

方式一：改 `templates/risk_rules_template.csv` 后导入。

方式二：调用 `knowledge.ingestion.csv_importer.import_csv()`。

方式三：走可选管理 API。

导入后默认进入 `pending`，审核通过才会被 C 主流程加载。

### 6.2 更新法规

维护 `templates/legal_regulations_template.csv`，或配置 JSON/API 数据源。

已有法规的新版本不会立即覆盖线上版本，而是进入 `pending_knowledge_updates`。

### 6.3 添加历史案例

维护 `templates/cases_template.csv`。案例的 `description`、`dispute_point`、`user_loss` 会被 RAG 检索使用。

### 6.4 动态接入

支持：

- CSV/Excel 转 CSV
- 通用 JSON API
- 国家法律法规数据库适配预留
- 央行 LPR/市场利率 JSON 适配
- 公开案例数据源适配预留

定时任务默认规划：

- 每天拉取 LPR
- 每周检查法规更新
- 每月拉取新案例

## 第7章：给 D 同学的开发建议

### 7.1 D 接入时注意事项

- D 应读取 C 的完整 `RiskCaseOutput`，不是只读 `riskItems` 数组。
- D 的 `inputRunIds` 应包含 B 的 `runId` 和 C 的 `runId`。
- D 的 `recommendations[].relatedRiskIds` 必须引用 `C.data.riskItems[].id`。
- 若 C `status = partial`，D 可以继续生成建议，但应传递 warnings，并考虑把自身状态设为 `partial`。

### 7.2 D 优先使用字段

建议 D 生成建议时按优先级读取：

1. `riskItems[].riskLevel`
2. `riskItems[].title`
3. `riskItems[].reason`
4. `riskItems[].possibleConsequence`
5. `riskItems[].questionToAsk`
6. `riskItems[].matchedCases`
7. `riskItems[].evidence[].quote`
8. `riskSummary`

### 7.3 questionList 与 recommendations

C 没有输出顶层 `questionList`，也没有输出 `recommendations`。C 每条风险里有：

```text
riskItems[].questionToAsk
```

D 可以把这些问题整理成自己的：

```text
D.data.questionList
```

但 D 需要自己生成 `recommendations[]`，并用 `relatedRiskIds` 关联 C 的风险 ID。

### 7.4 overallResult

C 没有输出 A 协议中 D 负责的 `overallResult`。C 的运行 trace 里有 `overallRiskLevelByScore`，但它不是 `RiskCaseOutput` 标准字段。

D 可以参考：

- `riskSummary.high > 0`：倾向 `high`
- `riskSummary.medium > 0`：倾向 `verify`
- 无风险且信息充分：倾向 `low`
- B/C warnings 影响关键金额或条款：倾向 `insufficient_information`

不要只用 C 的分数直接决定“签约/不签约”。建议 D 输出“风险提示、问题清单、可咨询话术”，避免替用户做绝对决策。

## 第8章：后续优化建议

- 接入真实向量模型：`sentence-transformers` 或 OpenAI embeddings。
- 增加 JSON Schema 校验，自动验证 C/D 输出。
- 扩展案例库来源，替换示例 URL。
- 将逾期条款证据从 `contractSummary.overdueFee` 也显式转为 evidence。
- 增加管理后台页面，审核 `pending_knowledge_updates`。
- 优化 `risk_case_outputs` 与 D 的联调接口，提供 HTTP 服务。
- 对法规和案例加失效监控，避免引用过期依据。

## Codex 提示词：给 D 同学直接使用

1. 请读取 `risk_case_agent/outputs/c-risk-case-output.json`，总结其中 `riskItems` 的结构，并说明 D 的 `recommendations[].relatedRiskIds` 应该如何引用 C 的风险 ID。

2. 请根据 C 输出的 `riskItems[].riskLevel`、`reason`、`possibleConsequence`、`questionToAsk` 和 `matchedCases`，生成符合 A 协议的 `RecommendationActionOutput`。

3. 请验证 C 的 `RiskCaseOutput` 是否符合 A 的协议：检查 `inputRunIds`、`riskSummary` 计数、`evidence[].clauseId` 与 `relatedClauseIds` 的关联关系。

4. 请将 C 的每条 `riskItems[].questionToAsk` 整理为 D 的 `questionList`，并按 high、medium、low 风险等级排序。

5. 请读取 B 输出和 C 输出，生成 D 的 `overallResult`，注意不要直接替用户做绝对决策，而是给出“谨慎核实/重点确认/可进一步咨询”的行动建议。

## 数据关系图

```text
B ContractCostOutput
├─ runId
│  └─ C.inputRunIds[0]
├─ data.contractSummary
│  ├─ loanAmount
│  │  └─ C 规则：砍头息、费用透明度
│  ├─ actualReceivedAmount
│  │  └─ C 规则：actualReceivedAmount < loanAmount
│  ├─ prepaymentRule
│  │  └─ C 规则：提前还款限制
│  └─ overdueFee
│     └─ C 规则：逾期罚息过高
├─ data.costAnalysis
│  ├─ additionalFees
│  │  └─ C 规则：费用不透明
│  └─ realAnnualRate
│     └─ C 规则：真实年化偏高
└─ data.clauses[]
   ├─ clauseId
   │  ├─ C.riskItems[].relatedClauseIds[]
   │  └─ C.riskItems[].evidence[].clauseId
   ├─ text
   │  └─ C.riskItems[].evidence[].quote / clauseText
   └─ location
      └─ C.riskItems[].evidence[].location

C RiskCaseOutput
├─ runId
│  └─ D.inputRunIds[]
├─ data.riskItems[]
│  ├─ id
│  │  └─ D.recommendations[].relatedRiskIds[]
│  ├─ riskLevel
│  │  └─ D.priority / overallResult.level 参考
│  ├─ reason
│  │  └─ D.rationale
│  ├─ possibleConsequence
│  │  └─ D.rationale / 用户提示
│  ├─ questionToAsk
│  │  └─ D.questionList / recommendations[].action
│  ├─ matchedCases
│  │  └─ D 建议中的案例支撑
│  └─ evidence
│     └─ D 建议中的合同原文依据
└─ data.riskSummary
   └─ D.overallResult.level 参考
```
