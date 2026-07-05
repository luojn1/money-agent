# Dynamic Knowledge Ingestion Implementation

## 1. 当前结论

此前项目只有动态接入的基础表和部分占位代码，还不算完整动态接入。

本次已补齐：

- API/JSON/HTML 数据源自动拉取
- APScheduler 定时任务
- 增量更新和内容哈希去重
- 版本号、生效日期、失效日期、过期自动标记
- 自动拉取数据进入待审核队列
- 人工 approve/reject 后才进入 Agent 可用知识库
- 命令行管理工具

## 2. 新增/修改文件

| 文件 | 作用 |
|---|---|
| `knowledge/ingestion/api_fetcher.py` | JSON API、法规、LPR、案例、HTML 正则拉取器 |
| `knowledge/scheduler.py` | 自动调度和单源/全源拉取 |
| `knowledge/versioning.py` | 内容哈希、增量去重、版本管理、过期标记 |
| `knowledge/migration.py` | 新增 `knowledge_ingestion_state` 和 pending hash 字段 |
| `knowledge/ingestion/default_sources.py` | 默认外部数据源配置模板 |
| `knowledge/ingestion/cli.py` | 安装数据源、运行拉取、审核、启动调度器 |
| `config/dynamic_sources.json` | 可编辑的数据源配置文件 |
| `tests/fixtures/*.json` | 本地模拟外部 API |
| `tests/test_dynamic_ingestion.py` | 动态接入测试 |

## 3. 数据源类型

当前支持：

| 类型 | fetcher_type | 说明 |
|---|---|---|
| 通用 JSON API | `json_api` / `json` | 通过 `record_path` 和 `field_mapping` 映射任意 JSON 接口 |
| 法规 API | `national_law` / `legal_regulation` | 将法规接口解析为 `legal_regulations` |
| LPR API | `pbc_lpr` | 将 LPR JSON 解析为 `market_rates` |
| 案例/投诉 API | `case_api` / `public_case` | 将公开投诉、案例接口解析为 `cases` |
| HTML 正则抽取 | `html_regex` | 用配置的 `record_regex` 从页面抽取结构化记录 |

说明：国家法律法规数据库、裁判文书网等公开平台可能存在验证码、登录、反爬或接口不稳定问题。当前实现提供可配置适配器和代理源接入方式；正式使用时应填入团队确认可访问的 API、学校代理接口或合规数据服务。

## 4. 数据源配置

默认配置文件：

```text
risk_case_agent/config/dynamic_sources.json
```

生成默认配置：

```bash
cd risk_case_agent
python -m knowledge.ingestion.cli write-default-sources
```

安装配置到数据库：

```bash
python -m knowledge.ingestion.cli install-sources --file config/dynamic_sources.json
```

默认外部 URL 使用 `example.com` 模板，并设置为 `paused`，避免误访问不可用接口。替换为真实 API 后，把 `status` 改为 `active`。

## 5. 手动拉取一次

拉取单个数据源：

```bash
python -m knowledge.ingestion.cli run-once --source-id local_fixture_cases_demo
```

拉取全部 active API/JSON 数据源：

```bash
python -m knowledge.ingestion.cli run-once
```

返回示例：

```json
{
  "sourceId": "local_fixture_cases_demo",
  "table": "cases",
  "fetched": 1,
  "importedToPendingReview": 1,
  "skippedUnchanged": 0,
  "expiredRecords": 0,
  "pendingRecordIds": ["CASE_EXT_001"]
}
```

再次拉取相同内容时：

```json
{
  "importedToPendingReview": 0,
  "skippedUnchanged": 1
}
```

## 6. 审核流程

查看待审核：

```bash
python -m knowledge.ingestion.cli pending --limit 20
```

批准：

```bash
python -m knowledge.ingestion.cli review approve cases CASE_EXT_001
```

拒绝：

```bash
python -m knowledge.ingestion.cli review reject cases CASE_EXT_001
```

只有 `review_status='approved'` 且 `is_active=1` 的知识会被 Agent 使用。

## 7. 定时任务

启动调度器：

```bash
python -m knowledge.ingestion.cli scheduler
```

默认计划：

| 任务 | cron | 说明 |
|---|---|---|
| 法规更新 | `0 9 * * 1` | 每周一 09:00 |
| LPR 更新 | `0 10 20 * *` | 每月 20 日 10:00 |
| 案例更新 | `0 10 1 * *` | 每月 1 日 10:00 |

## 8. 增量和版本管理

新增表：

```text
knowledge_ingestion_state
```

每次拉取会计算记录内容哈希：

- 哈希不变：跳过，不重复导入
- 哈希变化：生成 pending update
- 人工批准：旧版本自动过期，新版本生效
- 到期记录：`expire_due_records()` 自动标记 `is_active=0`

## 9. 已验证结果

已用本地模拟外部 API 验证：

- 自动拉取 LPR JSON
- 自动拉取案例 JSON
- 新数据进入 pending 审核队列
- 重复拉取自动跳过
- 人工批准后记录变为 active

测试命令：

```bash
python -m pytest
```

结果：

```text
5 passed
```
