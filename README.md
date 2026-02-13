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
python -m venv venv
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
   
   # Optional: Pre-fill OpenAI configuration in the UI
   VITE_AZURE_ENDPOINT=https://your-resource.openai.azure.com/openai/deployments/your-deployment
   VITE_AZURE_KEY=your-api-key
   VITE_AZURE_MODEL=gpt-4
   
   # Optional: Pre-fill comparison mode models
   VITE_COMPARISON_MODEL_A=
   VITE_COMPARISON_MODEL_B=
   VITE_COMPARISON_JUDGE_MODEL=
   
   # Optional: Pre-fill Socrata API token in the UI
   VITE_SOCRATA_APP_TOKEN=
   ```

3. Configure the backend `.env` file in the `backend/` directory:
   ```env
   SOCRATA_APP_TOKEN=your-socrata-app-token
   
   # Azure OpenAI (optional — can also be set via frontend UI)
   AZURE_ENDPOINT=https://your-resource.openai.azure.com/openai/v1/
   AZURE_KEY=your-api-key
   AZURE_MODEL=gpt-4
   
   # Local providers (optional — auto-discovered if running)
   OLLAMA_HOST=http://localhost:11434
   LM_STUDIO_URL=http://localhost:1234/v1
   
   # HuggingFace (optional — requires API key)
   HF_API_KEY=
   HF_API_URL=https://router.huggingface.co/v1
   
   # Server Configuration
   PORT=8000
   ```

### Development

Start both the frontend and backend:

```bash
# Terminal 1: Start the backend server
python -m backend.main

# Terminal 2: Start the frontend
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)

### Production Build

```bash
# Build frontend for Databricks deployment
npm run build:databricks
```

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
   - `AZURE_ENDPOINT`: Azure OpenAI endpoint URL
   - `AZURE_KEY`: Azure OpenAI API key
   - `AZURE_MODEL`: Azure OpenAI model deployment name
   - `HF_API_KEY`: HuggingFace API key
   - `HF_API_URL`: HuggingFace Router URL

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
