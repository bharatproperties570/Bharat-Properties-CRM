#!/bin/bash
set -e

# Enterprise Capacity and Retention Validator

check_capacity() {
    local ARTIFACT="$1"
    local RELEASE_ROOT="$2"

    local FREE_KB
    if ! FREE_KB=$(df -Pk "$RELEASE_ROOT" 2>/dev/null | awk 'NR==2 {print $4}'); then
        echo "❌ CRITICAL: df -Pk failed."
        return 1
    fi

    # Ensure FREE_KB is numeric and non-negative
    if ! [[ "$FREE_KB" =~ ^[0-9]+$ ]]; then
        echo "❌ CRITICAL: df -Pk returned non-numeric or empty value: '$FREE_KB'."
        return 1
    fi

    local FREE_BYTES=$((FREE_KB * 1024))

    local FREE_INODES
    if ! FREE_INODES=$(df -Pi "$RELEASE_ROOT" 2>/dev/null | awk 'NR==2 {print $4}'); then
        echo "❌ CRITICAL: df -Pi failed."
        return 1
    fi
    if ! [[ "$FREE_INODES" =~ ^[0-9]+$ ]]; then
        echo "❌ CRITICAL: df -Pi returned non-numeric or empty value: '$FREE_INODES'."
        return 1
    fi

    local UNCOMPRESSED_BYTES
    if ! UNCOMPRESSED_BYTES=$(gzip -l "$ARTIFACT" 2>/dev/null | awk 'NR==2 {print $2}'); then
        echo "❌ CRITICAL: gzip -l failed to read artifact metadata."
        return 1
    fi

    if ! [[ "$UNCOMPRESSED_BYTES" =~ ^[0-9]+$ ]]; then
        echo "❌ CRITICAL: Untrustworthy or empty gzip size ($UNCOMPRESSED_BYTES). Failsafe abort."
        return 1
    fi

    # Reject any artifact reporting an uncompressed size > 999 GB (13 digits)
    if [ "${#UNCOMPRESSED_BYTES}" -gt 13 ]; then
        echo "❌ CRITICAL: Integer overflow risk detected. Uncompressed size is impossibly large (${UNCOMPRESSED_BYTES})."
        return 1
    fi

    if [ "$UNCOMPRESSED_BYTES" -eq 0 ]; then
        echo "❌ CRITICAL: Gzip size is zero. Failsafe abort."
        return 1
    fi

    local COMPRESSED_BYTES
    COMPRESSED_BYTES=$(stat -f "%z" "$ARTIFACT" 2>/dev/null || stat -c "%s" "$ARTIFACT" 2>/dev/null || echo 0)

    if [[ "$COMPRESSED_BYTES" =~ ^[0-9]+$ ]] && [ "$COMPRESSED_BYTES" -gt 0 ] && [ "${#UNCOMPRESSED_BYTES}" -le 18 ] && [ "$UNCOMPRESSED_BYTES" -lt "$COMPRESSED_BYTES" ]; then
        UNCOMPRESSED_BYTES=$((UNCOMPRESSED_BYTES + 4294967296))
    fi

    # Safe Integer Math: UNCOMPRESSED_BYTES * 1.1 equivalent is * 11 / 10
    local EXTRACTION_BYTES=$((UNCOMPRESSED_BYTES * 11 / 10))
    # Safety reserve for OS, logging, and PM2 operation
    local SAFETY_RESERVE_BYTES=$((1024 * 1024 * 1024))
    # Inode constraint (prevents exhaustion from heavy node_modules payload)
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
    local ACTIVE_SHA="$2"
    local PREVIOUS_SHA="$3"
    local ROLLBACK_FALLBACK_SHA="$4"

    echo "🧹 Evaluating Release Retention Policy..."
    local RELEASES_DIR="${RELEASE_ROOT}/releases"
    if [ ! -d "$RELEASES_DIR" ]; then return 0; fi

    # We want to keep CURRENT, PREVIOUS, and ROLLBACK_FALLBACK.
    local PROTECTED=()
    if [ -n "$ACTIVE_SHA" ]; then PROTECTED+=("$ACTIVE_SHA"); fi
    if [ -n "$PREVIOUS_SHA" ]; then PROTECTED+=("$PREVIOUS_SHA"); fi
    if [ -n "$ROLLBACK_FALLBACK_SHA" ]; then PROTECTED+=("$ROLLBACK_FALLBACK_SHA"); fi

    local VALID_RELEASES=()
    local ORPHAN_RELEASES=()

    while IFS= read -r rel; do
        if [ -z "$rel" ]; then continue; fi

        # Security Gate 1: Must be exactly 40 lowercase hex chars
        if ! [[ "$rel" =~ ^[0-9a-f]{40}$ ]]; then
            echo "⚠️  Skipping non-SHA object in releases directory: '$rel'"
            continue
        fi

        local CANDIDATE_PATH="${RELEASES_DIR}/${rel}"

        # Security Gate 2: Must be a directory, not a symlink
        if [ -L "$CANDIDATE_PATH" ]; then
            echo "⚠️  Skipping symlink: '$rel'"
            continue
        fi

        if [ ! -d "$CANDIDATE_PATH" ]; then
            continue
        fi

        # Release Validity Contract:
        # A completed, successful release will ALWAYS have 'release-manifest.json'
        # copied into its root during deployment. However, manifest alone is not proof.
        # We must prove it satisfies the explicit MODEL_1 or MODEL_2 topology structural contract.
        local IS_VALID=0
        local IS_UNKNOWN=0
        if [ -f "$CANDIDATE_PATH/release-manifest.json" ]; then
            # We source resolve-topology.sh if available
            local RESOLVER_SCRIPT="$(dirname "${BASH_SOURCE[0]}")/resolve-topology.sh"
            if [ -f "$RESOLVER_SCRIPT" ]; then
                local TOPOLOGY_OUT
                TOPOLOGY_OUT=$(bash "$RESOLVER_SCRIPT" "$CANDIDATE_PATH" 2>/dev/null || echo "INVALID")
                if [[ "$TOPOLOGY_OUT" == MODEL_1* ]] || [[ "$TOPOLOGY_OUT" == MODEL_2_COMPATIBILITY* ]]; then
                    IS_VALID=1
                else
                    IS_UNKNOWN=1
                fi
            else
                # Fallback to basic structural checks if resolver is missing
                if [ -f "$CANDIDATE_PATH/src/server.js" ] || [ -f "$CANDIDATE_PATH/backend/src/server.js" ]; then
                    IS_VALID=1
                else
                    IS_UNKNOWN=1
                fi
            fi
        fi

        if [ $IS_VALID -eq 1 ]; then
            VALID_RELEASES+=("$rel")
        elif [ $IS_UNKNOWN -eq 1 ]; then
            echo "⚠️  Preserving release '$rel': valid manifest but unrecognized/invalid topology."
        else
            ORPHAN_RELEASES+=("$rel")
        fi
    done < <(ls -1trc "$RELEASES_DIR" 2>/dev/null || true)

    local RETAIN_COUNT=3
    local TOTAL_VALID=${#VALID_RELEASES[@]}

    # Clean up ORPHAN/PARTIAL releases explicitly (unless they somehow match ACTIVE, which is impossible if deployment is atomic)
    for rel in "${ORPHAN_RELEASES[@]}"; do
        local IS_PROTECTED=0
        for p in "${PROTECTED[@]}"; do
            if [ "$rel" == "$p" ]; then IS_PROTECTED=1; break; fi
        done

        if [ $IS_PROTECTED -eq 1 ]; then
            echo "⚠️  CRITICAL: Active/Protected release '$rel' is marked as partial! Refusing to purge."
            continue
        fi

        echo "🗑️  Purging incomplete/orphan release to reclaim capacity: $rel"
        local TARGET_PATH="${RELEASES_DIR}/${rel}"
        rm -rf "$TARGET_PATH"
    done

    # Clean up excess VALID releases
    for rel in "${VALID_RELEASES[@]}"; do
        # Check protection
        local IS_PROTECTED=0
        for p in "${PROTECTED[@]}"; do
            if [ "$rel" == "$p" ]; then IS_PROTECTED=1; break; fi
        done

        if [ $IS_PROTECTED -eq 1 ]; then
            echo "🔒 Protecting usable release: $rel"
            continue
        fi

        # Delete unprotected releases if we exceed retention threshold
        if [ "$TOTAL_VALID" -gt "$RETAIN_COUNT" ]; then
            echo "🗑️  Purging obsolete valid release to reclaim capacity: $rel"
            local TARGET_PATH="${RELEASES_DIR}/${rel}"
            rm -rf "$TARGET_PATH"
            TOTAL_VALID=$((TOTAL_VALID - 1))
        fi
    done
}
