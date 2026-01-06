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

- **CSV Input**: Upload local files or load directly from Socrata API URLs
- **Automatic Column Analysis**: Detects numeric, categorical, and text columns with statistical summaries
- **AI-Powered Descriptions**: Generates dataset overviews and column descriptions using Azure OpenAI
- **Human-in-the-Loop Workflow**: Accept, reject, or regenerate suggestions with custom instructions (e.g., "make this
  more concise")
- **Customizable Prompts**: Edit AI prompt templates to align with metadata guidelines
- **Regeneration Options**: Regenerate with different styles (concise, detailed, or custom instructions)
- **JSON Export**: Download results in structured format for integration with Socrata

## Getting Started

### Prerequisites

- Node.js 18+
- An Azure OpenAI resource with a deployed model (e.g., GPT-4, GPT-3.5-turbo)

### Installation

```bash
cd csv-analyzer
npm install
```

### Development

```bash
npm run dev
```

Opens the app at [http://localhost:5173](http://localhost:5173)

### Production Build

```bash
npm run build
```

## Usage

1. **Configure Azure OpenAI**: Enter your Azure OpenAI endpoint, API key, and deployment name
2. **Load CSV Data**:

- Upload a local CSV file, or
- Provide a Socrata API URL (e.g., `https://data.wa.gov/api/v3/views/{dataset-id}/query.csv`)

3. **Analyze**: Click "Analyze CSV" to start the analysis
4. **Review Results**: View the generated dataset description and individual column descriptions
5. **Iterate**:

- Edit descriptions inline with the ✏️ button
- Regenerate with "More Concise", "More Detailed", or custom instructions

6. **Export**: Download results as JSON for documentation or Socrata integration

## Project Structure

```
src/
├── components/
│   ├── Header/              # App header with project info
│   ├── HowItWorks/          # User instructions
│   ├── AzureConfig/         # Azure OpenAI configuration
│   ├── PromptEditor/        # Customizable prompt templates
│   ├── CsvInput/            # File upload / URL input
│   ├── StatusMessage/       # Status and error alerts
│   ├── DatasetDescription/  # Dataset overview with edit/regenerate
│   ├── ColumnCard/          # Column cards with stats and descriptions
│   └── ExportSection/       # JSON export functionality
├── hooks/
│   └── useAzureOpenAI.ts    # Azure OpenAI API integration
├── utils/
│   ├── columnAnalyzer.ts    # Column type detection & statistics
│   └── csvParser.ts         # CSV parsing (PapaParse wrapper)
├── types/
│   └── index.ts             # TypeScript type definitions
├── styles/
│   └── global.css           # Global styles
├── App.tsx                  # Main application component
└── main.tsx                 # Entry point
```

## Technology Stack

| Category      | Technology                       |
|---------------|----------------------------------|
| Frontend      | React 18, TypeScript, Vite       |
| Styling       | CSS Modules                      |
| CSV Parsing   | PapaParse                        |
| AI/LLM        | Microsoft Azure OpenAI           |
| Data Platform | Tyler Technologies / Socrata API |

## Integration with Socrata

This tool is designed to work with government data portals running on the **Tyler Technologies Socrata platform**,
including:

- Washington State ([data.wa.gov](https://data.wa.gov))
- And dozens of other U.S. cities, counties, and states

To fetch data directly from Socrata:

1. Select "Load from URL" in the CSV Data Source section
2. Enter the Socrata API endpoint URL
3. Provide your App Token (if required)

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

This project is open-access and free to use, designed for replication by other government data portals using the Socrata
platform.

## Acknowledgments

- Washington State Open Data Program
- Cathi Greenwood, Open Data Program Manager
- Kathleen Sullivan, Open Data Literacy Consultant
