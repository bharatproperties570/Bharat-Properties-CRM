#!/bin/bash

# Professional Live Update Script for Bharat Properties CRM
# This script preserves cache, pulls latest from Git, installs dependencies, runs migrations, and restarts services.

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Professional Update Flow...${NC}"

CACHE_FILE="backend/cache/social-reviews.json"
BACKUP_DIR="/tmp/bharat-crm-deploy-backup-$$"
CACHE_BACKUP="$BACKUP_DIR/social-reviews.json"

# 0. Preserve runtime cache if present
echo -e "${GREEN}📦 Checking for existing runtime cache...${NC}"
if [ -f "$CACHE_FILE" ]; then
    mkdir -p "$BACKUP_DIR"
    cp -p "$CACHE_FILE" "$CACHE_BACKUP"
    echo -e "${GREEN}✅ Preserved cache to temporary backup.${NC}"
else
    echo -e "${BLUE}ℹ️  No existing runtime cache found.${NC}"
fi

# 1. Stash any local changes
echo -e "${GREEN}📦 Stashing local changes (if any)...${NC}"
git stash

# 2. Pull latest code
echo -e "${GREEN}⬇️  Pulling latest code from Git...${NC}"
if ! git pull origin main; then
    echo -e "${RED}❌ Git pull failed. Deployment aborted.${NC}"
    exit 1
fi

# 3. Restore preserved cache
if [ -f "$CACHE_BACKUP" ]; then
    echo -e "${GREEN}📦 Restoring runtime cache...${NC}"
    mkdir -p "$(dirname "$CACHE_FILE")"
    cp -p "$CACHE_BACKUP" "$CACHE_FILE"
    echo -e "${GREEN}✅ Cache restored.${NC}"
fi

# 4. Install Dependencies
echo -e "${GREEN}🛠️  Installing Frontend Dependencies...${NC}"
npm install

echo -e "${GREEN}🛠️  Installing Backend Dependencies...${NC}"
cd backend && npm install && cd ..

# 5. Database Migrations (C9)
echo -e "${GREEN}⚙️  Executing database migrations...${NC}"
if [ -f "backend/scripts/provision_c9_indexes.js" ]; then
    if ! node backend/scripts/provision_c9_indexes.js; then
        echo -e "${RED}❌ CRITICAL: C9 index migration failed! Deployment halted safely.${NC}"
        echo -e "${RED}⚠️  PM2 HAS NOT BEEN RESTARTED. PLEASE INVESTIGATE. Backup preserved at $BACKUP_DIR${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Migration completed successfully.${NC}"
fi

# 6. Restart Services (If using PM2)
if command -v pm2 &> /dev/null
then
    echo -e "${GREEN}♻️  Restarting CRM Services via PM2...${NC}"
    if [ -f "backend/ecosystem.config.cjs" ]; then
        pm2 start backend/ecosystem.config.cjs --update-env
    fi
    pm2 restart all
else
    echo -e "${RED}⚠️  PM2 not found. Please restart your node services manually.${NC}"
fi

# 7. Cleanup
if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR"
    echo -e "${GREEN}🧹 Cleaned up temporary backups.${NC}"
fi

echo -e "${BLUE}✅ Update Completed Successfully!${NC}"
