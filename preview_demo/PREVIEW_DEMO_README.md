# C Agent 风险展示 Preview Demo

## 文件说明

```text
preview_demo/
├── index.html                 # 静态预览页面
├── style.css                  # 页面样式，参考 B 同学 demo 的卡片化报告风格
├── app.js                     # JSON 读取与渲染逻辑
├── start_preview_server.bat   # Windows 一键启动脚本
└── PREVIEW_DEMO_README.md     # 使用说明
```

## 如何打开

最简单方式：直接双击打开：

```text
preview_demo/index.html
```

页面内置了 B 示例数据和 C 当前输出数据，因此即使浏览器限制本地 `fetch`，也能直接看到默认风险报告。

更推荐使用交互式 Agent 服务打开。Windows 下可以直接双击：

```text
preview_demo/open_preview_demo.bat
```

这个脚本会自动打开浏览器，并在命令行窗口里启动本地 Agent 服务。保持弹出的命令行窗口不要关闭。

如果只想启动 Agent 服务、不自动打开浏览器，也可以双击：

```text
preview_demo/start_preview_server.bat
```

然后手动访问：

```text
http://127.0.0.1:8090/preview_demo/index.html
```

如果浏览器提示 `ERR_CONNECTION_REFUSED`，说明 8090 端口没有服务在运行，或服务窗口已经关闭。重新运行 `open_preview_demo.bat` 即可。

也可以在项目根目录手动运行：

```bash
python agents/risk_case/web_server.py --port 8090
```

看到 `RiskCase interactive demo is running at http://127.0.0.1:8090/preview_demo/index.html` 后，不要关闭这个终端。

注意：`python -m http.server 8080` 只能打开静态页面，不能调用 C Agent。要点击“开始分析”并运行真实 Agent，必须使用上面的 `web_server.py` 或 `.bat` 脚本。

## 如何替换 JSON 数据

页面顶部有三个上传入口：

- `B 输出 JSON`：上传 `b-contract-cost-output.json`
- `C 输出 JSON`：上传 `c-risk-case-output.json`
- `D 输出 JSON`：等 D 完成后上传 `d-recommendation-output.json`

C 默认输出文件位置：

```text
agents/risk_case/outputs/c-risk-case-output.json
```

交互式页面还支持：

- 上传 B JSON 后点击 `开始分析`
- 直接把 B JSON 粘贴到文本框后点击 `开始分析`
- 查看本次规则命中、法规检索、案例匹配日志
- 下载本次生成的 C 输出 JSON

## 如何与 B 同学 demo 联动

左侧 B 面板读取：

- `data.contractSummary`
- `data.costAnalysis`
- `data.clauses`

中间 C 面板读取：

- `data.riskItems`
- `data.riskSummary`
- `riskItems[].evidence`
- `riskItems[].matchedCases`

右侧 D 面板预留：

- `data.overallResult`
- `data.recommendations`
- `data.questionList`
- `data.disclaimer`

完整链路：

```text
B contract_cost JSON
  -> C risk_case JSON
    -> D recommendation_action JSON
```

## 给 D 同学的接入提示

D 应优先读取 C 的：

```text
riskItems[].id
riskItems[].title
riskItems[].riskLevel
riskItems[].reason
riskItems[].possibleConsequence
riskItems[].evidence
riskItems[].matchedCases
```

生成建议时，建议用：

```text
recommendations[].relatedRiskIds = [riskItems[].id]
```

不要用 `clauseId` 直接作为 D 建议的主关联 ID；`clauseId` 适合用于追溯 B 的合同原文证据。
