# D 模块第二阶段：报告页 AI 对话助手（T3）+ 工程兜底（T6）

> 「看得懂的钱」消费金融合同体检项目 · D 同学第二阶段交付
> 分支：`feature/chatbot-quality`

## 这次做了什么

在体检报告页新增「问一问」对话助手，用户可以对自己这份合同直接追问：

- **回答只基于当次报告**：所有数字、条款、案例都来自报告内容，每条回答附
  风险 / 条款 / 案例三类引用标签，不会凭空编造
- **多轮追问带上下文**：先问「还款压力大吗」，再补一句「我工资15000」，助手能
  延续话题结合报告数字帮忙估算；与合同无关的话题会礼貌拉回
- **隐私脱敏**：手机号 / 身份证 / 银行卡 / 显式标注的姓名，在调用 LLM 和写入
  对话历史之前统一遮蔽
- **双档运行，永不白屏**：
  - 未配置 LLM 密钥 → 规则模板回答（无外部依赖，随时可演示）
  - 配置 `LLM_API_KEY` → DeepSeek 增强回答（角色、语气、事实边界由代码内
    角色卡预设，无需训练调试）；超时或失败自动回退模板，页面不报错
  - 同一个密钥还会启用报告「建议落地」文案的 LLM 润色：建议结构、优先级、
    风险关联由规则引擎决定，LLM 只负责把表达改写成大白话（实测 D 阶段约 7 秒）
- **建议落地文案优化（2026-07-10）**：建议不再复读问题清单（重复 8 条 → 0 条），
  改为按风险类别给出具体动作（核对到账金额、留存证据、让客服演示截图等）；
  理由按类别差异化；同类建议自动合并（10 条 → 8 条，风险关联取并集）

## LLM 接入状态

已申请 DeepSeek API Key 并**先充值 10 元用于测试**，LLM 模式实测跑通
（2026-07-10）：单轮回答约 1~2 秒，多轮追问上下文正常，余额用尽自动回退模板回答。

密钥是**后端环境变量**，不在仓库中（`.env.local` 已被 `.gitignore` 忽略）。
本地演示把密钥写入 `.env.local` 后运行 `./start-demo.sh`；线上部署在
CloudBase 控制台配置：

```text
LLM_API_KEY=sk-xxx（联系 D 获取，勿提交到仓库）
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

## 新增接口（未动任何现有接口与 shared 协议）

```text
POST /api/pipeline/:taskId/chat          # 提问，返回 answer + citations + mode
GET  /api/pipeline/:taskId/chat/history  # 对话历史（入库前已脱敏）
```

错误码：`400 EMPTY_MESSAGE` / `404 TASK_NOT_FOUND` / `409 RESULT_NOT_READY`。

## 文件清单

```text
交付代码/
  website/backend/src/services/reportContextRetriever.ts  # 报告上下文检索（citation 来源）
  website/backend/src/services/chatOrchestrator.ts        # 对话编排：脱敏+角色卡+多轮历史+降级
  website/frontend/src/components/ChatPanel.tsx           # 报告页聊天入口
  website/frontend/src/components/ChatPanel.css           # 独立样式（mchat- 前缀）
  scripts/verify-chat.ts                                  # 验证脚本（31 项断言）
  start-demo.sh                                           # 一键本地演示
交付说明.md                                                # 给组长 A 的合并与部署说明
改动清单.md                                                # 改动明细与接口冻结遵守情况
```

另有 4 处对现有文件的最小改动（均为末尾新增，不改现有逻辑），明细见改动清单。

## 验证结果（2026-07-10 实测）

```bash
pnpm --filter @money-agent/backend run typecheck   # ✓
pnpm --filter @money-agent/frontend run typecheck  # ✓
pnpm run verify:chat                                # ✓ 31/31 断言通过
pnpm run verify:bcd-pipeline                        # ✓ 真实 B→C→D：8 风险 10 建议
```

浏览器实测：上传合同 → 报告页 → 问一问 → LLM 回答带引用；多轮追问、跑题拦截、
断网 / 无密钥降级均验证通过。

## 降级开关

| 开关 | 效果 |
| --- | --- |
| `DISABLE_CHAT=true`（后端） | 聊天返回关闭提示，主报告不受影响 |
| `VITE_DISABLE_CHAT=true`（前端） | 隐藏聊天入口 |
| 未配置 `LLM_API_KEY` | 规则模板回答，仍带引用 |
