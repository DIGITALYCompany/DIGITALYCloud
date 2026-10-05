# DIGITALYCloud — Project Documentation

This folder is the reference for anyone **building the backend APIs** or **connecting the frontend to them**.
Start here, then read the files in order.

| #   | Document                                                     | Read it when you need to…                                                        |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 01  | [Project overview](01-project-overview.md)                   | Understand what DIGITALYCloud is, its features, plans, regions and current state |
| 02  | [Folder structure](02-folder-structure.md)                   | Find any file in the repo, and see the target layout for the backend             |
| 03  | [Frontend architecture](03-frontend-architecture.md)         | Understand routing, providers, the `api` data layer and what is simulated        |
| 04  | [Data models](04-data-models.md)                             | Know every entity, field, enum and validation rule, plus the proposed DB schema  |
| 05  | [API reference](05-api-reference.md)                         | Implement or call an endpoint (request, response, errors, side effects)          |
| 06  | [Backend guide](06-backend-guide.md)                         | Set up the Express backend: structure, auth, deployments, real-time, security    |
| 07  | [Frontend integration](07-frontend-integration.md)           | Swap the mock for real HTTP calls, screen by screen                              |
| 08  | [Roadmap & open questions](08-roadmap-and-open-questions.md) | Know the build order, what "done" means per phase, and decisions still open      |

## TL;DR

- **DIGITALYCloud** is a hosting platform for Discord bots, Node.js apps, APIs and background workers (by DIGITALY SAS, Lyon, France). Production URL: `https://cloud.digitaly.fr`.
- **Frontend** (`apps/frontend`) is **feature-complete** in Next.js 16 + React 19 + Tailwind v4, but it runs on a **browser-side mock backend** (`apps/frontend/lib/api/mock-api.ts`) stored in `localStorage`.
- **Backend** (`apps/backend`) is **empty**: only a `package.json` that depends on Express 5. Nothing is implemented yet.
- **The contract already exists.** Every call the UI makes goes through one object, `api` (`apps/frontend/lib/api/index.ts`). The backend has to implement those operations over HTTP ([05-api-reference.md](05-api-reference.md)). The frontend then swaps the mock for an HTTP client with the same shape ([07-frontend-integration.md](07-frontend-integration.md)).
- Several screens don't use `api` yet and fake their data or actions locally: billing, team, security, notifications preferences, support, contact, admin, servers, metrics, logs. Each one is listed with the endpoint it needs.

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
| **Mock API**     | `apps/frontend/lib/api/mock-api.ts`, the fake backend the UI uses today.                                         |
| **Platform admin** | `User.role === 'admin'`: DIGITALY staff with access to `/admin` (Control Center). Not the same as a team role. |
| **Team role**    | Owner · Admin · Developer · Viewer: a user's permissions inside a team (account).                              |

## Conventions used in these docs

- Paths like `lib/api/mock-api.ts` are relative to `apps/frontend/` unless they start with `apps/` or `docs/`.
- "**Replaces**" in the API reference names the mock function an endpoint takes over, e.g. `api.services.create`.
- Items marked **Proposed** are recommendations. Nothing on the backend has been decided or built yet. Change them if the team decides otherwise, and update these docs when you do.
