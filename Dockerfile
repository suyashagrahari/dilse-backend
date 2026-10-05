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
# Writable home for the IP→country database the server downloads at boot
# (services/geo.service.ts). Not baked in: a Docker build step is cached and
# would never refresh. A failed download only means "everyone pays INR".
RUN mkdir -p /app/geo && chown expressjs:nodejs /app/geo

USER expressjs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "dist/server.js"]
