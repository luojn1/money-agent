# recommendation_action Agent（D 模块）

本目录是《看得懂的钱》同学 D 负责的**建议生成 + 行动管理 Agent**。它读取 B 模块 `contract_cost` 与 C 模块 `risk_case` 的完整协议信封，生成符合 A《多 Agent 数据协议 v1.0.0》的 `RecommendationActionOutput`，并额外产出行动管理扩展文件（提醒任务、证据清单、沟通话术、跟进计划）。

整体链路位置：

```text
B contract_cost -> C risk_case -> D recommendation_action -> A 后端汇总 FinalAnalysisResultV1
```

## 快速开始

环境：Python 3.10+，无必装第三方依赖（`jsonschema`、`pytest` 可选）。

```bash
cd recommendation_action_agent
python main.py
```

默认读取 `examples/` 下的 B/C 示例输出，产出：

- `outputs/d-recommendation-action-output.json` —— 严格符合协议 v1.0.0 的 D 输出（A 只需要这份）
- `outputs/d-action-plan.json` —— 行动管理扩展文件（前端“行动提醒”板块可选用）

指定真实输入与 Schema 校验：

```bash
python main.py \
  --input-b <B的contract-cost-output.json> \
  --input-c <C的risk-case-output.json> \
  --output outputs/d-recommendation-action-output.json \
  --schema <A仓库>/shared/schemas/analysis-protocol-v1.schema.json
```

个性化建议（说明书 5.2.5，可选）：

```bash
python main.py --user-profile examples/user-profile.json
```

`user-profile.json` 支持字段：`firstTimeBorrower`（bool）、`hasOtherDebts`（bool）、`scenario`（`insurance | training | medical | general`）。

## 演示网页（面向用户的完整体检流程）

完整演示（真实合同走 B→C→D 全链路）：

```bash
# 终端一：启动 B 合同解析服务（在 B 仓库主体目录）
pnpm install
pnpm run dev            # 端口 3001

# 终端二：启动 D 预览服务（合并仓库为 agents/recommendation_action，
#         本地开发布局为 D/recommendation_action_agent）
cd agents/recommendation_action
python preview/server.py

# 浏览器打开 http://127.0.0.1:8091
```

只看示例效果（不依赖 B/C 服务）：

```bash
python preview/server.py
# 浏览器打开 http://127.0.0.1:8091/ ，点击“示例演示”
```

C 模块目录按仓库相对路径自动发现（`agents/risk_case` 优先，其次
`C/risk_case`），也可用环境变量覆盖：`export C_DIR=/path/to/risk_case`。
调用 C 时会自动探测其命令行能力：旧版 C 传 `--strict-protocol` 要求严格
协议输出（新版 C 默认严格），并传 `--trace` 以从 stdout 读取 riskScore。

页面按产品说明书 3.5 设计，面向最终用户，无内部术语：**首页上传/粘贴合同 → 分析进度 → 体检报告**。报告含：四个核心数字（名义 vs 真实年化对比、成本四档颜色判定，说明书 4.2 功能 4）、成本构成、合同关键信息、风险评分仪表盘（0–40 高 / 41–70 中 / 71–100 低）+ 风险条款三栏对照、签约建议（红黄绿优先级）、签约前问题清单、行动提醒。

上传真实合同走**完整 B→C→D 编排**：`POST /api/run` 收到 `{contractFile:{name,base64}}` 后自动转发 B 服务解析测算（需先在 B 目录 `pnpm run dev` 启动，端口 3001）、subprocess 调 C 做风险识别（含从 C 的 stdout trace 读取 riskScore 评分）、再运行本模块。也支持 `{b:{...},c:{...}}` 直接传协议 JSON（联调用，不依赖 B/C 服务）。

可选 LLM 文案增强（规则保底 + LLM 润色，不改结论与数字）：

```bash
export LLM_API_KEY=sk-xxx          # OpenAI 兼容接口均可（通义/DeepSeek/Kimi）
export LLM_BASE_URL=https://api.openai.com/v1
python main.py --llm               # 未配置或调用失败自动回落模板文案
```

运行测试：

```bash
python -m pytest
```

当前 15 个测试全部通过（含对 A 官方 JSON Schema 的校验用例）。

## 协议要点

D 输出外层是通用 Agent 信封，`agent` 固定 `recommendation_action`，`agentVersion` 当前 `d-0.1.0`。`data` 按协议**只含四个字段**：

| 字段 | 生成逻辑 |
| --- | --- |
| `overallResult` | `level` 按 C 交接文档 7.4 判定：高风险>0 → `high`；仅中风险 → `verify`；无风险 → `low`；B 关键金额全部缺失，或关键路径 warning 且确有关键金额缺失 → `insufficient_information`（提示性 warning 如"检测到砍头息已按实际到账计算"不触发降级，避免掩盖真实风险等级）。`summary` 综合真实年化、风险计数与行动结论 |
| `recommendations[]` | 每条 C 风险生成一条建议；`relatedRiskIds` 引用 `C.data.riskItems[].id`（不用标题/下标）；`priority`：high→must、medium→should、low→optional；`timing` 按风险 category 映射协议枚举；高风险≥1 时追加一条聚合 must 建议（暂缓签约）；另生成"对比其他金融产品"建议（说明书 5.2.5，关联 interest_fee 风险） |
| `questionList` | 汇总 `riskItems[].questionToAsk`，按 high→medium→low 排序、去重、上限 10 条 |
| `disclaimer` | 固定免责声明，不省略 |

状态与链路规则：

- `inputRunIds` 同时包含 B 和 C 的 `runId`；`taskId`/`contractId` 沿用上游。
- B 或 C 为 `partial` → D 为 `partial`，并把上游 warnings 加 `B_`/`C_` 前缀透传。
- B 或 C 为 `failed` → D 为 `failed`，`data = null`，`errors` 说明原因。
- 输出写盘前先过内置结构自检（协议第 8 节验收规则），可选再过 A 的 JSON Schema。

## 行动管理扩展（d-action-plan.json）

协议 `RecommendationActionData` 为 `additionalProperties: false`，行动管理结果因此不进协议输出，单独成文件（与 C 模块“扩展字段 + strict 模式”的做法一致）。内容：

- `reminders[]`：按期还款（由 `installmentCount`/`monthlyPayment` 生成）、逾期防范、提前还款前置确认、自动扣款核对、退费/退订期限确认与投诉时限提醒（从 B 条款文本扫描关键词，说明书 5.2.6）、到期结清确认，并用 `relatedRiskIds` 回链 C 的风险项
- `evidenceChecklist[]`：证据保存清单
- `communicationScripts[]`：按最高风险生成的沟通话术（来自 `questionToAsk`）
- `followUpPlan[]`：before_signing / during_repayment / when_overdue / dispute 四阶段跟进步骤

## 目录

```text
recommendation_action_agent/
├── main.py                 # CLI 入口与信封组装
├── engine/
│   ├── loader.py           # 上游信封加载与一致性检查
│   ├── recommender.py      # recommendations / questionList 生成（文案模板集中在此）
│   ├── overall.py          # overallResult 判定
│   ├── action_plan.py      # 行动管理扩展
│   ├── llm_polish.py       # 可选 LLM 文案增强（规则保底，失败静默回落）
│   └── validator.py        # 协议自检 + 可选 JSON Schema 校验
├── preview/                # 演示网页：上传合同 → B→C→D 完整编排 → 体检报告
│   ├── server.py           # 零依赖 HTTP 服务（:8091），含全链路编排
│   └── index.html          # 面向用户的三视图 SPA（上传/进度/报告）
├── examples/               # B/C 示例输入（来自 B 示例与 C 实际输出）
├── outputs/                # 运行 main.py 生成的示例结果
├── tests/test_agent.py     # pytest 用例 x15
└── HANDOVER_TO_A.md        # 给 A 同学的合并对接说明
```
