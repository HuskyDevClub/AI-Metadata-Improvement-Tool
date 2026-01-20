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

- **CSV Input**: Upload local files or load directly from Socrata Open Data API URLs
- **Automatic Column Analysis**: Detects numeric, categorical, and text columns with statistical summaries
- **AI-Powered Descriptions**: Generates dataset overviews and column descriptions using any OpenAI-compatible API (Azure OpenAI, OpenAI, or other compatible providers)
- **Streaming Responses**: Real-time streaming of AI-generated content with token usage tracking
- **Human-in-the-Loop Workflow**: Accept, reject, or regenerate suggestions with custom instructions (e.g., "make this
  more concise")
- **Customizable Prompts**: Edit AI prompt templates to align with metadata guidelines
- **Regeneration Options**: Regenerate with different styles (concise, detailed, or custom instructions)
- **JSON Export**: Download results in structured format for integration with data portals
- **Secure Backend**: API keys handled server-side for enhanced security

## Getting Started

### Prerequisites

- Node.js 18+
- An OpenAI-compatible API (Azure OpenAI, OpenAI, or other compatible providers)
- A Socrata Open Data API App Token (for fetching data from government data portals)

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure the `.env` file:
   ```env
   # Backend API URL (defaults to http://localhost:3001 if not set)
   VITE_API_BASE_URL=http://localhost:3001

   # Optional: Pre-fill OpenAI configuration in the UI
   VITE_AZURE_ENDPOINT=https://your-resource.openai.azure.com/openai/deployments/your-deployment
   VITE_AZURE_KEY=your-api-key
   VITE_AZURE_MODEL=gpt-4
   ```

3. Configure the backend `.env` file in the `server/` directory:
   ```env
   SOCRATA_APP_TOKEN=your-socrata-app-token

   # Optional: Set these here or provide via frontend UI
   AZURE_ENDPOINT=https://your-resource.openai.azure.com/openai/deployments/your-deployment
   AZURE_KEY=your-api-key
   AZURE_MODEL=gpt-4
   ```

### Development

Start both the frontend and backend:

```bash
# Terminal 1: Start the backend server
cd server
npm run dev

# Terminal 2: Start the frontend
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:3001](http://localhost:3001)

### Production Build

```bash
# Build frontend
npm run build

# Build backend
cd server
npm run build
```

## Usage

1. **Configure OpenAI**: Enter your API base URL, API key, and model name (or pre-configure via environment variables)
2. **Load CSV Data**:
   - Upload a local CSV file, or
   - Provide a Socrata API URL (e.g., `https://data.wa.gov/api/v3/views/{dataset-id}/query.csv`)
3. **Analyze**: Click "Analyze CSV" to start the analysis
4. **Review Results**: View the generated dataset description and individual column descriptions with real-time streaming
5. **Iterate**:
   - Edit descriptions inline
   - Regenerate with "More Concise", "More Detailed", or custom instructions
6. **Export**: Download results as JSON for documentation or data portal integration

## Project Structure

```
├── src/                         # Frontend (React + Vite)
│   ├── components/
│   │   ├── Header/              # App header with project info
│   │   ├── HowItWorks/          # User instructions
│   │   ├── OpenAIConfig/        # OpenAI API configuration
│   │   ├── PromptEditor/        # Customizable prompt templates
│   │   ├── CsvInput/            # File upload / URL input
│   │   ├── StatusMessage/       # Status and error alerts
│   │   ├── DatasetDescription/  # Dataset overview with edit/regenerate
│   │   ├── ColumnCard/          # Column cards with stats and descriptions
│   │   └── ExportSection/       # JSON export functionality
│   ├── hooks/
│   │   └── useOpenAI.ts         # OpenAI API integration with streaming
│   ├── utils/
│   │   ├── columnAnalyzer.ts    # Column type detection & statistics
│   │   └── csvParser.ts         # CSV parsing (PapaParse wrapper)
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # Entry point
│
└── server/                      # Backend (Express)
    └── src/
        ├── index.ts             # Server entry point
        └── routes/
            ├── openai.ts        # OpenAI API proxy with streaming
            └── csv.ts           # CSV fetching from data portal APIs
```

## Technology Stack

| Category      | Technology                                     |
|---------------|------------------------------------------------|
| Frontend      | React 19, TypeScript, Vite                     |
| Backend       | Node.js, Express, TypeScript                   |
| Styling       | CSS                                            |
| CSV Parsing   | PapaParse                                      |
| AI/LLM        | OpenAI-compatible APIs (Azure OpenAI, OpenAI)  |
| Data Platform | Tyler Technologies Data & Insights (Socrata Open Data API) |

## Integration with Tyler Technologies Data & Insights

This tool is designed to work with government data portals powered by **Tyler Technologies Data & Insights** platform
(using the Socrata Open Data API), including:

- Washington State ([data.wa.gov](https://data.wa.gov))
- And dozens of other U.S. cities, counties, and states

To fetch data directly from these portals:

1. Ensure `SOCRATA_APP_TOKEN` is configured in the backend `.env` file
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

This project is open-access and free to use, designed for replication by other government data portals using Tyler
Technologies Data & Insights.

## Acknowledgments

- Washington State Open Data Program
- Cathi Greenwood, Open Data Program Manager
- Kathleen Sullivan, Open Data Literacy Consultant
