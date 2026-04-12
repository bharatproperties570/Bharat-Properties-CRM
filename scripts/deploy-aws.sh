#!/bin/bash

# Professional Deployment Orchestrator for Bharat Properties CRM
# Target Environment: AWS EC2 (Mumbai)
# API Domain: api.bharatproperties.co

SERVER_IP="13.239.4.253"
SERVER_USER="ubuntu"
REMOTE_PATH="/home/ubuntu/Bharat-Properties-CRM"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚢 Starting Professional Deployment to AWS...${NC}"

KEY_PATH="$(cd "$(dirname "$0")/.." && pwd)/bharat_properties.pem"

# 1. Connection Check
echo -e "${GREEN}🔍 Checking connectivity to ${SERVER_IP}...${NC}"
if ! ssh -i "$KEY_PATH" -o ConnectTimeout=5 -o BatchMode=yes ${SERVER_USER}@${SERVER_IP} exit 2>/dev/null; then
    echo -e "${RED}❌ SSH Connection failed. Ensure the key at $KEY_PATH is valid.${NC}"
    # exit 1 (Removing hard exit to allow manual override if needed)
fi

# 2. Remote Execution
echo -e "${GREEN}⚙️  Executing remote update script...${NC}"
ssh -i "$KEY_PATH" ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_PATH} && bash scripts/update-live.sh"

# 3. Post-Deployment Health Check
echo -e "${GREEN}🩺 Running Professional Health Check...${NC}"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.bharatproperties.co/api/health)

if [ "$HEALTH_STATUS" == "200" ]; then
    echo -e "${GREEN}✅ Deployment verified! API is responding (Status: 200)${NC}"
else
    echo -e "${RED}⚠️  Health Check Failed (Status: ${HEALTH_STATUS}). Please check PM2 logs on the server.${NC}"
fi

echo -e "${BLUE}🏁 Deployment Flow Finished.${NC}"
