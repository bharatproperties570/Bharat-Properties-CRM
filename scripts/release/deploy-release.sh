#!/bin/bash
set -e

# Simulates atomic immutable release deployment
# Usage: ./deploy-release.sh <artifact.tar.gz> <release-manifest.json> <release_root>

ARTIFACT=$1
MANIFEST_FILE=$2
RELEASE_ROOT=$3

if [ -z "$ARTIFACT" ] || [ -z "$MANIFEST_FILE" ] || [ -z "$RELEASE_ROOT" ]; then
    echo "Usage: $0 <artifact.tar.gz> <release-manifest.json> <release_root>"
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

# Verify Integrity
# Architecture Verification
MANIFEST_ARCH=$(echo "$MANIFEST" | jq -r .osArchitecture)
TARGET_ARCH=$(uname -m)
if [ -n "$MANIFEST_ARCH" ] && [ "$MANIFEST_ARCH" != "null" ]; then
    if [ "$MANIFEST_ARCH" != "$TARGET_ARCH" ]; then
        echo "❌ CRITICAL: Architecture mismatch!"
        echo "Artifact built for: $MANIFEST_ARCH"
        echo "Target host is:     $TARGET_ARCH"
        exit 1
    fi
    echo "✅ Architecture match verified: $TARGET_ARCH"
else
    echo "⚠️  WARNING: Manifest is missing osArchitecture metadata. Proceeding blindly."
fi

EXPECTED_SHA=$(echo "$MANIFEST" | jq -r .artifactSha256)
ACTUAL_SHA=$(shasum -a 256 "${ARTIFACT}" | awk '{print $1}')

if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "❌ CRITICAL: Artifact checksum mismatch!"
    echo "Expected: $EXPECTED_SHA"
    echo "Actual:   $ACTUAL_SHA"
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

# Verify Secrets Absence
if find "$RELEASE_DIR" -name ".env*" -not -name ".env.example" | grep -q .; then
    echo "❌ CRITICAL: Artifact contains illegal .env files!"
    rm -rf "$RELEASE_DIR"
    exit 1
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

