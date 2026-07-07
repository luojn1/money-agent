# BCD Agent Integration Plan

## 最终流程

用户上传合同
→ B Agent：合同解析与成本测算
→ C Agent：风险识别与案例匹配
→ D Agent：建议与行动方案
→ 前端完整报告

## 模块目录

- B Agent：website/backend
- 前端：website/frontend
- C Agent：agents/risk_case
- D Agent：agents/recommendation_action
- 统一协议：shared
- 知识库：knowledge_base

## 当前阶段

1. 保留 B 分支现有前后端。
2. 等 C Agent 补全缺失的 db、rag、examples、tests 等文件。
3. 将完整 C 代码迁入 agents/risk_case。
4. 将 D 代码迁入 agents/recommendation_action。
5. 修改 D 对 C 的路径。
6. 建立统一 pipeline 接口。
7. 完成真实 B → C → D 端到端联调。

## 统一接口目标

- POST /api/pipeline/analyze
- GET /api/pipeline/:taskId/status
- GET /api/pipeline/:taskId/result
