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
