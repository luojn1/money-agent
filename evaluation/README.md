# RAG/规则评测

这个目录用于证明 risk_case Agent 的判断链路不是黑盒，而是可以被数据复核：

- 规则命中是否符合人工标准答案
- RAG 检索到的法规/案例是否与风险项相关
- Agent 的整体风险判断是否与人工标注一致
- 每个用例的 B 输入、C 输出、C trace 是否可追溯

## 目录

```text
evaluation/
├── evaluation_dataset.json        # 15 份带标准答案的模拟合同
├── run_evaluation.py              # 自动评测脚本
├── EVALUATION_REPORT.md           # 运行后生成的评测报告
├── outputs/                       # 每个用例的 B/C/trace 输出
└── visualization/
    ├── index.html                 # 评分可视化页面
    └── evaluation-results.json    # 页面默认读取的数据
```

## 运行

在项目根目录执行：

```powershell
python evaluation\run_evaluation.py
```

运行后会生成：

- `evaluation/EVALUATION_REPORT.md`
- `evaluation/outputs/evaluation-results.json`
- `evaluation/outputs/cases/<caseId>/b-output.json`
- `evaluation/outputs/cases/<caseId>/c-output.json`
- `evaluation/outputs/cases/<caseId>/c-trace.json`
- `evaluation/visualization/evaluation-results.json`

## 查看可视化

直接打开：

```text
evaluation/visualization/index.html
```

如果浏览器因为本地文件限制无法读取 JSON，可以启动一个简单静态服务器：

```powershell
python -m http.server 8080
```

然后访问：

```text
http://127.0.0.1:8080/evaluation/visualization/index.html
```

## 指标说明

- 规则命中准确率：Agent 命中的规则中，有多少属于人工标注的应命中规则。
- 规则召回率：人工标注应命中的规则中，有多少被 Agent 找到。
- 法规检索准确率：检索到的法规标题与人工标注关键词的相关比例。
- 案例检索准确率：检索到的案例标题与人工标注关键词的相关比例。
- 整体结论一致率：Agent 判断的整体风险等级是否与人工标注一致。

RAG 相关率目前采用关键词近似评估，后续可以扩展为人工 1-5 分相关性评分。
