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
import { ComparisonMode } from './components/ComparisonMode/ComparisonMode';
import { DatasetComparison } from './components/DatasetComparison/DatasetComparison';
import { ColumnComparison } from './components/ColumnComparison/ColumnComparison';
import { useOpenAI } from './hooks/useOpenAI';
import { useComparisonGeneration } from './hooks/useComparisonGeneration';
import { generateJudgeSystemPrompt, useComparisonState } from './hooks/useComparisonState';
import { parseFile, parseUrl } from './utils/csvParser';
import { analyzeColumn, getColumnStatsText } from './utils/columnAnalyzer';
import { getEstimatedCost } from './utils/pricing';
import { getModelLabel } from './utils/modelColors';
import { handleJudgeError, handleRegenerationError } from './utils/stateHelpers';
import type {
    APIConfig,
    CategoricalStats,
    ColumnComparisonResult,
    ColumnInfo,
    CsvRow,
    GeneratedResults,
    NumericStats,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
    ScoringCategory,
    Status,
    TokenUsage,
} from './types';
import './App.css';

const DEFAULT_SYSTEM_PROMPT = `You are an expert technical writer specializing in government open data documentation.

Your task is to generate clear, accessible metadata descriptions that help the public understand and use government datasets.

Guidelines:
- Use plain language: avoid jargon, acronyms, and technical terms when possible
- When acronyms are necessary, expand them on first use
- Write in active voice with simple, direct sentences
- Be concise but complete: cover what the data contains and how it can be used
- Focus on practical value: who would use this data and why
- Maintain a neutral, professional tone appropriate for government publications
- Follow U.S. open data standards for consistency and accessibility`;

const DEFAULT_DATASET_PROMPT = `Generate a concise 2-3 sentence description of this dataset:

File Name: {fileName}
Number of Rows: {rowCount}
Columns:
{columnInfo}

Provide a brief overview of what this dataset contains and its potential use cases.`;

const DEFAULT_COLUMN_PROMPT = `Given this dataset context:
{datasetDescription}

Generate a concise 1-2 sentence description for the column "{columnName}".

Column statistics:
{columnStats}

Describe what this column represents and its role in the dataset.`;

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
    const [generatingColumns, setGeneratingColumns] = useState<Set<string>>(new Set());
    const [regeneratingDataset, setRegeneratingDataset] = useState(false);
    const [regeneratingColumns, setRegeneratingColumns] = useState<Set<string>>(new Set());
    const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    });

    // Comparison Mode State (extracted to custom hook)
    const comparison = useComparisonState();
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
        modelCount,
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

    // Handler for toggling comparison mode - clears status and token usage
    const handleComparisonToggle = useCallback((enabled: boolean) => {
        setComparisonEnabled(enabled);
        setStatus(null);
        // Clear token usage when switching modes
        if (enabled) {
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});
        } else {
            setComparisonTokenUsage({
                models: comparisonConfig.models.map(() => ({...EMPTY_TOKEN_USAGE})),
                judge: {...EMPTY_TOKEN_USAGE},
                total: {...EMPTY_TOKEN_USAGE},
            });
        }
    }, [setComparisonEnabled, setComparisonTokenUsage, comparisonConfig.models]);
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
            .map(([col, info]) => {
                let desc = `- ${col} (${info.type})`;
                if (info.type === 'numeric') {
                    const s = info.stats as NumericStats;
                    desc += `: range [${s.min.toFixed(2)} - ${s.max.toFixed(2)}], avg: ${s.mean.toFixed(2)}, median: ${s.median.toFixed(2)}`;
                } else if (info.type === 'categorical') {
                    const s = info.stats as CategoricalStats;
                    desc += `: ${s.uniqueCount} unique values [${s.values.join(', ')}${s.hasMore ? ', ...' : ''}]`;
                } else if (info.type === 'text') {
                    const s = info.stats as { uniqueCount: number; samples: string[] };
                    desc += `: ${s.uniqueCount} unique values, samples: ${s.samples.slice(0, 2).join(', ')}...`;
                }
                return desc;
            })
            .join('\n');
    }, []);

    const buildDatasetPrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        modifier: '' | 'concise' | 'detailed' = '',
        customInstruction?: string
    ): string => {
        const columnInfo = buildColumnInfo(stats);
        let prompt = promptTemplates.dataset
            .replace('{fileName}', name)
            .replace('{rowCount}', String(data.length))
            .replace('{columnInfo}', columnInfo);

        if (modifier === 'concise') {
            prompt += '\n\nIMPORTANT: Make this description MORE CONCISE. Use fewer words while keeping key information.';
        } else if (modifier === 'detailed') {
            prompt += '\n\nIMPORTANT: Make this description MORE DETAILED. Provide additional context and insights.';
        }

        if (customInstruction) {
            prompt += `\n\nAdditional instruction: ${customInstruction}`;
        }

        return prompt;
    }, [promptTemplates.dataset, buildColumnInfo]);

    const buildColumnPrompt = useCallback((
        columnName: string,
        info: ColumnInfo,
        datasetDesc: string,
        modifier: '' | 'concise' | 'detailed' = '',
        customInstruction?: string
    ): string => {
        const statsText = getColumnStatsText(info);

        let prompt = promptTemplates.column
            .replace('{datasetDescription}', datasetDesc)
            .replace('{columnName}', columnName)
            .replace('{columnStats}', statsText);

        if (modifier === 'concise') {
            prompt += '\n\nIMPORTANT: Make this description MORE CONCISE. Use fewer words while keeping key information.';
        } else if (modifier === 'detailed') {
            prompt += '\n\nIMPORTANT: Make this description MORE DETAILED. Provide additional context and insights.';
        }

        if (customInstruction) {
            prompt += `\n\nAdditional instruction: ${customInstruction}`;
        }

        return prompt;
    }, [promptTemplates.column]);

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
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string,
            abortSignal?: AbortSignal
        ): Promise<{ content: string; aborted: boolean }> => {
            const prompt = buildColumnPrompt(columnName, info, datasetDesc, modifier, customInstruction);

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

    // Get display names for comparison models
    const comparisonModelNames = comparisonConfig.models.map((m, i) =>
        getModelLabel(i, m || undefined)
    );

    // Short names for token usage display
    const comparisonModelShortNames = comparisonConfig.models.map((m, i) =>
        m || `Model ${i + 1}`
    );

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
            const prompt = buildDatasetPrompt(data, name, stats);

            // Mark all models as generating
            for (let i = 0; i < modelCount; i++) {
                setGeneratingDatasetModel(i, true);
            }

            const outputs: string[] = Array(modelCount).fill('');

            const configs = comparisonConfig.models.map(m => getComparisonModelConfig(m));
            const prompts = Array(modelCount).fill(prompt);

            const onChunks = comparisonConfig.models.map((_, i) => (chunk: string) => {
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
                promptTemplates.systemPrompt,
                onChunks,
                abortSignal
            );

            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({type: 'model', index: i}, usage);
            });

            for (let i = 0; i < modelCount; i++) {
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
        [buildDatasetPrompt, modelCount, comparisonConfig.models, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingDatasetModel, setDatasetComparison, judgeDatasetOutputs]
    );

    const generateColumnComparisonDescription = useCallback(
        async (
            columnName: string,
            info: ColumnInfo,
            datasetDescs: string[],
            abortSignal?: AbortSignal
        ): Promise<{ aborted: boolean }> => {
            // Mark all models as generating this column
            for (let i = 0; i < modelCount; i++) {
                setGeneratingColumnModel(i, columnName, true);
            }

            const outputs: string[] = Array(modelCount).fill('');

            const configs = comparisonConfig.models.map(m => getComparisonModelConfig(m));
            const prompts = comparisonConfig.models.map((_, i) =>
                buildColumnPrompt(columnName, info, datasetDescs[i])
            );

            const onChunks = comparisonConfig.models.map((_, i) => (chunk: string) => {
                outputs[i] += chunk;
                const currentOutput = outputs[i];
                setColumnComparisons((prev) => {
                    const newOutputs = [...(prev[columnName]?.outputs || Array(modelCount).fill(''))];
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
                promptTemplates.systemPrompt,
                onChunks,
                abortSignal
            );

            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({type: 'model', index: i}, usage);
            });

            for (let i = 0; i < modelCount; i++) {
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
        [buildColumnPrompt, modelCount, comparisonConfig.models, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingColumnModel, setColumnComparisons, judgeColumnOutputs]
    );

    const handleAnalyze = useCallback(
        async (method: 'file' | 'url', file?: File, url?: string, socrataToken?: string) => {

            // Create a new abort controller
            abortControllerRef.current = new AbortController();
            const abortSignal = abortControllerRef.current.signal;

            setIsProcessing(true);
            setShowResults(false);
            setGeneratedResults({datasetDescription: '', columnDescriptions: {}});
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});

            // Reset comparison state
            if (comparisonEnabled) {
                resetComparisonState();
            }

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
                    setStatus({
                        message: `Generating dataset descriptions (${modelCount} models in parallel)...`,
                        type: 'info'
                    });

                    // Initialize column comparisons
                    const initialColumnComparisons: Record<string, ColumnComparisonResult> = {};
                    columns.forEach((col) => {
                        initialColumnComparisons[col] = {
                            outputs: Array(modelCount).fill(''),
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
                    setStatus({
                        message: `Generating column descriptions for ${columns.length} columns...`,
                        type: 'info'
                    });

                    const columnPromises = columns.map(async (col) => {
                        const info = stats[col];
                        return generateColumnComparisonDescription(col, info, datasetDescs, abortSignal);
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
                    setStatus({message: `Generating descriptions for ${columns.length} columns...`, type: 'info'});
                    setGeneratingColumns(new Set(columns));

                    const columnPromises = columns.map(async (col) => {
                        const info = stats[col];
                        const colResult = await generateColumnDescription(col, info, datasetDesc, '', undefined, abortSignal);
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
                    setStatus({
                        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        type: 'error'
                    });
                }
            } finally {
                setIsProcessing(false);
            }
        },
        [comparisonEnabled, modelCount, resetComparisonState, setColumnComparisons, generateDatasetComparisonDescription, setDatasetComparison, generateColumnComparisonDescription, generateDatasetDescription, generateColumnDescription]
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
                const result = await generateColumnDescription(
                    columnName,
                    info,
                    generatedResults.datasetDescription,
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
        [columnStats, generatedResults.datasetDescription, generateColumnDescription]
    );

    // Comparison mode regeneration handler (single model)
    const handleRegenerateComparisonDataset = useCallback(
        async (
            modelIndex: number,
            modifier: '' | 'concise' | 'detailed',
            customInstruction?: string
        ) => {
            if (!csvData) return;

            setRegeneratingDatasetModel(modelIndex, true);

            try {
                const prompt = buildDatasetPrompt(csvData, fileName, columnStats, modifier, customInstruction);
                const modelName = comparisonConfig.models[modelIndex];
                const config = getComparisonModelConfig(modelName);

                let output = '';
                const result = await callOpenAIStream(prompt, config, promptTemplates.systemPrompt, (chunk) => {
                    output += chunk;
                    setDatasetComparison((prev) => {
                        const newOutputs = [...prev.outputs];
                        newOutputs[modelIndex] = output;
                        return {...prev, outputs: newOutputs};
                    });
                });

                addComparisonTokenUsage({type: 'model', index: modelIndex}, result.usage);

                if (result.aborted) {
                    setStatus({message: 'Regeneration stopped.', type: 'info'});
                    setRegeneratingDatasetModel(modelIndex, false);
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
                try {
                    const context = `File: ${fileName}, Rows: ${csvData.length}, Columns: ${Object.keys(columnStats).join(', ')}`;
                    await judgeDatasetOutputs(context, allOutputs);
                    setStatus({
                        message: `Successfully regenerated Model ${modelIndex + 1} description!`,
                        type: 'success'
                    });
                } catch (error) {
                    setDatasetComparison((prev) => ({...prev, isJudging: false}));
                    handleJudgeError(error, setStatus);
                }
            } catch (error) {
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingDatasetModel(modelIndex, false);
            }
        },
        [csvData, setRegeneratingDatasetModel, buildDatasetPrompt, fileName, columnStats, comparisonConfig.models, getComparisonModelConfig, callOpenAIStream, promptTemplates.systemPrompt, addComparisonTokenUsage, setDatasetComparison, judgeDatasetOutputs]
    );

    const handleRegenerateComparisonColumn = useCallback(
        async (
            columnName: string,
            modelIndex: number,
            modifier: '' | 'concise' | 'detailed',
            customInstruction?: string
        ) => {
            const info = columnStats[columnName];
            if (!info) return;

            setRegeneratingColumnModel(modelIndex, columnName, true);

            try {
                // Get the dataset description for context
                const datasetDesc = datasetComparison.outputs[modelIndex] || '';
                const prompt = buildColumnPrompt(columnName, info, datasetDesc, modifier, customInstruction);
                const modelName = comparisonConfig.models[modelIndex];
                const config = getComparisonModelConfig(modelName);

                let output = '';
                const result = await callOpenAIStream(prompt, config, promptTemplates.systemPrompt, (chunk) => {
                    output += chunk;
                    setColumnComparisons((prev) => {
                        const currentOutputs = [...(prev[columnName]?.outputs || Array(modelCount).fill(''))];
                        currentOutputs[modelIndex] = output;
                        return {
                            ...prev,
                            [columnName]: {
                                ...prev[columnName],
                                outputs: currentOutputs,
                            },
                        };
                    });
                });

                addComparisonTokenUsage({type: 'model', index: modelIndex}, result.usage);

                if (result.aborted) {
                    setStatus({message: 'Regeneration stopped.', type: 'info'});
                    setRegeneratingColumnModel(modelIndex, columnName, false);
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
                try {
                    const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
                    await judgeColumnOutputs(columnName, context, allOutputs);
                    setStatus({
                        message: `Successfully regenerated Model ${modelIndex + 1} description for "${columnName}"!`,
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
                setRegeneratingColumnModel(modelIndex, columnName, false);
            }
        },
        [columnStats, modelCount, setRegeneratingColumnModel, datasetComparison.outputs, buildColumnPrompt, comparisonConfig.models, getComparisonModelConfig, callOpenAIStream, promptTemplates.systemPrompt, addComparisonTokenUsage, setColumnComparisons, judgeColumnOutputs]
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

    // Memoized callback for OpenAIConfig onChange
    const handleOpenAIConfigChange = useCallback((newConfig: OpenAIConfigType) => {
        setApiConfig({baseURL: newConfig.baseURL, apiKey: newConfig.apiKey});
        setModel(newConfig.model);
    }, []);

    // Handler for scoring categories change — auto-regenerates judge system prompt
    const handleScoringCategoriesChange = useCallback((categories: ScoringCategory[]) => {
        setComparisonConfig((prev) => ({
            ...prev,
            scoringCategories: categories,
            judgeSystemPrompt: generateJudgeSystemPrompt(categories, prev.models.length),
        }));
    }, []);

    const handleExport = useCallback(() => {
        if (!csvData) return;

        if (comparisonEnabled) {
            // Export comparison results
            const exportData = {
                metadata: {
                    fileName,
                    rowCount: csvData.length,
                    columnCount: Object.keys(columnStats).length,
                    exportDate: new Date().toISOString(),
                    mode: 'comparison',
                    models: comparisonConfig.models.map((m, i) => ({
                        index: i,
                        name: m,
                        label: getModelLabel(i, m || undefined),
                    })),
                    judgeModel: comparisonConfig.judgeModel,
                },
                datasetDescription: {
                    outputs: datasetComparison.outputs.map((output, i) => ({
                        modelIndex: i,
                        modelName: comparisonConfig.models[i],
                        output,
                    })),
                    judgeResult: datasetComparison.judgeResult,
                },
                columns: Object.entries(columnStats).map(([name, info]) => ({
                    name,
                    type: info.type,
                    statistics: info.stats,
                    outputs: (columnComparisons[name]?.outputs || []).map((output, i) => ({
                        modelIndex: i,
                        modelName: comparisonConfig.models[i],
                        output,
                    })),
                    judgeResult: columnComparisons[name]?.judgeResult || null,
                })),
                tokenUsage: comparisonTokenUsage,
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName.replace('.csv', '')}_comparison.json`;
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

    const renderTokenUsage = () => {
        if (comparisonEnabled && comparisonTokenUsage.total.totalTokens > 0) {
            return (
                <div className="tokenUsage comparison">
                    {comparisonConfig.models.map((modelName, i) => (
                        <div className="tokenUsageRow" key={i}>
                            <span className="tokenLabel">{comparisonModelShortNames[i]}:</span>
                            <span
                                className="tokenValue">{comparisonTokenUsage.models[i]?.totalTokens.toLocaleString() || 0} tokens</span>
                            {(() => {
                                const usage = comparisonTokenUsage.models[i];
                                if (!usage) return null;
                                const cost = getEstimatedCost(
                                    modelName,
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
                            comparisonConfig.models.forEach((modelName, i) => {
                                const usage = comparisonTokenUsage.models[i];
                                if (usage) {
                                    totalCost += getEstimatedCost(modelName, usage.promptTokens, usage.completionTokens) || 0;
                                }
                            });
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
                    onChange={setComparisonConfig}
                    isGenerating={isAnyModelGenerating}
                />

                <PromptEditor
                    templates={promptTemplates}
                    onChange={setPromptTemplates}
                    comparisonEnabled={comparisonEnabled}
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
                    isProcessing={isProcessing}
                />

                <StatusMessage
                    status={status}
                    isProcessing={isProcessing}
                    onStop={handleStop}
                />

                {renderTokenUsage()}

                {showResults && (
                    <div className="results">
                        {comparisonEnabled ? (
                            // Comparison mode results
                            <>
                                {datasetComparison.outputs.some(o => o) && (
                                    <DatasetComparison
                                        result={datasetComparison}
                                        fileName={fileName}
                                        rowCount={csvData?.length || 0}
                                        columnCount={Object.keys(columnStats).length}
                                        modelNames={comparisonModelNames}
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
                                                    outputs: Array(modelCount).fill(''),
                                                    judgeResult: null,
                                                    isJudging: false,
                                                }}
                                                modelNames={comparisonModelShortNames}
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
                                    <ExportSection onExport={handleExport}/>
                                )}
                            </>
                        ) : (
                            // Single mode results (original)
                            <>
                                {generatedResults.datasetDescription && (
                                    <DatasetDescription
                                        description={generatedResults.datasetDescription}
                                        fileName={fileName}
                                        rowCount={csvData?.length || 0}
                                        columnCount={Object.keys(columnStats).length}
                                        onEdit={handleEditDatasetDescription}
                                        onRegenerate={handleRegenerateDataset}
                                        isRegenerating={regeneratingDataset}
                                    />
                                )}

                                {(generatingColumns.size > 0 || Object.keys(generatedResults.columnDescriptions).length > 0) && (
                                    <div className="section">
                                        <div className="sectionTitle">Column Descriptions</div>
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
                                                    isRegenerating={regeneratingColumns.has(name)}
                                                    isGenerating={generatingColumns.has(name)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {Object.keys(generatedResults.columnDescriptions).length > 0 && (
                                    <ExportSection onExport={handleExport}/>
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
