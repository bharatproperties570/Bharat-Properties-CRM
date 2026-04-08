#!/bin/bash

# Configuration
PORT=4000
SUBDOMAIN="bharat-crm-api-stable"
LOGFILE="localtunnel_monitor.log"

echo "Starting tunnel monitor for $SUBDOMAIN on port $PORT..." | tee -a $LOGFILE

while true; do
    # Check if lt is already running for this subdomain
    # (Actually we'll just start it and let it handle collisions or just kill old ones)
    
    echo "[$(date)] Starting localtunnel..." | tee -a $LOGFILE
    npx localtunnel --port $PORT --subdomain $SUBDOMAIN >> $LOGFILE 2>&1
    
    echo "[$(date)] Localtunnel exited. Restarting in 5 seconds..." | tee -a $LOGFILE
    sleep 5
done
