# 前端

React + Vite + TypeScript。页面通过 `src/services/api.ts` 统一调用后端真实合同分析接口，并保留可选的本地演示数据模式。

- `VITE_USE_MOCK_PIPELINE=false`：调用真实 `/api/pipeline/*` 接口。
- `VITE_USE_MOCK_PIPELINE=true`：仅用于本地界面开发。
- 生产构建由根目录 `Dockerfile` 完成，前后端同源部署。
