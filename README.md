# 看得懂的钱

“看得懂的钱”消费金融合同体检 MVP：上传合同或使用示例合同，查看模拟分析进度，并获得一份可展开阅读的合同体检报告。

> 当前版本仅使用固定 Mock 数据，不包含真实文件解析、OCR、AI、RAG、向量数据库、数据库或用户系统。

## 环境要求

- Node.js 20.19+（推荐使用当前 LTS）
- npm 10+

## 本地运行

```bash
npm install
npm run dev
```

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:3001
- 健康检查：http://127.0.0.1:3001/api/health

## 常用命令

```bash
npm run lint
npm run typecheck
npm run build
```

## 项目结构

```text
website/frontend/  React + Vite 前端
website/backend/   Express + TypeScript 后端
shared/            前后端共用的分析结果类型与 Mock 数据
docs/              项目文档与设计参考
```

## 后续接入位置

- 真实上传/OCR：替换 `website/backend/src/routes/analysis.ts` 中的演示任务创建逻辑。
- 真实 AI/RAG：在 `website/backend/src/services/` 增加独立分析服务，并保持现有 `AnalysisResult` 返回结构。
- 持久化任务：替换内存中的 `taskStore`，前端 service 层无需跟着页面散改。
