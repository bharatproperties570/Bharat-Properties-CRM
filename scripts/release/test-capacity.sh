#!/bin/bash
set -e

echo "🧪 Running Capacity Preflight & Security Tests (R11-R2)..."
source scripts/release/check-capacity.sh

# Mock df command behavior to simulate full disk
df() {
    if [[ "$1" == "-Pk" ]]; then
        echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
        echo "/dev/root 1000000 950000 50000 95% /" # 50MB free
    elif [[ "$1" == "-Pi" ]]; then
        echo "Filesystem Inodes IUsed IFree IUse% Mounted on"
        echo "/dev/root 100000 99000 1000 99% /" # 1000 inodes free
    else
        command df "$@"
    fi
}
export -f df

# Mock gzip output for tests
GZIP_MODE="normal"
gzip() {
    if [ "$GZIP_MODE" == "corrupt" ]; then
        echo "gzip: test.tar.gz: unexpected end of file" >&2
        return 1
    elif [ "$GZIP_MODE" == "overflow" ]; then
        # 10 Exabytes
        echo "  compressed uncompressed  ratio uncompressed_name"
        echo "   10000   10000000000000000000  99.9% test.tar"
    elif [ "$GZIP_MODE" == "zero" ]; then
        echo "  compressed uncompressed  ratio uncompressed_name"
        echo "   10000   0  99.9% test.tar"
    elif [ "$GZIP_MODE" == "malformed" ]; then
        echo "  compressed uncompressed  ratio uncompressed_name"
        echo "   10000   abc  99.9% test.tar"
    else
        echo "  compressed uncompressed  ratio uncompressed_name"
        echo "   145530051   1960502272  92.5% test.tar"
    fi
}
export -f gzip

echo "Testing gzip failures fail-closed..."
GZIP_MODE="corrupt"
touch /tmp/dummy_artifact.tar.gz
if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp" >/dev/null; then
    echo "❌ Test failed: Capacity check passed on corrupt gzip when it should fail-closed."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on corrupt gzip."
fi

GZIP_MODE="overflow"
if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp" >/dev/null; then
    echo "❌ Test failed: Capacity check passed on integer overflow when it should fail-closed."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on integer overflow."
fi

GZIP_MODE="zero"
if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp" >/dev/null; then
    echo "❌ Test failed: Capacity check passed on zero gzip size when it should fail-closed."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on zero gzip size."
fi

GZIP_MODE="malformed"
if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp" >/dev/null; then
    echo "❌ Test failed: Capacity check passed on malformed gzip size when it should fail-closed."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on malformed gzip size."
fi

GZIP_MODE="normal"
if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp" >/dev/null; then
    echo "❌ Test failed: Capacity check passed when low disk space."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on low space with normal gzip output."
fi

echo "Testing adversarial cleanup_retention & partial extraction..."
TEST_ROOT="/tmp/test-releases"
mkdir -p "$TEST_ROOT/releases"
rm -rf "$TEST_ROOT/releases"/*

# Create valid SHA releases in sequential ctime order
R1="1111111111111111111111111111111111111111" # Oldest, Valid
R2="2222222222222222222222222222222222222222" # Fallback, Valid
R3="3333333333333333333333333333333333333333" # Previous, Valid
R4="4444444444444444444444444444444444444444" # Active, Valid
R5="5555555555555555555555555555555555555555" # Newest, PARTIAL

mkdir -p "$TEST_ROOT/releases/$R1/src"; touch "$TEST_ROOT/releases/$R1/release-manifest.json" "$TEST_ROOT/releases/$R1/src/server.js" "$TEST_ROOT/releases/$R1/package.json" "$TEST_ROOT/releases/$R1/launcher.mjs" "$TEST_ROOT/releases/$R1/ecosystem.config.cjs"; sleep 1
mkdir -p "$TEST_ROOT/releases/$R2/src"; touch "$TEST_ROOT/releases/$R2/release-manifest.json" "$TEST_ROOT/releases/$R2/src/server.js" "$TEST_ROOT/releases/$R2/package.json" "$TEST_ROOT/releases/$R2/launcher.mjs" "$TEST_ROOT/releases/$R2/ecosystem.config.cjs"; sleep 1
mkdir -p "$TEST_ROOT/releases/$R3/src"; touch "$TEST_ROOT/releases/$R3/release-manifest.json" "$TEST_ROOT/releases/$R3/src/server.js" "$TEST_ROOT/releases/$R3/package.json" "$TEST_ROOT/releases/$R3/launcher.mjs" "$TEST_ROOT/releases/$R3/ecosystem.config.cjs"; sleep 1
mkdir -p "$TEST_ROOT/releases/$R4/src"; touch "$TEST_ROOT/releases/$R4/release-manifest.json" "$TEST_ROOT/releases/$R4/src/server.js" "$TEST_ROOT/releases/$R4/package.json" "$TEST_ROOT/releases/$R4/launcher.mjs" "$TEST_ROOT/releases/$R4/ecosystem.config.cjs"; sleep 1
mkdir -p "$TEST_ROOT/releases/$R5"; # NO MANIFEST AND NO FILES (Partial)

# MTIME ADVERSARIAL ATTACK:
# Attacker spoofs R3's mtime to make it appear older than R1
touch -t 202001010101 "$TEST_ROOT/releases/$R3"
# Because we use 'ls -1trc' (ctime), R3 should STILL be correctly identified as the 'Previous' release
# regardless of its tampered mtime.

# CTIME ADVERSARIAL PROOF:
# In R11-R2, we used 'ls -1trc' to derive the rollback candidates.
# If an operator runs `chmod` on R1 (an old release), its ctime updates.
chmod 777 "$TEST_ROOT/releases/$R1"
# Now if we parse with ctime:
CTIME_RELEASES=($(ls -1trc "$TEST_ROOT/releases" 2>/dev/null | grep -E '^[0-9a-f]{40}$' || true))
NEWEST_CTIME="${CTIME_RELEASES[${#CTIME_RELEASES[@]}-1]}"
if [ "$NEWEST_CTIME" == "$R1" ]; then
    echo "⚠️  CTIME VULNERABILITY PROVED: R1 became the newest release simply due to a chmod!"
else
    echo "❌ CTIME test failed to prove vulnerability."
    exit 1
fi
# This proves ctime is not authoritative for deployment history.

# Create adversarial/malformed directories
mkdir -p "$TEST_ROOT/releases/invalid object"
mkdir -p "$TEST_ROOT/releases/../../etc_mock" # Actually resolves to /tmp/etc_mock, safely isolated

ln -s "/tmp" "$TEST_ROOT/releases/6666666666666666666666666666666666666666"

# Simulate authoritative symlink history
ln -sfn "$TEST_ROOT/releases/$R4" "$TEST_ROOT/current"
ln -sfn "$TEST_ROOT/releases/$R3" "$TEST_ROOT/previous"
ln -sfn "$TEST_ROOT/releases/$R2" "$TEST_ROOT/fallback"

# Read history atomically from symlinks
ACTIVE_TARGET=$(readlink -f "$TEST_ROOT/current" 2>/dev/null || echo "")
ACTIVE_SHA=$(basename "$ACTIVE_TARGET" 2>/dev/null || echo "")

PREVIOUS_TARGET=$(readlink -f "$TEST_ROOT/previous" 2>/dev/null || echo "")
ROLLBACK_SHA=$(basename "$PREVIOUS_TARGET" 2>/dev/null || echo "")

FALLBACK_TARGET=$(readlink -f "$TEST_ROOT/fallback" 2>/dev/null || echo "")
FALLBACK_SHA=$(basename "$FALLBACK_TARGET" 2>/dev/null || echo "")

# Run cleanup (Protect R4 as active, R3 as rollback, R2 as fallback)
cleanup_retention "$TEST_ROOT" "$ACTIVE_SHA" "$ROLLBACK_SHA" "$FALLBACK_SHA" >/dev/null

# Assertions
if [ "$ROLLBACK_SHA" == "$R5" ] || [ "$FALLBACK_SHA" == "$R5" ]; then
    echo "❌ Test failed: Partial release R5 became a rollback candidate."
    exit 1
fi

if [ -d "$TEST_ROOT/releases/$R4" ] && [ -d "$TEST_ROOT/releases/$R3" ] && [ -d "$TEST_ROOT/releases/$R2" ]; then
    echo "✅ Test passed: Protected valid releases survived."
else
    echo "❌ Test failed: Protected valid release was deleted!"
    exit 1
fi

if [ -d "$TEST_ROOT/releases/$R1" ]; then
    echo "❌ Test failed: Unprotected old valid release R1 was not deleted."
    exit 1
else
    echo "✅ Test passed: Oldest unprotected valid release was purged."
fi

if [ -d "$TEST_ROOT/releases/$R5" ]; then
    echo "❌ Test failed: Unprotected partial release R5 was not purged."
    exit 1
else
    echo "✅ Test passed: Partial release R5 was recognized as orphan and safely purged."
fi

if [ -d "$TEST_ROOT/releases/invalid object" ]; then
    echo "✅ Test passed: Directory with space safely ignored."
else
    echo "❌ Test failed: Directory with space was deleted/mishandled."
    exit 1
fi

if [ -L "$TEST_ROOT/releases/6666666666666666666666666666666666666666" ]; then
    echo "✅ Test passed: Symlink safely ignored."
else
    echo "❌ Test failed: Symlink was deleted."
    exit 1
fi

echo "✅ ALL ADVERSARIAL TESTS PASSED."
