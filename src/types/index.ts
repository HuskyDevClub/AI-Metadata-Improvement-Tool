export interface APIConfig {
    baseURL: string;
    apiKey: string;
}

export type GenerationMode = 'default' | 'concise' | 'detailed' | 'suggest';

export interface OpenAIConfig extends APIConfig {
    model: string;
    modelConcise?: string;
    modelDetailed?: string;
    modelSuggest?: string;
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
    // Parallel to `values`: frequency of each (non-null) value. Optional
    // because older payloads / paths may not populate it.
    valueCounts?: number[];
    hasMore: boolean;
}

export interface TextStats {
    count: number;
    uniqueCount: number;
    samples: string[];
}

export interface TemporalStats {
    count: number;
    min: string;
    max: string;
}

export interface GeospatialStats {
    count: number;
    geometryType: string;
}

export interface OpaqueStats {
    count: number;
}

type ColumnType = 'numeric' | 'categorical' | 'text' | 'temporal' | 'geospatial' | 'opaque' | 'empty';

export interface ColumnInfo {
    type: ColumnType;
    originalType?: string;
    stats: NumericStats | CategoricalStats | TextStats | TemporalStats | GeospatialStats | OpaqueStats | Record<string, never>;
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
    columnDisplayNames: Record<string, string>;
    columnFieldNames: Record<string, string>;
}

export interface SocrataLicense {
    id: string;
    name: string;
    termsLink?: string;
}

type StatusType = 'info' | 'success' | 'error' | 'warning';

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

export type FieldRevisionSource = 'original' | 'ai' | 'user';

export interface FieldRevision {
    id: string;
    value: string | string[];
    source: FieldRevisionSource;
    timestamp: number;
}

export type FieldRevisionsMap = Record<string, FieldRevision[]>;
