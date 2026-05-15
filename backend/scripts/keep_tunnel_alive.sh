#!/bin/bash

# Configuration
PORT=4000
PRIMARY_SUBDOMAIN="bharat-crm-stable-api"
FALLBACK_SUBDOMAIN="bharat-properties-crm-$(date +%s)"
LOGFILE="localtunnel_monitor.log"

echo "[$(date)] Starting tunnel monitor for port $PORT..." | tee -a $LOGFILE

while true; do
    SUBDOMAIN=$PRIMARY_SUBDOMAIN
    echo "[$(date)] Attempting localtunnel with subdomain: $SUBDOMAIN" | tee -a $LOGFILE
    npx localtunnel --port $PORT --subdomain $SUBDOMAIN >> $LOGFILE 2>&1
    
    echo "[$(date)] Localtunnel ($SUBDOMAIN) exited. Trying fallback in 5 seconds..." | tee -a $LOGFILE
    sleep 5
    
    SUBDOMAIN=$FALLBACK_SUBDOMAIN
    echo "[$(date)] Attempting localtunnel with fallback subdomain: $SUBDOMAIN" | tee -a $LOGFILE
    npx localtunnel --port $PORT --subdomain $SUBDOMAIN >> $LOGFILE 2>&1
    
    echo "[$(date)] Localtunnel ($SUBDOMAIN) exited. Restarting loop in 5 seconds..." | tee -a $LOGFILE
    sleep 5
done
