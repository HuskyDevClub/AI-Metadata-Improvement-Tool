# Deployment Guide — Databricks Apps via Git-Linked Workspace

This guide walks you through setting up **automatic deployment to your own Databricks workspace** whenever you push to `main`. This workflow uses a dedicated `release-databricks` branch to store build artifacts, which is then pulled into a **Databricks Git Folder (Repo)** and deployed to your App.

## How It Works

On every push to `main`, the workflow:

1. Checks out the code and installs Node.js 24.
2. Runs `npm install`.
3. Writes `.env.databricks` from the `DATABRICKS_ENV_FILE` secret.
4. Syncs each line of `.env.databricks` into a Databricks secret scope (`open-data-tool`) and registers app-level resources that reference those secrets.
5. Builds the frontend (`npm run build:databricks`) with `VITE_API_BASE_URL` empty so the bundle uses relative paths.
6. Pushes the artifacts (`backend/`, `app.yaml`, and the built `backend/static/`) to a **`release-databricks`** branch in your GitHub repo via **`deploy.sh`**.
7. Updates the **Git Folder** in your Databricks workspace to the latest commit on that branch.
8. Deploys the Databricks App from that workspace path. At runtime, `app.yaml`'s `valueFrom` entries pull each env var from the registered secret resources.

## Setup (GitHub Actions CI/CD)

This section describes the "Production" workflow which uses GitHub Actions to automate builds and securely map secrets via Databricks Secret Resources.

### 1. Fork the repo

Fork this repository into your own GitHub account or organization.

### 2. Create the Databricks Git Folder (Repo)

1. Log into your Databricks workspace.
2. In the left sidebar, go to **Workspace**.
3. Right-click your user folder (e.g., `/Workspace/Users/you@example.com`) and select **Create → Git folder**.
4. Enter the URL of your forked repository.
5. Set the **Branch** to `release-databricks`. (Note: If the branch doesn't exist yet, you may need to run the GitHub Action once to create it, or create it manually).
6. Copy the path to this folder (e.g., `/Workspace/Users/you@example.com/ai-metadata-improvement-tool`). This is your `DATABRICKS_WORKSPACE_PATH`.

### 3. Create the Databricks App

**Option A — Web UI:**
1. Go to **Compute → Apps**.
2. Click **Create app**, choose **Custom app**, and give it a name (e.g., `open-data-tool`).
3. Finish the wizard. On the app's detail page, copy its public URL.

**Option B — CLI:**
```bash
databricks apps create open-data-tool
```

### 4. Prepare your `.env.databricks` content

Clone your fork locally, start from the template:

```bash
cp .env.databricks.example .env.databricks
```

Open `.env.databricks` and fill in:
- `DATABRICKS_APP_NAME` — your app name.
- `DATABRICKS_WORKSPACE_PATH` — the path from Step 2.
- `FRONTEND_URL` — the public app URL.
- (Other variables like `SOCRATA_APP_TOKEN`, etc.)

### 5. Add GitHub Repository Secrets

Add the following secrets to your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `DATABRICKS_HOST` | Your workspace URL (e.g., `https://dbc-xxxx.cloud.databricks.com`). |
| `DATABRICKS_TOKEN` | A Databricks Personal Access Token. |
| `DATABRICKS_ENV_FILE` | The entire contents of your `.env.databricks`. |

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

**CORS errors in the browser after a successful deploy.** `FRONTEND_URL` in `.env.databricks` doesn't match the URL you're visiting, so the backend rejects the origin. Update `FRONTEND_URL` to the exact Databricks App URL and redeploy.

**Deploy "succeeds" but the app shows a blank page or 404s on static assets.** The frontend build didn't land in the synced `backend/static/`. Check that `npm run build:databricks` ran cleanly (look for its output in the workflow log) and that `backend/static/index.html` shows up in the workspace path under step 2.

**Deploy fails after the app was auto-stopped (rate limit on deployments).** If Databricks auto-stopped the app's compute since the last successful deploy, `deploy.sh` runs `databricks apps start` to bring it back up — and starting the app itself counts as a deploy of the last-active build. The subsequent `databricks apps deploy` for the new build then hits Databricks' ~20-minute per-app rate limit for deployment operations and fails. Wait ~20 minutes and re-run the workflow (**Actions → Deploy to Databricks → Run workflow**). On the retry the app will already be `ACTIVE`, so the script skips the start and the deploy goes through as a single operation.

**Two deploys running at once / lost updates.** Shouldn't happen — the workflow's `concurrency` group serializes runs. If you're seeing it, check that you haven't disabled the `concurrency` block in `deploy-databricks.yml`.

**Changed a secret but CI still uses the old value.** GitHub only reads secrets at the start of each workflow run. Re-run the workflow (**Actions → Deploy to Databricks → Run workflow**) after updating the secret.
