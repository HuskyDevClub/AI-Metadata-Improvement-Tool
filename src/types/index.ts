export interface OpenAIConfig {
    baseURL: string;
    apiKey: string;
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
}

export interface GeneratedResults {
    datasetDescription: string;
    columnDescriptions: Record<string, string>;
}

export type StatusType = 'info' | 'success' | 'error' | 'warning';

export interface Status {
    message: string;
    type: StatusType;
}

export interface PromptTemplates {
    dataset: string;
    column: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export type CsvRow = Record<string, string>;
