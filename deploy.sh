#!/usr/bin/env bash
# Deploy to Databricks Apps with pre-built frontend.
# Only syncs backend/, app.yaml, and .env.databricks — no frontend source.
#
# Reads DATABRICKS_APP_NAME and DATABRICKS_WORKSPACE_PATH from .env.databricks.
# Both can be overridden via command-line arguments:
#
#   ./deploy.sh                              # uses values from .env.databricks
#   ./deploy.sh my-app /Workspace/Users/...  # override both

set -euo pipefail

# Read defaults from .env.databricks (if present), allow CLI overrides
if [ -f .env.databricks ]; then
  APP_NAME_FROM_ENV=$(grep -E '^DATABRICKS_APP_NAME=' .env.databricks | cut -d= -f2- | tr -d '"' || true)
  WORKSPACE_PATH_FROM_ENV=$(grep -E '^DATABRICKS_WORKSPACE_PATH=' .env.databricks | cut -d= -f2- | tr -d '"' || true)
fi
APP_NAME="${1:-${APP_NAME_FROM_ENV:-}}"
WORKSPACE_PATH="${2:-${WORKSPACE_PATH_FROM_ENV:-}}"

if [ -z "$APP_NAME" ] || [ -z "$WORKSPACE_PATH" ]; then
  echo "ERROR: Missing required configuration."
  echo "Set DATABRICKS_APP_NAME and DATABRICKS_WORKSPACE_PATH in .env.databricks,"
  echo "or pass as arguments:"
  echo "  ./deploy.sh <app-name> <workspace-path>"
  exit 1
fi

echo "==> Building frontend..."
npm run build:databricks

# Stage only the files Databricks needs (no package.json / src / tsconfig)
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

cp app.yaml "$STAGING/"
cp -r backend "$STAGING/"

if [ -f .env.databricks ]; then
  cp .env.databricks "$STAGING/"
else
  echo "WARNING: .env.databricks not found — deploy will use defaults"
fi

echo "==> Syncing to $WORKSPACE_PATH ..."
databricks sync "$STAGING" "$WORKSPACE_PATH" --full

echo "==> Deploying app '$APP_NAME'..."
databricks apps deploy "$APP_NAME" \
  --source-code-path "$WORKSPACE_PATH"

echo "==> Done. Check status with: databricks apps get $APP_NAME"
