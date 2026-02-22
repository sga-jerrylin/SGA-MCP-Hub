FROM node:20-alpine AS builder

WORKDIR /workspace

COPY sga-mcp-hub/package.json ./sga-mcp-hub/package.json
COPY sga-mcp-hub/pnpm-workspace.yaml ./sga-mcp-hub/pnpm-workspace.yaml
COPY sga-mcp-hub/pnpm-lock.yaml ./sga-mcp-hub/pnpm-lock.yaml

COPY mcp/packages/shared ./mcp/packages/shared

COPY sga-mcp-hub/packages/frontend ./sga-mcp-hub/packages/frontend

WORKDIR /workspace/sga-mcp-hub
RUN npm install -g pnpm && pnpm install --no-frozen-lockfile
RUN pnpm --filter @sga/shared build || true
RUN pnpm --filter @sga/frontend exec vite build

FROM nginx:alpine AS runner

COPY --from=builder /workspace/sga-mcp-hub/packages/frontend/dist /usr/share/nginx/html
COPY sga-mcp-hub/packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
