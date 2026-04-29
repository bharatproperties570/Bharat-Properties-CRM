#!/bin/bash
# CRM Backend & Tunnel Launcher

# 1. Clear old logs
echo "" > backend/startup.log
echo "" > backend/tunnel_startup.log

# 2. Kill any existing backend or tunnel on port 4000
echo "Stopping existing services..."
lsof -ti :4000 | xargs kill -9 2>/dev/null
killall lt 2>/dev/null

# 3. Start Backend
echo "Starting Backend..."
cd backend
npm start > startup.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID"

# 4. Wait for Backend to be ready
echo "Waiting for backend to listen on port 4000..."
for i in {1..10}; do
    if lsof -i :4000 > /dev/null; then
        echo "Backend is listening!"
        break
    fi
    sleep 1
done

# 5. Start Tunnel
echo "Starting Tunnel..."
SUBDOMAINS=("bharat-crm-stable-api" "bharat-properties-api" "crm-bharat-api" "bharat-crm-live")
MAX_ATTEMPTS=${#SUBDOMAINS[@]}
SUCCESS=0

for (( i=0; i<$MAX_ATTEMPTS; i++ )); do
    SUBDOMAIN=${SUBDOMAINS[$i]}
    echo "Attempting to claim $SUBDOMAIN..."
    npx localtunnel --port 4000 --subdomain $SUBDOMAIN > tunnel_startup.log 2>&1 &
    TUNNEL_PID=$!
    sleep 7
    if grep -q "$SUBDOMAIN" tunnel_startup.log; then
        echo "Successfully claimed $SUBDOMAIN!"
        SUCCESS=1
        break
    else
        echo "Failed to claim $SUBDOMAIN (Got random URL instead)."
        kill -9 $TUNNEL_PID 2>/dev/null
        sleep 3
    fi
done

if [ $SUCCESS -eq 0 ]; then
    echo "Using random URL as fallback..."
    npx localtunnel --port 4000 > tunnel_startup.log 2>&1 &
fi

# 6. Final check
echo "Current Tunnel URL:"
cat tunnel_startup.log
