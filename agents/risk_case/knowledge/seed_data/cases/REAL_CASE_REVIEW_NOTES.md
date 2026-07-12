# 真实案例库复审说明

本分支只保留与真实案例库直接相关的代码和数据，目标是让主分支合并时聚焦于 `cases` 知识库质量，不夹带上传包、Demo、调试基线或评测产物。

## 本次修复范围

- 修复 `import_manual_real_cases.py` 中 `CSV_COLUMNS` 重复包含 `source_url` 的问题，重新生成后的 `cases.csv` 和 `cases.sql` 仅保留一个 `source_url` 字段。
- 将 `source_url` 为 `example.com` 的 55 条模板/占位案例从 `approved` 调整为 `pending`，并设置 `is_active = 0`，避免被运行时检索加载。
- 将处理结果中明确包含“复核”提示的 15 条案例从 `approved` 调整为 `pending`，并设置 `is_active = 0`，等待人工核对原文后再上线。
- 对原先缺少 `effective_date` 的 78 条人工案例重新抽取日期；能从原文或 URL 识别精确日期的已补齐，仍缺少精确日期的记录保持 `pending`。

## effective_date 规范确认

当前动态知识规范允许字段存在空值，但运行时只应加载 `review_status = approved` 且 active 的知识。为保证案例来源可核验，本分支采用更严格的上线规则：

- `approved` 案例必须有可核验来源链接、明确处理结果、且具备精确 `effective_date`。
- 缺少精确 `effective_date` 的案例不作为已审核数据上线，先保留为 `pending`。
- `pending` 案例可作为后续补充材料，但不会进入当前 Agent 的相似案例匹配结果。

## 主分支合并边界

本分支不建议合并以下早期交付或运行产物：

- 上传包与上传清单：属于一次性交付材料，不是运行时代码或知识库。
- Demo 目录：用于本地演示，和真实案例库复审无直接关系。
- `dev_debug` 调试基线：属于开发验证产物，不应随真实案例库进入主分支。
- `evaluation` 评测产物：属于阶段性评测输出，后续如需纳入应单独走评测分支。
- `summary_report`、`summary_report_demo`、`A_integration_package`：属于整合/展示包，不属于本次真实案例库修复范围。

本分支保留的主要内容为案例种子数据、人工案例来源文档、真实案例采集/导入脚本及本说明文件。
