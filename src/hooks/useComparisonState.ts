import { useCallback, useMemo, useState } from 'react';
import type {
    ColumnComparisonResult,
    ComparisonConfig,
    ComparisonTokenUsage,
    DatasetComparisonResult,
    PromptVariant,
    ScoringCategory,
    TokenUsage,
} from '../types';

const EMPTY_TOKEN_USAGE: TokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0};

const DEFAULT_SCORING_CATEGORIES: ScoringCategory[] = [
    {
        key: 'clarity',
        label: 'Clarity',
        description: 'How clear and understandable the description is',
        minScore: 0,
        maxScore: 10
    },
    {
        key: 'completeness',
        label: 'Completeness',
        description: 'How thoroughly the description covers the content',
        minScore: 0,
        maxScore: 10
    },
    {
        key: 'accuracy',
        label: 'Accuracy',
        description: 'How accurately the description reflects the data',
        minScore: 0,
        maxScore: 10
    },
    {
        key: 'conciseness',
        label: 'Conciseness',
        description: 'How concise the description is without losing meaning',
        minScore: 0,
        maxScore: 10
    },
    {
        key: 'plainLanguage',
        label: 'Plain Language',
        description: 'How well the description uses plain, accessible language',
        minScore: 0,
        maxScore: 10
    },
];

export function generateJudgeSystemPrompt(
    categories: ScoringCategory[],
    slotCount: number,
    labelPrefix: string = 'Model'
): string {
    const slotLabels = Array.from({length: slotCount}, (_, i) => `${labelPrefix} ${i + 1}`);
    const categoryLines = categories
        .map((cat, i) => `${i + 1}. ${cat.label.toUpperCase()} (${cat.minScore}-${cat.maxScore}) - ${cat.description}`)
        .join('\n');

    const scoreFields = categories
        .map(cat => `        "${cat.key}": <${cat.minScore}-${cat.maxScore}>`)
        .join(',\n');

    // Build model JSON blocks matching the backend schema (model1, model2, ...)
    const modelBlocks = Array.from({length: slotCount}, (_, i) => {
        const key = `model${i + 1}`;
        return `    "${key}": {\n${scoreFields},\n        "reasoning": "<brief explanation for ${slotLabels[i]} scores>"\n    }`;
    }).join(',\n');

    const winnerOptions = Array.from({length: slotCount}, (_, i) => String(i + 1)).join(', ');

    return `You are an expert evaluator assessing metadata descriptions for government open data.
You will compare ${slotCount} candidate descriptions (${slotLabels.join(', ')}) and score each on the following metrics:

${categoryLines}

You must respond with valid JSON in exactly this format:
{
${modelBlocks},
    "winner": "<${winnerOptions}, or tie>",
    "winnerReasoning": "<1-2 sentence explanation of why this candidate is better or why it's a tie>"
}`;
}

export function generateDefaultEvaluationPrompt(
    slotCount: number,
    labelPrefix: string = 'Model'
): string {
    const candidateBlocks = Array.from({length: slotCount}, (_, i) =>
        `${labelPrefix.toUpperCase()} ${i + 1}:\n{output_${i}}`
    ).join('\n\n');

    return `CONTEXT:
{context}

${candidateBlocks}

Evaluate all candidates and respond with the JSON structure as specified.`;
}

function getInitialModels(defaultCount: number): string[] {
    // 1. VITE_COMPARISON_MODELS (comma-separated)
    const envModels = import.meta.env.VITE_COMPARISON_MODELS;
    if (envModels) {
        const models = envModels.split(',').map((m: string) => m.trim()).filter(Boolean);
        if (models.length >= 2) return models;
    }
    // 2. Legacy VITE_COMPARISON_MODEL_A / _B
    const modelA = import.meta.env.VITE_COMPARISON_MODEL_A || '';
    const modelB = import.meta.env.VITE_COMPARISON_MODEL_B || '';
    if (modelA || modelB) return [modelA, modelB];
    // 3. Fallback to empty strings
    return Array(defaultCount).fill('');
}

function createInitialConfig(slotCount: number): ComparisonConfig {
    const categories = [...DEFAULT_SCORING_CATEGORIES];
    const models = getInitialModels(slotCount);
    return {
        subMode: 'models',
        models,
        promptModel: '',
        promptVariants: [],
        judgeModel: import.meta.env.VITE_COMPARISON_JUDGE_MODEL || '',
        judgeSystemPrompt: generateJudgeSystemPrompt(categories, models.length),
        judgeEvaluationPrompt: generateDefaultEvaluationPrompt(models.length),
        scoringCategories: categories,
    };
}

function createInitialTokenUsage(slotCount: number): ComparisonTokenUsage {
    return {
        models: Array(slotCount).fill(null).map(() => ({...EMPTY_TOKEN_USAGE})),
        judge: {...EMPTY_TOKEN_USAGE},
        total: {...EMPTY_TOKEN_USAGE},
    };
}

export function createDefaultPromptVariant(index: number, templates?: {
    systemPrompt: string;
    dataset: string;
    column: string
}): PromptVariant {
    return {
        label: `Prompt ${index + 1}`,
        systemPrompt: templates?.systemPrompt || '',
        datasetPrompt: templates?.dataset || '',
        columnPrompt: templates?.column || '',
    };
}

const INITIAL_SLOT_COUNT = 2;

export function useComparisonState() {
    // Comparison Mode State
    const [comparisonEnabled, setComparisonEnabled] = useState(false);
    const [comparisonConfig, setComparisonConfig] = useState<ComparisonConfig>(
        () => createInitialConfig(INITIAL_SLOT_COUNT)
    );

    const comparisonSlotCount = useMemo(() => {
        return comparisonConfig.subMode === 'models'
            ? comparisonConfig.models.length
            : comparisonConfig.promptVariants.length;
    }, [comparisonConfig.subMode, comparisonConfig.models.length, comparisonConfig.promptVariants.length]);

    const [datasetComparison, setDatasetComparison] = useState<DatasetComparisonResult>({
        outputs: Array(INITIAL_SLOT_COUNT).fill(''),
        judgeResult: null,
        isJudging: false,
    });
    const [columnComparisons, setColumnComparisons] = useState<Record<string, ColumnComparisonResult>>({});
    const [comparisonTokenUsage, setComparisonTokenUsage] = useState<ComparisonTokenUsage>(
        () => createInitialTokenUsage(INITIAL_SLOT_COUNT)
    );

    // Generation states - indexed by model/slot
    const [generatingDataset, setGeneratingDataset] = useState<Set<number>>(new Set());
    const [generatingColumns, setGeneratingColumns] = useState<Map<number, Set<string>>>(new Map());

    // Regeneration states - indexed by model/slot
    const [regeneratingDataset, setRegeneratingDataset] = useState<Set<number>>(new Set());
    const [regeneratingColumns, setRegeneratingColumns] = useState<Map<number, Set<string>>>(new Map());

    // Re-judging states
    const [reJudgingDataset, setReJudgingDataset] = useState(false);
    const [reJudgingColumns, setReJudgingColumns] = useState<Set<string>>(new Set());

    // Check if any model is generating
    const isAnyModelGenerating = useMemo(() => {
        return generatingDataset.size > 0 || generatingColumns.size > 0
            || regeneratingDataset.size > 0 || regeneratingColumns.size > 0;
    }, [generatingDataset, generatingColumns, regeneratingDataset, regeneratingColumns]);

    const resetComparisonState = useCallback(() => {
        const slotCount = comparisonSlotCount || INITIAL_SLOT_COUNT;
        setDatasetComparison({
            outputs: Array(slotCount).fill(''),
            judgeResult: null,
            isJudging: false,
        });
        setColumnComparisons({});
        setComparisonTokenUsage(createInitialTokenUsage(slotCount));
        setGeneratingDataset(new Set());
        setGeneratingColumns(new Map());
        setRegeneratingDataset(new Set());
        setRegeneratingColumns(new Map());
    }, [comparisonSlotCount]);

    const addComparisonTokenUsage = useCallback((
        slot: { type: 'model'; index: number } | { type: 'judge' },
        usage: TokenUsage
    ) => {
        setComparisonTokenUsage((prev) => {
            const newUsage = {
                models: prev.models.map(m => ({...m})),
                judge: {...prev.judge},
                total: {...prev.total},
            };
            if (slot.type === 'model') {
                const i = slot.index;
                if (newUsage.models[i]) {
                    newUsage.models[i] = {
                        promptTokens: newUsage.models[i].promptTokens + usage.promptTokens,
                        completionTokens: newUsage.models[i].completionTokens + usage.completionTokens,
                        totalTokens: newUsage.models[i].totalTokens + usage.totalTokens,
                    };
                }
            } else {
                newUsage.judge = {
                    promptTokens: newUsage.judge.promptTokens + usage.promptTokens,
                    completionTokens: newUsage.judge.completionTokens + usage.completionTokens,
                    totalTokens: newUsage.judge.totalTokens + usage.totalTokens,
                };
            }
            newUsage.total = {
                promptTokens: newUsage.total.promptTokens + usage.promptTokens,
                completionTokens: newUsage.total.completionTokens + usage.completionTokens,
                totalTokens: newUsage.total.totalTokens + usage.totalTokens,
            };
            return newUsage;
        });
    }, []);

    // Helper to set generating dataset for a model index
    const setGeneratingDatasetModel = useCallback((index: number, isGenerating: boolean) => {
        setGeneratingDataset((prev) => {
            const next = new Set(prev);
            if (isGenerating) next.add(index);
            else next.delete(index);
            return next;
        });
    }, []);

    // Helper to set generating column for a model index
    const setGeneratingColumnModel = useCallback((index: number, columnName: string, isGenerating: boolean) => {
        setGeneratingColumns((prev) => {
            const next = new Map(prev);
            const cols = new Set(next.get(index) || []);
            if (isGenerating) cols.add(columnName);
            else cols.delete(columnName);
            if (cols.size > 0) next.set(index, cols);
            else next.delete(index);
            return next;
        });
    }, []);

    // Helper to set regenerating dataset for a model index
    const setRegeneratingDatasetModel = useCallback((index: number, isRegenerating: boolean) => {
        setRegeneratingDataset((prev) => {
            const next = new Set(prev);
            if (isRegenerating) next.add(index);
            else next.delete(index);
            return next;
        });
    }, []);

    // Helper to set regenerating column for a model index
    const setRegeneratingColumnModel = useCallback((index: number, columnName: string, isRegenerating: boolean) => {
        setRegeneratingColumns((prev) => {
            const next = new Map(prev);
            const cols = new Set(next.get(index) || []);
            if (isRegenerating) cols.add(columnName);
            else cols.delete(columnName);
            if (cols.size > 0) next.set(index, cols);
            else next.delete(index);
            return next;
        });
    }, []);

    // Helper to set re-judging column
    const setReJudgingColumn = useCallback((columnName: string, isReJudging: boolean) => {
        setReJudgingColumns((prev) => {
            const next = new Set(prev);
            if (isReJudging) next.add(columnName);
            else next.delete(columnName);
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
        generatingDataset,
        generatingColumns,
        regeneratingDataset,
        regeneratingColumns,
        reJudgingDataset,
        reJudgingColumns,
        comparisonSlotCount,
        isAnyModelGenerating,

        // Setters
        setComparisonEnabled,
        setComparisonConfig,
        setDatasetComparison,
        setColumnComparisons,
        setComparisonTokenUsage,
        setReJudgingDataset,

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
