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

- **Socrata Import**: Import datasets directly from data.wa.gov by dataset ID, with automatic metadata and statistics
  retrieval via the Socrata Open Data API
- **CSV Upload**: Upload local CSV files or drag-and-drop for quick analysis
- **Automatic Column Analysis**: Detects numeric, categorical, and text columns with statistical summaries
- **AI-Powered Descriptions**: Generates dataset descriptions, column descriptions, row labels, and notes using any
  OpenAI-compatible API
- **Multi-Provider Support**: Works with Databricks AI Gateway, Azure OpenAI, OpenAI, Ollama, LM Studio, and
  HuggingFace — configure any OpenAI-compatible endpoint
- **Streaming Responses**: Real-time streaming of AI-generated content with token usage tracking and cost estimation
- **Human-in-the-Loop Workflow**: Accept, reject, or regenerate suggestions with custom instructions (e.g., "make this
  more concise")
- **Customizable Prompts**: Edit system, dataset, column, row label, and notes prompt templates to align with metadata
  guidelines
- **Regeneration Options**: Regenerate with different styles (concise, detailed, or custom instructions)
- **Socrata Export**: Push updated metadata (descriptions, row labels, notes, column descriptions) back to data.wa.gov
  with OAuth or API Key authentication
- **Sign in with data.wa.gov**: OAuth integration for seamless authentication with the Socrata platform
- **Secure Backend**: API keys handled server-side for enhanced security

## Getting Started

See [DEPLOYMENT.md](DEPLOYMENT.md) for full installation, environment setup, OAuth configuration, and deployment instructions.

**Quick start:**

```bash
# Install dependencies
npm install
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Start the app (activate the venv first)
source backend/venv/bin/activate
python -m backend.main   # Terminal 1: backend
npm run dev              # Terminal 2: frontend
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)

## Usage

1. **Configure LLM Provider**: Enter your API base URL, API key, and model name (or pre-configure via environment
   variables).
2. **Import Data**:
   - Enter a Socrata dataset ID (e.g., `6fex-3r7d`) to import from data.wa.gov, or
   - Upload a local CSV file
3. **Review Results**: View the generated dataset description, row label, notes, and individual column descriptions with
   real-time streaming
4. **Iterate**:
   - Edit descriptions inline
   - Regenerate with "More Concise", "More Detailed", or custom instructions
5. **Export**: Push updated metadata back to data.wa.gov (requires OAuth or API Key authentication)

## Project Structure

```
├── src/                              # Frontend (React + Vite)
│   ├── components/
│   │   ├── ColumnCard/              # Column cards with stats and descriptions
│   │   ├── DatasetDescription/      # Dataset overview with edit/regenerate
│   │   ├── EditableDescription/     # Inline-editable text fields
│   │   ├── FloatingActions/         # Floating action buttons
│   │   ├── Layout/                  # App shell layout (header, nav, footer)
│   │   ├── OpenAIConfig/            # API configuration (endpoint, key, model)
│   │   ├── PromptEditor/            # Customizable prompt templates
│   │   └── StatusMessage/           # Status and error alerts
│   ├── contexts/
│   │   └── AppContext.tsx           # Global application context
│   ├── hooks/
│   │   └── useOpenAI.ts             # OpenAI API integration with streaming
│   ├── pages/
│   │   ├── ImportPage.tsx           # Socrata dataset ID import / CSV upload
│   │   ├── DataOverviewPage.tsx     # Dataset-level overview and description
│   │   ├── FieldOverviewPage.tsx    # Column-level details and editing
│   │   └── SettingsPage.tsx         # Prompt and API settings
│   ├── utils/
│   │   ├── api.ts                   # Backend API client
│   │   ├── columnAnalyzer.ts        # Column type detection & statistics
│   │   ├── config.ts               # App configuration constants
│   │   ├── csvParser.ts             # CSV parsing (PapaParse wrapper)
│   │   ├── pricing.ts              # Token cost estimation
│   │   ├── prompts.ts              # Prompt template defaults
│   │   └── stateHelpers.ts         # State management helpers
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── App.tsx                      # Main application component
│   └── main.tsx                     # Entry point
│
├── backend/                          # Backend (Python/FastAPI)
│   ├── __init__.py                  # Package init (required for python -m backend.main)
│   ├── main.py                      # FastAPI application & endpoints
│   ├── models.py                    # Pydantic data models
│   ├── requirements.txt             # Python dependencies
│   └── static/                      # Built frontend (generated by build:databricks)
│
└── app.yaml                          # Databricks Apps configuration
```

## Technology Stack

| Category      | Technology                                                        |
|---------------|-------------------------------------------------------------------|
| Frontend      | React 19, TypeScript 5.9, Vite 7                                  |
| Backend       | Python, FastAPI, Uvicorn                                          |
| Styling       | CSS                                                               |
| CSV Parsing   | PapaParse                                                         |
| AI/LLM        | OpenAI SDK — Ollama, LM Studio, HuggingFace, Azure OpenAI, OpenAI |
| Data Platform | Tyler Technologies Data & Insights (Socrata Open Data API)        |

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Databricks Apps deployment, OAuth setup, and production configuration.

## OpenAI-Compatible API Support

This tool works with **any LLM provider that implements the OpenAI chat completion API**. The backend uses the
[OpenAI Python SDK](https://github.com/openai/openai-python) with a configurable `base_url`, so any service exposing
a compatible `/v1/chat/completions` endpoint will work out of the box.

### Supported Providers

| Provider | Type | Setup |
|----------|------|-------|
| [Databricks](https://docs.databricks.com/aws/en/ai-gateway/) | Cloud | Set base URL to your AI Gateway endpoint (e.g., `https://<workspace>.cloud.databricks.com/mlflow/v1`) |
| [OpenAI](https://platform.openai.com/) | Cloud | Set base URL to `https://api.openai.com/v1` |
| [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) | Cloud | Set base URL to your Azure endpoint |
| [Ollama](https://ollama.com/) | Local | Set base URL to `http://localhost:11434/v1` |
| [LM Studio](https://lmstudio.ai/) | Local | Set base URL to `http://localhost:1234/v1` |
| [HuggingFace](https://huggingface.co/) | Cloud | Set base URL to `https://router.huggingface.co/v1` |
| Any OpenAI-compatible server | Either | Set base URL to the server's `/v1` endpoint |

### Recommended Starter Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt5-mini` | OpenAI / Azure | Fast and cost-effective (model names may change — check your provider's docs) |
| `gpt5-nano` | OpenAI / Azure | Lightest OpenAI option (model names may change — check your provider's docs) |
| `Qwen3-4B-Instruct-2507` | Ollama / HuggingFace | Small, runs well locally |
| `Qwen/Qwen3-8B` | Ollama / HuggingFace | Strong open-weight model |
| `mistralai/Ministral-3-8B-Instruct-2512` | Ollama / HuggingFace | Compact Mistral model |
| `mistralai/Ministral-3-14B-Instruct-2512` | Ollama / HuggingFace | Higher capacity Mistral model |

## Integration with Tyler Technologies Data & Insights

This tool is designed to work with government data portals powered by **Tyler Technologies Data & Insights** platform
(using the Socrata Open Data API), including:

- Washington State ([data.wa.gov](https://data.wa.gov))
- And dozens of other U.S. cities, counties, and states

To import data from these portals:

1. Configure `SOCRATA_APP_TOKEN` in the backend `.env` file
2. Enter a dataset ID on the Import page (e.g., `6fex-3r7d` from a data.wa.gov URL)
3. Optionally authenticate with OAuth or API Key to access private datasets and push metadata updates

## Project Sponsor

**Washington Technology Solutions**
State of Washington Open Data Program

## Team

| Name       | Role                     |
|------------|--------------------------|
| Wynter Lin | AI & Cloud Computing     |
| Danny Yue  | UI/UX & Machine Learning |
| Felix Zhao | DS & Backend Development |
| Julia Zhu  | BI & Data Visualization  |

## License

This project is licensed under the [Apache License 2.0](LICENSE). It is open-access and free to use, designed for
replication by other government data portals using Tyler Technologies Data & Insights.

## Acknowledgments

- Washington State Open Data Program
- Cathi Greenwood, Open Data Program Manager
- Kathleen Sullivan, Open Data Literacy Consultant
