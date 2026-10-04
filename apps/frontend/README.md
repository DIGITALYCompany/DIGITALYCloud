# DIGITALYCloud — Frontend

Marketing site, documentation, status page and customer dashboard for DIGITALYCloud.

Built with **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**, **Tailwind CSS v4** and **shadcn/ui** conventions (Radix primitives, `cva`, `cn()`).

> Migrated from a Vite + React Router SPA with a pixel-identical UI.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Development server (Turbopack)                                    |
| `npm run build`     | Production build (also type-checks)                               |
| `npm run start`     | Serve the production build                                        |
| `npm run lint`      | ESLint (Next.js + React Compiler rules)                           |
| `npm run typecheck` | Generates route types, then runs `tsc` (catches broken links too) |

Optional environment variables are listed in `.env.example`.

**Demo sign-in:** the login form is prefilled; any email with a password of 6+ characters works.

## Project structure

```
app/
  (marketing)/     Public site: landing, products, pricing, docs, status, legal…  (static/SSG)
  (auth)/          Login, signup, password reset
  (dashboard)/     Authenticated app: overview, services, deployments, billing, settings…
  layout.tsx       Root layout: fonts, metadata, global providers
  not-found.tsx    404 for unknown URLs
components/
  ui/              Design-system primitives (button, badge, dialog, modal, switch, tabs…)
  layout/          Site header/footer, dashboard shell, sidebar, menus, auth guard
  marketing/ docs/ status/ dashboard/ services/ settings/ billing/ …   Feature components
config/            Site metadata and navigation (links are type-checked routes)
data/              Static content: products, regions, docs articles, status, seed data
hooks/             Client hooks (live series, logs stream, click outside…)
lib/
  api/             Data access layer (see below)
  catalog.ts       Plans and service types
  simulation.ts    Deterministic chart/log data for the demo
  utils.ts         cn()
providers/         Auth, toast and cloud (services/deployments) React contexts
```

Route files in `app/` are thin Server Components that export metadata and render a feature component. Interactive pieces are Client Components (`'use client'`); everything else is rendered on the server.

## Connecting the backend

All data goes through `lib/api` (`import { api } from '@/lib/api'`). Today it is a **browser-side simulation** persisted in `localStorage` (`lib/api/mock-api.ts`), with the same async API a real client would have.

To connect the real backend:

1. Implement the same `api` shape over HTTP (for example in `lib/api/http-api.ts`).
2. Export it from `lib/api/index.ts` instead of the mock.
3. Replace the client-side guard in `components/layout/require-auth.tsx` with cookie-based sessions (e.g. a `proxy.ts` redirect) once the backend issues them.

Nothing in the UI depends on `localStorage` directly.

## Conventions

- **Styling:** Tailwind v4, configured in `app/globals.css` (`@theme` tokens for the `ink`, `brand`, `azure`, `aqua`, `success`, `warning`, `danger` palettes, animations and gradients). A small compatibility block keeps Tailwind v3 behaviour the original design relied on (hover on touch devices, absolute line-heights, button cursor, default border colour). Use `bg-linear-to-*/srgb` for gradients.
- **Components:** add shadcn/ui components with `npx shadcn add <name>`; `components.json` points them at `components/ui` and the semantic tokens map to the brand palette.
- **Links:** `typedRoutes` is enabled, so `href`s and `router.push()` targets are checked at build time. Use `AppHref` (`lib/routes.ts`) for links stored in data.
- **Icons:** `lucide-react` is pinned to `0.446.0` to keep the exact icon set of the original design (v1 renamed and removed icons).
