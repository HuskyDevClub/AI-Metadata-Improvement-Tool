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
    datasetDescription: string;
    columnDescriptions: Record<string, string>;
    datasetValidationResult?: ValidationResult;
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

export interface PairwiseComparison {
    modelAIndex: number;
    modelBIndex: number;
    models: JudgeMetrics[];
    winnerIndex: number | null; // null = tie
    winnerReasoning: string;
    confidenceMetrics?: ConfidenceMetrics;
}

export interface JudgeResult {
    models: JudgeMetrics[];
    winnerIndex: number | null; // null = tie
    winnerReasoning: string;
    confidenceMetrics?: ConfidenceMetrics;
    pairwiseComparisons?: PairwiseComparison[];
}

export interface ConfidenceMetrics {
    judge_certainty: number;
    inter_model_agreement: number;
    agreement_ci_lower: number;
    agreement_ci_upper: number;
    statistical_plausibility: number;
    score_ci_lower: number;
    score_ci_upper: number;
    outlier_ratio: number;
    rule_validation_strength: number;
    likelihood_ratio: number;
    composite_confidence_score: number;
    // Additional advanced statistical metrics
    effect_size_cohens_d: number;
    distribution_skewness: number;
    distribution_kurtosis: number;
    robust_median_score: number;
    robust_trimmed_mean: number;
    ranking_consistency: number;
    performance_stability_cv: number;
    statistical_significance_f: number;
    statistical_significance_p: number;
    category_correlation_avg: number;
    reliability_cronbach_alpha: number;
}

export interface ComparisonResult {
    outputs: string[];
    judgeResult: JudgeResult | null;
    isJudging: boolean;
    validationResults?: ValidationResult[];
}

export type DatasetComparisonResult = ComparisonResult;
export type ColumnComparisonResult = ComparisonResult;

export interface ComparisonTokenUsage {
    models: TokenUsage[];
    judge: TokenUsage;
    total: TokenUsage;
    modelsCost: number[];
    judgeCost: number;
    totalCost: number;
}

// Validation Types

export type ValidationSeverity = 'critical' | 'warning' | 'info';
export type ValidationCategory = 'plain_language' | 'content' | 'format' | 'required';

export interface ValidationIssue {
    rule_id: string;
    category: ValidationCategory;
    severity: ValidationSeverity;
    field?: string;
    message: string;
    suggestion?: string;
    line_number?: number;
}

export interface ValidationResult {
    is_valid: boolean;
    score: number;
    issues: ValidationIssue[];
    total_issues: number;
    critical_count: number;
    warning_count: number;
    info_count: number;
}

export interface DatasetValidationRequest {
    name?: string;
    description?: string;
    columns?: Record<string, any>[];
    data_source?: string;
}
