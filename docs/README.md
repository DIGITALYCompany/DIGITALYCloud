# DIGITALYCloud — Project Documentation

This folder is the reference for anyone working on the DIGITALYCloud platform: the backend APIs, the dashboard that uses
them, and running both. Start here, then read the files you need.

| #   | Document                                                     | Read it when you need to…                                                        |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 01  | [Project overview](01-project-overview.md)                   | Understand what DIGITALYCloud is, its features, plans, regions and current state |
| 02  | [Folder structure](02-folder-structure.md)                   | Find any file in the repo (frontend, backend, shared package)                    |
| 03  | [Frontend architecture](03-frontend-architecture.md)         | Understand routing, providers and the `api` data layer                            |
| 04  | [Data models](04-data-models.md)                             | Know every entity, field, enum and validation rule, and the MongoDB collections  |
| 05  | [API reference](05-api-reference.md)                         | Call an endpoint (request, response, errors, side effects)                       |
| —   | [OpenAPI](openapi.json)                                      | Machine-readable contract (generated with `npm run openapi`)                      |
| 06  | [Backend guide](06-backend-guide.md)                         | Work on the backend: stack, request pipeline, adding endpoints, testing          |
| 07  | [Frontend integration](07-frontend-integration.md)           | How the dashboard was moved from the mock to the API (historical plan + status)  |
| 08  | [Roadmap & open questions](08-roadmap-and-open-questions.md) | Phase status and the decisions taken on open questions                           |
| —   | [Backend decisions](backend-decisions.md)                    | Why: MongoDB design, security, roles, active team, billing, retention, extensions |
| —   | [Coverage](backend-coverage.md)                              | Each endpoint and screen: where it is and how it was verified                    |
| —   | [Progress](backend-progress.md)                              | What is done, what is blocked, how to resume                                     |
| —   | [Operations](operations.md)                                  | Run it: hosts, providers, backups, key rotation, monitoring, troubleshooting     |

## TL;DR

- **DIGITALYCloud** is a hosting platform for Discord bots, Node.js apps, APIs and background workers (by DIGITALY SAS, Lyon, France). Production URL: `https://cloud.digitaly.fr`.
- **Frontend** (`apps/frontend`): Next.js 16 + React 19 + Tailwind v4. Every dashboard screen talks to the real API through
  `apps/frontend/lib/api` (no mock, no simulated data).
- **Backend** (`apps/backend`): Express 5 on Node.js 24, MongoDB replica set (Mongoose), Redis/BullMQ, SSE, Docker hosts,
  Stripe. Start with [apps/backend/README.md](../apps/backend/README.md).
- **Shared contract** (`packages/shared`): catalog, enums, validation messages, permission matrix and DTOs used by both.
- **Not yet verified live**: real Docker hosts and the providers (Stripe, Google, GitHub, SMTP, S3) — see [backend-progress.md](backend-progress.md).

## Glossary

| Term             | Meaning                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Service**      | One deployed workload (a bot, app, API or worker). Each service has its own **plan** and is billed on its own. |
| **Service type** | `discord` · `node` · `api` · `worker`                                                                             |
| **Source**       | Where code comes from: `github` (repo + branch) · `upload` (.zip/.tar/.gz) · `docker` (image reference)           |
| **Plan**         | `free` · `starter` · `pro` · `business`. Sets RAM, vCPU, storage, price **and which regions are allowed**.  |
| **Region**       | Datacenter location (Lyon, Paris, Frankfurt…). Each region has a `minPlan`.                                       |
| **Server**       | A physical host (e.g. `Lyon-01`) that runs service containers.                                                    |
| **Deployment**   | One build-and-release of a service, numbered per service (#1, #2…). Status `building` → `success` / `failed`.     |
| **Platform admin** | `User.role === 'admin'`: DIGITALY staff with access to `/admin` (Control Center). Not the same as a team role. |
| **Team role**    | Owner · Admin · Developer · Viewer: a user's permissions inside a team (account).                              |

## Conventions used in these docs

- Paths like `lib/api/mock-api.ts` are relative to `apps/frontend/` unless they start with `apps/` or `docs/`.
- "**Replaces**" in the API reference names the former mock function an endpoint took over, e.g. `api.services.create`.
- The API reference was written before implementation; where the backend deviates or extends it, [backend-decisions.md §9](backend-decisions.md#9-endpoint-and-dto-extensions-to-05-api-reference) and [openapi.json](openapi.json) are authoritative.
