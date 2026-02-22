FROM node:20-alpine AS builder

# Mirror on-disk layout so pnpm-workspace.yaml relative paths resolve
WORKDIR /workspace

COPY sga-mcp-hub/package.json ./sga-mcp-hub/package.json
COPY sga-mcp-hub/pnpm-workspace.yaml ./sga-mcp-hub/pnpm-workspace.yaml
COPY sga-mcp-hub/pnpm-lock.yaml ./sga-mcp-hub/pnpm-lock.yaml
COPY sga-mcp-hub/tsconfig.base.json ./sga-mcp-hub/tsconfig.base.json

COPY mcp/packages/shared ./mcp/packages/shared
COPY mcp/packages/core ./mcp/packages/core

COPY sga-mcp-hub/packages/backend ./sga-mcp-hub/packages/backend

WORKDIR /workspace/sga-mcp-hub
RUN npm install -g pnpm && pnpm install --no-frozen-lockfile
RUN pnpm --filter @sga/shared build || true
RUN pnpm --filter @sga/core build || true
RUN pnpm --filter @sga/backend build
RUN pnpm --filter @sga/backend deploy --prod --legacy /deploy

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy ./

EXPOSE 8080
CMD ["node", "dist/main.js"]
