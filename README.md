# 看得懂的钱

消费金融合同体检 MVP。当前版本已接入合同上传识别、合同结构化解析、真实成本测算和本地知识库规则调用，并按团队统一数据协议 `v1.0.0` 输出合同成本模块结果。

## 本次交付范围

- 合同上传/OCR：支持粘贴文本、TXT/Markdown、DOCX、PDF 文本层、图片 OCR。
- 合同解析：抽取机构、借款金额、实际到账、期限、还款方式、名义利率、费用与关键条款。
- 真实成本测算：基于现金流计算真实年化、总还款、利息、额外费用、费用归类和或有成本。
- 知识库训练/调用：读取 `knowledge_base/contract_finance` 下完整合同与金融产品知识库，包含原始资料、字段词典、合同规则、产品规则和 LPR 记录。
- 协议输出：`GET /api/analysis/:taskId/contract-cost-output` 与 `/b-output` 返回统一 `ContractCostOutput`。

## 运行

```bash
pnpm install
pnpm run dev
```

- 前端预览：http://127.0.0.1:5173
- 后端接口：http://127.0.0.1:3001
- 健康检查：http://127.0.0.1:3001/api/health

## 核心接口

- `POST /api/analysis`：统一协议上传入口，multipart 字段名 `file`，也可带 `contractText`。
- `POST /api/analysis/upload`：兼容旧上传入口。
- `POST /api/analysis/demo`：创建示例合同任务。
- `GET /api/analysis/:taskId/status`：返回协议版任务状态。
- `GET /api/analysis/:taskId/result`：返回前端展示报告。
- `GET /api/analysis/:taskId/contract-cost-output`：返回严格 B 模块协议输出。
- `GET /api/analysis/:taskId/b-output`：同上，保留给原有联调路径。

## 验证

```bash
pnpm run typecheck
pnpm run verify:b-agents
pnpm run build
pnpm run lint
```

`verify:b-agents` 会校验示例合同的借款金额、实际到账、月供、服务费归类、现金流、真实年化、知识库完整性，以及 `ContractCostOutput` 的 `schemaVersion/agent/contractId/clauseId/calculationBasis`。

当前知识库完整性基线：145 份资料文件，133 条来源目录记录。

## 目录

```text
docs/data-protocol-v1.md                  # 团队统一数据协议
shared/analysis.ts                        # 前端展示与本地分析类型
shared/analysisProtocol.ts                # 协议类型
shared/schemas/analysis-protocol-v1.schema.json
website/backend/src/services/documentIntakeAgent.ts
website/backend/src/services/contractParserAgent.ts
website/backend/src/services/costCalculatorAgent.ts
website/backend/src/services/protocolAdapter.ts
website/backend/src/routes/analysis.ts
website/frontend/src/pages/UploadPage.tsx
website/frontend/src/pages/ReportPage.tsx
knowledge_base/contract_finance           # 完整知识库与 raw_sources
scripts/verify-b-agents.ts
```
