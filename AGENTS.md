# Codex Agent Instructions — sga-mcp-hub

## Package Manager: PNPM ONLY

This is a **pnpm workspace** (`pnpm-workspace.yaml` exists at root).

**RULES:**
- ALWAYS use `pnpm` for dependency management. NEVER run `npm install`.
- Install all: `pnpm install`
- Install dep to backend: `pnpm --filter @sga/hub-backend add <package>`
- Install dep to frontend: `pnpm --filter @sga/hub-frontend add <package>`
- Build backend: `pnpm --filter @sga/hub-backend build`
- Build frontend: `pnpm --filter @sga/hub-frontend build`
- Build all: `pnpm -r build`

## Project Structure

```
packages/
  backend/    → NestJS backend (@sga/hub-backend), port 3000
  frontend/   → Vue3 frontend (@sga/hub-frontend), port 5173
```

## Docker Deployment

```bash
# Rebuild and restart a single service
docker compose build backend && docker compose up -d --force-recreate backend
docker compose build frontend && docker compose up -d --force-recreate frontend

# Logs
docker compose logs -f backend
```

## Integration Testing

Do NOT use `npm install` for integration tests.
To test endpoints manually:
```bash
# Backend healthcheck
curl http://localhost:3000/api/health

# Test an endpoint
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/monitor/dashboard
```

If running TypeScript tests:
```bash
pnpm --filter @sga/hub-backend test
```

## Common Patterns

- All API responses: `{ code: 0, message: 'ok', data: ... }`
- Auth header: `Authorization: Bearer <jwt>`
- DB: TypeORM with PostgreSQL
- Config: environment variables via docker-compose.yml
