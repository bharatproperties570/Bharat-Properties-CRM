#!/bin/bash
GIT_SHA=$(git rev-parse HEAD)
# Use the same Docker container config as build-artifact.sh to get true metadata
DOCKER_CMD="docker run --rm --platform linux/amd64 node:20.20-bookworm-slim"
NODE_VER=$($DOCKER_CMD node -v | tr -d '\r')
ARCH=$($DOCKER_CMD node -p 'process.arch' | tr -d '\r')
PLATFORM=$($DOCKER_CMD node -p 'process.platform' | tr -d '\r')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<JSON > release-manifest.json
{
  "application": "bharat-properties-crm",
  "gitSha": "${GIT_SHA}",
  "buildId": "docker-linux-amd64",
  "buildTimestamp": "${TIMESTAMP}",
  "version": "1.0.0",
  "frontend": "dist",
  "backend": "src",
  "nodeVersion": "${NODE_VER}",
  "architecture": "${ARCH}",
  "platform": "${PLATFORM}"
}
JSON
echo "Manifest generated for ${GIT_SHA} (Node ${NODE_VER}, ${PLATFORM}/${ARCH})"
