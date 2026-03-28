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

- **CSV Input**: Upload local files or load directly from Socrata Open Data API URLs (with frontend Socrata token
  input)
- **Automatic Column Analysis**: Detects numeric, categorical, and text columns with statistical summaries
- **AI-Powered Descriptions**: Generates dataset overviews and column descriptions using any OpenAI-compatible API
- **Multi-Provider Support**: Works with Azure OpenAI, OpenAI, Ollama, LM Studio, and HuggingFace — with automatic
  local provider discovery
- **N-Model Comparison**: Compare outputs from 2–5 models side-by-side with an AI judge that scores and ranks them
- **Dynamic Scoring Categories**: Customize the scoring criteria (clarity, completeness, accuracy, etc.) used by the
  judge model, with real-time prompt regeneration
- **Streaming Responses**: Real-time streaming of AI-generated content with token usage tracking and cost estimation
- **Human-in-the-Loop Workflow**: Accept, reject, or regenerate suggestions with custom instructions (e.g., "make this
  more concise")
- **Customizable Prompts**: Edit system, dataset, column, and judge prompt templates to align with metadata guidelines
- **Regeneration Options**: Regenerate with different styles (concise, detailed, or custom instructions)
- **JSON Export**: Download results in structured format for integration with data portals
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

# Start the app
python -m backend.main   # Terminal 1: backend
npm run dev              # Terminal 2: frontend
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)

## Usage

1. **Configure LLM Provider**: Enter your API base URL, API key, and model name (or pre-configure via environment
   variables). Local providers like Ollama and LM Studio are auto-discovered.
2. **Load CSV Data**:
   - Upload a local CSV file, or
   - Provide a Socrata API URL (e.g., `https://data.wa.gov/api/v3/views/{dataset-id}/query.csv`)
3. **Analyze**: Click "Analyze CSV" to start the analysis
4. **Review Results**: View the generated dataset description and individual column descriptions with real-time streaming
5. **Iterate**:
   - Edit descriptions inline
   - Regenerate with "More Concise", "More Detailed", or custom instructions
6. **Compare** (optional): Enable comparison mode to evaluate 2–5 models side-by-side with AI judge scoring across
   customizable categories
7. **Export**: Download results as JSON for documentation or data portal integration

## Project Structure

```
├── src/                              # Frontend (React + Vite)
│   ├── components/
│   │   ├── Header/                   # App header with project info
│   │   ├── HowItWorks/              # User instructions
│   │   ├── OpenAIConfig/            # API configuration (endpoint, key, model)
│   │   ├── PromptEditor/            # Customizable prompt templates + scoring category editor
│   │   ├── CsvInput/                # File upload / URL input
│   │   ├── StatusMessage/           # Status and error alerts
│   │   ├── DatasetDescription/      # Dataset overview with edit/regenerate
│   │   ├── ColumnCard/              # Column cards with stats and descriptions
│   │   ├── ExportSection/           # JSON export functionality
│   │   ├── ComparisonMode/          # N-model comparison toggle (2–5 models)
│   │   ├── DatasetComparison/       # Dataset-level comparison results
│   │   ├── ColumnComparison/        # Column-level comparison results
│   │   └── ComparisonResults/       # Judge scoring visualization
│   │       ├── JudgeScoreCard/      # Individual model score card
│   │       ├── MetricBar/           # Score metric bar
│   │       ├── SideBySideView/      # N-column side-by-side layout
│   │       └── RegenerationControls/# Regenerate/edit controls
│   ├── hooks/
│   │   ├── useOpenAI.ts             # OpenAI API integration with streaming
│   │   ├── useComparisonState.ts    # Comparison config & prompt generation
│   │   └── useComparisonGeneration.ts # Parallel generation & judge API calls
│   ├── utils/
│   │   ├── columnAnalyzer.ts        # Column type detection & statistics
│   │   ├── csvParser.ts             # CSV parsing (PapaParse wrapper)
│   │   ├── modelColors.ts           # Model color palette (5 colors)
│   │   ├── pricing.ts              # Token cost estimation
│   │   └── stateHelpers.ts         # State management helpers
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── App.tsx                      # Main application component
│   └── main.tsx                     # Entry point
│
├── backend/                          # Backend (Python/FastAPI)
│   ├── main.py                      # FastAPI application & endpoints
│   ├── models.py                    # Pydantic data models
│   ├── local_providers.py           # Multi-provider discovery & management
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
| [OpenAI](https://platform.openai.com/) | Cloud | Set base URL to `https://api.openai.com/v1` |
| [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) | Cloud | Set base URL to your Azure endpoint |
| [Ollama](https://ollama.com/) | Local | Auto-discovered at `localhost:11434` |
| [LM Studio](https://lmstudio.ai/) | Local | Auto-discovered at `localhost:1234` |
| [HuggingFace](https://huggingface.co/) | Cloud | Requires `HF_API_KEY` in backend `.env` |
| [Groq](https://groq.com/) | Cloud | Set base URL to `https://api.groq.com/openai/v1` |
| [Together AI](https://www.together.ai/) | Cloud | Set base URL to `https://api.together.xyz/v1` |
| [Mistral](https://mistral.ai/) | Cloud | Set base URL to `https://api.mistral.ai/v1` |
| [vLLM](https://github.com/vllm-project/vllm) | Local | Set base URL to your vLLM server (e.g., `http://localhost:8080/v1`) |
| Any OpenAI-compatible server | Either | Set base URL to the server's `/v1` endpoint |

### Provider Resolution Order

When a model name is entered, the backend resolves which provider to use in this order:

1. **Ollama** — if the model is available locally in Ollama
2. **LM Studio** — if the model is loaded in LM Studio
3. **HuggingFace** — if the model exists on HuggingFace (requires API key)
4. **Fallback** — uses the base URL and API key from the UI or environment variables

This means local models are preferred automatically. To use a specific cloud provider, either ensure the model isn't
available locally, or enter the provider's base URL directly in the UI.

### Recommended Starter Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt5-mini` | OpenAI / Azure | Fast and cost-effective |
| `gpt5-nano` | OpenAI / Azure | Lightest OpenAI option |
| `Qwen3-4B-Instruct-2507` | Ollama / HuggingFace | Small, runs well locally |
| `Qwen/Qwen3-8B` | Ollama / HuggingFace | Strong open-weight model |
| `mistralai/Ministral-3-8B-Instruct-2512` | Ollama / HuggingFace | Compact Mistral model |
| `mistralai/Ministral-3-14B-Instruct-2512` | Ollama / HuggingFace | Higher capacity Mistral model |

## Integration with Tyler Technologies Data & Insights

This tool is designed to work with government data portals powered by **Tyler Technologies Data & Insights** platform
(using the Socrata Open Data API), including:

- Washington State ([data.wa.gov](https://data.wa.gov))
- And dozens of other U.S. cities, counties, and states

To fetch data directly from these portals:

1. Configure `SOCRATA_APP_TOKEN` in the backend `.env` file, or enter it directly in the frontend UI
2. Select "Load from URL" in the CSV Data Source section
3. Enter the data portal API endpoint URL

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
