# 本地开发调试模式

这个目录用于在不启动前端、不依赖真实 B/D 服务的情况下，快速验证 B -> C -> D 逻辑链路。

## 常用命令

运行全部预设合同：

```bash
python dev_debug/dev_debug.py run-all
```

只运行一个合同：

```bash
python dev_debug/dev_debug.py run --case credit_card_installment
```

查看当前结果相对上次运行的差异：

```bash
python dev_debug/dev_debug.py diff
```

把当前结果设为基线：

```bash
python dev_debug/dev_debug.py accept-baseline
```

修改知识库后，查看哪些用例受影响：

```bash
python dev_debug/dev_debug.py kb-impact
```

## 预设合同

- `consumer_loan`：消费贷
- `credit_card_installment`：信用卡分期
- `education_training_loan`：教育培训贷
- `medical_beauty_installment`：医美分期
- `mortgage_loan`：房贷/按揭

## 输出位置

- `dev_debug/outputs/latest/<case>/b-output.json`
- `dev_debug/outputs/latest/<case>/c-output.json`
- `dev_debug/outputs/latest/<case>/c-trace.json`
- `dev_debug/outputs/latest/<case>/d-output.json`
- `dev_debug/outputs/latest/<case>/summary.json`
- `dev_debug/outputs/diff-report.md`
- `dev_debug/outputs/kb-impact-report.md`

## 说明

本工具内置轻量 B/D 模拟器：

- B 模拟器负责把预设合同文本转成符合 C 输入要求的 B JSON。
- C 阶段会真实调用 `agents/risk_case/main.py`。
- D 模拟器负责根据 B/C 输出生成建议，用于调试链路和展示差异。

真正合并到 A 主仓库后，仍建议用真实 pipeline 再跑一次端到端验证。

