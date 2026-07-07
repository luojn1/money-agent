# 动态知识库接入指南

## 1. 接入架构

`risk_case Agent` 的动态知识库分为四层：

1. 数据源层：CSV/Excel、监管网站 API、公开案例数据源、自定义 JSON API。
2. 接入层：`knowledge/ingestion/` 负责配置、CSV 导入、API 拉取和字段映射。
3. 治理层：`knowledge/versioning.py` 负责版本管理、审核、变更日志、过期和回滚。
4. 使用层：`main.py` 只加载 `is_active = 1` 且 `review_status = 'approved'` 的知识。

自动拉取的数据不会直接进入线上判断。已有记录的新版本先进入 `pending_knowledge_updates` 暂存表；人工审核通过后，才会替换当前生效版本。

## 2. 数据源配置

数据源配置表：`data_source_config`

字段：

- `source_id`: 数据源 ID
- `source_name`: 数据源名称
- `source_type`: `csv | api | json`
- `config`: JSON 配置，包括 URL、目标表、字段映射等
- `schedule`: cron 表达式
- `last_run_at`: 上次运行时间
- `status`: `active | disabled`

Python 配置示例：

```python
from db.connection import get_connection
from knowledge.ingestion.config import DataSourceConfig, save_data_source

with get_connection() as conn:
    save_data_source(
        conn,
        DataSourceConfig(
            source_id="pbc_lpr",
            source_name="央行 LPR 数据源",
            source_type="api",
            config={
                "fetcher_type": "pbc_lpr",
                "target_table": "financial_products",
                "url": "https://example.com/lpr.json"
            },
            schedule="0 8 * * *"
        )
    )
    conn.commit()
```

## 3. CSV 导入

模板目录：

- `templates/risk_rules_template.csv`
- `templates/legal_regulations_template.csv`
- `templates/cases_template.csv`
- `templates/financial_products_template.csv`

导入示例：

```python
from pathlib import Path
from db.connection import get_connection
from knowledge.ingestion.csv_importer import import_csv

with get_connection() as conn:
    result = import_csv(
        conn,
        table_name="risk_rules",
        csv_path=Path("templates/risk_rules_template.csv"),
        require_review=True
    )
    conn.commit()
    print(result)
```

`require_review=True` 时：

- 新记录进入目标表，状态为 `pending`、`is_active = 0`。
- 已有记录的新版本进入 `pending_knowledge_updates` 暂存表，不影响当前线上版本。

审核通过：

```python
from db.connection import get_connection
from knowledge.versioning import approve_record

with get_connection() as conn:
    approve_record(conn, "risk_rules", "RR001", changed_by="operator")
    conn.commit()
```

审核拒绝：

```python
from knowledge.versioning import reject_record

reject_record(conn, "risk_rules", "RR001", changed_by="operator")
```

## 4. API 拉取

当前实现了三个 Fetcher：

- `JsonApiFetcher`: 通用 JSON API
- `NationalLawFetcher`: 国家法律法规数据库预留适配器
- `PbcLprFetcher`: LPR/市场利率 JSON 数据适配器

每个 Fetcher 都有两个函数：

- `fetch()`: 拉取原始数据
- `parse(raw_data)`: 转成内部知识记录

自定义数据源只需要继承 `BaseFetcher`，并在 `FETCHERS` 中注册。

## 5. 版本管理

所有知识表支持：

- `version`: 版本号
- `effective_date`: 生效日期
- `expiry_date`: 失效日期，`NULL` 表示当前有效
- `is_active`: 当前是否生效
- `source`: `csv | api | manual`
- `source_url`: 原始来源链接
- `imported_at`: 导入时间
- `review_status`: `pending | approved | rejected`

变更日志表：`knowledge_change_log`

字段：

- `log_id`
- `table_name`
- `record_id`
- `action`: `insert | update | delete | approve | reject | rollback | expire`
- `old_value`
- `new_value`
- `changed_by`
- `changed_at`

查看历史：

```python
from knowledge.versioning import history

logs = history(conn, "legal_regulations", "LAW001")
```

回滚：

```python
from knowledge.versioning import rollback_to_log

rollback_to_log(conn, log_id=1, changed_by="operator")
```

## 6. 定时任务

调度模块：`knowledge/scheduler.py`

默认规划：

- 每天 08:00 拉取 LPR 最新利率：`0 8 * * *`
- 每周一 09:00 检查法规更新：`0 9 * * 1`
- 每月 1 日 10:00 拉取新案例：`0 10 1 * *`

启动主 Agent 时开启调度器：

```bash
python main.py --start-scheduler
```

如果本地未安装 APScheduler，系统会返回调度配置摘要，不影响 Agent 主流程运行。

## 7. Agent 启动流程

`main.py` 启动时会：

1. 初始化数据库。
2. 执行动态知识库迁移。
3. 统计待审核数据。
4. 只加载 `approved + active` 的规则、法规和案例。
5. 可选启动后台调度器。
6. 读取 B 输出，生成符合 A 协议的 `RiskCaseOutput`。
7. 写入 `risk_case_outputs`、`risk_items`、`risk_evidence`、`risk_matched_cases`。

命令：

```bash
cd risk_case_agent
python knowledge/init_db.py
python main.py --input examples/b-contract-cost-output.json --output outputs/c-risk-case-output.json
```

## 8. 扩展新数据源

1. 在 `knowledge/ingestion/api_fetcher.py` 新建 Fetcher。
2. 实现 `fetch()` 和 `parse()`。
3. 在 `FETCHERS` 注册名称。
4. 在 `data_source_config` 新增配置。
5. 设置 `schedule`。
6. 运行调度器或手动调用 `run_api_source()`。

## 9. 测试

```bash
cd risk_case_agent
python -m pytest
```

测试覆盖：

- CSV 批量导入
- 待审核记录
- 审核通过后生效
- 法规过期标记
- 版本历史
- 调度器配置
