# C 模块验收问题修复总结

修复日期：2026-07-07  
目标目录：`agents/risk_case/`

## 总体结果

5 个验收问题已按优先级完成修复，并在新目录下重新验证。

已验证命令：

```bash
cd agents/risk_case
python -m pytest
python -m compileall .
python main.py --input examples\b-contract-cost-output.json --output outputs\final-acceptance-output.json --trace-output outputs\final-acceptance-output.trace.json
```

验证结果：

```text
8 passed
默认正式输出 data 只包含 riskItems、riskSummary
trace 文件成功写入
B failed -> C failed, data = null
B partial -> C partial, B warnings 已透传
relatedClauseIds / evidence[].clauseId 关联检查通过
```

## 问题 1：目录结构不符合 A 的要求

修复状态：已完成

修改内容：

- 将原 `risk_case_agent/` 整体迁移到 `agents/risk_case/`。
- 保持模块内部 import 方式不变，仍可在 `agents/risk_case/` 目录内直接运行 `python main.py`。
- 修复 Web 预览服务的项目根目录计算。
- 更新预览 demo 中指向 C 模块旧目录的路径。

修改文件：

```text
agents/risk_case/
agents/risk_case/web_server.py
preview_demo/open_preview_demo.bat
preview_demo/start_preview_server.bat
preview_demo/app.js
preview_demo/index.html
preview_demo/PREVIEW_DEMO_README.md
```

新的运行目录：

```bash
cd agents/risk_case
python main.py --input examples\b-contract-cost-output.json --output outputs\c-risk-case-output.json
```

## 问题 2：严格协议输出不是默认模式

修复状态：已完成

修改内容：

- `main.py` 默认输出严格协议 JSON。
- 移除 CLI 中的 `--strict-protocol` 参数。
- 正式输出中 `data` 默认只包含：

```text
riskItems
riskSummary
```

- 扩展信息不再混入正式 JSON。
- 新增 `--trace` / `--verbose`，仅用于把 trace 额外打印到终端。

修改文件：

```text
agents/risk_case/main.py
```

当前 CLI：

```text
--input
--output
--db
--start-scheduler
--trace-output
--trace
--verbose
```

## 问题 3：trace 信息没有写入文件

修复状态：已完成

修改内容：

- `main.py` 新增 `--trace-output <文件路径>`。
- 如果不传 `--trace-output`，默认生成：

```text
<output>.trace.json
```

例如：

```bash
python main.py --input examples\b-contract-cost-output.json --output outputs\c-risk-case-output.json
```

会生成：

```text
outputs/c-risk-case-output.json
outputs/c-risk-case-output.trace.json
```

trace 文件包含：

- 风险评分
- 命中规则
- 被跳过的规则
- 法规检索结果摘要
- 案例检索结果摘要
- 产品/市场利率/术语检索摘要
- 知识库使用统计
- pending 审核数据统计

修改文件：

```text
agents/risk_case/main.py
```

## 问题 4：B 的 failed/partial 状态没有正确透传

修复状态：已完成

修改内容：

- `main.py` 在校验 B 的 `data` 之前，先读取 `status`。
- B 为 `failed`：
  - C 输出 `status = failed`
  - `data = null`
  - 透传 B 的 `errors`
  - 不执行风险识别
- B 为 `partial`：
  - C 输出至少为 `partial`
  - 透传 B 的 `warnings`
  - 如果 B 的核心数据仍完整，则继续执行风险识别
- B 为 `completed`：
  - 正常执行风险识别

额外修复：

- B 输入 JSON 改用 `utf-8-sig` 读取，兼容 Windows 工具导出的带 BOM JSON。

修改文件：

```text
agents/risk_case/main.py
```

验证结果：

```text
failed_status=failed
failed_data_is_null=True
failed_errors=1
partial_status=partial
partial_has_b_warning=1
```

## 问题 5：存在“找不到条款就凑数”的兜底逻辑

修复状态：已完成

修改内容：

- 移除 `rules/engine.py` 中的 `return clauses[:1]`。
- `find_relevant_clauses()` 找不到真实相关条款时返回空数组。
- `run_rule_engine()` 遇到命中规则但没有真实条款证据时：
  - 不输出该风险项
  - 将该规则记录到 `skippedRules`
  - 在 C 输出 `warnings` 中记录 `missing_related_clause`
  - 在 trace 文件中保留跳过原因
- `main.py` 中移除 `unknown_clause_*` 兜底 ID，`evidence[].clauseId` 只使用 B 的真实 `clauses[].clauseId`。

修改文件：

```text
agents/risk_case/rules/engine.py
agents/risk_case/main.py
```

验证结果：

```text
bad_related=
bad_evidence=
```

说明：空结果表示没有发现非法条款 ID，也没有发现 `evidence[].clauseId` 不属于 `relatedClauseIds` 的情况。

## 最终验收检查快照

默认运行：

```bash
python main.py --input examples\b-contract-cost-output.json --output outputs\final-acceptance-output.json --trace-output outputs\final-acceptance-output.trace.json
```

输出检查：

```text
data_keys = riskItems,riskSummary
status = partial
risk_count = 6
warning_count = 1
trace_exists = True
bad_related =
bad_evidence =
```

`status = partial` 的原因：有 1 条规则命中，但没有在 B 的 `clauses` 中找到可真实引用的相关条款，因此该风险项被跳过并记录 warning。这是为了满足“不找第一条凑数”的验收要求。

