# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY website/backend/package.json website/backend/package.json
COPY website/frontend/package.json website/frontend/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN VITE_USE_MOCK_PIPELINE=false VITE_API_BASE_URL="" pnpm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV SERVE_FRONTEND=true
ENV PROJECT_ROOT=/app
ENV KNOWLEDGE_BASE_ROOT=/app/knowledge_base/contract_finance
ENV SCHEMA_PATH=/app/shared/schemas/analysis-protocol-v1.schema.json
ENV FRONTEND_DIST=/app/website/frontend/dist
ENV RUNTIME_ROOT=/tmp/money-agent-runtime
ENV PYTHON_BIN=/opt/venv/bin/python
ENV VITE_USE_MOCK_PIPELINE=false
ENV VITE_API_BASE_URL=

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agents ./agents
COPY --from=build /app/shared ./shared
COPY --from=build /app/knowledge_base ./knowledge_base
COPY --from=build /app/tests ./tests
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/website/backend ./website/backend
COPY --from=build /app/website/frontend/dist ./website/frontend/dist

RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/python -m pip install --no-cache-dir -r agents/risk_case/requirements.txt \
  && /opt/venv/bin/python -m pip install --no-cache-dir -r agents/recommendation_action/requirements.txt \
  && mkdir -p /tmp/money-agent-runtime

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "website/backend/dist/website/backend/src/index.js"]
