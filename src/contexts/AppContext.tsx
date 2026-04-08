import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOpenAI } from '../hooks/useOpenAI';
import {
    fetchSocrataImport,
    fetchSocrataOAuthLoginUrl,
    fetchSocrataOAuthUserInfo,
    pushSocrataMetadata,
} from '../utils/socrataApi';
import { buildSampleRows, getColumnStatsText, getSampleCount, getSampleValues } from '../utils/columnAnalyzer';
import { getEstimatedCost } from '../utils/pricing';
import { handleRegenerationError } from '../utils/stateHelpers';
import {
    appendPromptModifiers,
    buildColumnImprovementPrompt,
    buildDatasetImprovementPrompt,
    buildRegenerateWithSuggestionsPrompt,
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_COLUMN_SUGGESTION_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_DATASET_SUGGESTION_PROMPT,
    DEFAULT_NOTES_PROMPT,
    DEFAULT_ROW_LABEL_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    type SuggestionItem,
} from '../utils/prompts';
import type {
    APIConfig,
    ColumnInfo,
    CsvRow,
    GeneratedResults,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
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

export type PageId = 'import' | 'data' | 'field' | 'settings';

interface AppContextType {
    // Navigation
    currentPage: PageId;
    currentFieldName: string | null;
    navigate: (page: PageId, fieldName?: string) => void;

    // API & Config
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
    generatingNotes: boolean;
    pendingNote: string;

    // Socrata
    socrataDatasetId: string;
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

    // Handlers
    handleSocrataImport: (datasetId: string) => Promise<void>;
    handleStop: () => void;
    handleRegenerateDataset: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleRegenerateColumn: (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
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
    handleEditNote: (index: number, text: string) => void;
    handleDeleteNote: (index: number) => void;
    handleAddNote: (text: string) => void;
    handleGenerateNote: () => Promise<void>;
    handlePushToSocrata: () => Promise<void>;
    handleCloseDataset: () => void;
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
        baseURL: import.meta.env.VITE_LLM_ENDPOINT || '',
        apiKey: import.meta.env.VITE_LLM_API_KEY || '',
    });

    const [model, setModel] = useState<string>(import.meta.env.VITE_LLM_MODEL || '');

    // Combined config for hooks that need the full OpenAIConfig
    const openaiConfig: OpenAIConfigType = useMemo(() => ({
        ...apiConfig,
        model,
    }), [apiConfig, model]);

    const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        dataset: DEFAULT_DATASET_PROMPT,
        column: DEFAULT_COLUMN_PROMPT,
        rowLabel: DEFAULT_ROW_LABEL_PROMPT,
        notes: DEFAULT_NOTES_PROMPT,
        datasetSuggestion: DEFAULT_DATASET_SUGGESTION_PROMPT,
        columnSuggestion: DEFAULT_COLUMN_SUGGESTION_PROMPT,
    });

    const [csvData, setCsvData] = useState<CsvRow[] | null>(null);
    const [fileName, setFileName] = useState('');
    const [columnStats, setColumnStats] = useState<Record<string, ColumnInfo>>({});
    const [generatedResults, setGeneratedResults] = useState<GeneratedResults>({
        datasetDescription: '',
        rowLabel: '',
        notes: [],
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
    const [generatingNotes, setGeneratingNotes] = useState(false);
    const [pendingNote, setPendingNote] = useState('');

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

    // Abort controller for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null);

    const { callOpenAIStream } = useOpenAI();

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
        return buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.rowLabel, '', undefined, rowCountOverride);
    }, [promptTemplates.rowLabel, buildDatasetPromptFromTemplate]);

    const buildNotesPrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        rowCountOverride?: number,
    ): string => {
        return buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.notes, '', undefined, rowCountOverride);
    }, [promptTemplates.notes, buildDatasetPromptFromTemplate]);

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

    const generateNotes = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride?: number,
        ): Promise<{ content: string }> => {
            const prompt = buildNotesPrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            setPendingNote('');
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setPendingNote(fullContent.trim());
            });
            addTokenUsage(result.usage);
            return { content: fullContent.trim() };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildNotesPrompt, callOpenAIStream, addTokenUsage]
    );

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const handleCloseDataset = useCallback(() => {
        setCsvData(null);
        setFileName('');
        setColumnStats({});
        setGeneratedResults({ datasetDescription: '', rowLabel: '', notes: [], columnDescriptions: {} });
        setShowResults(false);
        setIsImportedData(false);
        setImportedRowCount(0);
        setGeneratingColumns(new Set());
        setRegeneratingDataset(false);
        setRegeneratingColumns(new Set());
        setSuggestingDataset(false);
        setDatasetSuggestions([]);
        setSuggestingColumns(new Set());
        setColumnSuggestions({});
        setIsGeneratingEmpty(false);
        setGeneratingRowLabel(false);
        setGeneratingNotes(false);
        setPendingNote('');
        setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        setSocrataDatasetId('');
        setSocrataFieldNameMap({});
        setStatus(null);
        navigate('import');
    }, [navigate]);

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
            const prompt = buildDatasetImprovementPrompt(currentDesc, promptTemplates.datasetSuggestion);
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
    }, [generatedResults.datasetDescription, openaiConfig, promptTemplates.systemPrompt, promptTemplates.datasetSuggestion, callOpenAIStream, addTokenUsage]);

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
            const prompt = buildColumnImprovementPrompt(columnName, currentDesc, promptTemplates.columnSuggestion);
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
    }, [generatedResults.columnDescriptions, openaiConfig, promptTemplates.systemPrompt, promptTemplates.columnSuggestion, callOpenAIStream, addTokenUsage]);

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

    const handleEditNote = useCallback((index: number, text: string) => {
        setGeneratedResults((prev) => {
            const notes = [...prev.notes];
            notes[index] = text;
            return { ...prev, notes };
        });
    }, []);

    const handleDeleteNote = useCallback((index: number) => {
        setGeneratedResults((prev) => ({
            ...prev,
            notes: prev.notes.filter((_, i) => i !== index),
        }));
    }, []);

    const handleAddNote = useCallback((text: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            notes: [...prev.notes, text],
        }));
    }, []);

    const handleGenerateNote = useCallback(async () => {
        if (!csvData) return;
        setGeneratingNotes(true);
        try {
            const result = await generateNotes(csvData, fileName, columnStats, importedRowCount || undefined);
            // Parse bulleted list into individual notes
            const parsed = result.content
                .split('\n')
                .map((line) => line.replace(/^\s*[-*•]\s+/, '').trim())
                .filter((line) => line.length > 0 && line.toLowerCase() !== 'no additional notes.');
            const newNotes = parsed.length > 0 ? parsed : [result.content];
            setGeneratedResults((prev) => ({
                ...prev,
                notes: [...prev.notes, ...newNotes],
            }));
            setPendingNote('');
            const count = newNotes.length;
            setStatus({ message: `Successfully generated ${count} note${count !== 1 ? 's' : ''}!`, type: 'success' });
        } catch (error) {
            setPendingNote('');
            setStatus({
                message: `Error generating notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingNotes(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateNotes]);

    const handleSocrataImport = useCallback(
        async (datasetId: string) => {
            setIsProcessing(true);
            setShowResults(false);
            setIsImportedData(false);
            setImportedRowCount(0);
            setGeneratedResults({ datasetDescription: '', rowLabel: '', notes: [], columnDescriptions: {} });
            setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
            setSocrataDatasetId(datasetId);

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
                    notes: result.notes || [],
                    columnDescriptions,
                });

                setShowResults(true);
                setStatus({
                    message: `Imported "${result.datasetName}" with ${columns.length} columns (${result.totalRowCount.toLocaleString()} rows). Existing descriptions pre-populated — edit or improve with AI.`,
                    type: 'success',
                    autoHide: 5000,
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Import error: ${detail}`, type: 'error' });
            } finally {
                setIsProcessing(false);
            }
        },
        [socrataOAuthToken, socrataApiKeyId, socrataApiKeySecret]
    );

    const handleOpenAIConfigChange = useCallback((newConfig: OpenAIConfigType) => {
        setApiConfig({ baseURL: newConfig.baseURL, apiKey: newConfig.apiKey });
        setModel(newConfig.model);
    }, []);

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
                generatedResults.notes.length > 0 ? generatedResults.notes : undefined,
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

    const renderTokenUsage = useCallback(() => {
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
    }, [tokenUsage, openaiConfig.model]);

    const value: AppContextType = {
        currentPage,
        currentFieldName,
        navigate,
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
        generatingNotes,
        pendingNote,
        socrataDatasetId,
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
        handleSocrataImport,
        handleStop,
        handleRegenerateDataset,
        handleRegenerateColumn,
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
        handleEditNote,
        handleDeleteNote,
        handleAddNote,
        handleGenerateNote,
        handlePushToSocrata,
        handleCloseDataset,
        renderTokenUsage,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
