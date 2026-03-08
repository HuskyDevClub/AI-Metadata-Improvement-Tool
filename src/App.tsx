import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Header } from './components/Header/Header';
import { HowItWorks } from './components/HowItWorks/HowItWorks';
import { OpenAIConfig } from './components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from './components/PromptEditor/PromptEditor';
import { CsvInput } from './components/CsvInput/CsvInput';
import { StatusMessage } from './components/StatusMessage/StatusMessage';
import { DatasetDescription } from './components/DatasetDescription/DatasetDescription';
import { ColumnCard } from './components/ColumnCard/ColumnCard';
import { ExportSection } from './components/ExportSection/ExportSection';
import { ImportSection } from './components/ImportSection/ImportSection';
import { ComparisonMode } from './components/ComparisonMode/ComparisonMode';
import { DatasetComparison } from './components/DatasetComparison/DatasetComparison';
import { ColumnComparison } from './components/ColumnComparison/ColumnComparison';
import { useOpenAI } from './hooks/useOpenAI';
import { useComparisonGeneration } from './hooks/useComparisonGeneration';
import { generateJudgeSystemPrompt, useComparisonState } from './hooks/useComparisonState';
import { fetchSocrataImport, parseFile, parseUrl, pushSocrataMetadata } from './utils/csvParser';
import {
    analyzeColumn,
    buildSampleRows,
    getColumnStatsText,
    getSampleCount,
    getSampleValues
} from './utils/columnAnalyzer';
import { getEstimatedCost } from './utils/pricing';
import { validateAndParseImport } from './utils/importValidator';
import { getModelLabel, getVariantLabel } from './utils/modelColors';
import { handleJudgeError, handleRegenerationError } from './utils/stateHelpers';
import {
    appendPromptModifiers,
    buildColumnImprovementPrompt,
    buildDatasetImprovementPrompt,
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_SYSTEM_PROMPT
} from './utils/prompts';
import type {
    APIConfig,
    ColumnComparisonResult,
    ColumnInfo,
    ComparisonConfig,
    CsvRow,
    GeneratedResults,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
    ScoringCategory,
    Status,
    TokenUsage,
} from './types';
import './App.css';

const EMPTY_TOKEN_USAGE: TokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0};

function App() {
    // Shared API configuration for all modes
    const [apiConfig, setApiConfig] = useState<APIConfig>({
        baseURL: import.meta.env.VITE_AZURE_ENDPOINT || '',
        apiKey: import.meta.env.VITE_AZURE_KEY || '',
    });

    // Model for non-comparison mode
    const [model, setModel] = useState<string>(import.meta.env.VITE_AZURE_MODEL || '');

    // Combined config for hooks that need the full OpenAIConfig
    const openaiConfig: OpenAIConfigType = {
        ...apiConfig,
        model,
    };

    const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        dataset: DEFAULT_DATASET_PROMPT,
        column: DEFAULT_COLUMN_PROMPT,
    });

    const [csvData, setCsvData] = useState<CsvRow[] | null>(null);
    const [fileName, setFileName] = useState('');
    const [columnStats, setColumnStats] = useState<Record<string, ColumnInfo>>({});
    const [generatedResults, setGeneratedResults] = useState<GeneratedResults>({
        datasetDescription: '',
        columnDescriptions: {},
    });

    const [status, setStatus] = useState<Status | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [isImportedData, setIsImportedData] = useState(false);
    const [importedRowCount, setImportedRowCount] = useState(0);
    const [generatingColumns, setGeneratingColumns] = useState<Set<string>>(new Set());
    const [regeneratingDataset, setRegeneratingDataset] = useState(false);
    const [regeneratingColumns, setRegeneratingColumns] = useState<Set<string>>(new Set());
    const [suggestingDataset, setSuggestingDataset] = useState(false);
    const [datasetSuggestions, setDatasetSuggestions] = useState('');
    const [suggestingColumns, setSuggestingColumns] = useState<Set<string>>(new Set());
    const [columnSuggestions, setColumnSuggestions] = useState<Record<string, string>>({});
    const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    });

    // Socrata push-back state
    const [socrataDatasetId, setSocrataDatasetId] = useState('');
    const [socrataCredentials, setSocrataCredentials] = useState<{
        appToken?: string;
        apiKeyId?: string;
        apiKeySecret?: string;
    }>({});
    const [socrataFieldNameMap, setSocrataFieldNameMap] = useState<Record<string, string>>({});
    const [isPushingSocrata, setIsPushingSocrata] = useState(false);
    const [isGeneratingEmpty, setIsGeneratingEmpty] = useState(false);

    // Comparison Mode State (extracted to custom hook)
    const comparison = useComparisonState();
    // Combined config for hooks that need the full OpenAIConfig
    const {
        comparisonEnabled,
        comparisonConfig,
        datasetComparison,
        columnComparisons,
        comparisonTokenUsage,
        generatingDataset: generatingDatasetModels,
        generatingColumns: generatingColumnModels,
        regeneratingDataset: regeneratingDatasetModels,
        regeneratingColumns: regeneratingColumnModels,
        reJudgingDataset,
        reJudgingColumns,
        comparisonSlotCount,
        isAnyModelGenerating,
        setComparisonEnabled,
        setComparisonConfig,
        setDatasetComparison,
        setColumnComparisons,
        setComparisonTokenUsage,
        setReJudgingDataset,
        resetComparisonState,
        addComparisonTokenUsage,
        setGeneratingDatasetModel,
        setGeneratingColumnModel,
        setRegeneratingDatasetModel,
        setRegeneratingColumnModel,
        setReJudgingColumn,
    } = comparison;

    // Abort controller for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null);

    const {callOpenAIStream} = useOpenAI();

    // Wrapper for comparison config changes — clears results when sub-mode changes
    const handleComparisonConfigChange = useCallback((newConfig: ComparisonConfig) => {
        if (newConfig.subMode !== comparisonConfig.subMode) {
            resetComparisonState();
        }
        setComparisonConfig(newConfig);
    }, [comparisonConfig.subMode, resetComparisonState, setComparisonConfig]);

    // Handler for toggling comparison mode - clears status and token usage
    const handleComparisonToggle = useCallback((enabled: boolean) => {
        setComparisonEnabled(enabled);
        setStatus(null);
        // Clear token usage when switching modes
        if (enabled) {
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});
        } else {
            setComparisonTokenUsage({
                models: Array(comparisonSlotCount).fill(null).map(() => ({...EMPTY_TOKEN_USAGE})),
                judge: {...EMPTY_TOKEN_USAGE},
                total: {...EMPTY_TOKEN_USAGE},
            });
        }
    }, [setComparisonEnabled, setComparisonTokenUsage, comparisonSlotCount]);
    const {generateParallel, callJudge} = useComparisonGeneration();

    const addTokenUsage = useCallback((usage: TokenUsage) => {
        setTokenUsage((prev) => ({
            promptTokens: prev.promptTokens + usage.promptTokens,
            completionTokens: prev.completionTokens + usage.completionTokens,
            totalTokens: prev.totalTokens + usage.totalTokens,
        }));
    }, []);

    const buildColumnInfo = useCallback((stats: Record<string, ColumnInfo>): string => {
        return Object.entries(stats)
            .map(([col, info]) => `- ${col} — ${info.type}`)
            .join('\n');
    }, []);

    const buildDatasetPromptFromTemplate = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        template: string,
        modifier: '' | 'concise' | 'detailed' = '',
        customInstruction?: string
    ): string => {
        const columnInfo = buildColumnInfo(stats);
        const sampleRows = buildSampleRows(data);
        const sampleCount = String(getSampleCount(data));
        const prompt = template
            .replace('{fileName}', name)
            .replace('{rowCount}', String(data.length))
            .replace('{columnInfo}', columnInfo)
            .replace('{sampleRows}', sampleRows)
            .replace('{sampleCount}', sampleCount);
        return appendPromptModifiers(prompt, modifier, customInstruction);
    }, [buildColumnInfo]);

    const buildDatasetPrompt = useCallback((
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string
        ): string =>
            buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.dataset, modifier, customInstruction),
        [promptTemplates.dataset, buildDatasetPromptFromTemplate]);

    const buildColumnPromptFromTemplate = useCallback((
        columnName: string,
        info: ColumnInfo,
        datasetDesc: string,
        template: string,
        columnValues?: (string | null | undefined)[],
        modifier: '' | 'concise' | 'detailed' = '',
        customInstruction?: string
    ): string => {
        const statsText = getColumnStatsText(info);
        const sampleValues = getSampleValues(info, columnValues || []);
        const nonNullCount = info.totalCount - info.nullCount;
        const completenessPercent = info.totalCount > 0
            ? ((nonNullCount / info.totalCount) * 100).toFixed(1)
            : '0.0';
        const prompt = template
            .replace(/\{columnName\}/g, columnName)
            .replace('{datasetDescription}', datasetDesc)
            .replace('{columnStats}', statsText)
            .replace('{dataType}', info.type)
            .replace('{nonNullCount}', String(nonNullCount))
            .replace('{rowCount}', String(info.totalCount))
            .replace('{completenessPercent}', completenessPercent)
            .replace('{sampleValues}', sampleValues)
            .replace('{nullCount}', String(info.nullCount));
        return appendPromptModifiers(prompt, modifier, customInstruction);
    }, []);

    const buildColumnPrompt = useCallback((
            columnName: string,
            info: ColumnInfo,
            datasetDesc: string,
            columnValues?: (string | null | undefined)[],
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string
        ): string =>
            buildColumnPromptFromTemplate(columnName, info, datasetDesc, promptTemplates.column, columnValues, modifier, customInstruction),
        [promptTemplates.column, buildColumnPromptFromTemplate]);

    const generateDatasetDescription = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string,
            abortSignal?: AbortSignal
        ): Promise<{ content: string; aborted: boolean }> => {
            const prompt = buildDatasetPrompt(data, name, stats, modifier, customInstruction);

            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    datasetDescription: fullContent,
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return {content: fullContent, aborted: result.aborted};
        },
        [openaiConfig, promptTemplates.systemPrompt, buildDatasetPrompt, callOpenAIStream, addTokenUsage]
    );

    const generateColumnDescription = useCallback(
        async (
            columnName: string,
            info: ColumnInfo,
            datasetDesc: string,
            columnValues?: (string | null | undefined)[],
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string,
            abortSignal?: AbortSignal
        ): Promise<{ content: string; aborted: boolean }> => {
            const prompt = buildColumnPrompt(columnName, info, datasetDesc, columnValues, modifier, customInstruction);

            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: {...prev.columnDescriptions, [columnName]: fullContent},
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return {content: fullContent, aborted: result.aborted};
        },
        [openaiConfig, promptTemplates.systemPrompt, buildColumnPrompt, callOpenAIStream, addTokenUsage]
    );

    // Build OpenAIConfig from shared API config for a specific model
    const getComparisonModelConfig = useCallback((modelName: string): OpenAIConfigType => ({
        ...apiConfig,
        model: modelName,
    }), [apiConfig]);

    // Get display names for comparison slots (models or prompt variants)
    const isPromptMode = comparisonConfig.subMode === 'prompts';

    const comparisonSlotNames = isPromptMode
        ? comparisonConfig.promptVariants.map((v, i) => getVariantLabel(i, v.label))
        : comparisonConfig.models.map((m, i) => getModelLabel(i, m || undefined));

    const comparisonSlotShortNames = isPromptMode
        ? comparisonConfig.promptVariants.map((v, i) => v.label || `Prompt ${i + 1}`)
        : comparisonConfig.models.map((m, i) => m || `Model ${i + 1}`);

    // Helper to judge dataset outputs and update state
    const judgeDatasetOutputs = useCallback(async (
        context: string,
        outputs: string[]
    ): Promise<void> => {
        const judgeConfig = getComparisonModelConfig(comparisonConfig.judgeModel);
        const judgeResult = await callJudge(context, outputs, judgeConfig, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories);

        addComparisonTokenUsage({type: 'judge'}, judgeResult.usage);

        setDatasetComparison((prev) => ({
            ...prev,
            judgeResult: judgeResult.result,
            isJudging: false,
        }));
    }, [getComparisonModelConfig, comparisonConfig.judgeModel, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories, callJudge, addComparisonTokenUsage, setDatasetComparison]);

    // Helper to judge column outputs and update the state
    const judgeColumnOutputs = useCallback(async (
        columnName: string,
        context: string,
        outputs: string[]
    ): Promise<void> => {
        const judgeConfig = getComparisonModelConfig(comparisonConfig.judgeModel);
        const judgeResult = await callJudge(context, outputs, judgeConfig, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories);

        addComparisonTokenUsage({type: 'judge'}, judgeResult.usage);

        setColumnComparisons((prev) => ({
            ...prev,
            [columnName]: {
                ...prev[columnName],
                judgeResult: judgeResult.result,
                isJudging: false,
            },
        }));
    }, [getComparisonModelConfig, comparisonConfig.judgeModel, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories, callJudge, addComparisonTokenUsage, setColumnComparisons]);

    // Comparison mode generation
    const generateDatasetComparisonDescription = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            abortSignal?: AbortSignal
        ): Promise<{ aborted: boolean }> => {
            const slotCount = comparisonSlotCount;

            // Mark all slots as generating
            for (let i = 0; i < slotCount; i++) {
                setGeneratingDatasetModel(i, true);
            }

            const outputs: string[] = Array(slotCount).fill('');

            let configs: OpenAIConfigType[];
            let prompts: string[];
            let systemPrompts: string | string[];

            if (comparisonConfig.subMode === 'prompts') {
                // Prompt comparison: same model, different prompts
                configs = Array(slotCount).fill(getComparisonModelConfig(comparisonConfig.promptModel));
                prompts = comparisonConfig.promptVariants.map(v =>
                    buildDatasetPromptFromTemplate(data, name, stats, v.datasetPrompt)
                );
                systemPrompts = comparisonConfig.promptVariants.map(v => v.systemPrompt);
            } else {
                // Model comparison: different models, same prompt
                const prompt = buildDatasetPrompt(data, name, stats);
                configs = comparisonConfig.models.map(m => getComparisonModelConfig(m));
                prompts = Array(slotCount).fill(prompt);
                systemPrompts = promptTemplates.systemPrompt;
            }

            const onChunks = Array.from({length: slotCount}, (_, i) => (chunk: string) => {
                outputs[i] += chunk;
                const currentOutput = outputs[i];
                setDatasetComparison((prev) => {
                    const newOutputs = [...prev.outputs];
                    newOutputs[i] = currentOutput;
                    return {...prev, outputs: newOutputs};
                });
            });

            const result = await generateParallel(
                prompts,
                configs,
                systemPrompts,
                onChunks,
                abortSignal
            );

            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({type: 'model', index: i}, usage);
            });

            for (let i = 0; i < slotCount; i++) {
                setGeneratingDatasetModel(i, false);
            }

            if (result.aborted) {
                return {aborted: true};
            }

            // Call judge
            setDatasetComparison((prev) => ({...prev, isJudging: true}));

            try {
                const context = `File: ${name}, Rows: ${data.length}, Columns: ${Object.keys(stats).join(', ')}`;
                await judgeDatasetOutputs(context, outputs);
            } catch (error) {
                setDatasetComparison((prev) => ({...prev, isJudging: false}));
                setStatus({
                    message: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'warning'
                });
            }

            return {aborted: false};
        },
        [buildDatasetPrompt, buildDatasetPromptFromTemplate, comparisonSlotCount, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingDatasetModel, setDatasetComparison, judgeDatasetOutputs]
    );

    const generateColumnComparisonDescription = useCallback(
        async (
            columnName: string,
            info: ColumnInfo,
            datasetDescs: string[],
            columnValues?: (string | null | undefined)[],
            abortSignal?: AbortSignal
        ): Promise<{ aborted: boolean }> => {
            const slotCount = comparisonSlotCount;

            // Mark all slots as generating this column
            for (let i = 0; i < slotCount; i++) {
                setGeneratingColumnModel(i, columnName, true);
            }

            const outputs: string[] = Array(slotCount).fill('');

            let configs: OpenAIConfigType[];
            let prompts: string[];
            let systemPrompts: string | string[];

            if (comparisonConfig.subMode === 'prompts') {
                configs = Array(slotCount).fill(getComparisonModelConfig(comparisonConfig.promptModel));
                prompts = comparisonConfig.promptVariants.map((v, i) =>
                    buildColumnPromptFromTemplate(columnName, info, datasetDescs[i], v.columnPrompt, columnValues)
                );
                systemPrompts = comparisonConfig.promptVariants.map(v => v.systemPrompt);
            } else {
                configs = comparisonConfig.models.map(m => getComparisonModelConfig(m));
                prompts = comparisonConfig.models.map((_, i) =>
                    buildColumnPrompt(columnName, info, datasetDescs[i], columnValues)
                );
                systemPrompts = promptTemplates.systemPrompt;
            }

            const onChunks = Array.from({length: slotCount}, (_, i) => (chunk: string) => {
                outputs[i] += chunk;
                const currentOutput = outputs[i];
                setColumnComparisons((prev) => {
                    const newOutputs = [...(prev[columnName]?.outputs || Array(slotCount).fill(''))];
                    newOutputs[i] = currentOutput;
                    return {
                        ...prev,
                        [columnName]: {...prev[columnName], outputs: newOutputs},
                    };
                });
            });

            const result = await generateParallel(
                prompts,
                configs,
                systemPrompts,
                onChunks,
                abortSignal
            );

            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({type: 'model', index: i}, usage);
            });

            for (let i = 0; i < slotCount; i++) {
                setGeneratingColumnModel(i, columnName, false);
            }

            if (result.aborted) {
                return {aborted: true};
            }

            // Call the judge for this column
            setColumnComparisons((prev) => ({
                ...prev,
                [columnName]: {...prev[columnName], isJudging: true},
            }));

            try {
                const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
                await judgeColumnOutputs(columnName, context, outputs);
            } catch (error) {
                console.error(error);
                setColumnComparisons((prev) => ({
                    ...prev,
                    [columnName]: {...prev[columnName], isJudging: false},
                }));
            }

            return {aborted: false};
        },
        [buildColumnPrompt, buildColumnPromptFromTemplate, comparisonSlotCount, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingColumnModel, setColumnComparisons, judgeColumnOutputs]
    );

    const handleAnalyze = useCallback(
        async (method: 'file' | 'url', file?: File, url?: string, socrataToken?: string) => {

            // Create a new abort controller
            abortControllerRef.current = new AbortController();
            const abortSignal = abortControllerRef.current.signal;

            setIsProcessing(true);
            setShowResults(false);
            setIsImportedData(false);
            setImportedRowCount(0);
            setGeneratedResults({datasetDescription: '', columnDescriptions: {}});
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});

            // Clear Socrata push-back state (non-Socrata source)
            setSocrataDatasetId('');
            setSocrataFieldNameMap({});

            // Reset comparison state
            if (comparisonEnabled) {
                resetComparisonState();
            }

            let currentStep = 'loading CSV';
            try {
                // Parse CSV
                setStatus({
                    message: method === 'file' ? 'Reading CSV file...' : 'Fetching CSV from URL...',
                    type: 'info'
                });

                const result = method === 'file' && file ? await parseFile(file) : await parseUrl(url!, socrataToken);

                if (!result.data || result.data.length === 0) {
                    setStatus({message: 'No data found in CSV file', type: 'error'});
                    setIsProcessing(false);
                    return;
                }

                setCsvData(result.data);
                setFileName(result.fileName);

                // Analyze columns
                setStatus({message: 'Analyzing columns...', type: 'info'});

                const columns = Object.keys(result.data[0]);
                const stats: Record<string, ColumnInfo> = {};

                columns.forEach((col) => {
                    const values = result.data.map((row) => row[col]);
                    stats[col] = analyzeColumn(col, values);
                });

                setColumnStats(stats);
                setShowResults(true);

                if (comparisonEnabled) {
                    // Comparison mode workflow
                    currentStep = 'generating dataset descriptions';
                    const slotLabel = comparisonConfig.subMode === 'prompts' ? 'prompt variants' : 'models';
                    setStatus({
                        message: `Generating dataset descriptions (${comparisonSlotCount} ${slotLabel} in parallel)...`,
                        type: 'info'
                    });

                    // Initialize column comparisons
                    const initialColumnComparisons: Record<string, ColumnComparisonResult> = {};
                    columns.forEach((col) => {
                        initialColumnComparisons[col] = {
                            outputs: Array(comparisonSlotCount).fill(''),
                            judgeResult: null,
                            isJudging: false,
                        };
                    });
                    setColumnComparisons(initialColumnComparisons);

                    const datasetResult = await generateDatasetComparisonDescription(
                        result.data,
                        result.fileName,
                        stats,
                        abortSignal
                    );

                    if (datasetResult.aborted) {
                        setStatus({message: 'Generation stopped.', type: 'info'});
                        setIsProcessing(false);
                        return;
                    }

                    // Get the dataset descriptions for column generation context
                    let datasetDescs: string[] = [];
                    setDatasetComparison((prev) => {
                        datasetDescs = [...prev.outputs];
                        return prev;
                    });

                    // Generate all column descriptions in parallel
                    currentStep = 'generating column descriptions';
                    setStatus({
                        message: `Generating column descriptions for ${columns.length} columns...`,
                        type: 'info'
                    });

                    const columnPromises = columns.map(async (col) => {
                        const info = stats[col];
                        const colValues = result.data.map(row => row[col]);
                        return generateColumnComparisonDescription(col, info, datasetDescs, colValues, abortSignal);
                    });

                    const columnResults = await Promise.all(columnPromises);

                    const abortedColumns = columnResults.filter(r => r.aborted);
                    if (abortedColumns.length > 0) {
                        setStatus({message: 'Generation stopped.', type: 'info'});
                        setIsProcessing(false);
                        return;
                    }

                    setStatus({
                        message: 'Comparison complete! All descriptions generated and judged.',
                        type: 'success'
                    });

                } else {
                    // Single mode workflow (original)
                    currentStep = 'generating dataset description';
                    setStatus({message: 'Generating dataset description...', type: 'info'});
                    const datasetResult = await generateDatasetDescription(result.data, result.fileName, stats, '', undefined, abortSignal);

                    if (datasetResult.aborted) {
                        setGeneratingColumns(new Set());
                        setStatus({message: 'Generation stopped.', type: 'info'});
                        setIsProcessing(false);
                        return;
                    }

                    const datasetDesc = datasetResult.content;
                    setGeneratedResults((prev) => ({...prev, datasetDescription: datasetDesc}));

                    // Generate all column descriptions in parallel
                    currentStep = 'generating column descriptions';
                    setStatus({message: `Generating descriptions for ${columns.length} columns...`, type: 'info'});
                    setGeneratingColumns(new Set(columns));

                    const columnPromises = columns.map(async (col) => {
                        const info = stats[col];
                        const colValues = result.data.map(row => row[col]);
                        const colResult = await generateColumnDescription(col, info, datasetDesc, colValues, '', undefined, abortSignal);
                        return {col, result: colResult};
                    });

                    const columnResults = await Promise.all(columnPromises);

                    // Check if any were aborted
                    const abortedColumns = columnResults.filter(r => r.result.aborted);
                    if (abortedColumns.length > 0) {
                        setGeneratingColumns(new Set());
                        setStatus({message: 'Generation stopped.', type: 'info'});
                        setIsProcessing(false);
                        return;
                    }

                    setGeneratingColumns(new Set());
                    setStatus({
                        message: 'Analysis complete! All descriptions generated successfully.',
                        type: 'success'
                    });
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    setStatus({message: 'Generation stopped.', type: 'info'});
                } else {
                    const detail = error instanceof Error ? error.message : 'Unknown error';
                    setStatus({
                        message: `Error while ${currentStep}: ${detail}`,
                        type: 'error'
                    });
                }
            } finally {
                setIsProcessing(false);
            }
        },
        [comparisonEnabled, comparisonSlotCount, comparisonConfig.subMode, resetComparisonState, setColumnComparisons, generateDatasetComparisonDescription, setDatasetComparison, generateColumnComparisonDescription, generateDatasetDescription, generateColumnDescription]
    );

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const handleRegenerateDataset = useCallback(
        async (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            if (!csvData) return;

            setRegeneratingDataset(true);
            try {
                const result = await generateDatasetDescription(csvData, fileName, columnStats, modifier, customInstruction);
                setGeneratedResults((prev) => ({...prev, datasetDescription: result.content}));
                setStatus({message: 'Successfully regenerated dataset description!', type: 'success'});
            } catch (error) {
                setStatus({
                    message: `Error regenerating: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error'
                });
            } finally {
                setRegeneratingDataset(false);
            }
        },
        [csvData, fileName, columnStats, generateDatasetDescription]
    );

    const handleRegenerateColumn = useCallback(
        async (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            setRegeneratingColumns((prev) => new Set(prev).add(columnName));
            try {
                const info = columnStats[columnName];
                const colValues = csvData?.map(row => row[columnName]);
                const result = await generateColumnDescription(
                    columnName,
                    info,
                    generatedResults.datasetDescription,
                    colValues,
                    modifier,
                    customInstruction
                );
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: {...prev.columnDescriptions, [columnName]: result.content},
                }));
                setStatus({message: `Successfully regenerated column "${columnName}" description!`, type: 'success'});
            } catch (error) {
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingColumns((prev) => {
                    const next = new Set(prev);
                    next.delete(columnName);
                    return next;
                });
            }
        },
        [csvData, columnStats, generatedResults.datasetDescription, generateColumnDescription]
    );

    const handleGenerateEmptyDescriptions = useCallback(async () => {
        if (!csvData) return;

        const emptyColumns = Object.keys(columnStats).filter(
            (col) => !generatedResults.columnDescriptions[col]?.trim()
        );
        if (emptyColumns.length === 0) {
            setStatus({message: 'All columns already have descriptions.', type: 'info'});
            return;
        }

        setIsGeneratingEmpty(true);
        setGeneratingColumns(new Set(emptyColumns));
        setStatus({
            message: `Generating descriptions for ${emptyColumns.length} empty column(s)...`,
            type: 'info',
        });

        try {
            // Generate dataset description first if empty
            let datasetDesc = generatedResults.datasetDescription;
            if (!datasetDesc.trim()) {
                const dsResult = await generateDatasetDescription(csvData, fileName, columnStats);
                datasetDesc = dsResult.content;
                setGeneratedResults((prev) => ({...prev, datasetDescription: datasetDesc}));
            }

            const columnPromises = emptyColumns.map(async (col) => {
                const info = columnStats[col];
                const colValues = csvData.map((row) => row[col]);
                const result = await generateColumnDescription(col, info, datasetDesc, colValues);
                return {col, result};
            });

            await Promise.all(columnPromises);

            setStatus({
                message: `Successfully generated descriptions for ${emptyColumns.length} column(s)!`,
                type: 'success',
            });
        } catch (error) {
            setStatus({
                message: `Error generating descriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingColumns(new Set());
            setIsGeneratingEmpty(false);
        }
    }, [csvData, columnStats, generatedResults, fileName, generateDatasetDescription, generateColumnDescription]);

    const handleSuggestDatasetImprovement = useCallback(async () => {
        const currentDesc = generatedResults.datasetDescription;
        if (!currentDesc) return;

        setSuggestingDataset(true);
        setDatasetSuggestions('');
        try {
            const prompt = buildDatasetImprovementPrompt(currentDesc);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setDatasetSuggestions(fullContent);
            });
            addTokenUsage(result.usage);
            setStatus({message: 'Suggestions ready for dataset description.', type: 'success'});
        } catch (error) {
            setStatus({
                message: `Error getting suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setSuggestingDataset(false);
        }
    }, [generatedResults.datasetDescription, openaiConfig, promptTemplates.systemPrompt, callOpenAIStream, addTokenUsage]);

    const handleDismissDatasetSuggestions = useCallback(() => {
        setDatasetSuggestions('');
    }, []);

    const handleSuggestColumnImprovement = useCallback(async (columnName: string) => {
        const currentDesc = generatedResults.columnDescriptions[columnName];
        if (!currentDesc) return;

        setSuggestingColumns((prev) => new Set(prev).add(columnName));
        setColumnSuggestions((prev) => ({...prev, [columnName]: ''}));
        try {
            const prompt = buildColumnImprovementPrompt(columnName, currentDesc);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setColumnSuggestions((prev) => ({...prev, [columnName]: fullContent}));
            });
            addTokenUsage(result.usage);
            setStatus({message: `Suggestions ready for column "${columnName}".`, type: 'success'});
        } catch (error) {
            handleRegenerationError(error, setStatus);
        } finally {
            setSuggestingColumns((prev) => {
                const next = new Set(prev);
                next.delete(columnName);
                return next;
            });
        }
    }, [generatedResults.columnDescriptions, openaiConfig, promptTemplates.systemPrompt, callOpenAIStream, addTokenUsage]);

    const handleDismissColumnSuggestions = useCallback((columnName: string) => {
        setColumnSuggestions((prev) => {
            const next = {...prev};
            delete next[columnName];
            return next;
        });
    }, []);

    // Comparison mode regeneration handler (single slot - model or prompt variant)
    const handleRegenerateComparisonDataset = useCallback(
        async (
            slotIndex: number,
            modifier: '' | 'concise' | 'detailed',
            customInstruction?: string
        ) => {
            if (!csvData) return;

            setRegeneratingDatasetModel(slotIndex, true);

            try {
                let prompt: string;
                let config: OpenAIConfigType;
                let systemPrompt: string;

                if (comparisonConfig.subMode === 'prompts') {
                    const variant = comparisonConfig.promptVariants[slotIndex];
                    prompt = buildDatasetPromptFromTemplate(csvData, fileName, columnStats, variant.datasetPrompt, modifier, customInstruction);
                    config = getComparisonModelConfig(comparisonConfig.promptModel);
                    systemPrompt = variant.systemPrompt;
                } else {
                    prompt = buildDatasetPrompt(csvData, fileName, columnStats, modifier, customInstruction);
                    config = getComparisonModelConfig(comparisonConfig.models[slotIndex]);
                    systemPrompt = promptTemplates.systemPrompt;
                }

                let output = '';
                const result = await callOpenAIStream(prompt, config, systemPrompt, (chunk) => {
                    output += chunk;
                    setDatasetComparison((prev) => {
                        const newOutputs = [...prev.outputs];
                        newOutputs[slotIndex] = output;
                        return {...prev, outputs: newOutputs};
                    });
                });

                addComparisonTokenUsage({type: 'model', index: slotIndex}, result.usage);

                if (result.aborted) {
                    setStatus({message: 'Regeneration stopped.', type: 'info'});
                    setRegeneratingDatasetModel(slotIndex, false);
                    return;
                }

                // Get all outputs for judging using flushSync
                let allOutputs: string[] = [];
                flushSync(() => {
                    setDatasetComparison((prev) => {
                        allOutputs = [...prev.outputs];
                        return {...prev, isJudging: true};
                    });
                });

                // Call judge with all outputs
                const slotLabel = comparisonConfig.subMode === 'prompts' ? 'Prompt' : 'Model';
                try {
                    const context = `File: ${fileName}, Rows: ${csvData.length}, Columns: ${Object.keys(columnStats).join(', ')}`;
                    await judgeDatasetOutputs(context, allOutputs);
                    setStatus({
                        message: `Successfully regenerated ${slotLabel} ${slotIndex + 1} description!`,
                        type: 'success'
                    });
                } catch (error) {
                    setDatasetComparison((prev) => ({...prev, isJudging: false}));
                    handleJudgeError(error, setStatus);
                }
            } catch (error) {
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingDatasetModel(slotIndex, false);
            }
        },
        [csvData, setRegeneratingDatasetModel, buildDatasetPrompt, buildDatasetPromptFromTemplate, fileName, columnStats, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, callOpenAIStream, promptTemplates.systemPrompt, addComparisonTokenUsage, setDatasetComparison, judgeDatasetOutputs]
    );

    const handleRegenerateComparisonColumn = useCallback(
        async (
            columnName: string,
            slotIndex: number,
            modifier: '' | 'concise' | 'detailed',
            customInstruction?: string
        ) => {
            const info = columnStats[columnName];
            if (!info) return;

            setRegeneratingColumnModel(slotIndex, columnName, true);

            try {
                // Get the dataset description for context
                const datasetDesc = datasetComparison.outputs[slotIndex] || '';
                const colValues = csvData?.map(row => row[columnName]);

                let prompt: string;
                let config: OpenAIConfigType;
                let systemPrompt: string;

                if (comparisonConfig.subMode === 'prompts') {
                    const variant = comparisonConfig.promptVariants[slotIndex];
                    prompt = buildColumnPromptFromTemplate(columnName, info, datasetDesc, variant.columnPrompt, colValues, modifier, customInstruction);
                    config = getComparisonModelConfig(comparisonConfig.promptModel);
                    systemPrompt = variant.systemPrompt;
                } else {
                    prompt = buildColumnPrompt(columnName, info, datasetDesc, colValues, modifier, customInstruction);
                    config = getComparisonModelConfig(comparisonConfig.models[slotIndex]);
                    systemPrompt = promptTemplates.systemPrompt;
                }

                let output = '';
                const result = await callOpenAIStream(prompt, config, systemPrompt, (chunk) => {
                    output += chunk;
                    setColumnComparisons((prev) => {
                        const currentOutputs = [...(prev[columnName]?.outputs || Array(comparisonSlotCount).fill(''))];
                        currentOutputs[slotIndex] = output;
                        return {
                            ...prev,
                            [columnName]: {
                                ...prev[columnName],
                                outputs: currentOutputs,
                            },
                        };
                    });
                });

                addComparisonTokenUsage({type: 'model', index: slotIndex}, result.usage);

                if (result.aborted) {
                    setStatus({message: 'Regeneration stopped.', type: 'info'});
                    setRegeneratingColumnModel(slotIndex, columnName, false);
                    return;
                }

                // Get all outputs for judging using flushSync
                let allOutputs: string[] = [];
                flushSync(() => {
                    setColumnComparisons((prev) => {
                        allOutputs = [...(prev[columnName]?.outputs || [])];
                        return {
                            ...prev,
                            [columnName]: {...prev[columnName], isJudging: true},
                        };
                    });
                });

                // Call judge with all outputs
                const slotLabel = comparisonConfig.subMode === 'prompts' ? 'Prompt' : 'Model';
                try {
                    const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
                    await judgeColumnOutputs(columnName, context, allOutputs);
                    setStatus({
                        message: `Successfully regenerated ${slotLabel} ${slotIndex + 1} description for "${columnName}"!`,
                        type: 'success'
                    });
                } catch (error) {
                    setColumnComparisons((prev) => ({
                        ...prev,
                        [columnName]: {...prev[columnName], isJudging: false},
                    }));
                    handleJudgeError(error, setStatus);
                }
            } catch (error) {
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingColumnModel(slotIndex, columnName, false);
            }
        },
        [csvData, columnStats, comparisonSlotCount, setRegeneratingColumnModel, datasetComparison.outputs, buildColumnPrompt, buildColumnPromptFromTemplate, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, callOpenAIStream, promptTemplates.systemPrompt, addComparisonTokenUsage, setColumnComparisons, judgeColumnOutputs]
    );

    // Re-judge handlers
    const handleReJudgeDataset = useCallback(async () => {
        if (!csvData || !datasetComparison.outputs.some(o => o)) return;

        setReJudgingDataset(true);
        setDatasetComparison((prev) => ({...prev, isJudging: true}));

        try {
            const context = `File: ${fileName}, Rows: ${csvData.length}, Columns: ${Object.keys(columnStats).join(', ')}`;
            await judgeDatasetOutputs(context, datasetComparison.outputs);
            setStatus({message: 'Successfully re-judged dataset descriptions!', type: 'success'});
        } catch (error) {
            setDatasetComparison((prev) => ({...prev, isJudging: false}));
            setStatus({
                message: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setReJudgingDataset(false);
        }
    }, [csvData, datasetComparison.outputs, setReJudgingDataset, setDatasetComparison, fileName, columnStats, judgeDatasetOutputs]);

    const handleReJudgeColumn = useCallback(async (columnName: string) => {
        const info = columnStats[columnName];
        const columnResult = columnComparisons[columnName];
        if (!info || !columnResult?.outputs.some(o => o)) return;

        setReJudgingColumn(columnName, true);
        setColumnComparisons((prev) => ({
            ...prev,
            [columnName]: {...prev[columnName], isJudging: true},
        }));

        try {
            const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
            await judgeColumnOutputs(columnName, context, columnResult.outputs);
            setStatus({message: `Successfully re-judged "${columnName}" descriptions!`, type: 'success'});
        } catch (error) {
            setColumnComparisons((prev) => ({
                ...prev,
                [columnName]: {...prev[columnName], isJudging: false},
            }));
            handleJudgeError(error, setStatus);
        } finally {
            setReJudgingColumn(columnName, false);
        }
    }, [columnStats, columnComparisons, setReJudgingColumn, setColumnComparisons, judgeColumnOutputs]);

    const handleEditDatasetDescription = useCallback((newDescription: string) => {
        setGeneratedResults((prev) => ({...prev, datasetDescription: newDescription}));
    }, []);

    const handleEditColumnDescription = useCallback((columnName: string, newDescription: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnDescriptions: {...prev.columnDescriptions, [columnName]: newDescription},
        }));
    }, []);

    const handleImport = useCallback(async (file: File) => {
        try {
            const text = await file.text();
            let json: unknown;
            try {
                json = JSON.parse(text);
            } catch {
                setStatus({message: 'Invalid JSON file.', type: 'error'});
                return;
            }

            const result = validateAndParseImport(json);
            if (!result.ok) {
                setStatus({message: `Import failed: ${result.error}`, type: 'error'});
                return;
            }

            const imported = result.data;

            // Reset processing-related state
            setCsvData(null);
            setIsProcessing(false);
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});

            // Common state
            setFileName(imported.fileName);
            setColumnStats(imported.columnStats);
            setIsImportedData(true);
            setImportedRowCount(imported.rowCount);

            if (imported.mode === 'standard') {
                setComparisonEnabled(false);
                setGeneratedResults(imported.generatedResults);
                resetComparisonState();
            } else {
                setComparisonEnabled(true);
                setGeneratedResults({datasetDescription: '', columnDescriptions: {}});

                // Merge partial config into current comparison config
                setComparisonConfig(prev => ({
                    ...prev,
                    ...imported.comparisonConfig,
                }));
                setDatasetComparison(imported.datasetComparison);
                setColumnComparisons(imported.columnComparisons);
                setComparisonTokenUsage(imported.comparisonTokenUsage);
            }

            setShowResults(true);
            setStatus({message: `Successfully imported results from "${file.name}".`, type: 'success'});
        } catch (error) {
            setStatus({
                message: `Import error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        }
    }, [resetComparisonState, setComparisonEnabled, setComparisonConfig, setDatasetComparison, setColumnComparisons, setComparisonTokenUsage]);

    const handleSocrataImport = useCallback(
        async (datasetId: string, appToken?: string, apiKeyId?: string, apiKeySecret?: string) => {
            setIsProcessing(true);
            setShowResults(false);
            setIsImportedData(false);
            setImportedRowCount(0);
            setGeneratedResults({datasetDescription: '', columnDescriptions: {}});
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});

            // Store dataset ID and credentials for push-back
            setSocrataDatasetId(datasetId);
            setSocrataCredentials({appToken, apiKeyId, apiKeySecret});

            if (comparisonEnabled) {
                resetComparisonState();
            }

            try {
                setStatus({message: 'Importing dataset from data.wa.gov...', type: 'info'});

                const result = await fetchSocrataImport(datasetId, appToken, apiKeyId, apiKeySecret);

                if (!result.data || result.data.length === 0) {
                    setStatus({message: 'No data found in dataset', type: 'error'});
                    setIsProcessing(false);
                    return;
                }

                // Set CSV data so all regeneration features work
                setCsvData(result.data);
                setFileName(result.fileName);

                // Analyze columns (same as handleAnalyze)
                setStatus({message: 'Analyzing columns...', type: 'info'});
                const columns = Object.keys(result.data[0]);
                const stats: Record<string, ColumnInfo> = {};
                columns.forEach((col) => {
                    const values = result.data.map((row) => row[col]);
                    stats[col] = analyzeColumn(col, values);
                });
                setColumnStats(stats);

                // Pre-populate descriptions from Socrata metadata
                const columnDescriptions: Record<string, string> = {};
                const fieldNameSet = new Set(result.columns.map((c) => c.fieldName));
                const nameToFieldName = new Map(
                    result.columns.map((c) => [c.name, c.fieldName])
                );
                const fieldNameDescMap = new Map(
                    result.columns.map((c) => [c.fieldName, c.description])
                );
                const displayNameDescMap = new Map(
                    result.columns.map((c) => [c.name, c.description])
                );

                // Build CSV column name → Socrata fieldName mapping
                const fieldMap: Record<string, string> = {};
                columns.forEach((col) => {
                    columnDescriptions[col] = fieldNameDescMap.get(col) || displayNameDescMap.get(col) || '';
                    // CSV header matches fieldName directly, or maps via display name
                    if (fieldNameSet.has(col)) {
                        fieldMap[col] = col;
                    } else if (nameToFieldName.has(col)) {
                        fieldMap[col] = nameToFieldName.get(col)!;
                    }
                });
                setSocrataFieldNameMap(fieldMap);

                setGeneratedResults({
                    datasetDescription: result.datasetDescription || '',
                    columnDescriptions,
                });

                setShowResults(true);
                setStatus({
                    message: `Imported "${result.datasetName}" with ${columns.length} columns. Existing descriptions pre-populated — edit or improve with AI.`,
                    type: 'success',
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({message: `Import error: ${detail}`, type: 'error'});
            } finally {
                setIsProcessing(false);
            }
        },
        [comparisonEnabled, resetComparisonState]
    );

    // Memoized callback for OpenAIConfig onChange
    const handleOpenAIConfigChange = useCallback((newConfig: OpenAIConfigType) => {
        setApiConfig({baseURL: newConfig.baseURL, apiKey: newConfig.apiKey});
        setModel(newConfig.model);
    }, []);

    // Handler for scoring categories change — auto-regenerates judge system prompt
    const handleScoringCategoriesChange = useCallback((categories: ScoringCategory[]) => {
        setComparisonConfig((prev) => {
            const slotCount = prev.subMode === 'models' ? prev.models.length : prev.promptVariants.length;
            const labelPrefix = prev.subMode === 'prompts' ? 'Prompt' : 'Model';
            return {
                ...prev,
                scoringCategories: categories,
                judgeSystemPrompt: generateJudgeSystemPrompt(categories, slotCount, labelPrefix),
            };
        });
    }, []);

    const handleExport = useCallback(() => {
        if (!csvData) return;

        if (comparisonEnabled) {
            // Export comparison results
            const isPromptExport = comparisonConfig.subMode === 'prompts';
            const exportData = {
                metadata: {
                    fileName,
                    rowCount: csvData.length,
                    columnCount: Object.keys(columnStats).length,
                    exportDate: new Date().toISOString(),
                    mode: 'comparison',
                    subMode: comparisonConfig.subMode,
                    ...(isPromptExport ? {
                        model: comparisonConfig.promptModel,
                        promptVariants: comparisonConfig.promptVariants.map((v, i) => ({
                            index: i,
                            label: v.label,
                            systemPrompt: v.systemPrompt,
                            datasetPrompt: v.datasetPrompt,
                            columnPrompt: v.columnPrompt,
                        })),
                    } : {
                        models: comparisonConfig.models.map((m, i) => ({
                            index: i,
                            name: m,
                            label: getModelLabel(i, m || undefined),
                        })),
                    }),
                    judgeModel: comparisonConfig.judgeModel,
                },
                datasetDescription: {
                    outputs: datasetComparison.outputs.map((output, i) => ({
                        slotIndex: i,
                        slotName: isPromptExport
                            ? comparisonConfig.promptVariants[i]?.label
                            : comparisonConfig.models[i],
                        output,
                    })),
                    judgeResult: datasetComparison.judgeResult,
                },
                columns: Object.entries(columnStats).map(([name, info]) => ({
                    name,
                    type: info.type,
                    statistics: info.stats,
                    outputs: (columnComparisons[name]?.outputs || []).map((output, i) => ({
                        slotIndex: i,
                        slotName: isPromptExport
                            ? comparisonConfig.promptVariants[i]?.label
                            : comparisonConfig.models[i],
                        output,
                    })),
                    judgeResult: columnComparisons[name]?.judgeResult || null,
                })),
                tokenUsage: comparisonTokenUsage,
            };

            const suffix = isPromptExport ? '_prompt_comparison' : '_comparison';
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName.replace('.csv', '')}${suffix}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            // Original export
            const exportData = {
                metadata: {
                    fileName,
                    rowCount: csvData.length,
                    columnCount: Object.keys(columnStats).length,
                    exportDate: new Date().toISOString(),
                },
                datasetDescription: generatedResults.datasetDescription,
                columns: Object.entries(columnStats).map(([name, info]) => ({
                    name,
                    type: info.type,
                    statistics: info.stats,
                    description: generatedResults.columnDescriptions[name] || '',
                })),
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName.replace('.csv', '')}_analysis.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        setStatus({message: 'File downloaded successfully!', type: 'success'});
    }, [csvData, fileName, columnStats, generatedResults, comparisonEnabled, comparisonConfig, datasetComparison, columnComparisons, comparisonTokenUsage]);

    const handlePushToSocrata = useCallback(async () => {
        if (!socrataDatasetId) return;

        setIsPushingSocrata(true);
        setStatus({message: 'Pushing metadata to data.wa.gov...', type: 'info'});

        try {
            // Build column updates from current descriptions
            const columnUpdates = Object.entries(generatedResults.columnDescriptions)
                .filter(([, desc]) => desc) // skip empty descriptions
                .map(([colName, desc]) => ({
                    fieldName: socrataFieldNameMap[colName] || colName,
                    description: desc,
                }));

            const result = await pushSocrataMetadata(
                socrataDatasetId,
                generatedResults.datasetDescription || undefined,
                columnUpdates,
                socrataCredentials.appToken,
                socrataCredentials.apiKeyId,
                socrataCredentials.apiKeySecret,
            );

            setStatus({message: result.message, type: 'success'});
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({message: `Push error: ${detail}`, type: 'error'});
        } finally {
            setIsPushingSocrata(false);
        }
    }, [socrataDatasetId, generatedResults, socrataFieldNameMap, socrataCredentials]);

    const renderTokenUsage = () => {
        if (comparisonEnabled && comparisonTokenUsage.total.totalTokens > 0) {
            const getSlotModel = (i: number) =>
                comparisonConfig.subMode === 'prompts'
                    ? comparisonConfig.promptModel
                    : comparisonConfig.models[i];

            return (
                <div className="tokenUsage comparison">
                    {Array.from({length: comparisonSlotCount}, (_, i) => (
                        <div className="tokenUsageRow" key={i}>
                            <span className="tokenLabel">{comparisonSlotShortNames[i]}:</span>
                            <span
                                className="tokenValue">{comparisonTokenUsage.models[i]?.totalTokens.toLocaleString() || 0} tokens</span>
                            {(() => {
                                const usage = comparisonTokenUsage.models[i];
                                if (!usage) return null;
                                const cost = getEstimatedCost(
                                    getSlotModel(i),
                                    usage.promptTokens,
                                    usage.completionTokens
                                );
                                return cost !== null ? <span className="tokenCost">~${cost.toFixed(4)}</span> : null;
                            })()}
                        </div>
                    ))}
                    <div className="tokenUsageRow">
                        <span className="tokenLabel">Judge:</span>
                        <span
                            className="tokenValue">{comparisonTokenUsage.judge.totalTokens.toLocaleString()} tokens</span>
                        {(() => {
                            const cost = getEstimatedCost(
                                comparisonConfig.judgeModel,
                                comparisonTokenUsage.judge.promptTokens,
                                comparisonTokenUsage.judge.completionTokens
                            );
                            return cost !== null ? <span className="tokenCost judge">~${cost.toFixed(4)}</span> : null;
                        })()}
                    </div>
                    <div className="tokenUsageRow total">
                        <span className="tokenLabel">Total:</span>
                        <span
                            className="tokenValue tokenTotal">{comparisonTokenUsage.total.totalTokens.toLocaleString()} tokens</span>
                        {(() => {
                            let totalCost = 0;
                            for (let i = 0; i < comparisonSlotCount; i++) {
                                const usage = comparisonTokenUsage.models[i];
                                if (usage) {
                                    totalCost += getEstimatedCost(getSlotModel(i), usage.promptTokens, usage.completionTokens) || 0;
                                }
                            }
                            totalCost += getEstimatedCost(comparisonConfig.judgeModel, comparisonTokenUsage.judge.promptTokens, comparisonTokenUsage.judge.completionTokens) || 0;
                            return totalCost > 0 ?
                                <span className="tokenCost total">~${totalCost.toFixed(4)}</span> : null;
                        })()}
                    </div>
                </div>
            );
        }

        if (tokenUsage.totalTokens > 0) {
            return (
                <div className="tokenUsage">
                    <span className="tokenLabel">Token Usage:</span>
                    <span className="tokenValue">{tokenUsage.promptTokens.toLocaleString()} prompt</span>
                    <span className="tokenSeparator">|</span>
                    <span className="tokenValue">{tokenUsage.completionTokens.toLocaleString()} completion</span>
                    <span className="tokenSeparator">|</span>
                    <span className="tokenValue tokenTotal">{tokenUsage.totalTokens.toLocaleString()} total</span>
                    {(() => {
                        const cost = getEstimatedCost(
                            openaiConfig.model,
                            tokenUsage.promptTokens,
                            tokenUsage.completionTokens
                        );
                        return cost !== null ? (
                            <>
                                <span className="tokenSeparator">|</span>
                                <span className="tokenCost">~${cost.toFixed(4)}</span>
                            </>
                        ) : null;
                    })()}
                </div>
            );
        }

        return null;
    };

    // Helper to get the set of model indices generating a specific column
    const getColumnGeneratingModels = useCallback((columnName: string): Set<number> => {
        const result = new Set<number>();
        generatingColumnModels.forEach((cols, modelIndex) => {
            if (cols.has(columnName)) result.add(modelIndex);
        });
        return result;
    }, [generatingColumnModels]);

    const getColumnRegeneratingModels = useCallback((columnName: string): Set<number> => {
        const result = new Set<number>();
        regeneratingColumnModels.forEach((cols, modelIndex) => {
            if (cols.has(columnName)) result.add(modelIndex);
        });
        return result;
    }, [regeneratingColumnModels]);

    return (
        <div className="container">
            <Header/>
            <div className="content">
                <HowItWorks/>

                <OpenAIConfig
                    config={openaiConfig}
                    onChange={handleOpenAIConfigChange}
                    showModel={!comparisonEnabled}
                />

                <ComparisonMode
                    enabled={comparisonEnabled}
                    onToggle={handleComparisonToggle}
                    config={comparisonConfig}
                    onChange={handleComparisonConfigChange}
                    isGenerating={isAnyModelGenerating}
                    promptTemplates={promptTemplates}
                />

                <PromptEditor
                    templates={promptTemplates}
                    onChange={setPromptTemplates}
                    comparisonEnabled={comparisonEnabled}
                    comparisonSubMode={comparisonConfig.subMode}
                    judgeSystemPrompt={comparisonConfig.judgeSystemPrompt}
                    onJudgeSystemPromptChange={(prompt) =>
                        setComparisonConfig((prev) => ({...prev, judgeSystemPrompt: prompt}))
                    }
                    judgeEvaluationPrompt={comparisonConfig.judgeEvaluationPrompt}
                    onJudgeEvaluationPromptChange={(prompt) =>
                        setComparisonConfig((prev) => ({...prev, judgeEvaluationPrompt: prompt}))
                    }
                    scoringCategories={comparisonConfig.scoringCategories}
                    onScoringCategoriesChange={handleScoringCategoriesChange}
                />
                <CsvInput
                    onAnalyze={handleAnalyze}
                    onSocrataImport={handleSocrataImport}
                    isProcessing={isProcessing}
                />
                <ImportSection
                    onImport={handleImport}
                    disabled={isProcessing}
                />

                <StatusMessage
                    status={status}
                    isProcessing={isProcessing}
                    onStop={handleStop}
                />

                {renderTokenUsage()}

                {showResults && (
                    <div className="results">
                        {isImportedData && (
                            <div className="import-warning-banner">
                                Viewing imported results. Regeneration requires the original CSV data.
                            </div>
                        )}
                        {comparisonEnabled ? (
                            // Comparison mode results
                            <>
                                {datasetComparison.outputs.some(o => o) && (
                                    <DatasetComparison
                                        result={datasetComparison}
                                        fileName={fileName}
                                        rowCount={csvData?.length || importedRowCount}
                                        columnCount={Object.keys(columnStats).length}
                                        modelNames={comparisonSlotNames}
                                        generatingModels={generatingDatasetModels}
                                        regeneratingModels={regeneratingDatasetModels}
                                        onRegenerate={handleRegenerateComparisonDataset}
                                        onReJudge={handleReJudgeDataset}
                                        isReJudging={reJudgingDataset}
                                        scoringCategories={comparisonConfig.scoringCategories}
                                    />
                                )}

                                {Object.keys(columnComparisons).length > 0 && (
                                    <div className="section">
                                        <div className="sectionTitle">Column Description Comparisons</div>
                                        {Object.entries(columnStats).map(([name, info]) => (
                                            <ColumnComparison
                                                key={name}
                                                columnName={name}
                                                columnInfo={info}
                                                result={columnComparisons[name] || {
                                                    outputs: Array(comparisonSlotCount).fill(''),
                                                    judgeResult: null,
                                                    isJudging: false,
                                                }}
                                                modelNames={comparisonSlotShortNames}
                                                generatingModels={getColumnGeneratingModels(name)}
                                                regeneratingModels={getColumnRegeneratingModels(name)}
                                                onRegenerate={(modelIndex, modifier, customInstruction) =>
                                                    handleRegenerateComparisonColumn(name, modelIndex, modifier, customInstruction)
                                                }
                                                onReJudge={() => handleReJudgeColumn(name)}
                                                isReJudging={reJudgingColumns.has(name)}
                                                scoringCategories={comparisonConfig.scoringCategories}
                                            />
                                        ))}
                                    </div>
                                )}

                                {(datasetComparison.judgeResult || Object.values(columnComparisons).some(c => c.judgeResult)) && (
                                    <ExportSection
                                        onExport={handleExport}
                                        onPushToSocrata={handlePushToSocrata}
                                        isPushingSocrata={isPushingSocrata}
                                        showSocrataPush={!!socrataDatasetId}
                                    />
                                )}
                            </>
                        ) : (
                            // Single mode results (original)
                            <>
                                {generatedResults.datasetDescription && (
                                    <DatasetDescription
                                        description={generatedResults.datasetDescription}
                                        fileName={fileName}
                                        rowCount={csvData?.length || importedRowCount}
                                        columnCount={Object.keys(columnStats).length}
                                        onEdit={handleEditDatasetDescription}
                                        onRegenerate={handleRegenerateDataset}
                                        onSuggestImprovement={handleSuggestDatasetImprovement}
                                        onDismissSuggestions={handleDismissDatasetSuggestions}
                                        suggestions={datasetSuggestions}
                                        isSuggesting={suggestingDataset}
                                        isRegenerating={regeneratingDataset}
                                    />
                                )}

                                {(generatingColumns.size > 0 || Object.keys(generatedResults.columnDescriptions).length > 0) && (
                                    <div className="section">
                                        <div className="sectionTitle">
                                            Column Descriptions
                                            {Object.keys(columnStats).some(col => !generatedResults.columnDescriptions[col]?.trim()) && csvData && (
                                                <button
                                                    className="generate-empty-btn"
                                                    onClick={handleGenerateEmptyDescriptions}
                                                    disabled={isGeneratingEmpty || isProcessing}
                                                >
                                                    {isGeneratingEmpty
                                                        ? `Generating (${Object.keys(columnStats).filter(col => !generatedResults.columnDescriptions[col]?.trim()).length} remaining)...`
                                                        : `Generate ${Object.keys(columnStats).filter(col => !generatedResults.columnDescriptions[col]?.trim()).length} Empty Descriptions`}
                                                </button>
                                            )}
                                        </div>
                                        <div className="columnsGrid">
                                            {Object.entries(columnStats).map(([name, info]) => (
                                                <ColumnCard
                                                    key={name}
                                                    name={name}
                                                    info={info}
                                                    description={generatedResults.columnDescriptions[name] || ''}
                                                    onEdit={(newDesc) => handleEditColumnDescription(name, newDesc)}
                                                    onRegenerate={(modifier, customInstruction) =>
                                                        handleRegenerateColumn(name, modifier, customInstruction)
                                                    }
                                                    onSuggestImprovement={() => handleSuggestColumnImprovement(name)}
                                                    onDismissSuggestions={() => handleDismissColumnSuggestions(name)}
                                                    suggestions={columnSuggestions[name] || ''}
                                                    isSuggesting={suggestingColumns.has(name)}
                                                    isRegenerating={regeneratingColumns.has(name)}
                                                    isGenerating={generatingColumns.has(name)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {Object.keys(generatedResults.columnDescriptions).length > 0 && (
                                    <ExportSection
                                        onExport={handleExport}
                                        onPushToSocrata={handlePushToSocrata}
                                        isPushingSocrata={isPushingSocrata}
                                        showSocrataPush={!!socrataDatasetId}
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
