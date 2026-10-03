#!/bin/bash
set -e

# P14-I5: Runtime State Migration Preparation Tool
# SAFELY migrates uploads/ and cache/ from legacy checkout to $RELEASE_ROOT/shared/
# Default is DRY_RUN.

RELEASE_ROOT=$1
MODE=${2:-"DRY_RUN"}

if [ -z "$RELEASE_ROOT" ]; then
    echo "Usage: $0 <RELEASE_ROOT> [EXECUTE]"
    exit 1
fi

echo "================================================="
echo "🔄 STATE MIGRATION PREPARATION: $MODE"
echo "================================================="

# Source paths (from current legacy deployment)
# Since this script runs from legacy root, we assume PWD is the repository root
LEGACY_UPLOADS="backend/uploads"
LEGACY_SOCIAL="backend/cache/social-reviews.json"

# Target paths
TARGET_UPLOADS="$RELEASE_ROOT/shared/uploads"
TARGET_CACHE_DIR="$RELEASE_ROOT/shared/cache"
TARGET_SOCIAL="$TARGET_CACHE_DIR/social-reviews.json"

function migrate_dir() {
    local src=$1
    local dest=$2
    if [ ! -d "$src" ]; then
        echo "⚠️  Source directory missing: $src (Skipping)"
        return
    fi
    if [ -e "$dest" ]; then
        echo "⚠️  Destination already exists: $dest (Skipping)"
        return
    fi
    
    if [ "$MODE" = "EXECUTE" ]; then
        echo "➡️  MIGRATING: $src -> $dest"
        mkdir -p "$(dirname "$dest")"
        cp -R "$src" "$dest"
    else
        echo "🔍 [DRY RUN] Would copy $src -> $dest"
    fi
}

function migrate_file() {
    local src=$1
    local dest=$2
    if [ ! -f "$src" ]; then
        echo "⚠️  Source file missing: $src (Skipping)"
        return
    fi
    if [ -e "$dest" ]; then
        echo "⚠️  Destination already exists: $dest (Skipping)"
        return
    fi
    
    if [ "$MODE" = "EXECUTE" ]; then
        echo "➡️  MIGRATING: $src -> $dest"
        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
    else
        echo "🔍 [DRY RUN] Would copy $src -> $dest"
    fi
}

migrate_dir "$LEGACY_UPLOADS" "$TARGET_UPLOADS"
migrate_file "$LEGACY_SOCIAL" "$TARGET_SOCIAL"

echo "✅ State Migration Tool Completed."
