#!/bin/bash

# Professional Live Update Script for Bharat Properties CRM
# This script stashes local changes, pulls latest from Git, installs dependencies, and restarts services.

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Professional Update Flow...${NC}"

# 1. Stash any local changes
echo -e "${GREEN}📦 Stashing local changes (if any)...${NC}"
git stash

# 2. Pull latest code
echo -e "${GREEN}⬇️  Pulling latest code from Git...${NC}"
git pull origin main

# 3. Install Dependencies
echo -e "${GREEN}🛠️  Installing Frontend Dependencies...${NC}"
npm install

echo -e "${GREEN}🛠️  Installing Backend Dependencies...${NC}"
cd backend && npm install && cd ..

# 4. Restart Services (If using PM2)
if command -v pm2 &> /dev/null
then
    echo -e "${GREEN}♻️  Restarting CRM Services via PM2...${NC}"
    pm2 restart all
else
    echo -e "${RED}⚠️  PM2 not found. Please restart your node services manually.${NC}"
fi

echo -e "${BLUE}✅ Update Completed Successfully!${NC}"
