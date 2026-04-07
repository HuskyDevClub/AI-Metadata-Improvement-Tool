# Deployment Guide

## Local Development

### Prerequisites

- Node.js 24+ (for frontend build)
- Python 3.11+ (for backend)
- An LLM provider — any of the following:
  - [Ollama](https://ollama.com/) (local, auto-discovered)
  - [LM Studio](https://lmstudio.ai/) (local, auto-discovered)
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

   # Optional: Pre-fill API configuration in the UI (works with any OpenAI-compatible endpoint)
   VITE_AZURE_ENDPOINT=https://api.openai.com/v1
   VITE_AZURE_KEY=your-api-key
   VITE_AZURE_MODEL=gpt5-mini

   # Optional: Pre-fill comparison mode models
   VITE_COMPARISON_MODEL_A=
   VITE_COMPARISON_MODEL_B=
   VITE_COMPARISON_JUDGE_MODEL=

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
   AZURE_ENDPOINT=https://api.openai.com/v1
   AZURE_KEY=your-api-key
   AZURE_MODEL=gpt5-mini

   # Local providers (optional — auto-discovered if running)
   OLLAMA_HOST=http://localhost:11434
   LM_STUDIO_URL=http://localhost:1234/v1

   # HuggingFace (optional — requires API key)
   HF_API_KEY=
   HF_API_URL=https://router.huggingface.co/v1

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
2. Go to Import page, select "Import from data.wa.gov"
3. Click **Sign in with data.wa.gov**
4. Authorize the app on data.wa.gov
5. You'll be redirected back and see "Signed in as {your name}"

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
2. Installs Node dependencies and builds the frontend (`npm install && npm run build:databricks`)
3. Starts the FastAPI server via uvicorn on port 8000

The built frontend is output to `backend/static/` and served by FastAPI as static files (SPA with catch-all routing).

#### `app.yaml`

```yaml
command:
  - "sh"
  - "-c"
  - |
    pip install -r backend/requirements.txt && \
    npm install && \
    npm run build:databricks && \
    uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Environment variables are loaded from .env.databricks by the backend at runtime.
# No env section needed here.
```

> **Note:** Building on startup means cold starts take longer (npm install + vite build). For faster startups, pre-build locally and commit `backend/static/` — then remove the `npm install && npm run build:databricks &&` portion from the command.

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
AZURE_ENDPOINT=https://your-endpoint.com/v1
AZURE_KEY=your-api-key
AZURE_MODEL=your-model-name

# HuggingFace (optional)
HF_API_KEY=
HF_API_URL=https://router.huggingface.co/v1

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
  local_providers.py      # Multi-provider discovery & management
  requirements.txt
  static/                 # Built frontend (created by npm run build:databricks)
src/                      # Frontend source (needed if building on startup)
  components/             # React components
  contexts/               # React context providers
  hooks/                  # Custom hooks (API, comparison, state)
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

#### 3. Deploy using Databricks CLI

```bash
# Create the app (first time only)
databricks apps create ai-metadata-tool

# Sync source code to workspace
databricks sync . /Workspace/Users/<your-email>/ai-metadata-tool

# Deploy the app
databricks apps deploy ai-metadata-tool \
  --source-code-path /Workspace/Users/<your-email>/ai-metadata-tool

# Optional: use AUTO_SYNC mode to auto-redeploy on workspace file changes
databricks apps deploy ai-metadata-tool \
  --source-code-path /Workspace/Users/<your-email>/ai-metadata-tool \
  --mode AUTO_SYNC
```

#### 4. Or deploy via Databricks UI

- Go to your Databricks workspace
- Navigate to **Compute** > **Apps**
- Click **Create App**, configure the app name and settings
- Upload the project files or connect to a Git repository

### Port Configuration

Databricks Apps routes external traffic to your app container on a platform-assigned port. However, the current `app.yaml` starts uvicorn on `--port 8000`, which works because Databricks Apps forwards to that port by default. If the platform requires a different port (indicated via the `PORT` environment variable), the backend's `main.py` reads `PORT` from the environment and falls back to `8000`. Ensure the `app.yaml` uvicorn `--port` value matches what `main.py` expects, or remove `--port 8000` from `app.yaml` and let the backend use `PORT` dynamically:

```yaml
command:
  - "sh"
  - "-c"
  - |
    pip install -r backend/requirements.txt && \
    uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
```
