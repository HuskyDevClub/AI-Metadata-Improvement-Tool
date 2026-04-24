# Deployment Guide — Databricks Apps via GitHub Actions

This guide walks you through setting up **automatic deployment to your own Databricks workspace** whenever you push to `main`. The included GitHub Actions workflow (`.github/workflows/deploy-databricks.yml`) handles the build and deploy — you just need to fork the repo, configure the required secrets, and push.

## How It Works

On every push to `main`, the workflow:

1. Checks out the code and installs Node.js 24
2. Runs `npm install`
3. Writes `.env.databricks` from the `DATABRICKS_ENV_FILE` secret
4. Installs the Databricks CLI
5. Runs `./deploy.sh`, which builds the frontend, stages the required files (backend code, `app.yaml`, and `.env.databricks`), syncs them to your Databricks workspace, starts the app's compute if it's stopped, and deploys the app

A `concurrency` group prevents two deploys from racing.

## Setup

### 1. Fork the repo

Fork this repository into your own GitHub account or organization. All steps below happen in your fork.

### 2. Create the Databricks app (first time only)

You can do this either through the Databricks web UI or the CLI.

**Option A — Web UI (easiest):**

1. Log into your Databricks workspace
2. In the left sidebar, go to **Compute → Apps** (or **Apps** directly, depending on your workspace)
3. Click **Create app**, choose **Custom app**, and give it a name (e.g. `open-data-tool`)
4. Finish the wizard — you don't need to upload any code yet; the GitHub Actions workflow will deploy it
5. On the app's detail page, copy its public URL (the `*.databricksapps.com` URL) — you'll need it in the next step

**Option B — CLI:**

Install the [Databricks CLI](https://docs.databricks.com/en/dev-tools/cli/install.html) locally and authenticate against your workspace:

```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

Then create the app and grab its URL:

```bash
databricks apps create open-data-tool
databricks apps get open-data-tool
```

Look for the `url` field in the JSON output — that's the public `*.databricksapps.com` URL you'll paste into `FRONTEND_URL` in the next step.

### 3. Prepare your `.env.databricks` content

This file contains every variable your deployment needs. You won't commit it (it's already listed in `.gitignore`) — you'll paste its contents into a GitHub secret.

Clone your fork locally, then start from the template:

```bash
cp .env.databricks.example .env.databricks
```

Open `.env.databricks` in your editor and fill in:

- `DATABRICKS_APP_NAME` — the name you chose in step 2 (e.g. `open-data-tool`).
- `DATABRICKS_WORKSPACE_PATH` — where `deploy.sh` will sync staged files (e.g. `/Workspace/Users/you@example.com/open-data-tool`).
- `FRONTEND_URL` — the public app URL you copied in step 2 (e.g. `https://open-data-tool-xxxx.databricksapps.com`). No trailing slash.
- `SOCRATA_APP_TOKEN` — the "App Token" from your data.wa.gov app (Profile → Developer Settings).
- **LLM (optional but recommended):** set `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` to pre-configure the LLM for everyone using the deployed app. If unset, each user enters their own credentials in the app UI on first use.
- **Socrata OAuth (optional — for "Sign in with data.wa.gov"):** set `SOCRATA_SECRET_TOKEN` to the "Secret Token" from the same data.wa.gov app as `SOCRATA_APP_TOKEN`.

> **Single source of truth:** `FRONTEND_URL` is the only URL you need to set. `deploy.sh` derives `VITE_API_BASE_URL` and `SOCRATA_OAUTH_REDIRECT_URI` from it.

> **Leave the `__FRONTEND_URL__` placeholders alone.** During deploy, `deploy.sh` substitutes them with `FRONTEND_URL` in your local file (so the Vite build picks them up), then restores the placeholders via an exit trap. If you hand-edit `VITE_API_BASE_URL` or `SOCRATA_OAUTH_REDIRECT_URI` to real URLs, your edits will be reverted on the next run — set `FRONTEND_URL` instead.

### 4. Generate a Databricks personal access token

1. Log into your Databricks workspace
2. Click your avatar (top-right) → **User Settings**
3. Go to **Developer → Access tokens → Manage**
4. Click **Generate new token**, set a comment (e.g. `github-actions-ci`) and a lifetime (e.g. 90 days)
5. **Copy the token immediately** — Databricks only shows it once

> **Set a rotation reminder.** PATs expire silently — when they do, CI deploys start failing with auth errors. Put a calendar reminder ~1 week before the lifetime you picked so you can generate a replacement token and update the `DATABRICKS_TOKEN` secret before the old one dies.

### 5. Add the three GitHub repository secrets

In your forked repo on GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**, and add:

| Secret | Value |
|---|---|
| `DATABRICKS_HOST` | Your **workspace** URL — the URL you use to log into Databricks. Format varies by cloud (AWS: `https://dbc-xxxx.cloud.databricks.com`; Azure: `https://adb-xxxx.azuredatabricks.net`). **Not** the app's `*.databricksapps.com` URL — using the app URL produces `Failed to resolve host metadata` errors. |
| `DATABRICKS_TOKEN` | The personal access token from step 4 (`dapi...`). Must be from the same workspace as `DATABRICKS_HOST`. |
| `DATABRICKS_ENV_FILE` | The **entire contents** of your `.env.databricks` from step 3, pasted as-is. GitHub preserves newlines in secret values. |

### 6. Update the Socrata OAuth callback (if using OAuth)

If you use "Sign in with data.wa.gov", update the Callback Prefix on your data.wa.gov app token to match your Databricks URL:

```
https://your-databricks-app-url/api/auth/socrata/
```

Go to **data.wa.gov → Profile → Developer Settings → edit your app token**. If this doesn't match, OAuth fails with `"Redirection URI outside the registered scope"`.

### 7. Push to `main`

Any push to `main` triggers a deploy. You can also run it on demand via **Actions → Deploy to Databricks → Run workflow**.

## Troubleshooting

**`Failed to resolve host metadata ... {}` / token rejection in the workflow log.** `DATABRICKS_HOST` is pointing at your app's `*.databricksapps.com` URL instead of the workspace URL. Set it to the URL you use to log into Databricks (e.g. `https://dbc-xxxx.cloud.databricks.com` on AWS, `https://adb-xxxx.azuredatabricks.net` on Azure).

**`invalid access token` / `401 Unauthorized` from the CLI.** The PAT expired, was revoked, or was created in a different workspace than `DATABRICKS_HOST`. Regenerate from step 4 inside the same workspace and update the `DATABRICKS_TOKEN` secret.

**`app … not found` during `databricks apps deploy`.** You skipped step 2 — the app has to exist before the workflow can deploy to it. Create it once via the UI or `databricks apps create <name>`.

**`Redirection URI outside the registered scope` after clicking "Sign in with data.wa.gov".** The Callback Prefix on your data.wa.gov app token doesn't match `FRONTEND_URL`. Fix it per step 6.

**CORS errors in the browser after a successful deploy.** `FRONTEND_URL` in `.env.databricks` doesn't match the URL you're visiting, so the built frontend baked a different `VITE_API_BASE_URL`. Update `FRONTEND_URL` and redeploy.

**Deploy "succeeds" but the app shows a blank page or 404s on static assets.** The frontend build didn't land in the synced `backend/static/`. Check that `npm run build:databricks` ran cleanly (look for its output in the workflow log) and that `backend/static/index.html` shows up in the workspace path under step 2.

**Deploy fails after the app was auto-stopped (rate limit on deployments).** If Databricks auto-stopped the app's compute since the last successful deploy, `deploy.sh` runs `databricks apps start` to bring it back up — and starting the app itself counts as a deploy of the last-active build. The subsequent `databricks apps deploy` for the new build then hits Databricks' ~20-minute per-app rate limit for deployment operations and fails. Wait ~20 minutes and re-run the workflow (**Actions → Deploy to Databricks → Run workflow**). On the retry the app will already be `ACTIVE`, so the script skips the start and the deploy goes through as a single operation.

**Two deploys running at once / lost updates.** Shouldn't happen — the workflow's `concurrency` group serializes runs. If you're seeing it, check that you haven't disabled the `concurrency` block in `deploy-databricks.yml`.

**Changed a secret but CI still uses the old value.** GitHub only reads secrets at the start of each workflow run. Re-run the workflow (**Actions → Deploy to Databricks → Run workflow**) after updating the secret.
