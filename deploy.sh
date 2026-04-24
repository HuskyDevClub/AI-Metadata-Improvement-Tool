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

# Stage only the files Databricks needs (no package.json / src / tsconfig)
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

cp app.yaml "$STAGING/"

if [ -f .env.databricks ]; then
  # Read FRONTEND_URL as the single source of truth for the base URL
  FRONTEND_URL=$(grep -E '^FRONTEND_URL=' .env.databricks | cut -d= -f2- | tr -d '"' || true)
  if [ -n "$FRONTEND_URL" ]; then
    # Substitute __FRONTEND_URL__ placeholders with the actual FRONTEND_URL value.
    # Write to a temp file, then atomically replace the local file so subsequent
    # runs (which read the same file) still see the placeholder pattern.
    TMP_ENV=$(mktemp)
    sed -e "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${FRONTEND_URL}|" \
        -e "s|^SOCRATA_OAUTH_REDIRECT_URI=.*|SOCRATA_OAUTH_REDIRECT_URI=${FRONTEND_URL}/api/auth/socrata/callback|" \
        .env.databricks > "$TMP_ENV"
    # Keep the substituted copy for the build and staging; restore placeholders in
    # the local file afterwards so subsequent runs still see the placeholder pattern.
    cp "$TMP_ENV" .env.databricks
    # The placeholder-restored version goes back to the local file at the end.
    RESTORE_ENV=$(mktemp)
    sed -e 's|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=__FRONTEND_URL__|' \
        -e 's|^SOCRATA_OAUTH_REDIRECT_URI=.*|SOCRATA_OAUTH_REDIRECT_URI=__FRONTEND_URL__/api/auth/socrata/callback|' \
        "$TMP_ENV" > "$RESTORE_ENV"
    trap 'rm -rf "$STAGING"; [ -f "$RESTORE_ENV" ] && mv "$RESTORE_ENV" .env.databricks' EXIT
    rm -f "$TMP_ENV"
  fi
else
  echo "WARNING: .env.databricks not found — deploy will use defaults"
fi

echo "==> Building frontend..."
npm run build:databricks

# Copy backend AFTER the build so the freshly built backend/static/ is included.
cp -r backend "$STAGING/"

# Stage the (possibly substituted) env file alongside backend/.
if [ -f .env.databricks ]; then
  cp .env.databricks "$STAGING/.env.databricks"
fi

echo "==> Syncing to $WORKSPACE_PATH ..."
databricks sync "$STAGING" "$WORKSPACE_PATH" --full

# `databricks apps deploy` requires the app's compute to be ACTIVE; start it if not.
echo "==> Checking app '$APP_NAME' compute status..."
APP_STATE=$(databricks apps get "$APP_NAME" --output json | jq -r '.compute_status.state // "UNKNOWN"')
echo "    Current state: $APP_STATE"
if [ "$APP_STATE" != "ACTIVE" ]; then
  echo "==> App not active — starting..."
  databricks apps start "$APP_NAME"
fi

echo "==> Deploying app '$APP_NAME'..."
databricks apps deploy "$APP_NAME" \
  --source-code-path "$WORKSPACE_PATH"

echo "==> Done. Check status with: databricks apps get $APP_NAME"
