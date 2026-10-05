#!/bin/bash
set -e

# Simulates atomic immutable release rollback
# Usage: ./rollback-release.sh <git_sha> <release_root> [port]

if [ -z "$BYPASS_LOCK" ]; then
    LOCK_DIR="/tmp/deploy-bharat-crm.lock.dir"
    if ! mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "❌ Rollback is blocked because deployment/rollback is already running."
        exit 1
    fi
    trap 'rm -rf "$LOCK_DIR"' EXIT
fi

GIT_SHA=$1
RELEASE_ROOT=$2
PORT=${3:-4000}

if [ -z "$GIT_SHA" ] || [ -z "$RELEASE_ROOT" ]; then
    echo "Usage: $0 <git_sha> <release_root> [port]"
    exit 1
fi

RELEASE_DIR="${RELEASE_ROOT}/releases/${GIT_SHA}"
CURRENT_LINK="${RELEASE_ROOT}/current"

if [ ! -d "$RELEASE_DIR" ]; then
    echo "❌ Target release directory not found: $RELEASE_DIR"
    exit 1
fi

if [ ! -f "$RELEASE_DIR/release-manifest.json" ]; then
    echo "❌ Target release manifest missing."
    exit 1
fi

echo "🔄 Atomically rolling back to previous release ($GIT_SHA)..."
ln -s "$RELEASE_DIR" "${CURRENT_LINK}.tmp"
if mv -T "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
elif mv -h "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
else
  ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
  rm -f "${CURRENT_LINK}.tmp"
fi

echo "🔄 Reloading PM2 (Rollback)..."
RELOAD_FAILED=0
if pm2 describe bharat-crm-backend > /dev/null 2>&1; then
    if ! pm2 reload bharat-crm-backend; then
        echo "❌ CRITICAL: pm2 reload failed for an existing process."
        RELOAD_FAILED=1
    fi
else
    echo "⚠️ PM2 process 'bharat-crm-backend' missing. Initiating ecosystem start..."
    if ! pm2 start "${CURRENT_LINK}/ecosystem.config.cjs" --update-env; then
        echo "❌ CRITICAL: pm2 start failed."
        RELOAD_FAILED=1
    fi
fi

if [ $RELOAD_FAILED -eq 1 ]; then
    echo "❌ Bypassing health checks due to PM2 orchestration failure."
    HEALTH_OK=0
    MAX_RETRIES=0
else
    echo "🏥 Verifying Health for rollback..."
    MAX_RETRIES=10
fi

RETRY_INTERVAL=2
HEALTH_OK=0

for i in $(seq 1 $MAX_RETRIES); do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/api/health || echo "000")
    READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/api/ready || echo "000")
    API_VERSION=$(curl -s http://127.0.0.1:${PORT}/api/version | jq -r .gitSha || echo "")

    if [ "$HEALTH_STATUS" == "200" ] && [ "$READY_STATUS" == "200" ] && [ "$API_VERSION" == "$GIT_SHA" ]; then
        HEALTH_OK=1
        break
    fi
    sleep $RETRY_INTERVAL
done

if [ $HEALTH_OK -eq 1 ]; then
    echo "✅ Rollback health verified!"
    echo "✅ ROLLBACK RESULT: SUCCESS"
    exit 0
else
    echo "❌ Rollback health verification failed!"
    echo "❌ ROLLBACK RESULT: FAILED"
    exit 1
fi
