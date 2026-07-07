# C 模块验收检查报告

检查日期：2026-07-07  
检查对象：本地工作区 `risk_case_agent/` 与 `preview_demo/`  
验收来源：A 同学提供的 `C模块.docx`

## 0. 总体结论

当前 C 模块已经具备完整的本地代码、知识库、RAG、规则引擎、测试和 Web 预览，能够在本机运行并生成严格协议 JSON。但按 A 的验收文档逐项核对后，仍有 5 个需要优先整改的点：

1. 目录当前为 `risk_case_agent/`，不是 A 建议的 `agents/risk_case/`。
2. 默认输出仍包含 C 扩展字段，严格协议输出需要显式加 `--strict-protocol`，尚未作为默认模式。
3. 扩展 trace 信息目前打印到终端，没有单独写入 trace 文件。
4. B 的 `failed` / `partial` 状态没有按协议透传处理。
5. 规则引擎存在“未匹配到条款时使用第一条条款兜底”的逻辑，需要移除。

因此，本模块状态为：核心功能可运行，但尚未完全满足 A 的最终联调验收要求。

## 1. 当前工作区状态

已扫描到的 C 模块核心目录：

```text
risk_case_agent/
├── config/
├── db/
├── examples/
├── knowledge/
├── rag/
├── rules/
├── scripts/
├── templates/
├── tests/
├── main.py
├── web_server.py
├── requirements.txt
├── README.md
├── HANDOVER_TO_D.md
└── QUICK_START_FOR_D.md
```

已扫描到的预览 demo：

```text
preview_demo/
├── index.html
├── app.js
├── style.css
├── open_preview_demo.bat
├── start_preview_server.bat
└── PREVIEW_DEMO_README.md
```

说明：当前环境没有可用的 `git` 命令，无法直接确认本地是否正处于 `c-agents-github-package` 分支，只能按当前工作区文件状态检查。

## 2. 目录完整性检查

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `db/connection.py` | 通过 | 文件存在 |
| `db/dao.py` | 通过 | 文件存在 |
| `rag/retriever.py` | 通过 | 文件存在 |
| `rag/embeddings.py` | 通过 | 文件存在 |
| `examples/` | 通过 | 含 `b-contract-cost-output.json` |
| `tests/` | 通过 | 含核心测试与动态接入测试 |
| `config/` | 通过 | 含 `config.yaml`、`dynamic_sources.json` |
| `rules/` | 通过 | 含 `engine.py` |
| `knowledge/` | 通过 | 含 schema、种子数据、动态接入、版本管理、调度 |
| `requirements.txt` | 通过 | 文件存在 |
| `main.py` | 通过 | 文件存在 |

结论：A 文档中提到的缺失核心文件，在当前本地工作区均已补齐。

## 3. 导入检查

已执行：

```bash
python -m compileall .
python -m pytest
```

结果：

```text
8 passed
```

`main.py` 依赖的以下模块在当前目录下可正常导入：

```text
db.connection
db.dao
knowledge.init_db
knowledge.scheduler
knowledge.versioning
rag.retriever
rules.engine
```

结论：在 `risk_case_agent/` 目录内运行时，没有发现 `ModuleNotFoundError`。

## 4. 目录结构检查

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 是否位于 `agents/risk_case/` | 未通过 | 当前目录为 `risk_case_agent/` |
| 是否包含 `main.py`、`requirements.txt`、`db/`、`rag/`、`rules/`、`knowledge/` | 通过 | 当前目录下均存在 |

建议：如果 A 最终合并要求统一目录，应将 `risk_case_agent/` 整体移动到：

```text
agents/risk_case/
```

或者保留当前目录，同时提供一个 `agents/risk_case/` 包装入口。但从验收角度看，最好直接按 A 的目录规范放置。

## 5. 运行验证

已执行：

```bash
python main.py --help
```

确认支持参数：

```text
--input
--output
--db
--start-scheduler
--strict-protocol
```

已执行严格协议输出：

```bash
python main.py --input examples\b-contract-cost-output.json --output outputs\acceptance-strict-output.json --strict-protocol
```

结果：命令成功，生成 `outputs/acceptance-strict-output.json`。

`pip install -r requirements.txt --dry-run` 检查结果：

- `pydantic`、`pyyaml`、`numpy`、`pytest` 已满足。
- `apscheduler` 在当前环境需要联网解析/下载，dry-run 因网络/超时未完整结束。
- `requirements.txt` 已包含当前代码需要的第三方依赖。

结论：CLI 可运行；新电脑安装依赖时需要联网，或提前准备离线依赖包。

## 6. 协议输出检查

严格协议输出文件：

```text
outputs/acceptance-strict-output.json
```

检查结果：

```text
top_keys = schemaVersion, taskId, contractId, runId, agent, agentVersion, status, generatedAt, inputRunIds, data, warnings, errors
data_keys = riskItems, riskSummary
status = completed
agent = risk_case
inputRunIds = [run_b_001]
riskSummary = { high: 4, medium: 3, low: 0 }
```

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `data` 是否只含 `riskItems`、`riskSummary` | 通过，仅限 `--strict-protocol` | 严格模式下满足 |
| 默认输出是否只含协议字段 | 未通过 | 默认模式仍包含 `knowledgeUsage` 及风险项扩展字段 |
| 扩展信息是否单独输出到 trace 文件 | 未通过 | 当前 trace 只打印到 stdout，没有写入独立 trace 文件 |

建议：

1. 将严格协议输出改为默认模式。
2. 新增 `--trace-output` 参数，或默认在输出旁边生成 `*.trace.json`。
3. 扩展字段只写 trace，不进入正式 C JSON。

## 7. B 状态处理检查

A 要求：

| B 状态 | C 应返回 |
| --- | --- |
| `failed` | `status = failed`，`data = null` |
| `partial` | `status = partial`，透传 B 的 `warnings` |
| `completed` | 正常执行 |

当前实际结果：

| 场景 | 检查结果 | 说明 |
| --- | --- | --- |
| B 为 `completed` | 通过 | 示例输入可正常执行 |
| B 为 `failed` | 未通过 | 当前 `validate_b_output()` 要求 `data` 必须是对象，`data = null` 会抛出 `AgentInputError`，不会生成 C failed 输出 |
| B 为 `partial` | 未通过 | 当前 `build_output()` 固定生成 `completed`，不会透传 B warnings |

结论：B 状态处理是当前最重要的协议缺口之一。

## 8. 条款关联检查

使用输入：

```text
examples/b-contract-cost-output.json
```

B 条款 ID：

```text
clause_fee_003
clause_prepay_008
```

严格输出检查结果：

```text
risk_count = 7
bad_related = 空
bad_evidence = 空
empty_related = 空
```

说明：

- 当前生成样例中，所有 `relatedClauseIds` 都能在 B 的 `data.clauses[].clauseId` 中找到。
- 所有 `evidence[].clauseId` 都存在于对应风险项的 `relatedClauseIds` 中。

但代码中存在以下风险逻辑：

```python
if matched:
    return matched[:2]
return clauses[:1]
```

该逻辑位于 `rules/engine.py` 的 `find_relevant_clauses()`。这意味着当规则命中但没有找到真实相关条款时，会使用合同第一条作为证据，违反 A 的要求。

结论：当前样例输出通过关联检查，但实现逻辑需要整改，不能保留“第一条兜底”。

## 9. 输出字段完整性检查

严格输出中已确认：

| 字段 | 结果 |
| --- | --- |
| `agent = "risk_case"` | 通过 |
| `inputRunIds = [B.runId]` | 通过 |
| `data.riskItems` | 通过 |
| `data.riskSummary` | 通过 |
| `riskItems[].id` | 通过 |
| `riskItems[].category` | 通过 |
| `riskItems[].riskLevel` | 通过 |
| `riskItems[].reason` | 通过 |
| `riskItems[].possibleConsequence` | 通过 |
| `riskItems[].questionToAsk` | 通过 |
| `riskItems[].relatedClauseIds` | 通过 |
| `riskItems[].evidence` | 通过 |

补充说明：严格输出的风险项还包含 `title`、`confidence`、`clauseText`、`clauseLocation`、`matchedCases`。这些字段是否允许，需要以 A 的 JSON Schema 为准。如果 A 要求“只能包含最小字段”，还需要进一步裁剪。

## 10. ID 一致性检查

B 输入：

```text
taskId = task_20260702_001
contractId = contract_001
runId = run_b_001
```

C 输出：

```text
taskId = task_20260702_001
contractId = contract_001
inputRunIds = [run_b_001]
```

结论：通过。C 输出保持了与 B 输入的 `taskId`、`contractId` 一致，并正确记录 `inputRunIds`。

## 11. 测试数据检查

当前用于测试的 B 输入：

```text
risk_case_agent/examples/b-contract-cost-output.json
```

该文件结构符合 B 的 `contract_cost` 输出形式，并含：

```text
agent = contract_cost
agentVersion = b-0.1.0
status = completed
```

但当前本地检查无法证明它是“真实 B 代码运行生成”的 JSON，还是手写/示例 JSON。A 文档明确要求准备一份由真实 B 代码生成的输入。

结论：部分通过。当前样例可用于 C 本地测试，但建议向 B 同学索要一次真实 demo 运行产生的 JSON，并保存为：

```text
risk_case_agent/examples/b-real-contract-cost-output.json
```

再用该文件跑出：

```text
risk_case_agent/examples/c-risk-case-output.strict.json
risk_case_agent/examples/c-risk-case-output.trace.json
```

## 12. 已通过项目汇总

- 核心目录和文件已补齐。
- `main.py` 在当前目录运行没有模块缺失。
- 测试通过：`8 passed`。
- CLI 支持 `--input`、`--output`、`--strict-protocol`。
- 严格模式下 `data` 只包含 `riskItems` 和 `riskSummary`。
- 当前示例输出的 `taskId`、`contractId`、`inputRunIds` 正确。
- 当前示例输出的条款 ID 关联正确。

## 13. 需要优先整改项目

### P0：B 状态处理

需要在读取 B 输出后先判断 `status`：

- `failed`：直接生成 C failed 输出，`data = null`，透传 `errors`。
- `partial`：继续分析或降级分析，但 C 输出至少为 `partial`，透传 B `warnings`。
- `completed`：正常执行。

### P0：移除第一条条款兜底逻辑

需要修改 `rules/engine.py`：

- 找不到相关条款时，不要返回 `clauses[:1]`。
- 可以返回空证据，并在 trace 中记录 `missing_related_clause`。
- 或者将该风险项标记为“需要人工确认”，但不能伪造条款证据。

### P0：正式 JSON 与 trace 分离

需要修改 `main.py`：

- 默认输出严格协议 JSON。
- 扩展信息写入单独 trace 文件。
- 建议新增参数：

```bash
--trace-output outputs/c-risk-case-output.trace.json
```

### P1：统一目录结构

需要与 A 确认是否必须迁移到：

```text
agents/risk_case/
```

如果必须迁移，应整体移动 C 模块目录并同步更新启动说明。

### P1：准备真实 B 输出

需要用 B 同学真实 demo 或 B 代码生成一份 JSON，再作为 C 联调输入保存。

## 14. 建议整改顺序

1. 先修 B `failed` / `partial` / `completed` 状态处理。
2. 移除 `find_relevant_clauses()` 的第一条兜底逻辑。
3. 将严格协议输出改成默认模式，并新增 trace 文件输出。
4. 与 A 确认目录是否迁移到 `agents/risk_case/`。
5. 用真实 B 输出重新跑一遍，生成可交给 D 的 C 输出。
6. 增加对应测试用例，覆盖 B failed、B partial、无相关条款、trace 文件输出。

