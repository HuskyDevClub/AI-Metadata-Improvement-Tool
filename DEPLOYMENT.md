# Deployment Guide

## Local Development

### Prerequisites

- Node.js 24+ (for frontend build)
- Python 3.11+ (for backend)
- An LLM provider — any of the following:
  - [Ollama](https://ollama.com/) (local)
  - [LM Studio](https://lmstudio.ai/) (local)
  - [HuggingFace](https://huggingface.co/) (API key required)
  - Azure OpenAI or any OpenAI-compatible API
- A Socrata Open Data API App Token (for fetching data from government data portals — can be entered via the UI or
  pre-configured in environment variables)

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
python3 -m venv venv  # On Windows: python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### Environment Setup

1. Copy the example environment files:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

2. Configure the frontend `.env` file (optional for local development):
   ```env
   # Backend API URL (defaults to http://localhost:8000)
   VITE_API_BASE_URL=http://localhost:8000
   ```

3. Configure the backend `.env` file in the `backend/` directory:
   ```env
   # Socrata API token (required for Socrata open data portal access)
   SOCRATA_APP_TOKEN=your-socrata-app-token
   # Socrata OAuth secret (required for "Sign in with data.wa.gov")
   # Must match the Callback Prefix domain registered on data.wa.gov
   SOCRATA_OAUTH_REDIRECT_URI=https://your-ngrok-url.ngrok-free.app/api/auth/socrata/callback

   # Default LLM endpoint (optional — can also be set via frontend UI)
   # Works with any OpenAI-compatible API (OpenAI, Azure, HuggingFace, etc.)
   LLM_ENDPOINT=https://api.openai.com/v1
   LLM_API_KEY=your-api-key
   LLM_MODEL=gpt-5-mini

   # Server Configuration
   PORT=8000
   ```

### Running the App

Start both the frontend and backend:

```bash
# Terminal 1: Start the backend server
python -m backend.main

# Terminal 2: Start the frontend
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)

### Socrata OAuth Setup (Sign in with data.wa.gov)

OAuth login allows users to authenticate with data.wa.gov instead of manually entering API credentials.

#### 1. Register an OAuth App on data.wa.gov

1. Log in to [data.wa.gov](https://data.wa.gov)
2. Go to your profile menu and open **Developer Settings** (or **App Tokens**)
3. Click **Create New App Token**
4. Fill in **Name** and **Description**
5. Set the **Callback Prefix** to your HTTPS callback URL (see below)
6. Save — note the **App Token** (client ID) and **Secret Token** (client secret)

> **Note:** Socrata requires HTTPS for the Callback Prefix. `http://localhost` is not accepted.

#### 2. Set Up HTTPS for Local Development

Use [ngrok](https://ngrok.com/) to expose your local backend over HTTPS:

```bash
# Install ngrok
brew install ngrok  # macOS

# Sign up at https://ngrok.com and add your auth token
ngrok config add-authtoken YOUR_NGROK_TOKEN

# Start the tunnel (while your backend runs on port 8000)
ngrok http 8000
```

ngrok provides a public URL like `https://abc123.ngrok-free.app`.

Set the **Callback Prefix** on data.wa.gov to:
```
https://abc123.ngrok-free.app/api/auth/socrata/
```

#### 3. Configure Environment Variables

Add to `backend/.env`:
```env
SOCRATA_APP_TOKEN=your-app-token
SOCRATA_SECRET_TOKEN=your-secret-token
SOCRATA_OAUTH_REDIRECT_URI=https://abc123.ngrok-free.app/api/auth/socrata/callback
FRONTEND_URL=http://localhost:5173
```

- `SOCRATA_APP_TOKEN`: The App Token from step 1 (also used as the OAuth `client_id`)
- `SOCRATA_SECRET_TOKEN`: The Secret Token from step 1
- `SOCRATA_OAUTH_REDIRECT_URI`: Must match the Callback Prefix domain registered on data.wa.gov
- `FRONTEND_URL`: Where the browser redirects after OAuth (your frontend dev server)

#### 4. Test the Flow

1. Start the backend and frontend
2. Go to the Import page
3. Click **Sign in with data.wa.gov**
4. Authorize the app on data.wa.gov
5. You'll be redirected back and see "Signed in as {your name}"
6. Enter a dataset ID (e.g., `6fex-3r7d`) and click **Import**

> **Tip:** The ngrok URL changes each restart (free tier). You'll need to update the Callback Prefix on data.wa.gov and `SOCRATA_OAUTH_REDIRECT_URI` each time. For a stable URL, consider ngrok's paid plan with fixed domains.

### Production Build

```bash
# Build frontend for Databricks deployment
npm run build:databricks
```

## Databricks Apps Deployment

This project is designed for deployment to **Databricks Apps**.

### How It Works

The deployment is driven by `app.yaml` at the project root. On startup, Databricks Apps runs the command defined there, which:

1. Installs Python dependencies (`pip install -r backend/requirements.txt`)
2. Starts the FastAPI server via uvicorn

The built frontend is output to `backend/static/` and served by FastAPI as static files (SPA with catch-all routing).

#### `app.yaml` (recommended — pre-built frontend)

Pre-build the frontend locally (see [step 1](#1-pre-build-the-frontend-recommended) below) for faster cold starts:

```yaml
command:
  - "sh"
  - "-c"
  - |
    pip install -r backend/requirements.txt && \
    uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}

# Environment variables are loaded from .env.databricks by the backend at runtime.
# No env section needed here.
```

#### `app.yaml` (alternative — build on startup)

If you prefer to build the frontend on each deploy (slower cold starts):

```yaml
command:
  - "sh"
  - "-c"
  - |
    pip install -r backend/requirements.txt && \
    npm install && \
    npm run build:databricks && \
    uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

> **Port note:** `${PORT:-8000}` uses the Databricks platform-assigned port if set, falling back to 8000. The backend's `main.py` also reads `PORT` from the environment.

### Environment Variables (`.env.databricks`)

All environment variables for Databricks deployment are stored in `.env.databricks` at the project root. This single file serves both:

- **Vite (frontend, build time):** `VITE_*` variables are baked into the JavaScript during `npm run build:databricks`. Vite automatically loads `.env.databricks` when using `--mode databricks` (a [Vite convention](https://vite.dev/guide/env-and-mode.html#modes)).
- **Python backend (runtime):** The FastAPI backend loads `.env.databricks` via `load_dotenv()` on startup, making all variables available as `os.getenv()`.

To set up:

```bash
cp .env.databricks.example .env.databricks
# Edit .env.databricks with your actual values
```

Example `.env.databricks`:

```env
# Frontend: set to your Databricks app URL, or leave empty for relative URLs
VITE_API_BASE_URL=

# Required
SOCRATA_APP_TOKEN=your-socrata-app-token

# LLM Configuration (optional - can also be set via app UI)
LLM_ENDPOINT=https://your-endpoint.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=your-model-name

# Socrata OAuth (optional - for "Sign in with data.wa.gov")
SOCRATA_SECRET_TOKEN=your-socrata-secret-token
SOCRATA_OAUTH_REDIRECT_URI=https://your-databricks-app-url/api/auth/socrata/callback
FRONTEND_URL=https://your-databricks-app-url
```

> **Important:** `.env.databricks` contains secrets and is gitignored. Only `.env.databricks.example` (with placeholder values) is committed. Do not commit `.env.databricks` to the repository.

> **CORS note:** If `VITE_API_BASE_URL` is not set in `.env.databricks`, it defaults to `http://localhost:8000` (see `src/utils/config.ts`), which will cause CORS errors on Databricks. Set it to empty or your app URL.

### Project Structure for Deployment

When syncing to Databricks, these files/directories are required:

```
app.yaml                  # Databricks Apps entry point
.env.databricks           # All Databricks env vars (frontend + backend)
backend/                  # Python backend (FastAPI)
  __init__.py
  main.py                 # FastAPI application & endpoints
  models.py               # Pydantic data models
  requirements.txt
  static/                 # Built frontend (created by npm run build:databricks)
src/                      # Frontend source (needed if building on startup)
  components/             # React components
  contexts/               # React context providers
  hooks/                  # Custom hooks (API, state)
  pages/                  # Page components (Import, DataOverview, FieldOverview, etc.)
  utils/                  # Utilities (CSV parsing, column analysis, pricing, etc.)
  types/                  # TypeScript type definitions
package.json
tsconfig*.json
vite.config.ts
index.html
```

These should **not** be synced (excluded by `.gitignore`):

```
node_modules/             # Reinstalled on startup
venv/ / .venv/            # Not needed — Databricks provides Python
dist/                     # Local dev build output
.env                      # Local dev env (secrets)
.env.databricks           # Databricks env (secrets) — only .env.databricks.example is committed
.claude/
__pycache__/
```

### Deploy to Databricks

#### Prerequisites

- **Databricks CLI** — install from https://docs.databricks.com/en/dev-tools/cli/install.html
- **Authentication** — configure a connection profile in `~/.databrickscfg`:
  ```ini
  [DEFAULT]
  host  = https://your-workspace.cloud.databricks.com
  token = dapi...your-personal-access-token
  ```
  Or authenticate via `databricks auth login --host https://your-workspace.cloud.databricks.com`. Use `--profile <name>` on any CLI command to select a non-default profile.

> **Node.js runtime:** Databricks Apps containers include Node.js. If the `app.yaml` startup command runs `npm install && npm run build:databricks`, it will work without additional setup. However, building on startup increases cold-start time — pre-building locally (step 1 below) is recommended.

#### 1. Pre-build the frontend (recommended)

Building locally avoids slow cold starts and catches build errors early:

```bash
npm install
npm run build:databricks
```

This outputs the production frontend to `backend/static/`.

#### 2. Configure environment variables

```bash
cp .env.databricks.example .env.databricks
# Edit .env.databricks with your actual values
```

See the [Environment Variables (`.env.databricks`)](#environment-variables-envdatabricks) section above for the full list of variables.

> **Finding your Databricks app URL:** After creating the app (step 3), run `databricks apps get ai-metadata-tool` — the output includes the app's public URL. Use this URL for `VITE_API_BASE_URL`, `SOCRATA_OAUTH_REDIRECT_URI`, `FRONTEND_URL`, and the **Callback Prefix** in your data.wa.gov app registration.

> **Important — Update Socrata Callback Prefix:** If you previously used a different URL (e.g., ngrok for local dev), you **must** update the Callback Prefix in your data.wa.gov app registration to match the Databricks app URL. Go to data.wa.gov > Profile > Developer Settings > edit your app token, and set the Callback Prefix to `https://your-databricks-app-url/api/auth/socrata/`. If this doesn't match, OAuth will fail with `"Redirection URI outside the registered scope"`.

#### 3. Deploy using `deploy.sh`

The `deploy.sh` script builds the frontend, stages only the required files, and deploys to Databricks in one step. It reads `DATABRICKS_APP_NAME` and `DATABRICKS_WORKSPACE_PATH` from `.env.databricks`:

```bash
# Set these in .env.databricks:
#   DATABRICKS_APP_NAME=open-data-tool
#   DATABRICKS_WORKSPACE_PATH=/Workspace/Users/you@example.com/open-data-tool

# Create the app (first time only)
databricks apps create open-data-tool

# Deploy
./deploy.sh
```

You can also override both values via command-line arguments:

```bash
./deploy.sh my-app /Workspace/Users/you@example.com/my-app
```

The script does the following:
1. Runs `npm run build:databricks` (outputs frontend to `backend/static/`)
2. Stages only `app.yaml`, `backend/`, and `.env.databricks` into a temp directory
3. Syncs the staged files to the workspace path via `databricks sync`
4. Deploys the app via `databricks apps deploy`

#### 4. Or deploy manually with Databricks CLI

```bash
# Sync source code to workspace
databricks sync . /Workspace/Users/<your-email>/ai-metadata-tool

# Deploy the app
databricks apps deploy ai-metadata-tool \
  --source-code-path /Workspace/Users/<your-email>/ai-metadata-tool
```

#### 5. Or deploy via Databricks UI

- Go to your Databricks workspace
- Navigate to **Compute** > **Apps**
- Click **Create App**, configure the app name and settings
- Upload the project files or connect to a Git repository

### Continuous Deployment with GitHub Actions

A GitHub Actions workflow at `.github/workflows/deploy-databricks.yml` runs `deploy.sh` on every push to `main`, so commits merged to main automatically redeploy to Databricks Apps. The workflow preserves the pre-built-frontend flow (fast cold starts) and can also be triggered manually from the **Actions** tab.

#### 1. Get a working local deploy first

Make sure `./deploy.sh` works locally with a valid `.env.databricks`. The CI workflow does exactly what the local script does — if it fails locally, it'll fail in CI.

#### 2. Add GitHub repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add three secrets:

| Secret | Value |
|---|---|
| `DATABRICKS_HOST` | **Workspace** URL, e.g. `https://dbc-xxxxxxxx-xxxx.cloud.databricks.com` or `https://adb-1234567890.12.azuredatabricks.net`. This is the URL you use to log in to the Databricks UI — **not** your app's public `*.databricksapps.com` URL (that URL serves the deployed app and does not respond to CLI auth, so using it produces `Failed to resolve host metadata ... {}` followed by a token-rejection error). |
| `DATABRICKS_TOKEN` | A Databricks personal access token (`dapi...`). Generate in Databricks at **User Settings → Developer → Access tokens**. Must be created from inside the same workspace that `DATABRICKS_HOST` points to. |
| `DATABRICKS_ENV_FILE` | The **entire contents** of your local `.env.databricks`, pasted as-is. GitHub supports multi-line secret values. |

`DATABRICKS_ENV_FILE` contains everything `deploy.sh` and Vite need: `DATABRICKS_APP_NAME`, `DATABRICKS_WORKSPACE_PATH`, `VITE_API_BASE_URL`, `SOCRATA_APP_TOKEN`, plus any LLM/OAuth vars. Keeping it as one secret mirrors how the local file works, so there's nothing extra to maintain.

#### 3. Commit and push the workflow

The workflow file must be on `main` before it can run. After committing:

- Every push to `main` triggers a deploy
- You can also run it on demand via **Actions → Deploy to Databricks → Run workflow**

#### 4. What the workflow does

1. Checkout and install Node.js 24
2. `npm install`
3. Writes `.env.databricks` from the `DATABRICKS_ENV_FILE` secret
4. Installs the Databricks CLI via the official `databricks/setup-cli@main` action
5. Runs `./deploy.sh` with `DATABRICKS_HOST` and `DATABRICKS_TOKEN` exported to the environment — builds the frontend, stages files, syncs to the workspace, and calls `databricks apps deploy`

A `concurrency` group prevents two deploys from racing: if you push twice in quick succession, the second run queues behind the first instead of clobbering it.

#### 5. How `.env.databricks` reaches CI

`DATABRICKS_ENV_FILE` is a GitHub secret name chosen for this project — it's **not** a standard Databricks variable. The workflow reads it and writes the value to disk as `.env.databricks` before `deploy.sh` runs:

```yaml
- name: Write .env.databricks from secret
  env:
    DATABRICKS_ENV_FILE: ${{ secrets.DATABRICKS_ENV_FILE }}
  run: printf '%s' "$DATABRICKS_ENV_FILE" > .env.databricks
```

After this step, the CI runner's working directory has a `.env.databricks` identical to your local one, so both `deploy.sh` (which reads `DATABRICKS_APP_NAME` / `DATABRICKS_WORKSPACE_PATH`) and Vite (which bakes `VITE_*` vars into the build) work unchanged.

**Local `.env.databricks` vs the CI secret:**

- **On the CI runner:** never committed, never needed in git — the workflow re-creates it from `DATABRICKS_ENV_FILE` at the start of every run.
- **On your laptop:** only needed to *author* the secret. Get `./deploy.sh` working locally first so you know the values are correct, then copy the entire file's contents into the `DATABRICKS_ENV_FILE` secret in GitHub. After that, CI is fully self-contained — you can merge to main and deploy without ever touching the local file again.

**Why one big secret instead of many individual ones:**

- Your local file and the CI secret stay identical by construction — no mapping to maintain.
- Adding a new var later (new LLM model, new Socrata config) means editing only the secret — the workflow needs no changes.
- Nothing is ever committed. `.env.databricks` stays gitignored; CI never depends on a file in the repo.

**Creating the `DATABRICKS_ENV_FILE` secret:**

1. Open your local `.env.databricks` and copy its **entire contents** (all lines, including comments).
2. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Set **Name** to `DATABRICKS_ENV_FILE`.
4. Paste the file contents into the **Secret** box. GitHub preserves newlines in secret values, so the multi-line file transfers intact.
5. Click **Add secret**.

#### 6. How `DATABRICKS_HOST` / `DATABRICKS_TOKEN` authenticate CI

Unlike `DATABRICKS_ENV_FILE`, these two are **standard Databricks CLI environment variables** — the CLI reads them automatically when no `~/.databrickscfg` file is present, which is the case on a fresh GitHub Actions runner.

**`DATABRICKS_HOST`** — your Databricks workspace URL, e.g. `https://your-workspace.cloud.databricks.com` or `https://adb-1234567890.12.azuredatabricks.net`. Same URL you see in the browser when logged into Databricks. Tells the CLI *which* workspace to talk to.

**`DATABRICKS_TOKEN`** — a **Personal Access Token (PAT)** proving that the CI runner is authorized to act in that workspace. Format: `dapi1234abcd...`. To generate one:

1. Log into Databricks
2. Click your avatar (top-right) → **User Settings**
3. Go to **Developer** → **Access tokens** → **Manage**
4. Click **Generate new token**, set a comment (e.g. `github-actions-ci`) and a lifetime (e.g. 90 days)
5. **Copy the token immediately** — Databricks only shows it once. Paste it into the `DATABRICKS_TOKEN` GitHub secret.

**How the workflow uses them:**

```yaml
- name: Build and deploy
  env:
    DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
    DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
  run: ./deploy.sh
```

When `deploy.sh` calls `databricks sync` and `databricks apps deploy`, the CLI picks up these env vars automatically and authenticates — no `.databrickscfg` file needed.

**Security notes:**

- **PATs expire.** Whatever lifetime you pick, set a calendar reminder to rotate the token before it expires, otherwise CI deploys will start failing.
- **Treat the token like a password.** Anyone with it can do anything *you* can do in the workspace. If it ever leaks, revoke it immediately at **User Settings → Developer → Access tokens**.
- **For production**, consider using an **OAuth machine-to-machine (M2M) service principal** instead of a personal PAT — it's not tied to a specific user account, so deploys survive people leaving the team. PATs are fine for getting started.

#### Rotating secrets

- **Databricks token** (common, since PATs expire): update `DATABRICKS_TOKEN` in GitHub.
- **Env file changes** (app URL, Socrata tokens, LLM config): update `DATABRICKS_ENV_FILE` in GitHub. The workflow writes a fresh copy at the start of every run, so nothing needs to be re-committed.

