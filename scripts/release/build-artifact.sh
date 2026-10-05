#!/bin/bash
set -e

# Creates the immutable release artifact for the backend.
# Run this from the repository root.

if [ ! -f "release-manifest.json" ]; then
    echo "❌ CRITICAL: release-manifest.json must be generated before building the artifact."
    exit 1
fi

GIT_SHA=$(jq -r .gitSha release-manifest.json)
ARTIFACT_NAME="bharat-crm-backend-${GIT_SHA}.tar.gz"
BUILD_DIR="/tmp/bharat-crm-build-${GIT_SHA}"

echo "📦 Building Immutable Artifact: $ARTIFACT_NAME"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 1. Copy necessary runtime backend files
rsync -a --exclude 'node_modules' --exclude '.git' --exclude 'uploads' --exclude '.env*' --exclude '*.log' --exclude 'scratch' backend/ "$BUILD_DIR/"
cp release-manifest.json "$BUILD_DIR/"

# 1.5 Package release lifecycle scripts into the artifact (R20 requirement)
mkdir -p "$BUILD_DIR/scripts/release"
cp -r scripts/release/* "$BUILD_DIR/scripts/release/"

# 2. Migration scripts are now already in $BUILD_DIR/scripts due to rsync

# 3. Exclude unsafe/test/diagnostic caches explicitly
rm -rf "$BUILD_DIR/src/tests" || true
rm -rf "$BUILD_DIR/tests" || true
rm -rf "$BUILD_DIR/scripts/legacy_diagnostic" || true
rm -rf "$BUILD_DIR/tests/legacy_unsafe" || true
rm -f "$BUILD_DIR/.env" "$BUILD_DIR/.env."*

# 4. Install production dependencies natively to bundle into artifact
# The PM2 Node process uses these natively.
echo "⚙️  Installing production dependencies..."
cd "$BUILD_DIR"
npm ci --omit=dev
cd - >/dev/null

# 5. Compress artifact deterministically
cd "$BUILD_DIR"
tar -czf "../${ARTIFACT_NAME}" .
cd - >/dev/null

mv "/tmp/${ARTIFACT_NAME}" "./${ARTIFACT_NAME}"
rm -rf "$BUILD_DIR"

# 6. Generate Checksum
SHA256=$(shasum -a 256 "${ARTIFACT_NAME}" | awk '{print $1}')

# Update manifest with artifact metadata
jq --arg sha "$SHA256" --arg file "$ARTIFACT_NAME" '. + {artifact: $file, artifactSha256: $sha}' release-manifest.json > release-manifest-final.json
mv release-manifest-final.json release-manifest.json

echo "✅ Artifact successfully built: ${ARTIFACT_NAME}"
echo "🔒 SHA-256: ${SHA256}"
