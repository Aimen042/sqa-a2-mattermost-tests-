#!/usr/bin/env bash
# Starts (or restarts) the local Mattermost preview server used as the authorized test environment.
# Usage: bash scripts/start-mattermost.sh [image-tag]     e.g.  bash scripts/start-mattermost.sh 10.5
set -euo pipefail
TAG="${1:-${MM_TAG:-latest}}"
NAME=mattermost-preview

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Container $NAME exists - starting it"
  docker start "$NAME" >/dev/null
else
  echo "Creating container $NAME from mattermost/mattermost-preview:$TAG"
  docker run --name "$NAME" -d --publish 8065:8065 "mattermost/mattermost-preview:$TAG" >/dev/null
fi

echo -n "Waiting for Mattermost on http://localhost:8065 "
for i in $(seq 1 90); do
  if curl -fs http://localhost:8065/api/v4/system/ping >/dev/null 2>&1; then
    echo
    VERSION=$(curl -sI http://localhost:8065/api/v4/system/ping | grep -i '^x-version-id' | cut -d' ' -f2 | tr -d '\r')
    echo "Mattermost is up. Version: ${VERSION}"
    exit 0
  fi
  echo -n "."; sleep 2
done
echo; echo "Mattermost did not start in 3 minutes. Check: docker logs $NAME"; exit 1
