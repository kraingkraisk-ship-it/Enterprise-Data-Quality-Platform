# EDQP — Enterprise Data Quality Platform
# Multi-stage image: deps (bun install) → build (next standalone) → runner (node:22-alpine, non-root).
# Build from repo root:  docker build -f deploy/Dockerfile -t edqp:latest .
# Production swap-points (PostgreSQL/OIDC/Redis/Celery/S3): see docs/DEPLOYMENT.md §4.

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client for the schema (SQLite at build time is never touched by the app)
RUN bunx prisma generate
RUN bun run build   # next build (output: "standalone") + copies .next/static & public into .next/standalone

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# DATABASE_URL / SESSION_SECRET are injected at runtime (docker run -e / compose)

RUN apk add --no-cache curl \
    && mkdir -p /app/db /app/uploads /app/exports \
    && chown -R node:node /app

USER node

# Standalone server + static assets + public files
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Prisma schema + query engine reference for tooling/inspection (client is bundled in standalone)
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
# Empty state dirs (mount volumes here: db-data, uploads)
RUN mkdir -p /app/.next && chown -R node:node /app/db /app/uploads /app/exports /app/.next

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]   # .next/standalone contents are copied to /app
