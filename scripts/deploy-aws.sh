#!/bin/bash

# Professional Deployment Orchestrator for Bharat Properties CRM
# Target Environment: AWS EC2 (Mumbai)
# API Domain: api.bharatproperties.co

SERVER_IP="api.bharatproperties.co"
SERVER_USER="ubuntu"
REMOTE_PATH="/home/ubuntu/bharat-properties-crm"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚢 Starting Professional Deployment to AWS...${NC}"

KEY_PATH="$(cd "$(dirname "$0")/.." && pwd)/bharat_properties.pem"

# 1. Connection Check
echo -e "${GREEN}🔍 Checking connectivity to ${SERVER_IP}...${NC}"
if ! ssh -i "$KEY_PATH" -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes ${SERVER_USER}@${SERVER_IP} exit 2>/dev/null; then
    echo -e "${RED}❌ SSH Connection failed. Ensure the key at $KEY_PATH is valid.${NC}"
    exit 1
fi

# 2. Remote Execution via Safe /tmp Handoff
echo -e "${GREEN}⚙️  Executing remote update script via safe /tmp handoff...${NC}"
if ! ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "DEPLOY_TMP=\"/tmp/bharat-crm-deploy-\$\$\"; mkdir -p \$DEPLOY_TMP; cp ${REMOTE_PATH}/scripts/update-live.sh \$DEPLOY_TMP/update-live.sh; cd ${REMOTE_PATH} && bash \$DEPLOY_TMP/update-live.sh; EXIT_CODE=\$?; rm -rf \$DEPLOY_TMP; exit \$EXIT_CODE"; then
    echo -e "${RED}❌ Remote deployment failed. Aborting deployment flow.${NC}"
    exit 1
fi

# 3. Post-Deployment Health Check with Bounded Retry
echo -e "${GREEN}🩺 Running Professional Health Check (Waiting for Node startup)...${NC}"
MAX_ATTEMPTS=12
SLEEP_SECONDS=2
ATTEMPT=1
SUCCESS=0

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.bharatproperties.co/api/health)

    # curl output might be empty if network is down completely, defaulting to 000
    if [ "$HEALTH_STATUS" == "200" ]; then
        echo -e "${GREEN}✅ Deployment verified! API is responding (Status: 200)${NC}"
        SUCCESS=1
        break
    else
        echo -e "${BLUE}ℹ️  Attempt $ATTEMPT/$MAX_ATTEMPTS: API returned status ${HEALTH_STATUS:-000}. Retrying in ${SLEEP_SECONDS}s...${NC}"
        sleep $SLEEP_SECONDS
        ((ATTEMPT++))
    fi
done

if [ $SUCCESS -ne 1 ]; then
    echo -e "${RED}⚠️  Health Check persistently failed after $MAX_ATTEMPTS attempts. Please check PM2 logs on the server.${NC}"
    exit 1
fi

echo -e "${BLUE}🏁 Deployment Flow Finished Successfully.${NC}"
