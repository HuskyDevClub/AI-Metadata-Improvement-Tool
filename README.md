# AI Metadata Improvement Tool

A Generative AI tool designed to assist data publishers in improving the quality, consistency, and accessibility of
metadata on the Washington State Open Data Portal ([data.wa.gov](https://data.wa.gov)).

## Project Overview

This project was developed as part of the **MSIM Capstone** program in partnership with **Washington Technology
Solutions** and the **State of Washington Open Data Program**.

High-value datasets regarding state licensing, transportation, healthcare, and fiscal matters are hosted on the Socrata
platform. However, metadata often falls short of completeness or fails to use "plain language," making it difficult for
the public to utilize these resources. This tool addresses that gap by using AI to generate compliant, descriptive
metadata automatically.

## Goals and Objectives

- **Automate Metadata Generation**: Utilize LLMs to analyze dataset samples and schemas to suggest titles, descriptions,
  and column definitions automatically
- **Enhance Accessibility & Consistency**: Enforce Plain Language standards (expanding acronyms, simplifying jargon) and
  ensure consistency with U.S. open data standards
- **Enable User Iteration**: Create a "Human-in-the-Loop" workflow that lets publishers accept, reject, or regenerate
  suggestions with specific instructions
- **Cost & Performance Optimization**: Generate high-quality descriptions quickly and cost-effectively for sustainable
  public-sector use
- **Platform Independence**: Free, open-access tool deployable without reliance on ongoing subscriptions

## Features

- **Flexible Data Import**: Connect directly to Socrata (data.wa.gov) via dataset ID or upload local CSV files.
- **Smart Column Analysis**: Automatic detection of data types (numeric, categorical, text) with statistical summaries.
- **AI-Powered Metadata**: Real-time generation of titles, descriptions, row labels, and temporal metadata.
- **Universal LLM Support**: Compatible with any OpenAI-compatible API (Azure, Databricks, Ollama, HuggingFace, etc.).
- **Human-in-the-Loop Workflow**: Review, edit, and iterate on AI suggestions with custom instructions and streaming responses.
- **Direct Socrata Export**: Push metadata updates back to the portal via OAuth or API Key authentication.
- **Full Customization**: Modify AI prompts, system personas, and regeneration styles to match specific guidelines.
- **Cost Efficiency**: Built-in token usage tracking and cost estimation for sustainable public-sector use.

## Local Development

### Prerequisites

- **Node.js 24+** (for frontend build)
- **Python 3.12+** (for backend)
- **An LLM provider** — any OpenAI-compatible API (e.g., [Ollama](https://ollama.com/), [LM Studio](https://lmstudio.ai/), [HuggingFace](https://huggingface.co/), or OpenAI)
- **A Socrata App Token** — required for fetching metadata from [data.wa.gov](https://data.wa.gov). See [Developer Settings](https://data.wa.gov/profile/edit/developer_settings).

### Installation

1. **Install frontend dependencies:**
   ```bash
   npm install
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

### Environment Setup

1. **Copy the example environment files:**
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

2. **Configure the backend `.env`** (in the `backend/` directory):
   - Set `SOCRATA_APP_TOKEN` (get one from [data.wa.gov](https://data.wa.gov/profile/edit/developer_settings))
   - (Optional) Set `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` to pre-configure the AI

### Running the App

You can start both the frontend and backend with a single command:

```bash
npm run dev:all
```

Alternatively, you can start them in separate terminals:

**Terminal 1: Backend**

```bash
# Activate the virtual environment if you haven't already
source backend/venv/bin/activate
python -m backend.main
```

**Terminal 2: Frontend**

```bash
npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend:** [http://localhost:8000](http://localhost:8000)

### Socrata OAuth Setup (Sign in with data.wa.gov)

OAuth login allows users to authenticate with their own portal credentials. Socrata requires **HTTPS** for OAuth callbacks, so you must use a tunnel for local development.

1. **Expose your local backend:** Use [ngrok](https://ngrok.com/) or similar to create an HTTPS tunnel to port 8000:
   ```bash
   ngrok http 8000
   ```
2. **Register an App Token:** On [data.wa.gov](https://data.wa.gov/profile/edit/developer_settings), create a new app token and set the **Callback Prefix** to your ngrok URL:
   `https://your-tunnel-id.ngrok-free.app/api/auth/socrata/`
3. **Update `backend/.env`:**
   ```env
   SOCRATA_SECRET_TOKEN=your-secret-token
   SOCRATA_OAUTH_REDIRECT_URI=https://your-tunnel-id.ngrok-free.app/api/auth/socrata/callback
   FRONTEND_URL=http://localhost:5173
   ```

> **Note:** The ngrok URL may change each time you restart the tunnel (free tier). You will need to update the Callback Prefix and `SOCRATA_OAUTH_REDIRECT_URI` accordingly.

## Usage

1. **Configure LLM Provider**: Enter your API base URL, API key, and model name (or pre-configure via environment
   variables).
2. **Import Data**:
   - Enter a Socrata dataset ID (e.g., `6fex-3r7d`) to import from data.wa.gov, or
   - Upload a local CSV file
3. **Review Results**: View the generated dataset title, description, row label, category, tags, and individual column descriptions with
   real-time streaming
4. **Iterate**:
   - Edit descriptions inline
   - Regenerate with "More Concise", "More Detailed", or custom instructions
5. **Export**: Push updated metadata back to data.wa.gov (requires OAuth or API Key authentication)

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Databricks Apps deployment, OAuth setup, and production configuration.

## OpenAI-Compatible API Support

This tool works with **any LLM provider that implements the OpenAI chat completion API**. The backend uses the
[OpenAI Python SDK](https://github.com/openai/openai-python) with a configurable `base_url`, so any service exposing
a compatible `/v1/chat/completions` endpoint will work out of the box.

### Supported Providers

| Provider | Type |
|----------|------|
| [Databricks](https://docs.databricks.com/aws/en/ai-gateway/) | Cloud |
| [OpenAI](https://platform.openai.com/) | Cloud |
| [Microsoft Azure Foundry](https://ai.azure.com/) | Cloud |
| [Ollama](https://ollama.com/) | Local / Cloud |
| [LM Studio](https://lmstudio.ai/) | Local |
| [HuggingFace](https://huggingface.co/) | Cloud |
| Any OpenAI-compatible server | Either |

### Recommended Starter Models

| Model | Notes |
|-------|-------|
| `gpt-5-mini` | Fast and cost-effective |
| `gpt-5-nano` | Lightest OpenAI option |
| `Qwen3-4B-Instruct-2507` | Small, runs well locally |
| `Qwen/Qwen3-8B` | Strong open-weight model |
| `mistralai/Ministral-3-8B-Instruct-2512` | Compact Mistral model |
| `mistralai/Ministral-3-14B-Instruct-2512` | Higher capacity Mistral model |

## Team

| Name       | Role                     |
|------------|--------------------------|
| Wynter Lin | AI & Cloud Computing     |
| Danny Yue  | UI/UX & Machine Learning |
| Felix Zhao | DS & Backend Development |
| Julia Zhu  | BI & Data Visualization  |

## Acknowledgments

- Washington State Open Data Program
- Cathi Greenwood, Open Data Program Manager
- Kathleen Sullivan, Open Data Literacy Consultant

## License

This project is licensed under the [Apache License 2.0](LICENSE). It is open-access and free to use, designed for
replication by other government data portals using Tyler Technologies Data & Insights.
