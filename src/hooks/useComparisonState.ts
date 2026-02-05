import { useCallback, useState } from 'react';
import type {
    ColumnComparisonResult,
    ComparisonConfig,
    ComparisonTokenUsage,
    DatasetComparisonResult,
    TokenUsage,
} from '../types';

const EMPTY_TOKEN_USAGE: TokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0};

const INITIAL_DATASET_COMPARISON: DatasetComparisonResult = {
    modelAOutput: '',
    modelBOutput: '',
    judgeResult: null,
    isJudging: false,
};

const INITIAL_TOKEN_USAGE: ComparisonTokenUsage = {
    modelA: {...EMPTY_TOKEN_USAGE},
    modelB: {...EMPTY_TOKEN_USAGE},
    judge: {...EMPTY_TOKEN_USAGE},
    total: {...EMPTY_TOKEN_USAGE},
};

const DEFAULT_JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing metadata descriptions for government open data.
You will compare two candidate descriptions and score each on the following metrics (1-10 scale):

1. CLARITY - How easy is it to understand? Uses plain language, avoids jargon.
2. COMPLETENESS - Does it cover the content, purpose, and potential use cases?
3. ACCURACY - Does it correctly describe what the data contains?
4. CONCISENESS - Is it brief while still being informative? No unnecessary padding.
5. PLAIN LANGUAGE - Uses active voice, simple words, short sentences.

You must respond with valid JSON in exactly this format:
{
    "modelA": {
        "clarity": <1-10>,
        "completeness": <1-10>,
        "accuracy": <1-10>,
        "conciseness": <1-10>,
        "plainLanguage": <1-10>,
        "reasoning": "<brief explanation for Model A scores>"
    },
    "modelB": {
        "clarity": <1-10>,
        "completeness": <1-10>,
        "accuracy": <1-10>,
        "conciseness": <1-10>,
        "plainLanguage": <1-10>,
        "reasoning": "<brief explanation for Model B scores>"
    },
    "winner": "<A, B, or tie>",
    "winnerReasoning": "<1-2 sentence explanation of why this candidate is better or why it's a tie>"
}`;

export function useComparisonState() {
    // Comparison Mode State
    const [comparisonEnabled, setComparisonEnabled] = useState(false);
    const [comparisonConfig, setComparisonConfig] = useState<ComparisonConfig>({
        modelA: import.meta.env.VITE_COMPARISON_MODEL_A || '',
        modelB: import.meta.env.VITE_COMPARISON_MODEL_B || '',
        judgeModel: import.meta.env.VITE_COMPARISON_JUDGE_MODEL || '',
        judgeSystemPrompt: import.meta.env.VITE_COMPARISON_JUDGE_SYSTEM_PROMPT || DEFAULT_JUDGE_SYSTEM_PROMPT,
    });
    const [datasetComparison, setDatasetComparison] = useState<DatasetComparisonResult>(INITIAL_DATASET_COMPARISON);
    const [columnComparisons, setColumnComparisons] = useState<Record<string, ColumnComparisonResult>>({});
    const [comparisonTokenUsage, setComparisonTokenUsage] = useState<ComparisonTokenUsage>(INITIAL_TOKEN_USAGE);

    // Generation states
    const [generatingColumnsA, setGeneratingColumnsA] = useState<Set<string>>(new Set());
    const [generatingColumnsB, setGeneratingColumnsB] = useState<Set<string>>(new Set());
    const [generatingDatasetA, setGeneratingDatasetA] = useState(false);
    const [generatingDatasetB, setGeneratingDatasetB] = useState(false);

    // Regeneration states
    const [regeneratingDatasetA, setRegeneratingDatasetA] = useState(false);
    const [regeneratingDatasetB, setRegeneratingDatasetB] = useState(false);
    const [regeneratingColumnsA, setRegeneratingColumnsA] = useState<Set<string>>(new Set());
    const [regeneratingColumnsB, setRegeneratingColumnsB] = useState<Set<string>>(new Set());

    // Re-judging states
    const [reJudgingDataset, setReJudgingDataset] = useState(false);
    const [reJudgingColumns, setReJudgingColumns] = useState<Set<string>>(new Set());

    const resetComparisonState = useCallback(() => {
        setDatasetComparison(INITIAL_DATASET_COMPARISON);
        setColumnComparisons({});
        setComparisonTokenUsage(INITIAL_TOKEN_USAGE);
        setGeneratingColumnsA(new Set());
        setGeneratingColumnsB(new Set());
        setGeneratingDatasetA(false);
        setGeneratingDatasetB(false);
    }, []);

    const addComparisonTokenUsage = useCallback((
        model: 'modelA' | 'modelB' | 'judge',
        usage: TokenUsage
    ) => {
        setComparisonTokenUsage((prev) => {
            const newUsage = {...prev};
            newUsage[model] = {
                promptTokens: prev[model].promptTokens + usage.promptTokens,
                completionTokens: prev[model].completionTokens + usage.completionTokens,
                totalTokens: prev[model].totalTokens + usage.totalTokens,
            };
            newUsage.total = {
                promptTokens: prev.total.promptTokens + usage.promptTokens,
                completionTokens: prev.total.completionTokens + usage.completionTokens,
                totalTokens: prev.total.totalTokens + usage.totalTokens,
            };
            return newUsage;
        });
    }, []);

    // Helper to add/remove from generating columns sets
    const setGeneratingColumn = useCallback((model: 'A' | 'B', columnName: string, isGenerating: boolean) => {
        const setter = model === 'A' ? setGeneratingColumnsA : setGeneratingColumnsB;
        setter((prev) => {
            const next = new Set(prev);
            if (isGenerating) {
                next.add(columnName);
            } else {
                next.delete(columnName);
            }
            return next;
        });
    }, []);

    // Helper to add/remove from regenerating columns sets
    const setRegeneratingColumn = useCallback((model: 'A' | 'B', columnName: string, isRegenerating: boolean) => {
        const setter = model === 'A' ? setRegeneratingColumnsA : setRegeneratingColumnsB;
        setter((prev) => {
            const next = new Set(prev);
            if (isRegenerating) {
                next.add(columnName);
            } else {
                next.delete(columnName);
            }
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

    return {
        // State
        comparisonEnabled,
        comparisonConfig,
        datasetComparison,
        columnComparisons,
        comparisonTokenUsage,
        generatingColumnsA,
        generatingColumnsB,
        generatingDatasetA,
        generatingDatasetB,
        regeneratingDatasetA,
        regeneratingDatasetB,
        regeneratingColumnsA,
        regeneratingColumnsB,
        reJudgingDataset,
        reJudgingColumns,

        // Setters
        setComparisonEnabled,
        setComparisonConfig,
        setDatasetComparison,
        setColumnComparisons,
        setComparisonTokenUsage,
        setGeneratingColumnsA,
        setGeneratingColumnsB,
        setGeneratingDatasetA,
        setGeneratingDatasetB,
        setRegeneratingColumnsA,
        setRegeneratingColumnsB,
        setRegeneratingDatasetA,
        setRegeneratingDatasetB,
        setReJudgingDataset,
        setReJudgingColumns,

        // Helpers
        resetComparisonState,
        addComparisonTokenUsage,
        setGeneratingColumn,
        setRegeneratingColumn,
        setReJudgingColumn,
    };
}
