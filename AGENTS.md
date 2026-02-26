# Codex Agent Instructions — sga-mcp-market

## Package Manager: PNPM ONLY

This is a **pnpm workspace** (`pnpm-workspace.yaml` exists at root).

**RULES:**
- ALWAYS use `pnpm` for dependency management. NEVER run `npm install`.
- Install all: `pnpm install`
- Install dep to backend: `pnpm --filter @sga/market-backend add <package>`
- Install dep to frontend: `pnpm --filter @sga/market-frontend add <package>`
- Build backend: `pnpm --filter @sga/market-backend build`
- Build frontend: `cd packages/frontend && npm run build` (Vue CLI project, OK here)
- Build all: `pnpm -r build`

## Project Structure

```
packages/
  backend/    → NestJS backend (@sga/market-backend), port 3100
  frontend/   → Vue3 frontend (@sga/market-frontend)
```

## Docker Deployment

```bash
# Rebuild and restart a single service
docker compose build backend && docker compose up -d --force-recreate backend

# Logs
docker compose logs -f backend
```

## Integration Testing

Do NOT use `npm install` for integration tests.
To test endpoints manually:
```bash
# Auth
curl -X POST http://localhost:3100/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# List packages
curl http://localhost:3100/packages
```

If running TypeScript checks:
```bash
pnpm --filter @sga/market-backend typecheck
# or
cd packages/backend && npx tsc --noEmit
```

## Key Routes (no /api prefix)

- `POST /auth/login` → get JWT token
- `GET /packages` → list packages
- `POST /packages/sync/push` → publish package (Bearer token required)
- `GET /packages/:id` → package detail

## Common Patterns

- All API responses: `{ code: 0, message: 'ok', data: ... }`
- Auth header: `Authorization: Bearer <token>`
- DB: TypeORM with PostgreSQL + MinIO for file storage
- Agent pipeline: security review → classify → enhance description → generate image
