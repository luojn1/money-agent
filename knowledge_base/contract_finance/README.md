# B同学_合同与金融产品知识库_20260701

本文件夹用于支持 B 同学负责的两个模块：合同解析 Agent、成本测算 Agent。

## 目录说明

- `raw_sources/`：下载的原始网页、PDF、DOC，按监管口径、合同模板、金融产品、信用卡分期分类。
- `source_catalog.csv`：资料来源目录，含 URL、保存路径、用途、下载状态。
- `source_catalog.json`：同上，便于程序读取。
- `knowledge_base/合同知识库.md`：合同字段、条款类型、别名、抽取规则。
- `knowledge_base/金融产品知识库.md`：金融产品要素、费率、费用类型、还款方式和成本测算口径。
- `knowledge_base/B输出Schema草案.json`：给 C/D 同学和前端联调的结构化输出建议。
- `knowledge_base/字段别名与费用词典.json`：合同解析 Agent 可直接使用的关键词词典。

## 真实性说明

所有条目均来自公开网页或公开文件链接；下载失败的条目不会伪造内容，只会保存一个 `.url.txt` 指针文件并在 `source_catalog.csv` 标注失败原因。建议引用时优先使用 `status=ok` 的条目。

## 使用建议

1. 先用 `source_catalog.csv` 做文献/来源目录。
2. 用 `合同知识库.md` 给合同解析 Agent 定字段。
3. 用 `金融产品知识库.md` 给成本测算 Agent 定计算口径。
4. 与 C/D/A 同学对齐 `B输出Schema草案.json` 后再写代码。
