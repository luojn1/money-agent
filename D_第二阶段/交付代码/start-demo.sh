#!/bin/sh
# 一键启动本地演示（前端 5173 + 后端 8080 + B→C→D + 对话助手）。
#
# 用法：
#   ./start-demo.sh
#
# 如需启用 LLM 增强回答（DeepSeek 等 OpenAI 兼容接口），把密钥写进
# 本目录的 .env.local（该文件已被 .gitignore 忽略，不会提交到仓库）：
#   LLM_API_KEY=sk-xxx
#   LLM_BASE_URL=https://api.deepseek.com/v1
#   LLM_MODEL=deepseek-chat
# 不配置也能正常演示（规则模板回答，同样带引用）。

cd "$(dirname "$0")" || exit 1

if [ -f .env.local ] && ! grep -q "请替换" .env.local; then
  echo "[start-demo] 已加载 .env.local（LLM 增强回答开启）"
  set -a
  . ./.env.local
  set +a
else
  echo "[start-demo] 未配置真实 LLM 密钥，使用规则模板回答（同样可演示）"
fi

export PORT="${PORT:-8080}"
echo "[start-demo] 后端端口 $PORT，浏览器打开 http://127.0.0.1:5173"
exec pnpm run dev
