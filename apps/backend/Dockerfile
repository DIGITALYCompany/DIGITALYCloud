# syntax=docker/dockerfile:1
# API, worker and operator CLI image. Build from the repository root:
#   docker build -f apps/backend/Dockerfile -t digitalycloud-backend .
# Run:  node dist/server.js | node dist/worker.js | node dist/cli.js <command>   (all as the non-root `node` user)

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
# Every workspace manifest is copied so `npm ci` can verify the single root lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --workspace backend --workspace @digitalycloud/shared --include-workspace-root=false --no-audit --no-fund

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run typecheck --workspace backend && npm run build --workspace backend

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false --no-audit --no-fund \
  && mkdir -p apps/backend/node_modules && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# Keeps the workspace layout so module resolution matches development (backend-local, then hoisted).
WORKDIR /repo/apps/backend
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/backend/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY apps/backend/package.json ./package.json
# The only writable app path: the development filesystem storage driver (uploads spool to /tmp).
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]
