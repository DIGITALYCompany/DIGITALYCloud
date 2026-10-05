# DIGITALYCloud

Hosting for Discord bots, Node.js apps, APIs and background workers — by DIGITALY SAS (Lyon, France).

| Workspace | What |
| --------- | ---- |
| [apps/frontend](apps/frontend) | Next.js 16 marketing site, docs, status page and dashboard |
| [apps/backend](apps/backend) | Express 5 API, workers and collectors (MongoDB, Redis, Docker, Stripe) — [README](apps/backend/README.md) |
| [packages/shared](packages/shared) | Catalog, validation, permissions and API DTOs shared by both apps |

```bash
npm install                                   # once, at the root (npm workspaces, one lockfile)
cd apps/backend && npm run env:init && cd -   # local backend .env with generated secrets
docker compose up -d                          # MongoDB replica set, Redis, Mailpit — or: npm run dev:infra --workspace backend
npm run db:migrate --workspace backend
npm run dev:api                               # http://localhost:4000/v1
npm run dev:worker
npm run dev:web                               # http://localhost:3000 (copy apps/frontend/.env.example to .env.local)

npm run typecheck && npm run lint && npm run build
```

Documentation: [docs/](docs/README.md) — backend decisions, coverage, operations runbook and the OpenAPI contract.
