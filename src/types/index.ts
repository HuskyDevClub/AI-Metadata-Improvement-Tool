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

export type ComparisonSubMode = 'models' | 'prompts';

export interface PromptVariant {
    label: string;
    systemPrompt: string;
    datasetPrompt: string;
    columnPrompt: string;
}

export interface ScoringCategory {
    key: string;
    label: string;
    description: string;
    minScore: number;
    maxScore: number;
}

export interface ComparisonConfig {
    subMode: ComparisonSubMode;
    models: string[];
    promptModel: string;
    promptVariants: PromptVariant[];
    judgeModel: string;
    judgeSystemPrompt: string;
    judgeEvaluationPrompt: string;
    scoringCategories: ScoringCategory[];
}

export interface JudgeMetrics {
    scores: Record<string, number>;
    reasoning: string;
}

export interface JudgeResult {
    models: JudgeMetrics[];
    winnerIndex: number | null; // null = tie
    winnerReasoning: string;
}

export interface DatasetComparisonResult {
    outputs: string[];
    judgeResult: JudgeResult | null;
    isJudging: boolean;
}

export interface ColumnComparisonResult {
    outputs: string[];
    judgeResult: JudgeResult | null;
    isJudging: boolean;
}

export interface ComparisonTokenUsage {
    models: TokenUsage[];
    judge: TokenUsage;
    total: TokenUsage;
}
