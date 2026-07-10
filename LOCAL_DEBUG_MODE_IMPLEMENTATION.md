# 本地开发调试模式实现说明

更新时间：2026-07-09  
位置：`dev_debug/`

## 1. 已实现能力

### 一键回归测试

命令：

```bash
python dev_debug/dev_debug.py run-all
```

覆盖 5 份代表性合同：

- `consumer_loan`：消费贷
- `credit_card_installment`：信用卡分期
- `education_training_loan`：教育培训贷
- `medical_beauty_installment`：医美分期
- `mortgage_loan`：房贷/按揭

每次运行会自动生成：

- B 模拟输出：`b-output.json`
- C 真实输出：`c-output.json`
- C trace：`c-trace.json`
- D 模拟输出：`d-output.json`
- 稳定摘要：`summary.json`
- 差异报告：`dev_debug/outputs/diff-report.md`

### 单合同快速调试

命令：

```bash
python dev_debug/dev_debug.py run --case credit_card_installment
```

输出目录：

```text
dev_debug/outputs/latest/<case>/
├── input-contract.txt
├── b-output.json
├── c-output.json
├── c-trace.json
├── d-output.json
├── risk_case_debug.db
└── summary.json
```

如果 C 阶段失败，会写入：

```text
dev_debug/outputs/latest/<case>/error.json
```

其中包含失败阶段、命令、stdout、stderr 和返回码。

### 知识库变更验证

先接受当前结果为基线：

```bash
python dev_debug/dev_debug.py accept-baseline
```

修改规则、术语、案例后运行：

```bash
python dev_debug/dev_debug.py kb-impact
```

输出：

```text
dev_debug/outputs/kb-impact-report.md
```

报告会列出：

- 哪些用例的稳定签名发生变化
- 当前知识库 seed 文件指纹

### 前端免启动

所有命令均为纯 CLI，不需要启动 Web 服务。

## 2. 实现方式

本地调试模式采用轻量 B/D 模拟器 + 真实 C Agent：

```text
合同 fixture
  -> dev_debug 内置 B 模拟器
  -> agents/risk_case/main.py
  -> dev_debug 内置 D 模拟器
  -> summary / diff / kb-impact
```

原因：

- 当前工作区重点是 C 模块，不一定包含完整 A/B/D 主仓库。
- 真实 C Agent 是本次重点验证对象，必须真实调用。
- B/D 采用模拟器可以保证本地快速、稳定、免服务。

## 3. 已验证结果

已运行：

```bash
python dev_debug/dev_debug.py run-all
python dev_debug/dev_debug.py accept-baseline
python dev_debug/dev_debug.py kb-impact
```

结果：

| 用例 | B 类型 | C 状态 | 风险摘要 | D 建议数 |
|---|---|---|---|---:|
| consumer_loan | consumer_loan | completed | high=4, medium=5, low=1 | 11 |
| credit_card_installment | credit_card_installment | completed | high=3, medium=4, low=1 | 10 |
| education_training_loan | education_training_loan | completed | high=1, medium=2, low=0 | 5 |
| medical_beauty_installment | medical_beauty_installment | completed | high=7, medium=4, low=1 | 14 |
| mortgage_loan | mortgage_loan | completed | high=0, medium=1, low=0 | 1 |

知识库影响报告当前显示：

```text
无。当前输出与基线稳定签名一致。
```

## 4. 文件清单

```text
dev_debug/
├── README.md
├── dev_debug.py
├── .gitignore
├── fixtures/
│   └── contracts/
│       ├── consumer_loan.txt
│       ├── credit_card_installment.txt
│       ├── education_training_loan.txt
│       ├── medical_beauty_installment.txt
│       └── mortgage_loan.txt
├── baselines/
└── outputs/              # 已被 dev_debug/.gitignore 忽略
```

## 5. 边界说明

这个模式不是替代 A 的真实 integrated pipeline，而是用于本地开发快速回归：

- B 阶段是模拟 B 输出，不做真实 OCR。
- D 阶段是模拟建议生成，不依赖完整 D 服务。
- C 阶段是真实运行 `agents/risk_case/main.py`。

真实合并前仍需 A 使用完整主仓库再跑一次 B -> C -> D -> 前端 pipeline。

