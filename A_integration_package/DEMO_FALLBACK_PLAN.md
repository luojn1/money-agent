# 演示兜底方案

用于演示当天快速排障。目标是保证即使某个模块临时出问题，也能展示完整产品价值。

## 情况 1：B 没有识别出新场景

现象：

- `contractSummary.contractType = unknown`
- 或没有 `scenarioSignals`

兜底：

1. 使用样例文件：
   - `data_samples/protocol/b-credit-card-installment-output.json`
   - `data_samples/protocol/b-education-training-loan-output.json`
2. 说明：这是 B 标准输出样例，用于验证 C/D 链路。
3. 演示 C 继续识别风险和案例匹配。

## 情况 2：C trace 没传给 D

现象：

- D 没有生成 `action_scene_credit_card_installment_001`
- 或没有生成 `action_scene_education_training_loan_001`

兜底：

1. 检查 pipeline 是否传了：

```text
--input-c-trace <c-trace.json>
```

2. 如果暂时无法改 pipeline，D 会从 `riskItems` 文本兜底识别，但样例风险项必须包含“信用卡分期”或“培训贷”等关键词。

## 情况 3：前端页面字段没对上

现象：

- 后端有输出，但前端不展示新场景或建议。

兜底：

1. 直接打开 JSON 输出：
   - B 输出：`b-output.json`
   - C 输出：`c-output.json`
   - C trace：`c-trace.json`
   - D 输出：`d-output.json`
2. 使用静态预览页展示 C 风险卡片。
3. 口头说明：前端展示字段映射由 A 最后统一接入。

## 情况 4：数据库导入失败

现象：

- SQL 执行失败
- 数据库路径不一致

兜底：

1. 不走数据库。
2. 使用 JSON 种子文件：
   - `knowledge/seed_data/contract_templates/*.json`
   - `knowledge/seed_data/scenario_rules/scenario_recognition_rules.json`
3. `scenarioKnowledgeBase.ts` 已支持 JSON 文件读取。

## 情况 5：演示链路完全跑不起来

兜底演示顺序：

1. 展示 B 样例 JSON，说明合同已被解析为结构化字段。
2. 展示 C 风险报告，说明风险规则、法规、案例和术语库如何增强判断。
3. 展示 D 场景化建议，说明用户下一步该问什么、保存什么证据。
4. 展示知识库文件，说明新场景不是硬编码，而是有规则和模板支撑。

