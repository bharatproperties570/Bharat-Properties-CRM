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
if [ -L "$CURRENT_LINK" ]; then
    PREVIOUS_TARGET=$(readlink -f "$CURRENT_LINK")
    PREVIOUS_SHA=$(basename "$PREVIOUS_TARGET")
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

# Verify expected files
if [ ! -f "$RELEASE_DIR/ecosystem.config.cjs" ]; then
    echo "❌ CRITICAL: ecosystem.config.cjs missing from artifact."
    rm -rf "$RELEASE_DIR"
    exit 1
fi

# Verify Secrets Absence
if find "$RELEASE_DIR" -name ".env*" -not -name ".env.example" | grep -q .; then
    echo "❌ CRITICAL: Artifact contains illegal .env files!"
    rm -rf "$RELEASE_DIR"
    exit 1
fi

# Link external production configuration securely
echo "🔗 Linking production environment configuration..."
if [ -f "/home/ubuntu/bharat-properties-crm/backend/.env" ]; then
    ln -s "/home/ubuntu/bharat-properties-crm/backend/.env" "$RELEASE_DIR/.env"
else
    echo "⚠️  WARNING: Production .env file not found at /home/ubuntu/bharat-properties-crm/backend/.env"
fi

# Ensure Shared Directories
mkdir -p "$SHARED_DIR/uploads"

# Atomic Switch
echo "🔄 Atomically switching current release..."
ln -s "$RELEASE_DIR" "${CURRENT_LINK}.tmp"
if mv -T "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
elif mv -h "${CURRENT_LINK}.tmp" "$CURRENT_LINK" 2>/dev/null; then
  :
else
  ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
  rm -f "${CURRENT_LINK}.tmp"
fi

echo "🔄 Reloading PM2..."
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

    HEALTH_OK=1
    break
done

if [ $HEALTH_OK -eq 1 ]; then
    echo "✅ Health verified!"
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
