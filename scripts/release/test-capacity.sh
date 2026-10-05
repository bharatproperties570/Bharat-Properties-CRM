#!/bin/bash
set -e

echo "🧪 Running Capacity Preflight Tests..."
source scripts/release/check-capacity.sh

# Mock df command behavior to simulate full disk
df() {
    if [[ "$1" == "-k" ]]; then
        echo "Filesystem 1K-blocks Used Available Use% Mounted on"
        echo "/dev/root 1000000 950000 50000 95% /" # 50MB free
    elif [[ "$1" == "-i" ]]; then
        echo "Filesystem Inodes IUsed IFree IUse% Mounted on"
        echo "/dev/root 100000 99000 1000 99% /" # 1000 inodes free
    else
        command df "$@"
    fi
}

export -f df

echo "Testing check_capacity with simulated low disk space..."
# Touch a dummy artifact
touch /tmp/dummy_artifact.tar.gz

if check_capacity "/tmp/dummy_artifact.tar.gz" "/tmp"; then
    echo "❌ Test failed: Capacity check passed when it should have failed."
    exit 1
else
    echo "✅ Test passed: Capacity check failed securely on low space."
fi

# Test cleanup_retention
echo "Testing cleanup_retention..."
mkdir -p /tmp/test-releases/releases
touch /tmp/test-releases/releases/a
touch /tmp/test-releases/releases/b
touch /tmp/test-releases/releases/c
touch /tmp/test-releases/releases/d
sleep 1 # Ensure modification times are different if we created them fast, but touch doesn't do that easily unless specified.
# Actually let's just make them dummy dirs
rm -rf /tmp/test-releases/releases/*
mkdir -p /tmp/test-releases/releases/oldest
sleep 1
mkdir -p /tmp/test-releases/releases/middle
sleep 1
mkdir -p /tmp/test-releases/releases/current
sleep 1
mkdir -p /tmp/test-releases/releases/previous

cleanup_retention "/tmp/test-releases" "current" "previous"

# Check what's left
remaining=$(ls -1 /tmp/test-releases/releases | wc -l)
if [ "$remaining" -le 3 ]; then
    echo "✅ Test passed: cleanup_retention retained $remaining releases."
else
    echo "❌ Test failed: cleanup_retention retained $remaining releases (expected <= 3)."
    exit 1
fi
