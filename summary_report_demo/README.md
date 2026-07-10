# 摘要版报告 Demo

打开：

```text
summary_report_demo/index.html
```

功能：

- 默认展示一份信用卡分期摘要样例。
- 支持选择 `summary-report-v1` JSON 文件预览。
- 点击“查看完整报告”展开原始摘要数据。
- 摘要中的风险、行动、数字都保留 `detailAnchor`，方便前端跳转到完整版报告对应位置。

生成摘要 JSON：

```bash
python summary_report/summary_builder.py \
  --b dev_debug/outputs/latest/credit_card_installment/b-output.json \
  --c dev_debug/outputs/latest/credit_card_installment/c-output.json \
  --d dev_debug/outputs/latest/credit_card_installment/d-output.json \
  --output summary_report_demo/sample-summary.json
```

