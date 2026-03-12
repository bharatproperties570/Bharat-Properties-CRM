#!/bin/bash

# Cleanup script for Antigravity-related logs and history to prevent server crashes

echo "Starting cleanup of Antigravity system directories..."

# 1. Clear old daemon logs
DAEMON_DIR="/Users/bharatproperties/.gemini/antigravity/daemon"
if [ -d "$DAEMON_DIR" ]; then
    echo "Clearing logs in $DAEMON_DIR..."
    find "$DAEMON_DIR" -name "*.log" -type f -delete
    find "$DAEMON_DIR" -name "ls_*.json" -type f -delete
fi

# 2. Clear project-level logs
PROJECT_DIR="/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm"
echo "Clearing .log files in $PROJECT_DIR..."
find "$PROJECT_DIR" -name "*.log" -maxdepth 2 -type f -delete

# 3. Handle large conversation history
# NOTE: We keep the most recent ones but can archive/delete very old ones if needed.
# For now, we just report size and let user know.
CONVERSATIONS_DIR="/Users/bharatproperties/.gemini/antigravity/conversations"
if [ -d "$CONVERSATIONS_DIR" ]; then
    SIZE=$(du -sh "$CONVERSATIONS_DIR" | cut -f1)
    echo "Current conversation history size: $SIZE"
    # To delete history older than 30 days:
    # find "$CONVERSATIONS_DIR" -mtime +30 -type d -exec rm -rf {} +
fi

echo "Cleanup complete. Please restart Antigravity server to apply changes."
