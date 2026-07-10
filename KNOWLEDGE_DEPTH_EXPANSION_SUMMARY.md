# 知识库深度扩充摘要

更新时间：2026-07-09

## 1. 扩充目标

本次不是赶交付，而是在已有“语言通俗化 + 场景知识扩展”基础上继续增加知识密度，提升风险识别 Agent 的说服力和覆盖度。

优先级按用户要求执行：

1. 术语库扩展
2. 风险规则扩展
3. 案例库扩展
4. 法规库扩展
5. 可选新增场景

## 2. 最终数据量

| 知识库 | 文件目录 | 扩充后数量 |
|---|---|---:|
| 金融术语库 | `agents/risk_case/knowledge/seed_data/financial_glossary/` | 52 |
| 风险规则库 | `agents/risk_case/knowledge/seed_data/risk_rules/` | 80 |
| 案例库 | `agents/risk_case/knowledge/seed_data/cases/` | 80 |
| 法规库 | `agents/risk_case/knowledge/seed_data/legal_regulations/` | 50 |
| 合同模板库 | `agents/risk_case/knowledge/seed_data/contract_templates/` | 24 |
| 金融产品库 | `agents/risk_case/knowledge/seed_data/financial_products/` | 24 |
| 市场利率库 | `agents/risk_case/knowledge/seed_data/market_rates/` | 48 |

`manifest.json` 已同步更新。

## 3. 新增内容概览

### 3.1 术语库

新增 20 条术语，使总数达到 52 条。

新增覆盖：

- 信用卡类：账单日、还款日、免息期、分期手续费率、占用额度、全额还款、滞纳金
- 教育培训贷类：培训贷、服务合同绑定、履约保证、就业承诺、试听期
- 保险类：现金价值、退保损失、等待期、宽限期、犹豫期
- 通用金融类：单利、授信额度、综合融资成本

每条均保持：

- `term`
- `definition`：通俗解释
- `example`：生活化示例

### 3.2 风险规则库

新增 28 条规则，使总数达到 80 条。

新增覆盖：

- 信用卡分期：最低还款额陷阱、提前还款规则不清、占用额度未提示、现金分期用途限制、自动分期默认开通
- 教育培训贷：诱导性营销、贷款主体未告知、退课后征信影响、学费一次性划转、未设置冷静期
- 通用风险：自动续费提示不显著、利率浮动风险未明示、担保责任范围模糊、投诉渠道缺失、费用退还规则缺失
- 可选新场景：保险分期、医美分期

### 3.3 案例库

新增 25 个案例，使总数达到 80 个。

新增覆盖：

- 信用卡分期纠纷 10 个
- 教育培训贷纠纷 10 个
- 其他消费金融纠纷 5 个，包括汽车金融、医美分期、保险分期、平台消费贷、租赁贷

### 3.4 法规库

新增 18 条法规/监管规则摘要，使总数达到 50 条。

新增覆盖：

- 《商业银行信用卡业务监督管理办法》相关信息披露、分期业务、催收管理
- 《银行卡业务管理办法》相关银行卡收费、持卡人权益
- 《关于进一步规范大学生互联网消费贷款监督管理工作的通知》
- 《国务院办公厅关于加强金融消费者权益保护工作的指导意见》
- 《银行保险机构消费者权益保护管理办法》
- 《金融消费者权益保护实施办法》
- 《个人信息保护法》
- 《电子签名法》
- 《互联网贷款管理暂行办法》
- 《消费金融公司管理办法》
- 《保险销售行为管理办法》
- 《互联网广告管理办法》

说明：法规库中保存的是 MVP 知识库摘要，不替代正式法律意见；后续上线前应由人工核验条文原文和效力状态。

## 4. 新增脚本

新增：

- `agents/risk_case/scripts/expand_knowledge_depth.py`

作用：

- 读取现有 JSON
- 按主键和标题/术语去重
- 增量追加新术语、规则、案例、法规
- 同步生成 JSON、CSV、SQL
- 更新 `manifest.json`

运行命令：

```bash
python agents/risk_case/scripts/expand_knowledge_depth.py
```

## 5. Trace 增强

修改：

- `agents/risk_case/main.py`

新增：

- `detect_scenario_signals()`
- `collect_trace_glossary_terms()`

trace 新增字段：

- `scenarioSignals`
- `glossaryTerms`

新增可识别场景信号：

- `credit_card_installment`
- `education_training_loan`
- `insurance_installment`
- `medical_beauty_installment`

## 6. 验证结果

知识库统计：

```text
financial_glossary 52
risk_rules 80
cases 80
legal_regulations 50
```

C Agent 使用扩充知识库运行：

```text
activeRuleCount = 80
glossaryTerms = 7
```

测试结果：

```text
8 passed
```

测试命令：

```bash
cd agents/risk_case
python -m pytest
```

## 7. 相关输出文件

术语：

- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.json`
- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.csv`
- `agents/risk_case/knowledge/seed_data/financial_glossary/financial_glossary.sql`

规则：

- `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.json`
- `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.csv`
- `agents/risk_case/knowledge/seed_data/risk_rules/risk_rules.sql`

案例：

- `agents/risk_case/knowledge/seed_data/cases/cases.json`
- `agents/risk_case/knowledge/seed_data/cases/cases.csv`
- `agents/risk_case/knowledge/seed_data/cases/cases.sql`

法规：

- `agents/risk_case/knowledge/seed_data/legal_regulations/legal_regulations.json`
- `agents/risk_case/knowledge/seed_data/legal_regulations/legal_regulations.csv`
- `agents/risk_case/knowledge/seed_data/legal_regulations/legal_regulations.sql`

