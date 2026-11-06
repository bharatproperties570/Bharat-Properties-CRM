#!/bin/bash
resolve_topology() {
    local TARGET_DIR="$1"
    local M1=0
    local M2=0

    if [ -f "$TARGET_DIR/src/server.js" ] && [ -f "$TARGET_DIR/package.json" ] && [ -f "$TARGET_DIR/launcher.mjs" ] && [ -f "$TARGET_DIR/ecosystem.config.cjs" ]; then
        M1=1
    fi

    if [ -f "$TARGET_DIR/backend/src/server.js" ] && [ -f "$TARGET_DIR/backend/package.json" ] && [ -f "$TARGET_DIR/backend/launcher.mjs" ] && [ -f "$TARGET_DIR/backend/ecosystem.config.cjs" ]; then
        M2=1
    fi

    if [ $M1 -eq 1 ] && [ $M2 -eq 1 ]; then
        echo "AMBIGUOUS"
    elif [ $M1 -eq 1 ]; then
        echo "MODEL_1|$TARGET_DIR"
    elif [ $M2 -eq 1 ]; then
        echo "MODEL_2_COMPATIBILITY|$TARGET_DIR/backend"
    else
        echo "INVALID"
    fi
}

resolve_canonical_sha() {
    local TARGET_PATH="$1"
    local RELEASE_ROOT_RELEASES="$2"
    
    if [ -z "$TARGET_PATH" ] || [ -z "$RELEASE_ROOT_RELEASES" ]; then
        return 1
    fi
    
    # 1. readlink -f succeeds
    local RAW_TARGET
    RAW_TARGET=$(readlink -f "$TARGET_PATH" 2>/dev/null)
    if [ -z "$RAW_TARGET" ]; then
        return 1
    fi

    # 2. resolved target exists
    if [ ! -e "$RAW_TARGET" ]; then
        return 1
    fi

    # Gracefully strip legacy backward-compatible MODEL_2 subdirectory
    local CANONICAL_TARGET="${RAW_TARGET%/backend}"
    local EXTRACTED_SHA
    EXTRACTED_SHA=$(basename "$CANONICAL_TARGET")

    # 5. canonical SHA matches 40-char hex
    if [[ ! "$EXTRACTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
        return 1
    fi
    
    # 3. & 4. canonical target is contained exactly one level under RELEASE_ROOT_RELEASES
    # Compare paths strictly avoiding trailing slashes
    local EXPECTED_PATH
    EXPECTED_PATH=$(readlink -f "${RELEASE_ROOT_RELEASES}/${EXTRACTED_SHA}")
    if [ "$CANONICAL_TARGET" != "$EXPECTED_PATH" ]; then
        return 1
    fi

    echo "$EXTRACTED_SHA"
    return 0
}

# If executed directly as a script, run the resolver
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ -n "$1" ]; then
        resolve_topology "$1"
    fi
fi
