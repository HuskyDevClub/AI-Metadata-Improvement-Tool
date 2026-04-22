export interface APIConfig {
    baseURL: string;
    apiKey: string;
}

export interface OpenAIConfig extends APIConfig {
    model: string;
}

export interface NumericStats {
    count: number;
    min: number;
    max: number;
    mean: number;
    q1: number;
    median: number;
    q3: number;
}

export interface CategoricalStats {
    count: number;
    uniqueCount: number;
    values: string[];
    hasMore: boolean;
}

export interface TextStats {
    count: number;
    uniqueCount: number;
    samples: string[];
}

export type ColumnType = 'numeric' | 'categorical' | 'text' | 'empty';

export interface ColumnInfo {
    type: ColumnType;
    stats: NumericStats | CategoricalStats | TextStats | Record<string, never>;
    nullCount: number;
    totalCount: number;
}

export interface GeneratedResults {
    datasetTitle: string;
    datasetDescription: string;
    rowLabel: string;
    category: string;
    tags: string[];
    licenseId: string;
    attribution: string;
    contactEmail: string;
    periodOfTime: string;
    postingFrequency: string;
    columnDescriptions: Record<string, string>;
}

export interface SocrataLicense {
    id: string;
    name: string;
    termsLink?: string;
}

export type StatusType = 'info' | 'success' | 'error' | 'warning';

export interface Status {
    message: string;
    type: StatusType;
    autoHide?: number;
}

export interface PromptTemplates {
    systemPrompt: string;
    dataset: string;
    column: string;
    rowLabel: string;
    datasetTitle: string;
    category: string;
    tags: string;
    periodOfTime: string;
    datasetSuggestion: string;
    columnSuggestion: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export type CsvRow = Record<string, string>;
