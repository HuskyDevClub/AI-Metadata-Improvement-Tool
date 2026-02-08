import { useCallback, useState } from 'react';
import type {
    ColumnComparisonResult,
    ComparisonConfig,
    ComparisonTokenUsage,
    DatasetComparisonResult,
    ScoringCategory,
    TokenUsage,
} from '../types';

const EMPTY_TOKEN_USAGE: TokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0};

function createInitialDatasetComparison(modelCount: number): DatasetComparisonResult {
    return {
        outputs: Array(modelCount).fill(''),
        judgeResult: null,
        isJudging: false,
    };
}

function createInitialTokenUsage(modelCount: number): ComparisonTokenUsage {
    return {
        models: Array.from({length: modelCount}, () => ({...EMPTY_TOKEN_USAGE})),
        judge: {...EMPTY_TOKEN_USAGE},
        total: {...EMPTY_TOKEN_USAGE},
    };
}

export const DEFAULT_SCORING_CATEGORIES: ScoringCategory[] = [
    {
        key: 'clarity',
        label: 'Clarity',
        description: 'How easy is it to understand? Uses plain language, avoids jargon.',
        minScore: 1,
        maxScore: 10
    },
    {
        key: 'completeness',
        label: 'Completeness',
        description: 'Does it cover the content, purpose, and potential use cases?',
        minScore: 1,
        maxScore: 10
    },
    {
        key: 'accuracy',
        label: 'Accuracy',
        description: 'Does it correctly describe what the data contains?',
        minScore: 1,
        maxScore: 10
    },
    {
        key: 'conciseness',
        label: 'Conciseness',
        description: 'Is it brief while still being informative? No unnecessary padding.',
        minScore: 1,
        maxScore: 10
    },
    {
        key: 'plainLanguage',
        label: 'Plain Language',
        description: 'Uses active voice, simple words, short sentences.',
        minScore: 1,
        maxScore: 10
    },
];

export function generateJudgeSystemPrompt(categories: ScoringCategory[], modelCount: number): string {
    const categoryLines = categories
        .map((cat, i) => `${i + 1}. ${cat.label.toUpperCase()} (${cat.minScore}-${cat.maxScore}) - ${cat.description}`)
        .join('\n');

    const scoreFields = categories
        .map(cat => `        "${cat.key}": <${cat.minScore}-${cat.maxScore}>`)
        .join(',\n');

    // Build model JSON blocks
    const modelBlocks = Array.from({length: modelCount}, (_, i) => {
        const key = `model${i + 1}`;
        return `    "${key}": {\n${scoreFields},\n        "reasoning": "<brief explanation for Model ${i + 1} scores>"\n    }`;
    }).join(',\n');

    // Build winner enum description
    const winnerOptions = Array.from({length: modelCount}, (_, i) => String(i + 1)).join(', ');

    return `You are an expert evaluator assessing metadata descriptions for government open data.
You will compare ${modelCount} candidate descriptions and score each on the following metrics:

${categoryLines}

You must respond with valid JSON in exactly this format:
{
${modelBlocks},
    "winner": "<${winnerOptions}, or tie>",
    "winnerReasoning": "<1-2 sentence explanation of why this candidate is better or why it's a tie>"
}`;
}

export function generateDefaultEvaluationPrompt(modelCount: number): string {
    const candidateBlocks = Array.from({length: modelCount}, (_, i) => {
        return `CANDIDATE ${i + 1}:\n{candidate${i}}`;
    }).join('\n\n');

    return `CONTEXT:
{context}

${candidateBlocks}

Evaluate all candidates and respond with the JSON structure as specified.`;
}

function getInitialModels(): string[] {
    const envModels = import.meta.env.VITE_COMPARISON_MODELS;
    if (envModels) {
        const models = envModels.split(',').map((m: string) => m.trim()).filter(Boolean);
        if (models.length >= 2) return models;
    }
    // Fallback to legacy env vars
    const modelA = import.meta.env.VITE_COMPARISON_MODEL_A || '';
    const modelB = import.meta.env.VITE_COMPARISON_MODEL_B || '';
    return [modelA, modelB];
}

const INITIAL_MODELS = getInitialModels();
const INITIAL_MODEL_COUNT = INITIAL_MODELS.length;

export function useComparisonState() {
    // Comparison Mode State
    const [comparisonEnabled, setComparisonEnabled] = useState(false);
    const [comparisonConfig, setComparisonConfig] = useState<ComparisonConfig>({
        models: INITIAL_MODELS,
        judgeModel: import.meta.env.VITE_COMPARISON_JUDGE_MODEL || '',
        judgeSystemPrompt: import.meta.env.VITE_COMPARISON_JUDGE_SYSTEM_PROMPT || generateJudgeSystemPrompt(DEFAULT_SCORING_CATEGORIES, INITIAL_MODEL_COUNT),
        judgeEvaluationPrompt: import.meta.env.VITE_COMPARISON_JUDGE_EVALUATION_PROMPT || generateDefaultEvaluationPrompt(INITIAL_MODEL_COUNT),
        scoringCategories: DEFAULT_SCORING_CATEGORIES,
    });
    const [datasetComparison, setDatasetComparison] = useState<DatasetComparisonResult>(
        createInitialDatasetComparison(INITIAL_MODEL_COUNT)
    );
    const [columnComparisons, setColumnComparisons] = useState<Record<string, ColumnComparisonResult>>({});
    const [comparisonTokenUsage, setComparisonTokenUsage] = useState<ComparisonTokenUsage>(
        createInitialTokenUsage(INITIAL_MODEL_COUNT)
    );

    // Generation states - indexed by model
    const [generatingDataset, setGeneratingDataset] = useState<Set<number>>(new Set());
    const [generatingColumns, setGeneratingColumns] = useState<Map<number, Set<string>>>(new Map());

    // Regeneration states - indexed by model
    const [regeneratingDataset, setRegeneratingDataset] = useState<Set<number>>(new Set());
    const [regeneratingColumns, setRegeneratingColumns] = useState<Map<number, Set<string>>>(new Map());

    // Re-judging states
    const [reJudgingDataset, setReJudgingDataset] = useState(false);
    const [reJudgingColumns, setReJudgingColumns] = useState<Set<string>>(new Set());

    const modelCount = comparisonConfig.models.length;

    const resetComparisonState = useCallback(() => {
        setDatasetComparison(createInitialDatasetComparison(modelCount));
        setColumnComparisons({});
        setComparisonTokenUsage(createInitialTokenUsage(modelCount));
        setGeneratingDataset(new Set());
        setGeneratingColumns(new Map());
        setRegeneratingDataset(new Set());
        setRegeneratingColumns(new Map());
    }, [modelCount]);

    const addComparisonTokenUsage = useCallback((
        target: { type: 'model'; index: number } | { type: 'judge' },
        usage: TokenUsage
    ) => {
        setComparisonTokenUsage((prev) => {
            const newUsage = {...prev, models: [...prev.models]};
            if (target.type === 'model') {
                const i = target.index;
                newUsage.models[i] = {
                    promptTokens: prev.models[i].promptTokens + usage.promptTokens,
                    completionTokens: prev.models[i].completionTokens + usage.completionTokens,
                    totalTokens: prev.models[i].totalTokens + usage.totalTokens,
                };
            } else {
                newUsage.judge = {
                    promptTokens: prev.judge.promptTokens + usage.promptTokens,
                    completionTokens: prev.judge.completionTokens + usage.completionTokens,
                    totalTokens: prev.judge.totalTokens + usage.totalTokens,
                };
            }
            newUsage.total = {
                promptTokens: prev.total.promptTokens + usage.promptTokens,
                completionTokens: prev.total.completionTokens + usage.completionTokens,
                totalTokens: prev.total.totalTokens + usage.totalTokens,
            };
            return newUsage;
        });
    }, []);

    // Helper to set generating dataset for a model index
    const setGeneratingDatasetModel = useCallback((index: number, isGenerating: boolean) => {
        setGeneratingDataset((prev) => {
            const next = new Set(prev);
            if (isGenerating) {
                next.add(index);
            } else {
                next.delete(index);
            }
            return next;
        });
    }, []);

    // Helper to set generating column for a model index
    const setGeneratingColumnModel = useCallback((index: number, columnName: string, isGenerating: boolean) => {
        setGeneratingColumns((prev) => {
            const next = new Map(prev);
            const cols = new Set(prev.get(index) || []);
            if (isGenerating) {
                cols.add(columnName);
            } else {
                cols.delete(columnName);
            }
            next.set(index, cols);
            return next;
        });
    }, []);

    // Helper to set regenerating dataset for a model index
    const setRegeneratingDatasetModel = useCallback((index: number, isRegenerating: boolean) => {
        setRegeneratingDataset((prev) => {
            const next = new Set(prev);
            if (isRegenerating) {
                next.add(index);
            } else {
                next.delete(index);
            }
            return next;
        });
    }, []);

    // Helper to set regenerating column for a model index
    const setRegeneratingColumnModel = useCallback((index: number, columnName: string, isRegenerating: boolean) => {
        setRegeneratingColumns((prev) => {
            const next = new Map(prev);
            const cols = new Set(prev.get(index) || []);
            if (isRegenerating) {
                cols.add(columnName);
            } else {
                cols.delete(columnName);
            }
            next.set(index, cols);
            return next;
        });
    }, []);

    // Helper to set re-judging column
    const setReJudgingColumn = useCallback((columnName: string, isReJudging: boolean) => {
        setReJudgingColumns((prev) => {
            const next = new Set(prev);
            if (isReJudging) {
                next.add(columnName);
            } else {
                next.delete(columnName);
            }
            return next;
        });
    }, []);

    // Check if any model is generating
    const isAnyModelGenerating = generatingDataset.size > 0 ||
        Array.from(generatingColumns.values()).some(s => s.size > 0) ||
        regeneratingDataset.size > 0 ||
        Array.from(regeneratingColumns.values()).some(s => s.size > 0);

    return {
        // State
        comparisonEnabled,
        comparisonConfig,
        datasetComparison,
        columnComparisons,
        comparisonTokenUsage,
        generatingDataset,
        generatingColumns,
        regeneratingDataset,
        regeneratingColumns,
        reJudgingDataset,
        reJudgingColumns,
        modelCount,
        isAnyModelGenerating,

        // Setters
        setComparisonEnabled,
        setComparisonConfig,
        setDatasetComparison,
        setColumnComparisons,
        setComparisonTokenUsage,
        setReJudgingDataset,
        setReJudgingColumns,

        // Helpers
        resetComparisonState,
        addComparisonTokenUsage,
        setGeneratingDatasetModel,
        setGeneratingColumnModel,
        setRegeneratingDatasetModel,
        setRegeneratingColumnModel,
        setReJudgingColumn,
    };
}
