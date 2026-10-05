#!/bin/bash
set -e

# Simulates atomic immutable release deployment
# Usage: ./deploy-release.sh <artifact.tar.gz> <release-manifest.json> <release_root> [port]

LOCK_DIR="/tmp/deploy-bharat-crm.lock.dir"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "❌ Deployment is already running."
    exit 1
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

ARTIFACT=$1
MANIFEST_FILE=$2
RELEASE_ROOT=$3
PORT=${4:-4000}

if [ -z "$ARTIFACT" ] || [ -z "$MANIFEST_FILE" ] || [ -z "$RELEASE_ROOT" ]; then
    echo "Usage: $0 <artifact.tar.gz> <release-manifest.json> <release_root> [port]"
    exit 1
fi

if [ ! -f "$ARTIFACT" ]; then
    echo "❌ Artifact not found: $ARTIFACT"
    exit 1
fi
if [ ! -f "$MANIFEST_FILE" ]; then
    echo "❌ Manifest not found: $MANIFEST_FILE"
    exit 1
fi

echo "🚀 Starting Deployment Preflight..."

MANIFEST=$(cat "$MANIFEST_FILE")
GIT_SHA=$(echo "$MANIFEST" | jq -r .gitSha)

if [ -z "$GIT_SHA" ] || [ "$GIT_SHA" == "null" ]; then
    echo "❌ CRITICAL: Invalid manifest. Missing gitSha."
    exit 1
fi

RELEASE_DIR="${RELEASE_ROOT}/releases/${GIT_SHA}"
CURRENT_LINK="${RELEASE_ROOT}/current"
SHARED_DIR="${RELEASE_ROOT}/shared"

PREVIOUS_SHA=""
if [ -e "$CURRENT_LINK" ] || [ -L "$CURRENT_LINK" ]; then
    if [ ! -L "$CURRENT_LINK" ]; then
        echo "❌ CRITICAL: INVALID_CURRENT_POINTER. current exists but is not a symlink. Aborting."
        exit 1
    fi
    PREVIOUS_TARGET=$(readlink -f "$CURRENT_LINK" || echo "")
    if [ ! -d "$PREVIOUS_TARGET" ]; then
        echo "❌ CRITICAL: INVALID_CURRENT_POINTER. current symlink resolves to non-existent directory. Aborting."
        exit 1
    fi
    RELEASE_ROOT_REAL=$(readlink -f "${RELEASE_ROOT}/releases")
    if [[ "$PREVIOUS_TARGET" != "$RELEASE_ROOT_REAL/"* ]]; then
        echo "❌ CRITICAL: INVALID_CURRENT_POINTER. current resolves outside intended release root ($PREVIOUS_TARGET). Aborting."
        exit 1
    fi
    PREVIOUS_SHA=$(basename "$PREVIOUS_TARGET")
else
    echo "⚠️  current symlink is absent. Classifying as INITIAL/NO-CURRENT state."
fi

echo "   Intended SHA: $GIT_SHA"
echo "   Previous SHA: ${PREVIOUS_SHA:-None}"

# Verify Integrity
MANIFEST_ARCH=$(echo "$MANIFEST" | jq -r .osArchitecture)
TARGET_ARCH=$(uname -m)
if [ -n "$MANIFEST_ARCH" ] && [ "$MANIFEST_ARCH" != "null" ]; then
    if [ "$MANIFEST_ARCH" != "$TARGET_ARCH" ]; then
        echo "❌ CRITICAL: Architecture mismatch! Expected $MANIFEST_ARCH, got $TARGET_ARCH"
        exit 1
    fi
fi

EXPECTED_SHA=$(echo "$MANIFEST" | jq -r .artifactSha256)
ACTUAL_SHA=$(shasum -a 256 "${ARTIFACT}" | awk '{print $1}')
if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "❌ CRITICAL: Artifact checksum mismatch!"
    exit 1
fi
echo "✅ Checksum verified: $ACTUAL_SHA"

# --- NEW CAPACITY & RETENTION CHECKS ---
SCRIPT_DIR=$(dirname "$0")
if [ ! -f "$SCRIPT_DIR/check-capacity.sh" ]; then
    echo "❌ CRITICAL: check-capacity.sh missing from $SCRIPT_DIR"
    exit 1
fi
source "$SCRIPT_DIR/check-capacity.sh"

HISTORY_PREV_TARGET=$(readlink -f "${RELEASE_ROOT}/previous" 2>/dev/null || echo "")
HISTORY_PREV_SHA=$(basename "$HISTORY_PREV_TARGET" 2>/dev/null || echo "")

HISTORY_FALLBACK_TARGET=$(readlink -f "${RELEASE_ROOT}/fallback" 2>/dev/null || echo "")
HISTORY_FALLBACK_SHA=$(basename "$HISTORY_FALLBACK_TARGET" 2>/dev/null || echo "")

echo "🔍 Running Release Retention Cleanup..."
cleanup_retention "$RELEASE_ROOT" "$PREVIOUS_SHA" "$HISTORY_PREV_SHA" "$HISTORY_FALLBACK_SHA"

echo "🔍 Validating Deployment Capacity..."
if ! check_capacity "$ARTIFACT" "$RELEASE_ROOT"; then
    echo "❌ CRITICAL: Deployment aborted during capacity preflight."
    exit 1
fi
# ---------------------------------------

if [ -d "$RELEASE_DIR" ]; then
    echo "⚠️  Release directory already exists: $RELEASE_DIR"
    echo "Refusing to mutate existing release."
    exit 1
fi

echo "📦 Extracting release to $RELEASE_DIR..."
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"

# Write the final manifest into the release dir
cp "$MANIFEST_FILE" "$RELEASE_DIR/release-manifest.json"

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
    rm -rf "$RELEASE_DIR"
    exit 1
elif [ "$RESOLUTION" == "INVALID" ]; then
    echo "❌ CRITICAL: INVALID TOPOLOGY. Neither MODEL 1 nor MODEL 2 contracts are satisfied. Aborting."
    rm -rf "$RELEASE_DIR"
    exit 1
fi

TOPOLOGY=$(echo "$RESOLUTION" | cut -d'|' -f1)
EFFECTIVE_TARGET=$(echo "$RESOLUTION" | cut -d'|' -f2)

if [ "$TOPOLOGY" == "MODEL_2_COMPATIBILITY" ]; then
    echo "⚠️  Topology Resolved: MODEL_2_COMPATIBILITY (Legacy Wrapper)"
else
    echo "✅ Topology Resolved: MODEL_1"
fi



# Setup Stable Runtime Boundary
RUNTIME_DIR="/home/ubuntu/bharat-crm-runtime"
mkdir -p "$RUNTIME_DIR"
cp "$EFFECTIVE_TARGET/launcher.mjs" "$RUNTIME_DIR/launcher.mjs"
cp "$EFFECTIVE_TARGET/ecosystem.config.cjs" "$RUNTIME_DIR/ecosystem.config.cjs"

# Verify Secrets Absence
if find "$RELEASE_DIR" -name ".env*" -not -name ".env.example" | grep -q .; then
    echo "❌ CRITICAL: Artifact contains illegal .env files!"
    rm -rf "$RELEASE_DIR"
    exit 1
fi

# Verify external .env exists before switching current
ENV_PATH="/home/ubuntu/bharat-properties-crm/backend/.env"
echo "🔍 Validating external environment file..."
if [ ! -f "$ENV_PATH" ] || [ ! -r "$ENV_PATH" ]; then
    echo "❌ CRITICAL: .env file missing or unreadable at $ENV_PATH. Aborting deployment."
    rm -rf "$RELEASE_DIR"
    exit 1
fi
if [ -d "$ENV_PATH" ]; then
    echo "❌ CRITICAL: .env path is a directory. Aborting deployment."
    rm -rf "$RELEASE_DIR"
    exit 1
fi

echo "🔗 Linking production environment configuration..."
ln -s "$ENV_PATH" "$EFFECTIVE_TARGET/.env"

# Ensure Shared Directories
mkdir -p "$SHARED_DIR/uploads"

# Atomic Switch
atomic_symlink() {
    local TARGET="$1"
    local LINK_NAME="$2"
    ln -s "$TARGET" "${LINK_NAME}.tmp"
    if mv -T "${LINK_NAME}.tmp" "$LINK_NAME" 2>/dev/null; then :
    elif mv -h "${LINK_NAME}.tmp" "$LINK_NAME" 2>/dev/null; then :
    else
        ln -sfn "$TARGET" "$LINK_NAME"
        rm -f "${LINK_NAME}.tmp"
    fi
}

echo "🔄 Atomically switching current release..."
atomic_symlink "$EFFECTIVE_TARGET" "$CURRENT_LINK"

echo "🔄 Managing PM2 State..."
RELOAD_FAILED=0

# Safely check PM2 daemon responsiveness
if ! JLIST_OUT=$(pm2 jlist 2>/dev/null); then
    echo "❌ CRITICAL: PM2 daemon unavailable/unresponsive. Aborting deployment."
    # Rollback symlink so state remains consistent
    if [ -n "$PREVIOUS_TARGET" ]; then
        ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
    else
        rm -f "$CURRENT_LINK"
    fi
    exit 1
fi

PM2_COUNT=$(echo "$JLIST_OUT" | jq '[.[] | select(.name=="bharat-crm-backend")] | length')

if [ -z "$PM2_COUNT" ]; then
    PM2_COUNT=0
fi

if [ "$PM2_COUNT" -gt 1 ]; then
    echo "❌ CRITICAL_DUPLICATE_PROCESS_STATE: Found $PM2_COUNT instances of 'bharat-crm-backend'. Aborting deployment."
    # Rollback symlink
    if [ -n "$PREVIOUS_TARGET" ]; then
        ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
    else
        rm -f "$CURRENT_LINK"
    fi
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
    echo "🏥 Verifying Health..."
    MAX_RETRIES=10
fi

RETRY_INTERVAL=2
HEALTH_OK=0

for i in $(seq 1 $MAX_RETRIES); do
    echo "   Attempt $i/$MAX_RETRIES..."

    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/api/health || echo "000")
    if [ "$HEALTH_STATUS" != "200" ]; then
        sleep $RETRY_INTERVAL
        continue
    fi

    READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/api/ready || echo "000")
    if [ "$READY_STATUS" != "200" ]; then
        sleep $RETRY_INTERVAL
        continue
    fi

    API_VERSION=$(curl -s http://127.0.0.1:${PORT}/api/version | jq -r .gitSha || echo "")
    if [ "$API_VERSION" != "$GIT_SHA" ]; then
        sleep $RETRY_INTERVAL
        continue
    fi

    # Check PM2 Pointer Durability
    PM2_EXEC_PATH=$(pm2 jlist | jq -r '.[] | select(.name=="bharat-crm-backend") | .pm2_env.pm_exec_path')
    if [[ "$PM2_EXEC_PATH" != *"/bharat-crm-runtime/launcher.mjs" ]]; then
        echo "❌ CRITICAL: PM2 Pointer Durability failed! Found: $PM2_EXEC_PATH"
        HEALTH_OK=0
        break
    fi

    HEALTH_OK=1
    break
done

if [ $HEALTH_OK -eq 1 ]; then
    echo "✅ Health verified!"

    echo "🔄 Advancing release history symlinks atomically..."
    # Update fallback first to securely duplicate HISTORY_PREV_TARGET before we overwrite previous.
    # This guarantees that if a crash occurs between updates, we don't lose the old previous release.
    if [ -n "$HISTORY_PREV_TARGET" ] && [ -d "$HISTORY_PREV_TARGET" ]; then
        atomic_symlink "$HISTORY_PREV_TARGET" "${RELEASE_ROOT}/fallback"
    fi
    if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
        atomic_symlink "$PREVIOUS_TARGET" "${RELEASE_ROOT}/previous"
    fi

    echo "💾 Saving PM2 state..."
    pm2 save
    echo "✅ DEPLOYMENT RESULT: SUCCESS"
    exit 0
else
    echo "❌ Health check failed after $MAX_RETRIES attempts."
    if [ -n "$PREVIOUS_SHA" ]; then
        echo "🔄 Initiating automatic rollback to $PREVIOUS_SHA..."
        SCRIPT_DIR=$(dirname "$0")
        BYPASS_LOCK=1 bash "$SCRIPT_DIR/rollback-release.sh" "$PREVIOUS_SHA" "$RELEASE_ROOT" "$PORT"
        RB_STATUS=$?
        if [ $RB_STATUS -eq 0 ]; then
            echo "❌ DEPLOYMENT RESULT: FAILED — ROLLBACK SUCCEEDED"
            exit 1
        else
            echo "❌ CRITICAL: DEPLOYMENT RESULT: FAILED — ROLLBACK FAILED"
            exit 2
        fi
    else
        echo "❌ No previous release to rollback to!"
        echo "❌ DEPLOYMENT RESULT: FAILED — ROLLBACK FAILED"
        exit 2
    fi
fi
