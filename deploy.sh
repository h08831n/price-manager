#!/bin/bash
set -e

echo "=== Price Collector Automated Deployment ==="
cd "$(dirname "$0")"

# 1. Backup live database before pulling
mkdir -p data_backup
if [ -f data/database.json ]; then
  echo "Backing up live database..."
  cp -f data/database.json data_backup/database.json.bak
fi

# 2. Reset git and pull latest changes cleanly
echo "Fetching latest changes from git..."
git stash --include-untracked 2>/dev/null || true
git fetch origin main
git reset --hard origin/main

# 3. Restore the server's live database
if [ -f data_backup/database.json.bak ]; then
  echo "Restoring live database..."
  cp -f data_backup/database.json.bak data/database.json
fi

# 4. Prevent git from tracking local runtime changes to database.json
git update-index --skip-worktree data/database.json 2>/dev/null || true

# 5. Build and restart docker container
echo "Rebuilding and restarting docker container..."
docker compose down
docker compose up -d --build
docker image prune -f

echo "=== Deployment Completed Successfully! ==="
