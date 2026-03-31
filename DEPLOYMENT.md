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

### Deploy to Databricks

1. **Build the frontend** (optional — `app.yaml` builds on startup, but useful for validation):
   ```bash
   npm install
   npm run build:databricks
   ```

2. **Configure environment variables** in your Databricks workspace (optional):

   - `SOCRATA_APP_TOKEN`: Your Socrata API token
   - `AZURE_ENDPOINT`: LLM API endpoint URL (any OpenAI-compatible endpoint)
   - `AZURE_KEY`: LLM API key
   - `AZURE_MODEL`: Model name (e.g., `gpt5-mini`, `Qwen3-4B-Instruct-2507`, `mistralai/Ministral-3-8B-Instruct-2512`)
   - `HF_API_KEY`: HuggingFace API key
   - `HF_API_URL`: HuggingFace Router URL

   For OAuth support, also set:
   - `SOCRATA_SECRET_TOKEN`: Your Socrata Secret Token (from the same App Token registration)
   - `SOCRATA_OAUTH_REDIRECT_URI`: `https://your-databricks-app-url/api/auth/socrata/callback`

3. **Deploy using Databricks CLI**:
   ```bash
   # Create the app (first time only)
   databricks apps create ai-metadata-tool

   # Sync source code to workspace
   databricks sync . /Workspace/Users/<your-email>/ai-metadata-tool

   # Deploy the app
   databricks apps deploy ai-metadata-tool \
     --source-code-path /Workspace/Users/<your-email>/ai-metadata-tool
   ```

4. **Or deploy via Databricks UI**:
   - Go to your Databricks workspace
   - Navigate to **Compute** > **Apps**
   - Click **Create App**, configure the app name and settings
   - Upload the project files or connect to a Git repository
