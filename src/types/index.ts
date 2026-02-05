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
    systemPrompt: string;
    dataset: string;
    column: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export type CsvRow = Record<string, string>;

// Comparison Mode Types

export interface ComparisonConfig {
    modelA: string;
    modelB: string;
    judgeModel: string;
    judgeSystemPrompt: string;
}

export interface JudgeMetrics {
    clarity: number;
    completeness: number;
    accuracy: number;
    conciseness: number;
    plainLanguage: number;
    reasoning: string;
}

export interface JudgeResult {
    modelA: JudgeMetrics;
    modelB: JudgeMetrics;
    winner: 'A' | 'B' | 'tie';
    winnerReasoning: string;
}

export interface DatasetComparisonResult {
    modelAOutput: string;
    modelBOutput: string;
    judgeResult: JudgeResult | null;
    isJudging: boolean;
}

export interface ColumnComparisonResult {
    modelAOutput: string;
    modelBOutput: string;
    judgeResult: JudgeResult | null;
    isJudging: boolean;
}

export interface ComparisonTokenUsage {
    modelA: TokenUsage;
    modelB: TokenUsage;
    judge: TokenUsage;
    total: TokenUsage;
}
