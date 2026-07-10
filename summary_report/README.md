# 摘要版报告

目标：让非金融背景用户在 30 秒内看懂合同核心风险。

## 文件

- `summary-report-v1.schema.json`：摘要版 JSON Schema。
- `summary_builder.py`：从 B/C/D 输出生成摘要 JSON。
- `agents/risk_case/summary_adapter.py`：C 侧风险摘要片段生成代码。
- `A_integration_package/agents/recommendation_action/summary_report_builder.py`：D/后端侧摘要整合代码。
- `summary_report_demo/index.html`：摘要版报告静态页面。

## 生成示例

```bash
python summary_report/summary_builder.py \
  --b dev_debug/outputs/latest/credit_card_installment/b-output.json \
  --c dev_debug/outputs/latest/credit_card_installment/c-output.json \
  --d dev_debug/outputs/latest/credit_card_installment/d-output.json \
  --output summary_report_demo/sample-summary.json
```

## 设计原则

- 默认展示摘要版。
- 完整报告用“查看完整报告”展开。
- 摘要中的每个数字、风险、行动都带 `detailAnchor`。
- 前端可用 `detailAnchor` 跳到完整版对应位置。
- 句子尽量短，避免专业术语。

