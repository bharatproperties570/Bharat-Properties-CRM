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


# Resolve Topology
SCRIPT_DIR=$(dirname "$0")
if [ ! -f "$SCRIPT_DIR/resolve-topology.sh" ]; then
    echo "❌ CRITICAL: resolve-topology.sh missing from $SCRIPT_DIR"
    exit 1
fi
source "$SCRIPT_DIR/resolve-topology.sh"

RESOLUTION=$(resolve_topology "$RELEASE_DIR")
if [ "$RESOLUTION" == "AMBIGUOUS" ]; then
    echo "❌ CRITICAL: AMBIGUOUS TOPOLOGY. Artifact satisfies both MODEL 1 and MODEL 2 criteria. Aborting."
    exit 1
elif [ "$RESOLUTION" == "INVALID" ]; then
    echo "❌ CRITICAL: INVALID TOPOLOGY. Neither MODEL 1 nor MODEL 2 contracts are satisfied. Aborting."
    exit 1
fi

TOPOLOGY=$(echo "$RESOLUTION" | cut -d'|' -f1)
EFFECTIVE_TARGET=$(echo "$RESOLUTION" | cut -d'|' -f2)

if [ "$TOPOLOGY" == "MODEL_2_COMPATIBILITY" ]; then
    echo "⚠️  Topology Resolved: MODEL_2_COMPATIBILITY (Legacy Wrapper)"
else
    echo "✅ Topology Resolved: MODEL_1"
fi

echo "🔄 Atomically rolling back to previous release ($GIT_SHA)..."
ln -s "$EFFECTIVE_TARGET" "${CURRENT_LINK}.tmp"
if mv -T "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
elif mv -h "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
else
  ln -sfn "$EFFECTIVE_TARGET" "$CURRENT_LINK"
  rm -f "${CURRENT_LINK}.tmp"
fi

echo "🔄 Managing PM2 State (Rollback)..."
RUNTIME_DIR="/home/ubuntu/bharat-crm-runtime"
RELOAD_FAILED=0

if ! JLIST_OUT=$(pm2 jlist 2>/dev/null); then
    echo "❌ CRITICAL: PM2 daemon unavailable/unresponsive. Aborting rollback."
    exit 1
fi

PM2_COUNT=$(echo "$JLIST_OUT" | jq '[.[] | select(.name=="bharat-crm-backend")] | length')

if [ -z "$PM2_COUNT" ]; then
    PM2_COUNT=0
fi

if [ "$PM2_COUNT" -gt 1 ]; then
    echo "❌ CRITICAL_DUPLICATE_PROCESS_STATE: Found $PM2_COUNT instances of 'bharat-crm-backend'. Aborting rollback."
    exit 1
fi

if [ "$PM2_COUNT" -eq 1 ]; then
    echo "🔄 Reloading PM2 process..."
    if ! pm2 reload bharat-crm-backend; then
        echo "❌ CRITICAL: pm2 reload failed."
        RELOAD_FAILED=1
    fi
elif [ "$PM2_COUNT" -eq 0 ]; then
    echo "⚠️ PM2 process 'bharat-crm-backend' absent. Initiating controlled ecosystem start..."
    if ! pm2 start "${RUNTIME_DIR}/ecosystem.config.cjs" --update-env; then
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
        # Check PM2 Pointer Durability
        PM2_EXEC_PATH=$(pm2 jlist | jq -r '.[] | select(.name=="bharat-crm-backend") | .pm2_env.pm_exec_path')
        if [[ "$PM2_EXEC_PATH" != *"/bharat-crm-runtime/launcher.mjs" ]]; then
            echo "❌ CRITICAL: PM2 Pointer Durability failed! Found: $PM2_EXEC_PATH"
            HEALTH_OK=0
            break
        fi

        HEALTH_OK=1
        break
    fi
    sleep $RETRY_INTERVAL
done

if [ $HEALTH_OK -eq 1 ]; then
    echo "✅ Rollback health verified!"
    echo "✅ ROLLBACK RESULT: SUCCESS"
    # Do NOT execute pm2 save here. The persistence bounds were already saved by the deployment script.
    exit 0
else
    echo "❌ CRITICAL_ROLLBACK_FAILURE"
    echo "Diagnostic State:"
    echo "  Target SHA: $GIT_SHA"
    echo "  Current Symlink Target: $(readlink -f "$CURRENT_LINK" || echo "Broken")"
    echo "  PM2 Process Count: $(pm2 jlist | jq '[.[] | select(.name=="bharat-crm-backend")] | length')"
    echo "  PM2 Process Status: $(pm2 jlist | jq -r '.[] | select(.name=="bharat-crm-backend") | .pm2_env.status')"
    echo "  PM2 Exec Path: $(pm2 jlist | jq -r '.[] | select(.name=="bharat-crm-backend") | .pm2_env.pm_exec_path')"
    echo "  PM2 CWD: $(pm2 jlist | jq -r '.[] | select(.name=="bharat-crm-backend") | .pm2_env.pm_cwd')"
    echo "  Health Status Code: $HEALTH_STATUS"
    echo "  Readiness Status Code: $READY_STATUS"
    echo "  Version API: $API_VERSION"
    exit 1
fi
