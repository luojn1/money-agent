# 后端

Express + TypeScript 合同分析服务。后端负责文档读取、成本测算，并串联风险识别与行动建议 Agent。

- 真实分析接口：`/api/pipeline/*`
- 服务检查：`/api/health`、`/api/ready`
- 当前任务状态保存在内存中，适合单实例 MVP；容器重启后旧任务不会保留。
