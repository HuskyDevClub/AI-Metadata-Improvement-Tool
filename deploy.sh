#!/usr/bin/env bash
# Deploy to Databricks Apps using a Git branch for build content.
#
# Workflow:
# 1. Build the frontend locally (in CI).
# 2. Push backend/, app.yaml, and backend/static/ to a 'release-databricks' branch.
# 3. Trigger Databricks to deploy from that branch.
#
# Environment variables are passed via the Databricks CLI --json flag.

set -euo pipefail

DEPLOY_BRANCH="release-databricks"

# Read defaults from .env.databricks (if present)
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
  echo "  ./deploy-git.sh <app-name> <workspace-path>"
  exit 1
fi

# Substitute __FRONTEND_URL__ placeholders before building
if [ -f .env.databricks ]; then
  FRONTEND_URL=$(grep -E '^FRONTEND_URL=' .env.databricks | cut -d= -f2- | tr -d '"' || true)
  if [ -n "$FRONTEND_URL" ]; then
    echo "==> Substituting placeholders with FRONTEND_URL=$FRONTEND_URL"
    TMP_ENV=$(mktemp)
    sed -e "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${FRONTEND_URL}|" \
        -e "s|^SOCRATA_OAUTH_REDIRECT_URI=.*|SOCRATA_OAUTH_REDIRECT_URI=${FRONTEND_URL}/api/auth/socrata/callback|" \
        .env.databricks > "$TMP_ENV"
    mv "$TMP_ENV" .env.databricks
  fi
fi

echo "==> Building frontend..."
npm run build:databricks

# Setup staging for the deployment branch
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

echo "==> Preparing deployment artifacts in $STAGING..."
cp app.yaml "$STAGING/"
cp -r backend "$STAGING/"

# Build the authenticated remote URL from GitHub Actions env vars.
# GITHUB_TOKEN and GITHUB_REPOSITORY ("owner/repo") are auto-provided by Actions.
if [ -z "${GITHUB_TOKEN:-}" ] || [ -z "${GITHUB_REPOSITORY:-}" ]; then
  echo "ERROR: GITHUB_TOKEN and GITHUB_REPOSITORY must be set (provided by GitHub Actions)."
  exit 1
fi
REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# Initialize staging as a git repo and link to remote
cd "$STAGING"
git init -b "$DEPLOY_BRANCH"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git remote add origin "$REMOTE_URL"

# Fetch existing history so we can build on top of it
echo "==> Fetching existing history from '$DEPLOY_BRANCH'..."
if git fetch origin "$DEPLOY_BRANCH" --depth 1 2>/dev/null; then
  git reset --soft origin/"$DEPLOY_BRANCH"
  echo "    Found existing history, building on top of it."
else
  echo "    No existing history found, starting a new one."
fi

# Add artifacts (git add -A ensures deletions of old files are tracked)
git add -A
if git diff --cached --quiet; then
  echo "==> No changes in build artifacts; skipping commit and push."
else
  git commit -m "Deploy to Databricks: $(date -u)"
  echo "==> Pushing to branch '$DEPLOY_BRANCH'..."
  git push -u origin "$DEPLOY_BRANCH"
fi

cd - > /dev/null

# Update the Databricks Git Folder (Repo)
echo "==> Updating Databricks Git Folder at $WORKSPACE_PATH..."
databricks repos update "$WORKSPACE_PATH" --branch "$DEPLOY_BRANCH"

# Ensure the app is RUNNING before deploy (deploy fails on stopped apps).
# `apps start` is idempotent — no-op if already running.
APP_STATE=$(databricks apps get "$APP_NAME" --output json | jq -r '.compute_status.state // "UNKNOWN"')
echo "    Current state: $APP_STATE"
if [ "$APP_STATE" != "ACTIVE" ]; then
  echo "==> App not active — starting..."
  databricks apps start "$APP_NAME"
fi

# Trigger Databricks Deploy. Env vars are loaded by the backend at runtime
# from the .env.databricks file included in the source tree.
echo "==> Triggering Databricks deploy for app '$APP_NAME' from $WORKSPACE_PATH..."
databricks apps deploy "$APP_NAME" \
  --source-code-path "$WORKSPACE_PATH"

echo "==> Done. Check status with: databricks apps get $APP_NAME"
