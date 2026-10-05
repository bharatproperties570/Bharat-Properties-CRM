#!/bin/bash
set -e

# Enterprise Capacity and Retention Validator

check_capacity() {
    local ARTIFACT="$1"
    local RELEASE_ROOT="$2"
    
    local FREE_KB=$(df -k "$RELEASE_ROOT" | awk 'NR==2 {print $4}')
    local FREE_BYTES=$((FREE_KB * 1024))
    local FREE_INODES=$(df -i "$RELEASE_ROOT" | awk 'NR==2 {print $4}')
    
    local UNCOMPRESSED_BYTES=$(gzip -l "$ARTIFACT" 2>/dev/null | awk 'NR==2 {print $2}')
    local COMPRESSED_BYTES=$(stat -f "%z" "$ARTIFACT" 2>/dev/null || stat -c "%s" "$ARTIFACT" 2>/dev/null || echo 0)
    
    if [ -z "$UNCOMPRESSED_BYTES" ] || [ "$UNCOMPRESSED_BYTES" -eq 0 ]; then
        # Fallback if gzip -l fails (e.g. not a valid gzip or corrupted)
        UNCOMPRESSED_BYTES=$((COMPRESSED_BYTES * 3))
    elif [ "$UNCOMPRESSED_BYTES" -lt "$COMPRESSED_BYTES" ]; then
        UNCOMPRESSED_BYTES=$((UNCOMPRESSED_BYTES + 4294967296))
    fi
    
    local EXTRACTION_BYTES=$(echo "$UNCOMPRESSED_BYTES * 1.1" | bc | cut -d. -f1)
    local SAFETY_RESERVE_BYTES=$((1024 * 1024 * 1024))
    local REQUIRED_INODES=50000
    
    local TOTAL_REQUIRED_BYTES=$((EXTRACTION_BYTES + SAFETY_RESERVE_BYTES))
    
    echo "   Free Space: $((FREE_BYTES / 1024 / 1024)) MB"
    echo "   Required Space: $((TOTAL_REQUIRED_BYTES / 1024 / 1024)) MB"
    echo "   Free Inodes: $FREE_INODES (Required: $REQUIRED_INODES)"
    
    if [ "$FREE_BYTES" -lt "$TOTAL_REQUIRED_BYTES" ]; then
        echo "❌ CRITICAL: Insufficient disk space! Deployment aborted to protect production host."
        return 1
    fi
    
    if [ "$FREE_INODES" -lt "$REQUIRED_INODES" ]; then
        echo "❌ CRITICAL: Insufficient inodes ($FREE_INODES < $REQUIRED_INODES)! Deployment aborted."
        return 1
    fi
    
    echo "✅ Capacity verified."
    return 0
}

cleanup_retention() {
    local RELEASE_ROOT="$1"
    local CURRENT_SHA="$2"
    local PREVIOUS_SHA="$3"
    
    echo "🧹 Evaluating Release Retention Policy..."
    local RELEASES_DIR="${RELEASE_ROOT}/releases"
    if [ ! -d "$RELEASES_DIR" ]; then return 0; fi
    
    # Array of all releases sorted by modification time (oldest first)
    local RELEASES=($(ls -1tr "$RELEASES_DIR"))
    
    # We want to keep CURRENT, PREVIOUS, and perhaps 1 additional rollback.
    # Total retain count: 3
    local RETAIN_COUNT=3
    local PROTECTED=()
    if [ -n "$CURRENT_SHA" ]; then PROTECTED+=("$CURRENT_SHA"); fi
    if [ -n "$PREVIOUS_SHA" ]; then PROTECTED+=("$PREVIOUS_SHA"); fi
    
    for rel in "${RELEASES[@]}"; do
        local IS_PROTECTED=0
        for p in "${PROTECTED[@]}"; do
            if [ "$rel" == "$p" ]; then IS_PROTECTED=1; fi
        done
        
        if [ $IS_PROTECTED -eq 1 ]; then
            echo "🔒 Protecting active/rollback release: $rel"
            continue
        fi
        
        # If we have more releases than RETAIN_COUNT overall, delete the oldest unprotected ones.
        local CURRENT_TOTAL_COUNT=$(ls -1 "$RELEASES_DIR" | wc -l)
        if [ "$CURRENT_TOTAL_COUNT" -gt "$RETAIN_COUNT" ]; then
            echo "🗑️  Purging obsolete release to reclaim capacity: $rel"
            rm -rf "${RELEASES_DIR}/$rel"
        fi
    done
}
