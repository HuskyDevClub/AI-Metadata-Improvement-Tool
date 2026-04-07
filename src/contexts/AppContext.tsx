import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useOpenAI } from '../hooks/useOpenAI';
import { useComparisonGeneration } from '../hooks/useComparisonGeneration';
import { generateJudgeSystemPrompt, useComparisonState } from '../hooks/useComparisonState';
import {
    fetchSocrataImport,
    fetchSocrataOAuthLoginUrl,
    fetchSocrataOAuthUserInfo,
    parseFile,
    parseUrl,
    pushSocrataMetadata,
} from '../utils/csvParser';
import {
    analyzeColumn,
    buildSampleRows,
    getColumnStatsText,
    getSampleCount,
    getSampleValues
} from '../utils/columnAnalyzer';
import { getEstimatedCost } from '../utils/pricing';
import { getModelLabel, getVariantLabel } from '../utils/modelColors';
import { handleJudgeError, handleRegenerationError } from '../utils/stateHelpers';
import {
    appendPromptModifiers,
    buildColumnImprovementPrompt,
    buildDatasetImprovementPrompt,
    buildRegenerateWithSuggestionsPrompt,
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_ROW_LABEL_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    type SuggestionItem,
} from '../utils/prompts';
import { EMPTY_TOKEN_USAGE } from '../utils/config';
import type {
    APIConfig,
    ColumnComparisonResult,
    ColumnInfo,
    ComparisonConfig,
    ComparisonTokenUsage,
    CsvRow,
    DatasetComparisonResult,
    GeneratedResults,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
    ScoringCategory,
    Status,
    TokenUsage,
} from '../types';

function parseSuggestions(text: string): SuggestionItem[] {
    // Split on lines starting with bullet points, dashes, or asterisks
    const lines = text.split('\n').filter((line) => /^\s*[-*•]\s+/.test(line));
    if (lines.length === 0) {
        // If no bullet points found, split by sentences as fallback
        const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 10);
        return sentences.map((s, i) => ({
            id: `suggestion-${i}-${Date.now()}`,
            text: s.trim(),
            selected: true,
            edited: false,
        }));
    }
    return lines.map((line, i) => ({
        id: `suggestion-${i}-${Date.now()}`,
        text: line.replace(/^\s*[-*•]\s+/, '').trim(),
        selected: true,
        edited: false,
    }));
}

export type PageId = 'import' | 'data' | 'field' | 'compare' | 'settings';

interface AppContextType {
    // Navigation
    currentPage: PageId;
    currentFieldName: string | null;
    navigate: (page: PageId, fieldName?: string) => void;

    // API & Config
    apiConfig: APIConfig;
    model: string;
    openaiConfig: OpenAIConfigType;
    promptTemplates: PromptTemplates;
    setPromptTemplates: React.Dispatch<React.SetStateAction<PromptTemplates>>;
    handleOpenAIConfigChange: (config: OpenAIConfigType) => void;

    // CSV Data
    csvData: CsvRow[] | null;
    fileName: string;
    columnStats: Record<string, ColumnInfo>;
    generatedResults: GeneratedResults;
    showResults: boolean;
    isImportedData: boolean;
    importedRowCount: number;

    // Processing
    status: Status | null;
    setStatus: React.Dispatch<React.SetStateAction<Status | null>>;
    isProcessing: boolean;
    generatingColumns: Set<string>;
    regeneratingDataset: boolean;
    regeneratingColumns: Set<string>;
    suggestingDataset: boolean;
    datasetSuggestions: SuggestionItem[];
    suggestingColumns: Set<string>;
    columnSuggestions: Record<string, SuggestionItem[]>;
    isGeneratingEmpty: boolean;
    generatingRowLabel: boolean;

    // Token usage
    tokenUsage: TokenUsage;

    // Socrata
    socrataDatasetId: string;
    socrataFieldNameMap: Record<string, string>;
    isPushingSocrata: boolean;

    // Socrata OAuth
    socrataOAuthToken: string | null;
    socrataOAuthUser: { id: string; displayName: string; email?: string } | null;
    isSocrataOAuthAuthenticating: boolean;
    handleSocrataOAuthLogin: () => Promise<void>;
    handleSocrataOAuthLogout: () => void;

    // Socrata API Key
    socrataApiKeyId: string;
    socrataApiKeySecret: string;
    handleSocrataApiKeySave: (keyId: string, keySecret: string) => void;
    handleSocrataApiKeyClear: () => void;

    // Comparison state
    comparisonEnabled: boolean;
    comparisonConfig: ComparisonConfig;
    datasetComparison: DatasetComparisonResult;
    columnComparisons: Record<string, ColumnComparisonResult>;
    comparisonTokenUsage: ComparisonTokenUsage;
    generatingDatasetModels: Set<number>;
    generatingColumnModels: Map<number, Set<string>>;
    regeneratingDatasetModels: Set<number>;
    regeneratingColumnModels: Map<number, Set<string>>;
    reJudgingDataset: boolean;
    reJudgingColumns: Set<string>;
    comparisonSlotCount: number;
    comparisonSlotNames: string[];
    comparisonSlotShortNames: string[];
    isAnyModelGenerating: boolean;
    setComparisonConfig: React.Dispatch<React.SetStateAction<ComparisonConfig>>;

    // Handlers
    handleAnalyze: (method: 'file' | 'url', file?: File, url?: string) => Promise<void>;
    handleSocrataImport: (datasetId: string) => Promise<void>;
    handleStop: () => void;
    handleRegenerateDataset: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleRegenerateColumn: (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleGenerateEmptyDescriptions: () => Promise<void>;
    handleGenerateSelectedDescriptions: (selectedColumns: string[]) => Promise<void>;
    handleSuggestDatasetImprovement: () => Promise<void>;
    handleDismissDatasetSuggestions: () => void;
    handleToggleDatasetSuggestion: (id: string) => void;
    handleEditDatasetSuggestion: (id: string, text: string) => void;
    handleAddDatasetSuggestion: (text: string) => void;
    handleApplyDatasetSuggestions: () => Promise<void>;
    handleSuggestColumnImprovement: (columnName: string) => Promise<void>;
    handleDismissColumnSuggestions: (columnName: string) => void;
    handleToggleColumnSuggestion: (columnName: string, id: string) => void;
    handleEditColumnSuggestion: (columnName: string, id: string, text: string) => void;
    handleAddColumnSuggestion: (columnName: string, text: string) => void;
    handleApplyColumnSuggestions: (columnName: string) => Promise<void>;
    handleEditDatasetDescription: (newDescription: string) => void;
    handleEditColumnDescription: (columnName: string, newDescription: string) => void;
    handleEditRowLabel: (newLabel: string) => void;
    handleGenerateRowLabel: () => Promise<void>;
    handlePushToSocrata: () => Promise<void>;
    handleComparisonConfigChange: (config: ComparisonConfig) => void;
    handleComparisonToggle: (enabled: boolean) => void;
    handleScoringCategoriesChange: (categories: ScoringCategory[]) => void;
    handleRegenerateComparisonDataset: (slotIndex: number, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleRegenerateComparisonColumn: (columnName: string, slotIndex: number, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleReJudgeDataset: () => Promise<void>;
    handleReJudgeColumn: (columnName: string) => Promise<void>;
    getColumnGeneratingModels: (columnName: string) => Set<number>;
    getColumnRegeneratingModels: (columnName: string) => Set<number>;
    renderTokenUsage: () => React.ReactNode;
}

const AppContext = createContext<AppContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextType {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
    // Navigation
    const [currentPage, setCurrentPage] = useState<PageId>('import');
    const [currentFieldName, setCurrentFieldName] = useState<string | null>(null);

    const navigate = useCallback((page: PageId, fieldName?: string) => {
        setCurrentPage(page);
        setCurrentFieldName(fieldName ?? null);
    }, []);

    // Shared API configuration for all modes
    const [apiConfig, setApiConfig] = useState<APIConfig>({
        baseURL: import.meta.env.VITE_AZURE_ENDPOINT || '',
        apiKey: import.meta.env.VITE_AZURE_KEY || '',
    });

    // Model for non-comparison mode
    const [model, setModel] = useState<string>(import.meta.env.VITE_AZURE_MODEL || '');

    // Combined config for hooks that need the full OpenAIConfig
    const openaiConfig: OpenAIConfigType = useMemo(() => ({
        ...apiConfig,
        model,
    }), [apiConfig, model]);

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
        rowLabel: '',
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
    const [datasetSuggestions, setDatasetSuggestions] = useState<SuggestionItem[]>([]);
    const [suggestingColumns, setSuggestingColumns] = useState<Set<string>>(new Set());
    const [columnSuggestions, setColumnSuggestions] = useState<Record<string, SuggestionItem[]>>({});
    const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    });

    // Socrata push-back state
    const [socrataDatasetId, setSocrataDatasetId] = useState('');
    const [socrataFieldNameMap, setSocrataFieldNameMap] = useState<Record<string, string>>({});
    const [isPushingSocrata, setIsPushingSocrata] = useState(false);
    const [socrataOAuthToken, setSocrataOAuthToken] = useState<string | null>(null);
    const [socrataOAuthUser, setSocrataOAuthUser] = useState<{
        id: string; displayName: string; email?: string;
    } | null>(null);
    const [isSocrataOAuthAuthenticating, setIsSocrataOAuthAuthenticating] = useState(false);
    const [socrataApiKeyId, setSocrataApiKeyId] = useState(() => localStorage.getItem('socrata_api_key_id') || '');
    const [socrataApiKeySecret, setSocrataApiKeySecret] = useState(() => localStorage.getItem('socrata_api_key_secret') || '');
    const [isGeneratingEmpty, setIsGeneratingEmpty] = useState(false);
    const [generatingRowLabel, setGeneratingRowLabel] = useState(false);

    // Socrata OAuth: detect token in URL fragment on mount, or restore from localStorage
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#oauth_token=')) {
            const token = hash.slice('#oauth_token='.length);
            window.history.replaceState(null, '', window.location.pathname);

            setSocrataOAuthToken(token);
            setIsSocrataOAuthAuthenticating(true);

            fetchSocrataOAuthUserInfo(token)
                .then((user) => {
                    setSocrataOAuthUser(user);
                    localStorage.setItem('socrata_oauth_token', token);
                    localStorage.setItem('socrata_oauth_user', JSON.stringify(user));
                    setStatus({ message: `Signed in to data.wa.gov as ${user.displayName}`, type: 'success' });
                })
                .catch(() => {
                    setSocrataOAuthToken(null);
                    localStorage.removeItem('socrata_oauth_token');
                    localStorage.removeItem('socrata_oauth_user');
                    setStatus({ message: 'OAuth sign-in failed: could not verify token', type: 'error' });
                })
                .finally(() => setIsSocrataOAuthAuthenticating(false));
        } else if (hash.startsWith('#oauth_error=')) {
            const error = decodeURIComponent(hash.slice('#oauth_error='.length));
            window.history.replaceState(null, '', window.location.pathname);
            setStatus({ message: `OAuth sign-in failed: ${error}`, type: 'error' });
        } else {
            // Restore session from localStorage
            const savedToken = localStorage.getItem('socrata_oauth_token');
            const savedUser = localStorage.getItem('socrata_oauth_user');
            if (savedToken && savedUser) {
                setSocrataOAuthToken(savedToken);
                setSocrataOAuthUser(JSON.parse(savedUser));
                setIsSocrataOAuthAuthenticating(true);

                // Verify the saved token is still valid
                fetchSocrataOAuthUserInfo(savedToken)
                    .then((user) => {
                        setSocrataOAuthUser(user);
                        localStorage.setItem('socrata_oauth_user', JSON.stringify(user));
                    })
                    .catch(() => {
                        // Token expired or invalid — clear session
                        setSocrataOAuthToken(null);
                        setSocrataOAuthUser(null);
                        localStorage.removeItem('socrata_oauth_token');
                        localStorage.removeItem('socrata_oauth_user');
                        setStatus({ message: 'Session expired. Please sign in again.', type: 'info' });
                    })
                    .finally(() => setIsSocrataOAuthAuthenticating(false));
            }
        }
    }, []);

    const handleSocrataOAuthLogin = useCallback(async () => {
        setIsSocrataOAuthAuthenticating(true);
        try {
            const authUrl = await fetchSocrataOAuthLoginUrl();
            window.location.href = authUrl;
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({ message: `OAuth error: ${detail}`, type: 'error' });
            setIsSocrataOAuthAuthenticating(false);
        }
    }, []);

    const handleSocrataApiKeySave = useCallback((keyId: string, keySecret: string) => {
        setSocrataApiKeyId(keyId);
        setSocrataApiKeySecret(keySecret);
        localStorage.setItem('socrata_api_key_id', keyId);
        localStorage.setItem('socrata_api_key_secret', keySecret);
    }, []);

    const handleSocrataApiKeyClear = useCallback(() => {
        setSocrataApiKeyId('');
        setSocrataApiKeySecret('');
        localStorage.removeItem('socrata_api_key_id');
        localStorage.removeItem('socrata_api_key_secret');
    }, []);

    const handleSocrataOAuthLogout = useCallback(() => {
        setSocrataOAuthToken(null);
        setSocrataOAuthUser(null);
        localStorage.removeItem('socrata_oauth_token');
        localStorage.removeItem('socrata_oauth_user');
        setStatus({ message: 'Signed out from data.wa.gov', type: 'info' });
    }, []);

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

    const { callOpenAIStream } = useOpenAI();

    // Wrapper for comparison config changes
    const handleComparisonConfigChange = useCallback((newConfig: ComparisonConfig) => {
        if (newConfig.subMode !== comparisonConfig.subMode) {
            resetComparisonState();
        }
        setComparisonConfig(newConfig);
    }, [comparisonConfig.subMode, resetComparisonState, setComparisonConfig]);

    const handleComparisonToggle = useCallback((enabled: boolean) => {
        setComparisonEnabled(enabled);
        setStatus(null);
        if (enabled) {
            setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        } else {
            setComparisonTokenUsage({
                models: Array(comparisonSlotCount).fill(null).map(() => ({ ...EMPTY_TOKEN_USAGE })),
                judge: { ...EMPTY_TOKEN_USAGE },
                total: { ...EMPTY_TOKEN_USAGE },
            });
        }
    }, [setComparisonEnabled, setComparisonTokenUsage, comparisonSlotCount]);

    const { generateParallel, callJudge } = useComparisonGeneration();

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
        customInstruction?: string,
        rowCountOverride?: number
    ): string => {
        const columnInfo = buildColumnInfo(stats);
        const sampleRows = buildSampleRows(data);
        const sampleCount = String(getSampleCount(data));
        const effectiveRowCount = rowCountOverride ?? data.length;
        const prompt = template
            .replace('{fileName}', name)
            .replace('{rowCount}', String(effectiveRowCount))
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
            customInstruction?: string,
            rowCountOverride?: number
        ): string =>
            buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.dataset, modifier, customInstruction, rowCountOverride),
        [promptTemplates.dataset, buildDatasetPromptFromTemplate]);

    const buildRowLabelPrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        rowCountOverride?: number,
    ): string => {
        return buildDatasetPromptFromTemplate(data, name, stats, DEFAULT_ROW_LABEL_PROMPT, '', undefined, rowCountOverride);
    }, [buildDatasetPromptFromTemplate]);

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
            const prompt = buildDatasetPrompt(data, name, stats, modifier, customInstruction, importedRowCount || undefined);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    datasetDescription: fullContent,
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return { content: fullContent, aborted: result.aborted };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildDatasetPrompt, callOpenAIStream, addTokenUsage, importedRowCount]
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
                    columnDescriptions: { ...prev.columnDescriptions, [columnName]: fullContent },
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return { content: fullContent, aborted: result.aborted };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildColumnPrompt, callOpenAIStream, addTokenUsage]
    );

    const generateRowLabel = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride?: number,
        ): Promise<{ content: string }> => {
            const prompt = buildRowLabelPrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    rowLabel: fullContent.trim(),
                }));
            });
            addTokenUsage(result.usage);
            return { content: fullContent.trim() };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildRowLabelPrompt, callOpenAIStream, addTokenUsage]
    );

    const getComparisonModelConfig = useCallback((modelName: string): OpenAIConfigType => ({
        ...apiConfig,
        model: modelName,
    }), [apiConfig]);

    const isPromptMode = comparisonConfig.subMode === 'prompts';

    const comparisonSlotNames = isPromptMode
        ? comparisonConfig.promptVariants.map((v, i) => getVariantLabel(i, v.label))
        : comparisonConfig.models.map((m, i) => getModelLabel(i, m || undefined));

    const comparisonSlotShortNames = isPromptMode
        ? comparisonConfig.promptVariants.map((v, i) => v.label || `Prompt ${i + 1}`)
        : comparisonConfig.models.map((m, i) => m || `Model ${i + 1}`);

    const judgeDatasetOutputs = useCallback(async (
        context: string,
        outputs: string[]
    ): Promise<void> => {
        const judgeConfig = getComparisonModelConfig(comparisonConfig.judgeModel);
        const judgeResult = await callJudge(context, outputs, judgeConfig, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories);
        addComparisonTokenUsage({ type: 'judge' }, judgeResult.usage);
        setDatasetComparison((prev) => ({
            ...prev,
            judgeResult: judgeResult.result,
            isJudging: false,
        }));
    }, [getComparisonModelConfig, comparisonConfig.judgeModel, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories, callJudge, addComparisonTokenUsage, setDatasetComparison]);

    const judgeColumnOutputs = useCallback(async (
        columnName: string,
        context: string,
        outputs: string[]
    ): Promise<void> => {
        const judgeConfig = getComparisonModelConfig(comparisonConfig.judgeModel);
        const judgeResult = await callJudge(context, outputs, judgeConfig, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories);
        addComparisonTokenUsage({ type: 'judge' }, judgeResult.usage);
        setColumnComparisons((prev) => ({
            ...prev,
            [columnName]: {
                ...prev[columnName],
                judgeResult: judgeResult.result,
                isJudging: false,
            },
        }));
    }, [getComparisonModelConfig, comparisonConfig.judgeModel, comparisonConfig.judgeSystemPrompt, comparisonConfig.judgeEvaluationPrompt, comparisonConfig.scoringCategories, callJudge, addComparisonTokenUsage, setColumnComparisons]);

    const generateDatasetComparisonDescription = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            abortSignal?: AbortSignal
        ): Promise<{ aborted: boolean }> => {
            const slotCount = comparisonSlotCount;
            for (let i = 0; i < slotCount; i++) {
                setGeneratingDatasetModel(i, true);
            }
            const outputs: string[] = Array(slotCount).fill('');
            let configs: OpenAIConfigType[];
            let prompts: string[];
            let systemPrompts: string | string[];

            const rowCount = importedRowCount || undefined;
            if (comparisonConfig.subMode === 'prompts') {
                configs = Array(slotCount).fill(getComparisonModelConfig(comparisonConfig.promptModel));
                prompts = comparisonConfig.promptVariants.map(v =>
                    buildDatasetPromptFromTemplate(data, name, stats, v.datasetPrompt, '', undefined, rowCount)
                );
                systemPrompts = comparisonConfig.promptVariants.map(v => v.systemPrompt);
            } else {
                const prompt = buildDatasetPrompt(data, name, stats, '', undefined, rowCount);
                configs = comparisonConfig.models.map(m => getComparisonModelConfig(m));
                prompts = Array(slotCount).fill(prompt);
                systemPrompts = promptTemplates.systemPrompt;
            }

            const onChunks = Array.from({ length: slotCount }, (_, i) => (chunk: string) => {
                outputs[i] += chunk;
                const currentOutput = outputs[i];
                setDatasetComparison((prev) => {
                    const newOutputs = [...prev.outputs];
                    newOutputs[i] = currentOutput;
                    return { ...prev, outputs: newOutputs };
                });
            });

            const result = await generateParallel(prompts, configs, systemPrompts, onChunks, abortSignal);
            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({ type: 'model', index: i }, usage);
            });
            for (let i = 0; i < slotCount; i++) {
                setGeneratingDatasetModel(i, false);
            }

            if (result.aborted) return { aborted: true };

            setDatasetComparison((prev) => ({ ...prev, isJudging: true }));
            try {
                const effectiveRows = importedRowCount || data.length;
                const context = `File: ${name}, Rows: ${effectiveRows}, Columns: ${Object.keys(stats).join(', ')}`;
                await judgeDatasetOutputs(context, outputs);
            } catch (error) {
                setDatasetComparison((prev) => ({ ...prev, isJudging: false }));
                setStatus({
                    message: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'warning'
                });
            }

            return { aborted: false };
        },
        [buildDatasetPrompt, buildDatasetPromptFromTemplate, comparisonSlotCount, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingDatasetModel, setDatasetComparison, judgeDatasetOutputs, importedRowCount]
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

            const onChunks = Array.from({ length: slotCount }, (_, i) => (chunk: string) => {
                outputs[i] += chunk;
                const currentOutput = outputs[i];
                setColumnComparisons((prev) => {
                    const newOutputs = [...(prev[columnName]?.outputs || Array(slotCount).fill(''))];
                    newOutputs[i] = currentOutput;
                    return {
                        ...prev,
                        [columnName]: { ...prev[columnName], outputs: newOutputs },
                    };
                });
            });

            const result = await generateParallel(prompts, configs, systemPrompts, onChunks, abortSignal);
            result.usages.forEach((usage, i) => {
                addComparisonTokenUsage({ type: 'model', index: i }, usage);
            });
            for (let i = 0; i < slotCount; i++) {
                setGeneratingColumnModel(i, columnName, false);
            }

            if (result.aborted) return { aborted: true };

            setColumnComparisons((prev) => ({
                ...prev,
                [columnName]: { ...prev[columnName], isJudging: true },
            }));

            try {
                const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
                await judgeColumnOutputs(columnName, context, outputs);
            } catch {
                setColumnComparisons((prev) => ({
                    ...prev,
                    [columnName]: { ...prev[columnName], isJudging: false },
                }));
            }

            return { aborted: false };
        },
        [buildColumnPrompt, buildColumnPromptFromTemplate, comparisonSlotCount, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, generateParallel, promptTemplates.systemPrompt, addComparisonTokenUsage, setGeneratingColumnModel, setColumnComparisons, judgeColumnOutputs]
    );

    const handleAnalyze = useCallback(
        async (method: 'file' | 'url', file?: File, url?: string) => {
            abortControllerRef.current = new AbortController();
            const abortSignal = abortControllerRef.current.signal;

            setIsProcessing(true);
            setShowResults(false);
            setIsImportedData(false);
            setImportedRowCount(0);
            setGeneratedResults({ datasetDescription: '', rowLabel: '', columnDescriptions: {} });
            setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
            setSocrataDatasetId('');
            setSocrataFieldNameMap({});

            if (comparisonEnabled) {
                resetComparisonState();
            }

            let currentStep = 'loading CSV';
            try {
                setStatus({
                    message: method === 'file' ? 'Reading CSV file...' : 'Fetching CSV from URL...',
                    type: 'info'
                });

                const result = method === 'file' && file ? await parseFile(file) : await parseUrl(url!);

                if (!result.data || result.data.length === 0) {
                    setStatus({ message: 'No data found in CSV file', type: 'error' });
                    setIsProcessing(false);
                    return;
                }

                setCsvData(result.data);
                setFileName(result.fileName);

                setStatus({ message: 'Analyzing columns...', type: 'info' });
                const columns = Object.keys(result.data[0]);
                const stats: Record<string, ColumnInfo> = {};
                columns.forEach((col) => {
                    const values = result.data.map((row) => row[col]);
                    stats[col] = analyzeColumn(col, values);
                });
                setColumnStats(stats);
                setShowResults(true);

                if (comparisonEnabled) {
                    currentStep = 'generating dataset descriptions';
                    const slotLabel = comparisonConfig.subMode === 'prompts' ? 'prompt variants' : 'models';
                    setStatus({
                        message: `Generating dataset descriptions (${comparisonSlotCount} ${slotLabel} in parallel)...`,
                        type: 'info'
                    });

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
                        result.data, result.fileName, stats, abortSignal
                    );

                    if (datasetResult.aborted) {
                        setStatus({ message: 'Generation stopped.', type: 'info' });
                        setIsProcessing(false);
                        return;
                    }

                    let datasetDescs: string[] = [];
                    setDatasetComparison((prev) => {
                        datasetDescs = [...prev.outputs];
                        return prev;
                    });

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
                        setStatus({ message: 'Generation stopped.', type: 'info' });
                        setIsProcessing(false);
                        return;
                    }

                    setStatus({
                        message: 'Comparison complete! All descriptions generated and judged.',
                        type: 'success'
                    });
                } else {
                    currentStep = 'generating dataset description';
                    setStatus({ message: 'Generating dataset description...', type: 'info' });
                    const datasetResult = await generateDatasetDescription(result.data, result.fileName, stats, '', undefined, abortSignal);

                    if (datasetResult.aborted) {
                        setGeneratingColumns(new Set());
                        setStatus({ message: 'Generation stopped.', type: 'info' });
                        setIsProcessing(false);
                        return;
                    }

                    const datasetDesc = datasetResult.content;
                    setGeneratedResults((prev) => ({ ...prev, datasetDescription: datasetDesc }));

                    currentStep = 'generating column descriptions';
                    setStatus({ message: `Generating descriptions for ${columns.length} columns...`, type: 'info' });
                    setGeneratingColumns(new Set(columns));

                    const columnPromises = columns.map(async (col) => {
                        const info = stats[col];
                        const colValues = result.data.map(row => row[col]);
                        const colResult = await generateColumnDescription(col, info, datasetDesc, colValues, '', undefined, abortSignal);
                        return { col, result: colResult };
                    });

                    const columnResults = await Promise.all(columnPromises);
                    const abortedColumns = columnResults.filter(r => r.result.aborted);
                    if (abortedColumns.length > 0) {
                        setGeneratingColumns(new Set());
                        setStatus({ message: 'Generation stopped.', type: 'info' });
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
                    setStatus({ message: 'Generation stopped.', type: 'info' });
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
                setGeneratedResults((prev) => ({ ...prev, datasetDescription: result.content }));
                setStatus({ message: 'Successfully regenerated dataset description!', type: 'success' });
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
                    columnName, info, generatedResults.datasetDescription, colValues, modifier, customInstruction
                );
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: { ...prev.columnDescriptions, [columnName]: result.content },
                }));
                setStatus({ message: `Successfully regenerated column "${columnName}" description!`, type: 'success' });
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
            setStatus({ message: 'All columns already have descriptions.', type: 'info' });
            return;
        }

        setIsGeneratingEmpty(true);
        setGeneratingColumns(new Set(emptyColumns));
        setStatus({
            message: `Generating descriptions for ${emptyColumns.length} empty column(s)...`,
            type: 'info',
        });

        try {
            let datasetDesc = generatedResults.datasetDescription;
            if (!datasetDesc.trim()) {
                const dsResult = await generateDatasetDescription(csvData, fileName, columnStats);
                datasetDesc = dsResult.content;
                setGeneratedResults((prev) => ({ ...prev, datasetDescription: datasetDesc }));
            }

            const columnPromises = emptyColumns.map(async (col) => {
                const info = columnStats[col];
                const colValues = csvData.map((row) => row[col]);
                const result = await generateColumnDescription(col, info, datasetDesc, colValues);
                return { col, result };
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

    const handleGenerateSelectedDescriptions = useCallback(async (selectedColumns: string[]) => {
        if (!csvData || selectedColumns.length === 0) return;

        setIsGeneratingEmpty(true);
        setGeneratingColumns(new Set(selectedColumns));
        setStatus({
            message: `Generating descriptions for ${selectedColumns.length} column(s)...`,
            type: 'info',
        });

        try {
            let datasetDesc = generatedResults.datasetDescription;
            if (!datasetDesc.trim()) {
                const dsResult = await generateDatasetDescription(csvData, fileName, columnStats);
                datasetDesc = dsResult.content;
                setGeneratedResults((prev) => ({ ...prev, datasetDescription: datasetDesc }));
            }

            const columnPromises = selectedColumns.map(async (col) => {
                const info = columnStats[col];
                const colValues = csvData.map((row) => row[col]);
                const result = await generateColumnDescription(col, info, datasetDesc, colValues);
                return { col, result };
            });

            await Promise.all(columnPromises);

            setStatus({
                message: `Successfully generated descriptions for ${selectedColumns.length} column(s)!`,
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
        setDatasetSuggestions([]);
        try {
            const prompt = buildDatasetImprovementPrompt(currentDesc);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setDatasetSuggestions(parseSuggestions(fullContent));
            });
            addTokenUsage(result.usage);
            setStatus({ message: 'Suggestions ready for dataset description.', type: 'success' });
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
        setDatasetSuggestions([]);
    }, []);

    const handleToggleDatasetSuggestion = useCallback((id: string) => {
        setDatasetSuggestions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
        );
    }, []);

    const handleEditDatasetSuggestion = useCallback((id: string, text: string) => {
        setDatasetSuggestions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, text, edited: true } : s))
        );
    }, []);

    const handleAddDatasetSuggestion = useCallback((text: string) => {
        setDatasetSuggestions((prev) => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, text, selected: true, edited: false },
        ]);
    }, []);

    const handleApplyDatasetSuggestions = useCallback(async () => {
        const currentDesc = generatedResults.datasetDescription;
        if (!currentDesc || !csvData) return;
        setRegeneratingDataset(true);
        setDatasetSuggestions([]);
        try {
            const rowCount = importedRowCount || csvData.length;
            const columnInfo = Object.entries(columnStats)
                .map(([name, stats]) => `  ${name} — ${stats.type}`)
                .join('\n');
            const sampleCount = Math.min(5, csvData.length);
            const sampleRows = csvData.slice(0, sampleCount);
            const originalPrompt = `Generate a Brief Description for this government dataset following Washington State metadata guidance. The description should be approximately 100 words.

Dataset Name: ${fileName}
Number of Rows: ${rowCount}
Columns (name — type):
${columnInfo}

Sample Data (first ${sampleCount} rows):
${JSON.stringify(sampleRows, null, 2)}

Your description MUST cover these elements in order:
1. CONTENT & SIGNIFICANCE (first 2 sentences): What data this dataset contains, what each row represents, and why this data matters to the public.
2. KEY FIELDS: Highlight the most important columns and what kind of information they provide. Reference specific values from the sample data when helpful.
3. SCOPE: The geographic and/or temporal coverage, if inferable from the data.
4. POTENTIAL USERS: Briefly note who would use this data (residents, researchers, journalists, businesses, agencies, etc.) and for what purpose.

FORMAT RULES:
- Write as a single cohesive paragraph (no bullet points, no headers)
- Do not start with "This dataset contains..." — vary your opening
- Do not include row counts or technical statistics in the description
- Expand all acronyms found in column names or data values`;

            const prompt = buildRegenerateWithSuggestionsPrompt(originalPrompt, datasetSuggestions);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({ ...prev, datasetDescription: fullContent }));
            });
            addTokenUsage(result.usage);
            setStatus({ message: 'Description updated with suggestions!', type: 'success' });
        } catch (error) {
            setStatus({
                message: `Error applying suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setRegeneratingDataset(false);
        }
    }, [csvData, fileName, columnStats, generatedResults.datasetDescription, datasetSuggestions, importedRowCount, openaiConfig, promptTemplates.systemPrompt, callOpenAIStream, addTokenUsage]);

    const handleSuggestColumnImprovement = useCallback(async (columnName: string) => {
        const currentDesc = generatedResults.columnDescriptions[columnName];
        if (!currentDesc) return;
        setSuggestingColumns((prev) => new Set(prev).add(columnName));
        setColumnSuggestions((prev) => ({ ...prev, [columnName]: [] }));
        try {
            const prompt = buildColumnImprovementPrompt(columnName, currentDesc);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setColumnSuggestions((prev) => ({ ...prev, [columnName]: parseSuggestions(fullContent) }));
            });
            addTokenUsage(result.usage);
            setStatus({ message: `Suggestions ready for column "${columnName}".`, type: 'success' });
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
            const next = { ...prev };
            delete next[columnName];
            return next;
        });
    }, []);

    const handleToggleColumnSuggestion = useCallback((columnName: string, id: string) => {
        setColumnSuggestions((prev) => ({
            ...prev,
            [columnName]: (prev[columnName] || []).map((s) =>
                s.id === id ? { ...s, selected: !s.selected } : s
            ),
        }));
    }, []);

    const handleEditColumnSuggestion = useCallback((columnName: string, id: string, text: string) => {
        setColumnSuggestions((prev) => ({
            ...prev,
            [columnName]: (prev[columnName] || []).map((s) =>
                s.id === id ? { ...s, text, edited: true } : s
            ),
        }));
    }, []);

    const handleAddColumnSuggestion = useCallback((columnName: string, text: string) => {
        setColumnSuggestions((prev) => ({
            ...prev,
            [columnName]: [
                ...(prev[columnName] || []),
                { id: `${Date.now()}-${Math.random()}`, text, selected: true, edited: false },
            ],
        }));
    }, []);

    const handleApplyColumnSuggestions = useCallback(async (columnName: string) => {
        const currentDesc = generatedResults.columnDescriptions[columnName];
        if (!currentDesc) return;
        const info = columnStats[columnName];
        const colValues = csvData?.map((row) => row[columnName]);
        if (!info || colValues === undefined) return;
        setRegeneratingColumns((prev) => new Set(prev).add(columnName));
        setColumnSuggestions((prev) => {
            const next = { ...prev };
            delete next[columnName];
            return next;
        });
        try {
            const originalPrompt = buildColumnPrompt(
                columnName, info, generatedResults.datasetDescription || '', colValues, '', undefined
            );
            const prompt = buildRegenerateWithSuggestionsPrompt(originalPrompt, columnSuggestions[columnName] || []);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: { ...prev.columnDescriptions, [columnName]: fullContent },
                }));
            });
            addTokenUsage(result.usage);
            setStatus({ message: `Column "${columnName}" updated with suggestions!`, type: 'success' });
        } catch (error) {
            handleRegenerationError(error, setStatus);
        } finally {
            setRegeneratingColumns((prev) => {
                const next = new Set(prev);
                next.delete(columnName);
                return next;
            });
        }
    }, [csvData, columnStats, generatedResults, columnSuggestions, openaiConfig, promptTemplates.systemPrompt, buildColumnPrompt, callOpenAIStream, addTokenUsage]);

    const handleRegenerateComparisonDataset = useCallback(
        async (slotIndex: number, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            if (!csvData) return;
            setRegeneratingDatasetModel(slotIndex, true);
            try {
                let prompt: string;
                let config: OpenAIConfigType;
                let systemPrompt: string;

                const rowCount = importedRowCount || undefined;
                if (comparisonConfig.subMode === 'prompts') {
                    const variant = comparisonConfig.promptVariants[slotIndex];
                    prompt = buildDatasetPromptFromTemplate(csvData, fileName, columnStats, variant.datasetPrompt, modifier, customInstruction, rowCount);
                    config = getComparisonModelConfig(comparisonConfig.promptModel);
                    systemPrompt = variant.systemPrompt;
                } else {
                    prompt = buildDatasetPrompt(csvData, fileName, columnStats, modifier, customInstruction, rowCount);
                    config = getComparisonModelConfig(comparisonConfig.models[slotIndex]);
                    systemPrompt = promptTemplates.systemPrompt;
                }

                let output = '';
                const result = await callOpenAIStream(prompt, config, systemPrompt, (chunk) => {
                    output += chunk;
                    setDatasetComparison((prev) => {
                        const newOutputs = [...prev.outputs];
                        newOutputs[slotIndex] = output;
                        return { ...prev, outputs: newOutputs };
                    });
                });

                addComparisonTokenUsage({ type: 'model', index: slotIndex }, result.usage);

                if (result.aborted) {
                    setStatus({ message: 'Regeneration stopped.', type: 'info' });
                    setRegeneratingDatasetModel(slotIndex, false);
                    return;
                }

                let allOutputs: string[] = [];
                flushSync(() => {
                    setDatasetComparison((prev) => {
                        allOutputs = [...prev.outputs];
                        return { ...prev, isJudging: true };
                    });
                });

                const slotLabel = comparisonConfig.subMode === 'prompts' ? 'Prompt' : 'Model';
                try {
                    const effectiveRows = importedRowCount || csvData.length;
                    const context = `File: ${fileName}, Rows: ${effectiveRows}, Columns: ${Object.keys(columnStats).join(', ')}`;
                    await judgeDatasetOutputs(context, allOutputs);
                    setStatus({
                        message: `Successfully regenerated ${slotLabel} ${slotIndex + 1} description!`,
                        type: 'success'
                    });
                } catch (error) {
                    setDatasetComparison((prev) => ({ ...prev, isJudging: false }));
                    handleJudgeError(error, setStatus);
                }
            } catch (error) {
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingDatasetModel(slotIndex, false);
            }
        },
        [csvData, setRegeneratingDatasetModel, buildDatasetPrompt, buildDatasetPromptFromTemplate, fileName, columnStats, comparisonConfig.subMode, comparisonConfig.models, comparisonConfig.promptModel, comparisonConfig.promptVariants, getComparisonModelConfig, callOpenAIStream, promptTemplates.systemPrompt, addComparisonTokenUsage, setDatasetComparison, judgeDatasetOutputs, importedRowCount]
    );

    const handleRegenerateComparisonColumn = useCallback(
        async (columnName: string, slotIndex: number, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            const info = columnStats[columnName];
            if (!info) return;
            setRegeneratingColumnModel(slotIndex, columnName, true);
            try {
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
                            [columnName]: { ...prev[columnName], outputs: currentOutputs },
                        };
                    });
                });

                addComparisonTokenUsage({ type: 'model', index: slotIndex }, result.usage);

                if (result.aborted) {
                    setStatus({ message: 'Regeneration stopped.', type: 'info' });
                    setRegeneratingColumnModel(slotIndex, columnName, false);
                    return;
                }

                let allOutputs: string[] = [];
                flushSync(() => {
                    setColumnComparisons((prev) => {
                        allOutputs = [...(prev[columnName]?.outputs || [])];
                        return {
                            ...prev,
                            [columnName]: { ...prev[columnName], isJudging: true },
                        };
                    });
                });

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
                        [columnName]: { ...prev[columnName], isJudging: false },
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

    const handleReJudgeDataset = useCallback(async () => {
        if (!csvData || !datasetComparison.outputs.some(o => o)) return;
        setReJudgingDataset(true);
        setDatasetComparison((prev) => ({ ...prev, isJudging: true }));
        try {
            const effectiveRows = importedRowCount || csvData.length;
            const context = `File: ${fileName}, Rows: ${effectiveRows}, Columns: ${Object.keys(columnStats).join(', ')}`;
            await judgeDatasetOutputs(context, datasetComparison.outputs);
            setStatus({ message: 'Successfully re-judged dataset descriptions!', type: 'success' });
        } catch (error) {
            setDatasetComparison((prev) => ({ ...prev, isJudging: false }));
            setStatus({
                message: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setReJudgingDataset(false);
        }
    }, [csvData, datasetComparison.outputs, setReJudgingDataset, setDatasetComparison, fileName, columnStats, judgeDatasetOutputs, importedRowCount]);

    const handleReJudgeColumn = useCallback(async (columnName: string) => {
        const info = columnStats[columnName];
        const columnResult = columnComparisons[columnName];
        if (!info || !columnResult?.outputs.some(o => o)) return;
        setReJudgingColumn(columnName, true);
        setColumnComparisons((prev) => ({
            ...prev,
            [columnName]: { ...prev[columnName], isJudging: true },
        }));
        try {
            const context = `Column "${columnName}" (${info.type}): ${getColumnStatsText(info)}`;
            await judgeColumnOutputs(columnName, context, columnResult.outputs);
            setStatus({ message: `Successfully re-judged "${columnName}" descriptions!`, type: 'success' });
        } catch (error) {
            setColumnComparisons((prev) => ({
                ...prev,
                [columnName]: { ...prev[columnName], isJudging: false },
            }));
            handleJudgeError(error, setStatus);
        } finally {
            setReJudgingColumn(columnName, false);
        }
    }, [columnStats, columnComparisons, setReJudgingColumn, setColumnComparisons, judgeColumnOutputs]);

    const handleEditDatasetDescription = useCallback((newDescription: string) => {
        setGeneratedResults((prev) => ({ ...prev, datasetDescription: newDescription }));
    }, []);

    const handleEditColumnDescription = useCallback((columnName: string, newDescription: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnDescriptions: { ...prev.columnDescriptions, [columnName]: newDescription },
        }));
    }, []);

    const handleEditRowLabel = useCallback((newLabel: string) => {
        setGeneratedResults((prev) => ({ ...prev, rowLabel: newLabel }));
    }, []);

    const handleGenerateRowLabel = useCallback(async () => {
        if (!csvData) return;
        setGeneratingRowLabel(true);
        try {
            await generateRowLabel(csvData, fileName, columnStats, importedRowCount || undefined);
            setStatus({ message: 'Successfully generated row label!', type: 'success' });
        } catch (error) {
            setStatus({
                message: `Error generating row label: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingRowLabel(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateRowLabel]);

    const handleSocrataImport = useCallback(
        async (datasetId: string) => {
            setIsProcessing(true);
            setShowResults(false);
            setIsImportedData(false);
            setImportedRowCount(0);
            setGeneratedResults({ datasetDescription: '', rowLabel: '', columnDescriptions: {} });
            setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
            setSocrataDatasetId(datasetId);

            if (comparisonEnabled) {
                resetComparisonState();
            }

            try {
                setStatus({ message: 'Importing dataset from data.wa.gov...', type: 'info' });
                const result = await fetchSocrataImport(
                    datasetId,
                    socrataOAuthToken || undefined,
                    socrataApiKeyId || undefined,
                    socrataApiKeySecret || undefined,
                );

                if (!result.sampleRows || result.sampleRows.length === 0) {
                    setStatus({ message: 'No data found in dataset', type: 'error' });
                    setIsProcessing(false);
                    return;
                }

                // Store sample rows (sufficient for display & AI prompts)
                setCsvData(result.sampleRows);
                setFileName(result.fileName);
                setImportedRowCount(result.totalRowCount);

                // Use pre-computed stats from SODA API — no client-side analyzeColumn
                setColumnStats(result.columnStats);

                const columns = Object.keys(result.columnStats);
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

                const fieldMap: Record<string, string> = {};
                columns.forEach((col) => {
                    columnDescriptions[col] = fieldNameDescMap.get(col) || displayNameDescMap.get(col) || '';
                    if (fieldNameSet.has(col)) {
                        fieldMap[col] = col;
                    } else if (nameToFieldName.has(col)) {
                        fieldMap[col] = nameToFieldName.get(col)!;
                    }
                });
                setSocrataFieldNameMap(fieldMap);

                setGeneratedResults({
                    datasetDescription: result.datasetDescription || '',
                    rowLabel: result.rowLabel || '',
                    columnDescriptions,
                });

                setShowResults(true);
                setStatus({
                    message: `Imported "${result.datasetName}" with ${columns.length} columns (${result.totalRowCount.toLocaleString()} rows). Existing descriptions pre-populated — edit or improve with AI.`,
                    type: 'success',
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Import error: ${detail}`, type: 'error' });
            } finally {
                setIsProcessing(false);
            }
        },
        [comparisonEnabled, resetComparisonState, socrataOAuthToken, socrataApiKeyId, socrataApiKeySecret]
    );

    const handleOpenAIConfigChange = useCallback((newConfig: OpenAIConfigType) => {
        setApiConfig({ baseURL: newConfig.baseURL, apiKey: newConfig.apiKey });
        setModel(newConfig.model);
    }, []);

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
    }, [setComparisonConfig]);

    const handlePushToSocrata = useCallback(async () => {
        if (!socrataDatasetId) return;
        setIsPushingSocrata(true);
        setStatus({ message: 'Pushing metadata to data.wa.gov...', type: 'info' });

        try {
            const columnUpdates = Object.entries(generatedResults.columnDescriptions)
                .filter(([, desc]) => desc)
                .map(([colName, desc]) => ({
                    fieldName: socrataFieldNameMap[colName] || colName,
                    description: desc,
                }));

            const result = await pushSocrataMetadata(
                socrataDatasetId,
                generatedResults.datasetDescription || undefined,
                generatedResults.rowLabel || undefined,
                columnUpdates,
                socrataOAuthToken || undefined,
                socrataApiKeyId || undefined,
                socrataApiKeySecret || undefined,
            );

            setStatus({ message: result.message, type: 'success' });
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({ message: `Push error: ${detail}`, type: 'error' });
        } finally {
            setIsPushingSocrata(false);
        }
    }, [socrataDatasetId, generatedResults, socrataFieldNameMap, socrataOAuthToken, socrataApiKeyId, socrataApiKeySecret]);

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

    const renderTokenUsage = useCallback(() => {
        if (comparisonEnabled && comparisonTokenUsage.total.totalTokens > 0) {
            const getSlotModel = (i: number) =>
                comparisonConfig.subMode === 'prompts'
                    ? comparisonConfig.promptModel
                    : comparisonConfig.models[i];

            return (
                <div className="tokenUsage comparison">
                    {Array.from({ length: comparisonSlotCount }, (_, i) => (
                        <div className="tokenUsageRow" key={i}>
                            <span className="tokenLabel">{comparisonSlotShortNames[i]}:</span>
                            <span
                                className="tokenValue">{comparisonTokenUsage.models[i]?.totalTokens.toLocaleString() || 0} tokens</span>
                            {(() => {
                                const usage = comparisonTokenUsage.models[i];
                                if (!usage) return null;
                                const cost = getEstimatedCost(getSlotModel(i), usage.promptTokens, usage.completionTokens);
                                return cost !== null ? <span className="tokenCost">~${cost.toFixed(4)}</span> : null;
                            })()}
                        </div>
                    ))}
                    <div className="tokenUsageRow">
                        <span className="tokenLabel">Judge:</span>
                        <span
                            className="tokenValue">{comparisonTokenUsage.judge.totalTokens.toLocaleString()} tokens</span>
                        {(() => {
                            const cost = getEstimatedCost(comparisonConfig.judgeModel, comparisonTokenUsage.judge.promptTokens, comparisonTokenUsage.judge.completionTokens);
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
                        const cost = getEstimatedCost(openaiConfig.model, tokenUsage.promptTokens, tokenUsage.completionTokens);
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
    }, [comparisonEnabled, comparisonTokenUsage, comparisonSlotCount, comparisonSlotShortNames, comparisonConfig, tokenUsage, openaiConfig.model]);

    const value: AppContextType = {
        currentPage,
        currentFieldName,
        navigate,
        apiConfig,
        model,
        openaiConfig,
        promptTemplates,
        setPromptTemplates,
        handleOpenAIConfigChange,
        csvData,
        fileName,
        columnStats,
        generatedResults,
        showResults,
        isImportedData,
        importedRowCount,
        status,
        setStatus,
        isProcessing,
        generatingColumns,
        regeneratingDataset,
        regeneratingColumns,
        suggestingDataset,
        datasetSuggestions,
        suggestingColumns,
        columnSuggestions,
        isGeneratingEmpty,
        generatingRowLabel,
        tokenUsage,
        socrataDatasetId,
        socrataFieldNameMap,
        isPushingSocrata,
        socrataOAuthToken,
        socrataOAuthUser,
        isSocrataOAuthAuthenticating,
        handleSocrataOAuthLogin,
        handleSocrataOAuthLogout,
        socrataApiKeyId,
        socrataApiKeySecret,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
        comparisonEnabled,
        comparisonConfig,
        datasetComparison,
        columnComparisons,
        comparisonTokenUsage,
        generatingDatasetModels,
        generatingColumnModels,
        regeneratingDatasetModels,
        regeneratingColumnModels,
        reJudgingDataset,
        reJudgingColumns,
        comparisonSlotCount,
        comparisonSlotNames,
        comparisonSlotShortNames,
        isAnyModelGenerating,
        setComparisonConfig,
        handleAnalyze,
        handleSocrataImport,
        handleStop,
        handleRegenerateDataset,
        handleRegenerateColumn,
        handleGenerateEmptyDescriptions,
        handleGenerateSelectedDescriptions,
        handleSuggestDatasetImprovement,
        handleDismissDatasetSuggestions,
        handleToggleDatasetSuggestion,
        handleEditDatasetSuggestion,
        handleAddDatasetSuggestion,
        handleApplyDatasetSuggestions,
        handleSuggestColumnImprovement,
        handleDismissColumnSuggestions,
        handleToggleColumnSuggestion,
        handleEditColumnSuggestion,
        handleAddColumnSuggestion,
        handleApplyColumnSuggestions,
        handleEditDatasetDescription,
        handleEditColumnDescription,
        handleEditRowLabel,
        handleGenerateRowLabel,
        handlePushToSocrata,
        handleComparisonConfigChange,
        handleComparisonToggle,
        handleScoringCategoriesChange,
        handleRegenerateComparisonDataset,
        handleRegenerateComparisonColumn,
        handleReJudgeDataset,
        handleReJudgeColumn,
        getColumnGeneratingModels,
        getColumnRegeneratingModels,
        renderTokenUsage,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
