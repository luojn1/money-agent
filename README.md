# 合同上传识别与真实成本测算交付包

本包对应《看得懂的钱》的两个核心能力：

- 合同上传识别：支持粘贴文本、TXT/Markdown、DOCX、PDF 文本层，以及图片 OCR。
- 真实成本测算：基于合同结构化字段和本地知识库规则生成现金流，计算真实年化、总成本、费用归类和或有成本。

## 目录

```text
shared/analysis.ts                         # 前后端共用 Schema
website/backend/src/services/documentIntakeAgent.ts
website/backend/src/services/contractParserAgent.ts
website/backend/src/services/costCalculatorAgent.ts
website/backend/src/services/knowledgeBase.ts
website/backend/src/routes/analysis.ts
website/frontend/src/pages/UploadPage.tsx
website/frontend/src/pages/ReportPage.tsx
website/frontend/src/styles.css
knowledge_base/contract_finance            # 完整知识库，含 raw_sources 原始资料
scripts/verify-b-agents.ts                 # 冒烟验证脚本
```

## 运行

```bash
pnpm install
pnpm run dev
```

默认前端为 `http://127.0.0.1:5173`，后端为 `http://127.0.0.1:3001`。

## 验证

```bash
pnpm run typecheck
pnpm run verify:b-agents
pnpm run build
```

`verify:b-agents` 会校验示例合同的关键结果：借款金额、实际到账金额、月供、服务费归类、现金流、真实年化，以及知识库完整性。当前完整知识库应包含 145 个文件、133 条来源目录记录。

## 知识库调用说明

后端优先读取 `KNOWLEDGE_BASE_ROOT`，未设置时读取本包内 `knowledge_base/contract_finance`。成本测算会加载字段别名与费用词典、合同规则、产品规则、LPR 记录和 source catalog，并在报告页展示“知识库规则训练”的规模与依据。
