# syntax=docker/dockerfile:1
# ↑ Enables the BuildKit `--mount=type=cache` npm store shared across stages.

# ── Stage 1: Install all dependencies (including native builds) ─────────────
FROM node:20-alpine AS deps

# Required for native modules (sharp uses libvips)
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --frozen-lockfile

# ── Stage 2: TypeScript compilation ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: Production-only dependencies ───────────────────────────────────
FROM node:20-alpine AS prod-deps

RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --frozen-lockfile

# ── Stage 4: Minimal production runner ──────────────────────────────────────
# ── Stage: geo ──────────────────────────────────────────────────────────────
# IP→country database for international pricing (services/geo.service.ts):
# DB-IP "IP to Country Lite", CC BY 4.0 — attribution is on the privacy page.
# Refreshed on every image build (this month's file, else last month's).
# FAIL-SOFT on purpose: if the download fails the image still builds with an
# empty /geo, and the server treats every visitor as "unknown" → INR, which is
# exactly the pre-international behaviour. A geo outage must never block a
# deploy or break an Indian checkout.
FROM alpine:3.20 AS geo
WORKDIR /geo
RUN m=$(date -u +%Y-%m); \
    pm=$(echo "$m" | awk -F- '{y=$1; mo=$2-1; if (mo==0) {mo=12; y--}; printf "%04d-%02d", y, mo}'); \
    for v in "$m" "$pm"; do \
      if wget -q -T 60 -O db.mmdb.gz "https://download.db-ip.com/free/dbip-country-lite-$v.mmdb.gz" && gunzip -f db.mmdb.gz; then \
        mv db.mmdb country.mmdb && echo "geo: using dbip-country-lite-$v" && break; \
      fi; \
      rm -f db.mmdb.gz db.mmdb; \
    done; \
    ls -la /geo

FROM node:20-alpine AS runner

# ffmpeg transcodes uploaded videos (dedication clips) to small H.264 mp4s.
RUN apk add --no-cache libc6-compat ffmpeg
WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# Only copy what's needed for runtime
COPY --from=prod-deps --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --chown=expressjs:nodejs package.json ./
COPY --from=geo --chown=expressjs:nodejs /geo ./geo

USER expressjs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "dist/server.js"]
