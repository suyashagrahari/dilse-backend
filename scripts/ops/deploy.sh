#!/usr/bin/env bash
# /opt/dilse/scripts/deploy.sh
# Zero-downtime blue-green deployment for dilse services
#
# Usage: deploy.sh <service> <image> <tag> [env]
#   service  — "frontend", "backend" or "cms"
#   image    — Docker Hub image (e.g. youruser/dilse-frontend)
#   tag      — Image tag (e.g. sha-abc1234)
#   env      — "prod" (default) or "dev"
#
# Port layout:
#   PROD: backend blue=5000 green=5001 | frontend blue=3000 green=3001 | cms blue=1337 green=1338
#   DEV:  backend blue=5002 green=5003 | frontend blue=3002 green=3003 | cms blue=1339 green=1340

set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────
SERVICE="${1:?Usage: deploy.sh <frontend|backend> <image> <tag> [prod|dev]}"
IMAGE="${2:?Missing image argument}"
TAG="${3:?Missing tag argument}"
DEPLOY_ENV="${4:-prod}"

# ── Config ──────────────────────────────────────────────────────────────────
BASE_DIR="/opt/dilse"
STATE_DIR="$BASE_DIR/state"
NGINX_CONF_DIR="/etc/nginx/conf.d"

if [[ "$DEPLOY_ENV" != "prod" && "$DEPLOY_ENV" != "dev" ]]; then
  echo "ERROR: env must be 'prod' or 'dev', got '$DEPLOY_ENV'" >&2
  exit 1
fi

# Extra `docker run` flags (e.g. persistent volumes). Empty for stateless services.
VOLUME_ARGS=""

case "$SERVICE" in
  backend)
    CONTAINER_PORT=5000
    HEALTH_PATH="/api/health"
    if [[ "$DEPLOY_ENV" == "prod" ]]; then
      BLUE_PORT=5000
      GREEN_PORT=5001
      ENV_FILE="$BASE_DIR/.env.backend"
      UPSTREAM_CONF="$NGINX_CONF_DIR/backend-upstream.conf"
      UPSTREAM_NAME="backend_upstream"
      CONTAINER_BASE="dilse-backend"
      STATE_FILE="$STATE_DIR/backend.color"
    else
      BLUE_PORT=5002
      GREEN_PORT=5003
      ENV_FILE="$BASE_DIR/.env.dev.backend"
      UPSTREAM_CONF="$NGINX_CONF_DIR/dev-backend-upstream.conf"
      UPSTREAM_NAME="dev_backend_upstream"
      CONTAINER_BASE="dilse-dev-backend"
      STATE_FILE="$STATE_DIR/dev-backend.color"
    fi
    ;;
  frontend)
    CONTAINER_PORT=3000
    HEALTH_PATH="/"
    if [[ "$DEPLOY_ENV" == "prod" ]]; then
      BLUE_PORT=3000
      GREEN_PORT=3001
      ENV_FILE="$BASE_DIR/.env.frontend"
      UPSTREAM_CONF="$NGINX_CONF_DIR/frontend-upstream.conf"
      UPSTREAM_NAME="frontend_upstream"
      CONTAINER_BASE="dilse-frontend"
      STATE_FILE="$STATE_DIR/frontend.color"
    else
      BLUE_PORT=3002
      GREEN_PORT=3003
      ENV_FILE="$BASE_DIR/.env.dev.frontend"
      UPSTREAM_CONF="$NGINX_CONF_DIR/dev-frontend-upstream.conf"
      UPSTREAM_NAME="dev_frontend_upstream"
      CONTAINER_BASE="dilse-dev-frontend"
      STATE_FILE="$STATE_DIR/dev-frontend.color"
    fi
    ;;
  cms)
    CONTAINER_PORT=1337
    # Strapi serves the admin panel at /admin (HTTP 200) — used as the health probe.
    HEALTH_PATH="/admin"
    # SQLite DB + uploaded media must survive redeploys → mount host volumes.
    # (Container WORKDIR is /opt/app; DATABASE_FILENAME=.tmp/data.db resolves under it.)
    CMS_DATA_DIR="$BASE_DIR/cms-data"
    mkdir -p "$CMS_DATA_DIR/.tmp" "$CMS_DATA_DIR/uploads"
    VOLUME_ARGS="-v ${CMS_DATA_DIR}/.tmp:/opt/app/.tmp -v ${CMS_DATA_DIR}/uploads:/opt/app/public/uploads"
    if [[ "$DEPLOY_ENV" == "prod" ]]; then
      BLUE_PORT=1337
      GREEN_PORT=1338
      ENV_FILE="$BASE_DIR/.env.cms"
      UPSTREAM_CONF="$NGINX_CONF_DIR/cms-upstream.conf"
      UPSTREAM_NAME="cms_upstream"
      CONTAINER_BASE="dilse-cms"
      STATE_FILE="$STATE_DIR/cms.color"
    else
      BLUE_PORT=1339
      GREEN_PORT=1340
      ENV_FILE="$BASE_DIR/.env.dev.cms"
      UPSTREAM_CONF="$NGINX_CONF_DIR/dev-cms-upstream.conf"
      UPSTREAM_NAME="dev_cms_upstream"
      CONTAINER_BASE="dilse-dev-cms"
      STATE_FILE="$STATE_DIR/dev-cms.color"
    fi
    ;;
  *)
    echo "ERROR: Unknown service '$SERVICE'. Must be 'frontend', 'backend' or 'cms'." >&2
    exit 1
    ;;
esac

# ── Determine active/standby colors ─────────────────────────────────────────
if [[ -f "$STATE_FILE" ]]; then
  ACTIVE_COLOR=$(cat "$STATE_FILE")
else
  ACTIVE_COLOR="blue"
fi

if [[ "$ACTIVE_COLOR" == "blue" ]]; then
  STANDBY_COLOR="green"
  ACTIVE_PORT=$BLUE_PORT
  STANDBY_PORT=$GREEN_PORT
else
  STANDBY_COLOR="blue"
  ACTIVE_PORT=$GREEN_PORT
  STANDBY_PORT=$BLUE_PORT
fi

ACTIVE_CONTAINER="${CONTAINER_BASE}-${ACTIVE_COLOR}"
STANDBY_CONTAINER="${CONTAINER_BASE}-${STANDBY_COLOR}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DILSE DEPLOY: $SERVICE [$DEPLOY_ENV]"
echo "  Image : $IMAGE:$TAG"
echo "  Active: $ACTIVE_COLOR ($ACTIVE_PORT) → Standby: $STANDBY_COLOR ($STANDBY_PORT)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Pull new image ───────────────────────────────────────────────────────────
#
# Retried, because `docker pull` has a transient failure mode that has already
# broken a deploy here: containerd races its own garbage collector and removes
# the ingest directory while a layer is still being written, so the commit
# fails with
#
#   commit failed: rename .../ingest/<id>/data .../blobs/sha256/<id>:
#   no such file or directory
#
# Worth being precise about what it is NOT, because both are the obvious first
# guesses and both were checked at the time: not disk pressure (25G free, 13%
# inodes) and not a bad image — the identical tag pulled cleanly on the next
# attempt with no other change.
#
# This script runs under `set -e`, so a single failed pull aborted the entire
# deploy. That is SAFE — the previous version keeps serving and nothing is
# half-changed — but it means a perfectly good build sits undeployed until
# somebody notices and re-runs it.
#
# Deliberately ONLY a retry: this does not clear containerd's ingest directory.
# The frontend and backend deploys are separate concurrency groups and do run
# at the same time, so `rm -rf .../ingest/*` here could destroy a pull
# belonging to the other service. If plain retries ever stop being enough,
# that is a different fault and wants diagnosing, not a bigger hammer.
PULL_ATTEMPTS=3
PULL_BACKOFF=5

echo "[1/6] Pulling $IMAGE:$TAG ..."
for pull_attempt in $(seq 1 "$PULL_ATTEMPTS"); do
  if docker pull "$IMAGE:$TAG"; then
    break
  fi
  if [ "$pull_attempt" -eq "$PULL_ATTEMPTS" ]; then
    echo "   ✗ Pull failed $PULL_ATTEMPTS times — giving up."
    echo "     The running version was NOT touched and is still serving."
    exit 1
  fi
  echo "   ⏳ Pull attempt $pull_attempt/$PULL_ATTEMPTS failed, retrying in ${PULL_BACKOFF}s ..."
  sleep "$PULL_BACKOFF"
done

# ── Stop existing standby container (if any) ────────────────────────────────
echo "[2/6] Stopping old standby container ($STANDBY_CONTAINER) ..."
docker stop "$STANDBY_CONTAINER" 2>/dev/null || true
docker rm   "$STANDBY_CONTAINER" 2>/dev/null || true

# ── Start new container on standby port ─────────────────────────────────────
echo "[3/6] Starting new container on port $STANDBY_PORT ..."
docker run -d \
  --name "$STANDBY_CONTAINER" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:${STANDBY_PORT}:${CONTAINER_PORT}" \
  $VOLUME_ARGS \
  "$IMAGE:$TAG"

# ── Health check (max 2 minutes, 5s intervals) ───────────────────────────────
echo "[4/6] Waiting for health check on port $STANDBY_PORT$HEALTH_PATH ..."
MAX_RETRIES=24
RETRY_INTERVAL=5
HEALTHY=false

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 5 \
    "http://127.0.0.1:${STANDBY_PORT}${HEALTH_PATH}" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" =~ ^(200|301|302)$ ]]; then
    HEALTHY=true
    echo "  ✓ Healthy after $((i * RETRY_INTERVAL))s (HTTP $HTTP_CODE)"
    break
  fi

  echo "  ⏳ Attempt $i/$MAX_RETRIES — HTTP $HTTP_CODE, retrying in ${RETRY_INTERVAL}s ..."
  sleep "$RETRY_INTERVAL"
done

if [[ "$HEALTHY" != "true" ]]; then
  echo "ERROR: New container failed health check. Rolling back ..." >&2
  docker stop "$STANDBY_CONTAINER" 2>/dev/null || true
  docker rm   "$STANDBY_CONTAINER" 2>/dev/null || true
  exit 1
fi

# ── Switch Nginx upstream atomically ────────────────────────────────────────
echo "[5/6] Switching Nginx upstream to port $STANDBY_PORT ..."
TEMP_CONF=$(mktemp)
cat > "$TEMP_CONF" <<EOF
# /etc/nginx/conf.d/$(basename "$UPSTREAM_CONF")
# THIS FILE IS MANAGED BY THE DEPLOY SCRIPT — do not edit manually.
# Active: $STANDBY_COLOR on port $STANDBY_PORT

upstream $UPSTREAM_NAME {
    server 127.0.0.1:${STANDBY_PORT};
    keepalive 32;
}
EOF

sudo mv "$TEMP_CONF" "$UPSTREAM_CONF"
sudo nginx -t
sudo systemctl reload nginx
echo "  ✓ Nginx reloaded — traffic now on $STANDBY_COLOR ($STANDBY_PORT)"

# ── Stop old active container ────────────────────────────────────────────────
echo "[6/6] Stopping old active container ($ACTIVE_CONTAINER) ..."
docker stop "$ACTIVE_CONTAINER" 2>/dev/null || true
docker rm   "$ACTIVE_CONTAINER" 2>/dev/null || true

# ── Update state ─────────────────────────────────────────────────────────────
echo "$STANDBY_COLOR" > "$STATE_FILE"

# ── Prune old images ────────────────────────────────────────────────────────
# CI images are TAGGED (sha-*); plain `prune -f` only clears DANGLING images,
# so old builds never got removed. -a removes every unreferenced image while
# RUNNING containers (prod + dev, all services) stay protected automatically.
docker image prune -af 2>/dev/null || true

echo ""
echo "✅ Deploy complete! [$DEPLOY_ENV]"
echo "   Service  : $SERVICE"
echo "   Image    : $IMAGE:$TAG"
echo "   Active   : $STANDBY_COLOR on port $STANDBY_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
