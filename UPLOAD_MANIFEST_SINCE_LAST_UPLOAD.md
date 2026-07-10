# GitHub 共享上传清单

建议新建分支：

```text
feature/post-upload-demo-evaluation-summary
```

建议提交信息：

```text
feat: add post-upload demo, evaluation, summary report and expanded knowledge assets
```

## 必传目录

| 路径 | 说明 |
|---|---|
| `agents/risk_case/` | C 模块最新代码、规则引擎修复、知识库 seed_data、trace 增强、测试 |
| `demo/` | 可粘贴/上传合同的端到端本地 Demo，含可视化报告页面和 3 份测试合同 |
| `evaluation/` | RAG/规则评测脚本、15 份标注测试集、评测报告和评分可视化页面 |
| `summary_report/` | 摘要版报告 Schema 与生成器 |
| `summary_report_demo/` | 摘要版报告静态预览页面 |
| `dev_debug/` | 本地开发调试与回归测试工具 |
| `A_integration_package/` | 给 A 整合 B/D/shared/知识库扩展使用的代码包 |

## 必传文档

| 文件 | 说明 |
|---|---|
| `IMPROVEMENTS_SINCE_LAST_UPLOAD.md` | 自上次上传以来的改进总结 |
| `DEMO_GUIDE.md` | 本地 Demo 启动和演示指南 |
| `LOCAL_DEBUG_MODE_IMPLEMENTATION.md` | 本地调试模式说明 |
| `PROJECT_END_TO_END_OVERVIEW.md` | B→C→D→A 链路总览 |
| `KNOWLEDGE_DEPTH_EXPANSION_SUMMARY.md` | 知识库扩展总结 |
| `FINAL_SELF_REVIEW.md` | 最终自查报告 |
| `PROJECT_CURRENT_STATE.md` | 项目当前状态 |

## 不建议上传的运行产物

以下内容已从共享包中排除：

- `demo/outputs/`
- `evaluation/outputs/`
- `dev_debug/outputs/`
- `agents/risk_case/outputs/`
- `__pycache__/`
- `.pytest_cache/`
- `*.db`
- `*.pyc`
- `server.out.log`
- `server.err.log`
- 已生成的旧 zip 包

## 手动上传时的建议步骤

```powershell
git checkout -b feature/post-upload-demo-evaluation-summary
git add agents/risk_case demo evaluation summary_report summary_report_demo dev_debug A_integration_package
git add IMPROVEMENTS_SINCE_LAST_UPLOAD.md DEMO_GUIDE.md LOCAL_DEBUG_MODE_IMPLEMENTATION.md PROJECT_END_TO_END_OVERVIEW.md KNOWLEDGE_DEPTH_EXPANSION_SUMMARY.md FINAL_SELF_REVIEW.md PROJECT_CURRENT_STATE.md UPLOAD_MANIFEST_SINCE_LAST_UPLOAD.md
git commit -m "feat: add post-upload demo, evaluation, summary report and expanded knowledge assets"
git push -u origin feature/post-upload-demo-evaluation-summary
```
