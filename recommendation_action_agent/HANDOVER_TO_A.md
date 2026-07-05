# D 模块移交文档：recommendation_action Agent -> A 合并总控

## 一句话职责

D 读取 B（`contract_cost`）、C（`risk_case`）两份完整信封，输出协议 v1.0.0 的 `RecommendationActionOutput`，供后端汇总进 `FinalAnalysisResultV1`。

## A 怎么调用

方式一（推荐，文件交接）：

```bash
cd D/recommendation_action_agent
python main.py \
  --input-b <B输出.json> \
  --input-c <C输出.json> \
  --output outputs/d-recommendation-action-output.json \
  --schema <A仓库>/shared/schemas/analysis-protocol-v1.schema.json
```

退出码非 0 表示失败（上游不符协议或自检不通过），stdout 有中文错误明细。

方式二（进程内调用）：

```python
from main import run
d_env, action_plan, (b_env, c_env) = run(b_path, c_path)
```

## A 汇总 FinalAnalysisResultV1 时的字段映射

| FinalAnalysisResult 字段 | 取自 D |
| --- | --- |
| `overallResult` | `data.overallResult` |
| `questionList` | `data.questionList` |
| （建议区块） | `data.recommendations`（已按 must → should → optional 排序） |
| `sourceAgentRuns` 中 D 项 | `runId` / `agentVersion` / `status` |
| `completedWithWarnings` | D `status == "partial"` 或 `warnings` 非空时为 true |

## 状态语义（严格按协议）

- `completed`：B、C 均 completed 且链路一致。
- `partial`：B 或 C 为 partial，或 taskId/runId 链路不一致；warnings 内有 `B_`/`C_` 前缀的透传警告和 `UPSTREAM_LINK_MISMATCH`。
- `failed`：B 或 C 为 failed；`data = null`，请让任务进入 failed 分支，不要读 data。

## 验收自查（已在 D 内部保证）

1. `inputRunIds = [B.runId, C.runId]`；
2. 全部 `recommendations[].relatedRiskIds` 可解析到 `C.data.riskItems[].id`；
3. `data` 恰为 `overallResult / recommendations / questionList / disclaimer` 四字段；
4. 通过 `shared/schemas/analysis-protocol-v1.schema.json` 的 `recommendationActionOutput` 校验；
5. `disclaimer` 恒存在。

## 行动管理扩展（可选接入）

`outputs/d-action-plan.json` 不属于协议输出，前端如需“行动提醒/证据清单/沟通话术”板块可直接消费；字段见 README。不接也不影响主链路。

## 已知边界

- 建议文案为规则模板生成（与 C 的规则引擎风格一致，离线可复现）；后续可在 `engine/recommender.py` 挂 LLM 润色，不影响协议结构。
- 用户画像个性化建议的 `relatedRiskIds` 为空数组（协议允许），前端展示时可归入“通用建议”。
