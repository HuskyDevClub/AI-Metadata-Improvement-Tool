import * as React from 'react';
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useOpenAI } from '../hooks/useOpenAI';
import {
    describeSocrataType,
    fetchSocrataCategories,
    fetchSocrataConfig,
    fetchSocrataImport,
    fetchSocrataLicenses,
    fetchSocrataOAuthLoginUrl,
    fetchSocrataSession,
    fetchSocrataTags,
    logoutSocrata,
    parseFile,
    pushSocrataMetadata,
    type PushSocrataMetadataOptions,
    saveSocrataApiKey,
} from '../utils/socrataApi';
import { fetchOpenAISession, logoutOpenAI, saveOpenAIConfig, } from '../utils/openaiApi';
import {
    analyzeColumn,
    buildSampleRows,
    getColumnStatsText,
    getSampleCount,
    getSampleValues
} from '../utils/columnAnalyzer';
import { handleRegenerationError } from '../utils/stateHelpers';
import {
    appendPromptModifiers,
    buildColumnImprovementPrompt,
    buildDatasetImprovementPrompt,
    buildNumberedCategoryList,
    buildRegenerateWithSuggestionsPrompt,
    DEFAULT_CATEGORY_PROMPT,
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_COLUMN_SUGGESTION_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_DATASET_SUGGESTION_PROMPT,
    DEFAULT_DATASET_TITLE_PROMPT,
    DEFAULT_PERIOD_OF_TIME_PROMPT,
    DEFAULT_ROW_LABEL_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_TAGS_PROMPT,
    parseCategoryIndex,
    parseTagsFromResponse,
    sanitizeInline,
    sanitizeUntrusted,
    type SuggestionItem,
} from '../utils/prompts';
import type {
    APIConfig,
    ColumnInfo,
    CsvRow,
    GeneratedResults,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
    SocrataLicense,
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

interface DatasetTabInfo {
    id: string;
    fileName: string;
}

interface SavedDatasetState {
    page: 'data' | 'field';
    fieldName: string | null;
    csvData: CsvRow[] | null;
    fileName: string;
    columnStats: Record<string, ColumnInfo>;
    generatedResults: GeneratedResults;
    initialResults: GeneratedResults | null;
    showResults: boolean;
    importedRowCount: number;
    tokenUsage: TokenUsage;
    socrataDatasetId: string;
    socrataFieldNameMap: Record<string, string>;
    // In-flight compare-UI state. Streaming regenerations on one dataset
    // must not bleed into another tab when the user switches, so we
    // persist what would otherwise be ambient React state.
    pendingDatasetDescription: string | null;
    pendingColumnDescriptions: Record<string, string>;
    pendingDatasetTitle: string | null;
    pendingRowLabel: string | null;
    pendingCategory: string | null;
    pendingTags: string[] | null;
    pendingPeriodOfTime: string | null;
    regeneratingDataset: boolean;
    regeneratingColumns: Set<string>;
}

export type ResettableColumnField = 'description' | 'displayName' | 'fieldName';

interface AppContextType {
    // Navigation
    currentPage: PageId;
    currentFieldName: string | null;
    navigate: (page: PageId, fieldName?: string) => void;

    // Multi-dataset tabs
    datasetTabs: DatasetTabInfo[];
    activeDatasetId: string | null;
    switchToDataset: (id: string) => void;

    // API & Config
    openaiConfig: OpenAIConfigType;
    isOpenAIConfigured: boolean;
    promptTemplates: PromptTemplates;
    setPromptTemplates: (templates: PromptTemplates) => void;
    handleOpenAIConfigSave: (
        baseURL: string,
        apiKey: string,
        model: string,
        modelConcise: string,
        modelDetailed: string,
        modelSuggest: string,
    ) => Promise<void>;
    handleOpenAIConfigClear: () => Promise<void>;

    // Portal domain this backend is bound to (null until /api/socrata/config resolves).
    socrataDomain: string | null;

    // Live data from the Socrata portal
    allowedCategories: string[];
    allowedTags: string[];
    allowedLicenses: SocrataLicense[];

    // CSV Data
    csvData: CsvRow[] | null;
    fileName: string;
    columnStats: Record<string, ColumnInfo>;
    generatedResults: GeneratedResults;
    initialResults: GeneratedResults | null;
    showResults: boolean;
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
    generatingDatasetTitle: boolean;
    generatingCategory: boolean;
    generatingTags: boolean;
    generatingPeriodOfTime: boolean;

    // Socrata
    socrataDatasetId: string;
    isPushingSocrata: boolean;

    // Socrata auth (credentials live in an HttpOnly cookie — never exposed to JS)
    socrataOAuthUser: {id: string; displayName: string; email?: string} | null;
    socrataApiKeyId: string;  // present only when kind === 'api_key'; never the secret
    isSocrataOAuthAuthenticating: boolean;
    handleSocrataOAuthLogin: () => Promise<void>;
    handleSocrataOAuthLogout: () => Promise<void>;
    handleSocrataApiKeySave: (keyId: string, keySecret: string) => Promise<void>;
    handleSocrataApiKeyClear: () => Promise<void>;

    // Handlers
    handleAnalyze: (file: File) => Promise<void>;
    handleSocrataImport: (datasetId: string, keyId?: string, keySecret?: string) => Promise<void>;
    handleStop: () => void;
    handleRegenerateDataset: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    handleRegenerateColumn: (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => Promise<void>;
    pendingDatasetDescription: string | null;
    pendingColumnDescriptions: Record<string, string>;
    pendingDatasetTitle: string | null;
    pendingRowLabel: string | null;
    pendingCategory: string | null;
    pendingTags: string[] | null;
    pendingPeriodOfTime: string | null;
    handleAcceptPendingDataset: () => void;
    handleDiscardPendingDataset: () => void;
    handleAcceptPendingColumn: (columnName: string) => void;
    handleDiscardPendingColumn: (columnName: string) => void;
    handleAcceptPendingDatasetTitle: () => void;
    handleDiscardPendingDatasetTitle: () => void;
    handleAcceptPendingRowLabel: () => void;
    handleDiscardPendingRowLabel: () => void;
    handleAcceptPendingCategory: () => void;
    handleDiscardPendingCategory: () => void;
    handleAcceptPendingTags: () => void;
    handleDiscardPendingTags: () => void;
    handleAcceptPendingPeriodOfTime: () => void;
    handleDiscardPendingPeriodOfTime: () => void;
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
    handleEditColumnDisplayName: (columnName: string, newDisplayName: string) => void;
    handleEditColumnFieldName: (columnName: string, newFieldName: string) => void;
    handleEditRowLabel: (newLabel: string) => void;
    handleGenerateRowLabel: () => Promise<void>;
    handleEditDatasetTitle: (newTitle: string) => void;
    handleGenerateDatasetTitle: () => Promise<void>;
    handleEditCategory: (newCategory: string) => void;
    handleGenerateCategory: () => Promise<void>;
    handleEditTags: (newTags: string[]) => void;
    handleAddTag: (tag: string) => void;
    handleRemoveTag: (tag: string) => void;
    handleGenerateTags: () => Promise<void>;
    handleEditLicenseId: (newLicenseId: string) => void;
    handleEditAttribution: (newAttribution: string) => void;
    handleEditContactEmail: (newContactEmail: string) => void;
    handleEditPeriodOfTime: (newPeriodOfTime: string) => void;
    handleGeneratePeriodOfTime: () => Promise<void>;
    handleEditPostingFrequency: (newPostingFrequency: string) => void;
    handleResetField: <K extends keyof GeneratedResults>(field: K) => void;
    handleResetColumnField: (columnName: string, field: ResettableColumnField) => void;
    handlePushToSocrata: () => Promise<void>;
    handleCloseDataset: () => void;
    closeTab: (id: string) => void;
    renderTokenUsage: () => React.ReactNode;
}

const AppContext = createContext<AppContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextType {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}

export function AppProvider({ children }: {children: ReactNode}) {
    // Navigation
    const [currentPage, setCurrentPage] = useState<PageId>('import');
    const [currentFieldName, setCurrentFieldName] = useState<string | null>(null);
    const lastDatasetPageRef = useRef<{page: 'data' | 'field'; fieldName: string | null}>({
        page: 'data',
        fieldName: null
    });

    const navigate = useCallback((page: PageId, fieldName?: string) => {
        setCurrentPage(page);
        setCurrentFieldName(fieldName ?? null);
        if (page === 'data' || page === 'field') {
            lastDatasetPageRef.current = { page, fieldName: fieldName ?? null };
        }
    }, []);

    // OpenAI Configuration (persisted in encrypted session cookie on backend)
    const [isOpenAIConfigured, setIsOpenAIConfigured] = useState(false);
    const [apiConfig, setApiConfig] = useState<APIConfig>({
        baseURL: '',
        apiKey: '', // Always empty on the frontend after initial save
    });
    const [model, setModel] = useState<string>('');
    const [modelConcise, setModelConcise] = useState<string>('');
    const [modelDetailed, setModelDetailed] = useState<string>('');
    const [modelSuggest, setModelSuggest] = useState<string>('');

    // Combined config for hooks that need the full OpenAIConfig
    const openaiConfig: OpenAIConfigType = useMemo(() => ({
        ...apiConfig,
        model,
        modelConcise,
        modelDetailed,
        modelSuggest,
    }), [apiConfig, model, modelConcise, modelDetailed, modelSuggest]);

    const [promptTemplates, setPromptTemplatesState] = useState<PromptTemplates>(() => {
        const defaults: PromptTemplates = {
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            dataset: DEFAULT_DATASET_PROMPT,
            column: DEFAULT_COLUMN_PROMPT,
            rowLabel: DEFAULT_ROW_LABEL_PROMPT,
            datasetTitle: DEFAULT_DATASET_TITLE_PROMPT,
            category: DEFAULT_CATEGORY_PROMPT,
            tags: DEFAULT_TAGS_PROMPT,
            periodOfTime: DEFAULT_PERIOD_OF_TIME_PROMPT,
            datasetSuggestion: DEFAULT_DATASET_SUGGESTION_PROMPT,
            columnSuggestion: DEFAULT_COLUMN_SUGGESTION_PROMPT,
        };
        try {
            const saved = localStorage.getItem('prompt_templates');
            if (saved) return { ...defaults, ...JSON.parse(saved) } as PromptTemplates;
        } catch { /* ignore corrupt data */
        }
        return defaults;
    });

    const setPromptTemplates = useCallback((templates: PromptTemplates) => {
        setPromptTemplatesState(templates);
        localStorage.setItem('prompt_templates', JSON.stringify(templates));
    }, []);

    const [socrataDomain, setSocrataDomain] = useState<string | null>(null);
    const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
    const [allowedTags, setAllowedTags] = useState<string[]>([]);
    const [allowedLicenses, setAllowedLicenses] = useState<SocrataLicense[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchSocrataConfig()
            .then((config) => {
                if (!cancelled && config.domain) setSocrataDomain(config.domain);
            })
            .catch((err) => {
                console.warn('Failed to load Socrata config:', err);
            });
        fetchSocrataCategories()
            .then((list) => {
                if (!cancelled) setAllowedCategories(list);
            })
            .catch((err) => {
                console.warn('Failed to load Socrata categories:', err);
            });
        fetchSocrataLicenses()
            .then((list) => {
                if (!cancelled) setAllowedLicenses(list);
            })
            .catch((err) => {
                console.warn('Failed to load Socrata licenses:', err);
            });

        // Initialize OpenAI session
        fetchOpenAISession()
            .then((session) => {
                if (!cancelled) {
                    setIsOpenAIConfigured(session.isConfigured);
                    if (session.isConfigured) {
                        setApiConfig({ baseURL: session.baseURL || '', apiKey: '' });
                        setModel(session.model || '');
                        setModelConcise(session.modelConcise || '');
                        setModelDetailed(session.modelDetailed || '');
                        setModelSuggest(session.modelSuggest || '');
                    }
                }
            })
            .catch((err) => {
                console.warn('Failed to load OpenAI session:', err);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const [csvData, setCsvData] = useState<CsvRow[] | null>(null);
    const [fileName, setFileName] = useState('');
    const [columnStats, setColumnStats] = useState<Record<string, ColumnInfo>>({});
    const [generatedResults, setGeneratedResults] = useState<GeneratedResults>({
        datasetTitle: '',
        datasetDescription: '',
        rowLabel: '',
        category: '',
        tags: [],
        licenseId: '',
        attribution: '',
        contactEmail: '',
        periodOfTime: '',
        postingFrequency: '',
        columnDescriptions: {},
        columnDisplayNames: {},
        columnFieldNames: {},
    });
    // Snapshot of generatedResults captured at import. Lets users reset
    // individual fields back to the value loaded from the source (Socrata
    // metadata for imports; the empty defaults for CSV uploads).
    const [initialResults, setInitialResults] = useState<GeneratedResults | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchSocrataTags('')
            .then((list) => {
                if (!cancelled) setAllowedTags(list);
            })
            .catch((err) => {
                console.warn('Failed to load Socrata tags:', err);
                if (!cancelled) setAllowedTags([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const [status, setStatus] = useState<Status | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [importedRowCount, setImportedRowCount] = useState(0);
    const [generatingColumns, setGeneratingColumns] = useState<Set<string>>(new Set());
    const [regeneratingDataset, setRegeneratingDataset] = useState(false);
    const [regeneratingColumns, setRegeneratingColumns] = useState<Set<string>>(new Set());
    const [suggestingDataset, setSuggestingDataset] = useState(false);
    const [datasetSuggestions, setDatasetSuggestions] = useState<SuggestionItem[]>([]);
    const [suggestingColumns, setSuggestingColumns] = useState<Set<string>>(new Set());
    const [columnSuggestions, setColumnSuggestions] = useState<Record<string, SuggestionItem[]>>({});
    const [pendingDatasetDescription, setPendingDatasetDescription] = useState<string | null>(null);
    const [pendingColumnDescriptions, setPendingColumnDescriptions] = useState<Record<string, string>>({});
    const [pendingDatasetTitle, setPendingDatasetTitle] = useState<string | null>(null);
    const [pendingRowLabel, setPendingRowLabel] = useState<string | null>(null);
    const [pendingCategory, setPendingCategory] = useState<string | null>(null);
    const [pendingTags, setPendingTags] = useState<string[] | null>(null);
    const [pendingPeriodOfTime, setPendingPeriodOfTime] = useState<string | null>(null);
    const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    });

    // Socrata push-back state
    const [socrataDatasetId, setSocrataDatasetId] = useState('');
    const [socrataFieldNameMap, setSocrataFieldNameMap] = useState<Record<string, string>>({});
    const [isPushingSocrata, setIsPushingSocrata] = useState(false);
    const [socrataOAuthUser, setSocrataOAuthUser] = useState<{
        id: string; displayName: string; email?: string;
    } | null>(null);
    const [socrataApiKeyId, setSocrataApiKeyId] = useState<string>('');
    const [isSocrataOAuthAuthenticating, setIsSocrataOAuthAuthenticating] = useState(false);
    const [isGeneratingEmpty, setIsGeneratingEmpty] = useState(false);
    const [generatingRowLabel, setGeneratingRowLabel] = useState(false);
    const [generatingDatasetTitle, setGeneratingDatasetTitle] = useState(false);
    const [generatingCategory, setGeneratingCategory] = useState(false);
    const [generatingTags, setGeneratingTags] = useState(false);
    const [generatingPeriodOfTime, setGeneratingPeriodOfTime] = useState(false);

    // --- Multi-dataset tab support ---
    const [datasetTabs, setDatasetTabs] = useState<DatasetTabInfo[]>([]);
    const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
    const savedDatasetsRef = useRef<Map<string, SavedDatasetState>>(new Map());
    const activeDatasetIdRef = useRef<string | null>(null);

    // Abort controller for stopping generation (moved here so switchToDataset can reference it)
    const abortControllerRef = useRef<AbortController | null>(null);

    // Ref that always holds current per-dataset state (updated synchronously after render)
    const datasetStateRef = useRef({
        csvData, fileName, columnStats, generatedResults, initialResults, showResults,
        importedRowCount, tokenUsage, socrataDatasetId, socrataFieldNameMap,
        pendingDatasetDescription, pendingColumnDescriptions,
        pendingDatasetTitle, pendingRowLabel, pendingCategory, pendingTags, pendingPeriodOfTime,
        regeneratingDataset, regeneratingColumns,
    });
    useLayoutEffect(() => {
        datasetStateRef.current = {
            csvData, fileName, columnStats, generatedResults, initialResults, showResults,
            importedRowCount, tokenUsage, socrataDatasetId, socrataFieldNameMap,
            pendingDatasetDescription, pendingColumnDescriptions,
            pendingDatasetTitle, pendingRowLabel, pendingCategory, pendingTags, pendingPeriodOfTime,
            regeneratingDataset, regeneratingColumns,
        };
    });

    const saveCurrentDataset = useCallback(() => {
        const id = activeDatasetIdRef.current;
        if (!id) return;
        const s = datasetStateRef.current;
        const lp = lastDatasetPageRef.current;
        savedDatasetsRef.current.set(id, {
            ...s,
            page: lp.page,
            fieldName: lp.fieldName,
        });
    }, []);

    const restoreDataset = useCallback((id: string) => {
        const saved = savedDatasetsRef.current.get(id);
        if (!saved) return;
        setCsvData(saved.csvData);
        setFileName(saved.fileName);
        setColumnStats(saved.columnStats);
        setGeneratedResults(saved.generatedResults);
        setInitialResults(saved.initialResults);
        setShowResults(saved.showResults);
        setImportedRowCount(saved.importedRowCount);
        setTokenUsage(saved.tokenUsage);
        setSocrataDatasetId(saved.socrataDatasetId);
        setSocrataFieldNameMap(saved.socrataFieldNameMap);
        setIsProcessing(false);
        setGeneratingColumns(new Set());
        setRegeneratingDataset(saved.regeneratingDataset);
        setRegeneratingColumns(new Set(saved.regeneratingColumns));
        setSuggestingDataset(false);
        setDatasetSuggestions([]);
        setSuggestingColumns(new Set());
        setColumnSuggestions({});
        setPendingDatasetDescription(saved.pendingDatasetDescription);
        setPendingColumnDescriptions(saved.pendingColumnDescriptions);
        setPendingDatasetTitle(saved.pendingDatasetTitle);
        setPendingRowLabel(saved.pendingRowLabel);
        setPendingCategory(saved.pendingCategory);
        setPendingTags(saved.pendingTags);
        setPendingPeriodOfTime(saved.pendingPeriodOfTime);
        setIsGeneratingEmpty(false);
        setGeneratingRowLabel(false);
        setGeneratingDatasetTitle(false);
        setGeneratingCategory(false);
        setGeneratingTags(false);
        setGeneratingPeriodOfTime(false);
        setIsPushingSocrata(false);
        setCurrentPage(saved.page);
        setCurrentFieldName(saved.fieldName);
        lastDatasetPageRef.current = { page: saved.page, fieldName: saved.fieldName };
    }, []);

    // Streaming generations capture the dataset id they were started on, then
    // route state writes through these helpers. If the user switched tabs
    // mid-stream, the originating dataset's saved entry is mutated instead of
    // the now-active state — so compare-UI chunks land on the correct tab.
    const setPendingDatasetDescriptionForDataset = useCallback((id: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingDatasetDescription(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingDatasetDescription: value });
        }
    }, []);

    const setPendingColumnDescriptionForDataset = useCallback((id: string, columnName: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingColumnDescriptions((prev) => {
                const next = { ...prev };
                if (value === null) delete next[columnName];
                else next[columnName] = value;
                return next;
            });
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            const nextCols = { ...saved.pendingColumnDescriptions };
            if (value === null) delete nextCols[columnName];
            else nextCols[columnName] = value;
            savedDatasetsRef.current.set(id, { ...saved, pendingColumnDescriptions: nextCols });
        }
    }, []);

    const setPendingDatasetTitleForDataset = useCallback((id: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingDatasetTitle(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingDatasetTitle: value });
        }
    }, []);

    const setPendingRowLabelForDataset = useCallback((id: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingRowLabel(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingRowLabel: value });
        }
    }, []);

    const setPendingCategoryForDataset = useCallback((id: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingCategory(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingCategory: value });
        }
    }, []);

    const setPendingTagsForDataset = useCallback((id: string, value: string[] | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingTags(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingTags: value });
        }
    }, []);

    const setPendingPeriodOfTimeForDataset = useCallback((id: string, value: string | null) => {
        if (id === activeDatasetIdRef.current) {
            setPendingPeriodOfTime(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, pendingPeriodOfTime: value });
        }
    }, []);

    const setRegeneratingDatasetForDataset = useCallback((id: string, value: boolean) => {
        if (id === activeDatasetIdRef.current) {
            setRegeneratingDataset(value);
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            savedDatasetsRef.current.set(id, { ...saved, regeneratingDataset: value });
        }
    }, []);

    const setRegeneratingColumnForDataset = useCallback((id: string, columnName: string, value: boolean) => {
        if (id === activeDatasetIdRef.current) {
            setRegeneratingColumns((prev) => {
                const next = new Set(prev);
                if (value) next.add(columnName);
                else next.delete(columnName);
                return next;
            });
            return;
        }
        const saved = savedDatasetsRef.current.get(id);
        if (saved) {
            const nextSet = new Set(saved.regeneratingColumns);
            if (value) nextSet.add(columnName);
            else nextSet.delete(columnName);
            savedDatasetsRef.current.set(id, { ...saved, regeneratingColumns: nextSet });
        }
    }, []);

    const switchToDataset = useCallback((id: string) => {
        const currentId = activeDatasetIdRef.current;
        if (id === currentId) {
            // Already active - navigate back to its last page (in case we're on import/settings)
            const lp = lastDatasetPageRef.current;
            setCurrentPage(lp.page);
            setCurrentFieldName(lp.fieldName);
            return;
        }
        // Abort any ongoing processing
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        // Save current dataset
        saveCurrentDataset();
        // Restore target
        restoreDataset(id);
        activeDatasetIdRef.current = id;
        setActiveDatasetId(id);
        savedDatasetsRef.current.delete(id);
    }, [saveCurrentDataset, restoreDataset]);

    // Hydrate the Socrata auth session from the backend on mount. Credentials
    // live in an HttpOnly cookie — the browser never sees the raw token/secret.
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#oauth_error=')) {
            const error = decodeURIComponent(hash.slice('#oauth_error='.length));
            window.history.replaceState(null, '', window.location.pathname);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setStatus({ message: `OAuth sign-in failed: ${error}`, type: 'error' });
        } else if (hash.startsWith('#oauth_token=')) {
            // Legacy callback format — strip it from URL. Fresh deploys use cookie-only.
            window.history.replaceState(null, '', window.location.pathname);
        }

        // Clean up localStorage from previous token-based versions
        localStorage.removeItem('socrata_oauth_token');
        localStorage.removeItem('socrata_oauth_user');
        localStorage.removeItem('socrata_api_key_id');
        localStorage.removeItem('socrata_api_key_secret');
        localStorage.removeItem('openai_base_url');
        localStorage.removeItem('openai_api_key');
        localStorage.removeItem('openai_model');

        setIsSocrataOAuthAuthenticating(true);
        fetchSocrataSession()
            .then((session) => {
                if (session.kind === 'oauth') {
                    setSocrataOAuthUser(session.user);
                    setSocrataApiKeyId('');
                } else if (session.kind === 'api_key') {
                    setSocrataApiKeyId(session.apiKeyId);
                    setSocrataOAuthUser(null);
                } else {
                    setSocrataOAuthUser(null);
                    setSocrataApiKeyId('');
                }
            })
            .catch(() => {
                // No active session — silent, this is the default state
            })
            .finally(() => setIsSocrataOAuthAuthenticating(false));
    }, []);

    const handleSocrataOAuthLogin = useCallback(async () => {
        setIsSocrataOAuthAuthenticating(true);
        try {
            window.location.href = await fetchSocrataOAuthLoginUrl();
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({ message: `OAuth error: ${detail}`, type: 'error' });
            setIsSocrataOAuthAuthenticating(false);
        }
    }, []);

    const handleSocrataApiKeySave = useCallback(
        async (keyId: string, keySecret: string) => {
            try {
                await saveSocrataApiKey(keyId, keySecret);
                setSocrataApiKeyId(keyId);
                // Saving an API key replaces any OAuth session on the backend.
                setSocrataOAuthUser(null);
                setStatus({ message: 'API key saved', type: 'success' });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Failed to save API key: ${detail}`, type: 'error' });
            }
        },
        [],
    );

    const handleSocrataApiKeyClear = useCallback(async () => {
        try {
            await logoutSocrata();
        } catch {
            // Ignore — we still clear local state below
        }
        setSocrataApiKeyId('');
    }, []);

    const handleSocrataOAuthLogout = useCallback(async () => {
        try {
            await logoutSocrata();
        } catch {
            // Ignore — we still clear local state below
        }
        setSocrataOAuthUser(null);
        setStatus({
            message: socrataDomain ? `Signed out from ${socrataDomain}` : 'Signed out',
            type: 'info',
        });
    }, [socrataDomain]);

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
            .map(([col, info]) => {
                const typeLabel = info.originalType
                    ? describeSocrataType(info.originalType)
                    : info.type;
                return `- ${col} — ${typeLabel}`;
            })
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
            .replace('{fileName}', sanitizeInline(name))
            .replace('{rowCount}', String(effectiveRowCount))
            .replace('{columnInfo}', sanitizeUntrusted(columnInfo))
            .replace('{sampleRows}', sanitizeUntrusted(sampleRows))
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

    const buildDatasetTitlePrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        rowCountOverride?: number,
    ): string => {
        return buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.datasetTitle, '', undefined, rowCountOverride);
    }, [promptTemplates.datasetTitle, buildDatasetPromptFromTemplate]);

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
            .replace(/\{columnName}/g, sanitizeInline(columnName))
            .replace('{datasetDescription}', sanitizeUntrusted(datasetDesc))
            .replace('{columnStats}', sanitizeUntrusted(statsText))
            .replace('{dataType}', info.originalType ? describeSocrataType(info.originalType) : info.type)
            .replace('{nonNullCount}', String(nonNullCount))
            .replace('{rowCount}', String(info.totalCount))
            .replace('{completenessPercent}', completenessPercent)
            .replace('{sampleValues}', sanitizeUntrusted(sampleValues))
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
        ): Promise<{content: string; aborted: boolean}> => {
            const prompt = buildDatasetPrompt(data, name, stats, modifier, customInstruction, importedRowCount || undefined);
            let fullContent = '';
            const mode = modifier === '' ? 'default' : modifier;
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    datasetDescription: fullContent,
                }));
            }, abortSignal, mode);
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
        ): Promise<{content: string; aborted: boolean}> => {
            const prompt = buildColumnPrompt(columnName, info, datasetDesc, columnValues, modifier, customInstruction);
            let fullContent = '';
            const mode = modifier === '' ? 'default' : modifier;
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: { ...prev.columnDescriptions, [columnName]: fullContent },
                }));
            }, abortSignal, mode);
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
            rowCountOverride: number | undefined,
            onPartial: (value: string) => void,
        ): Promise<{content: string}> => {
            const prompt = buildRowLabelPrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                onPartial(fullContent.trim());
            });
            addTokenUsage(result.usage);
            return { content: fullContent.trim() };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildRowLabelPrompt, callOpenAIStream, addTokenUsage]
    );

    const generateDatasetTitle = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride: number | undefined,
            onPartial: (value: string) => void,
        ): Promise<{content: string}> => {
            const prompt = buildDatasetTitlePrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                onPartial(fullContent.trim().replace(/^["']|["']$/g, ''));
            });
            addTokenUsage(result.usage);
            return { content: fullContent.trim().replace(/^["']|["']$/g, '') };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildDatasetTitlePrompt, callOpenAIStream, addTokenUsage]
    );

    const buildCategoryPrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        rowCountOverride?: number,
    ): string => {
        const base = buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.category, '', undefined, rowCountOverride);
        return base.replace('{categoryList}', buildNumberedCategoryList(allowedCategories));
    }, [promptTemplates.category, buildDatasetPromptFromTemplate, allowedCategories]);

    const buildTagsPrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        tagList: string[],
        rowCountOverride?: number,
    ): string => {
        const base = buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.tags, '', undefined, rowCountOverride);
        // Send a small, high-signal vocabulary to the LLM. Caller is expected to
        // pre-rank tagList so category-scoped entries come first.
        const PROMPT_TAG_CAP = 20;
        const promptTags = tagList.slice(0, PROMPT_TAG_CAP);
        const rendered = promptTags.length > 0
            ? promptTags.join(', ')
            : '(no existing tags available — generate tags from the dataset alone)';
        return base.replace('{tagList}', rendered);
    }, [promptTemplates.tags, buildDatasetPromptFromTemplate]);

    const generateCategory = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride: number | undefined,
            onResult: (value: string) => void,
        ): Promise<{content: string}> => {
            const prompt = buildCategoryPrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
            });
            addTokenUsage(result.usage);
            const matched = parseCategoryIndex(fullContent, allowedCategories);
            if (!matched) {
                setStatus({
                    message: 'AI did not return a valid category — please select one manually.',
                    type: 'warning',
                });
                return { content: '' };
            }
            onResult(matched);
            return { content: matched };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildCategoryPrompt, callOpenAIStream, addTokenUsage, allowedCategories]
    );

    const generateTags = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride: number | undefined,
            onPartial: (value: string[]) => void,
        ): Promise<{tags: string[]}> => {
            const currentCategory = datasetStateRef.current.generatedResults.category || '';
            // Prefer category-scoped tags, then top-of-domain tags as fallback fill.
            // The merged list is what the LLM sees as the "preferred vocabulary".
            const [scoped, global] = await Promise.all([
                currentCategory
                    ? fetchSocrataTags(currentCategory).catch((err) => {
                        console.warn('Failed to load category-scoped tags:', err);
                        return [] as string[];
                    })
                    : Promise.resolve([] as string[]),
                fetchSocrataTags('').catch((err) => {
                    console.warn('Failed to load Socrata tag list — falling back to free-form generation:', err);
                    return [] as string[];
                }),
            ]);
            const seen = new Set<string>();
            const tagList: string[] = [];
            for (const t of [...scoped, ...global]) {
                const key = t.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                tagList.push(t);
            }
            const prompt = buildTagsPrompt(data, name, stats, tagList, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                onPartial(parseTagsFromResponse(fullContent));
            });
            addTokenUsage(result.usage);
            const finalTags = parseTagsFromResponse(fullContent);
            onPartial(finalTags);
            return { tags: finalTags };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildTagsPrompt, callOpenAIStream, addTokenUsage]
    );

    const handleAnalyze = useCallback(
        async (file: File) => {
            setIsProcessing(true);
            setStatus({ message: 'Reading CSV file...', type: 'info' });

            try {
                const result = await parseFile(file);

                if (!result.data || result.data.length === 0) {
                    setStatus({ message: 'No data found in CSV file', type: 'error' });
                    setIsProcessing(false);
                    return;
                }

                // Save current dataset before switching
                if (activeDatasetIdRef.current && datasetStateRef.current.showResults) {
                    saveCurrentDataset();
                }

                // Create new tab
                const newId = crypto.randomUUID();
                activeDatasetIdRef.current = newId;
                setActiveDatasetId(newId);

                // Set new dataset state
                setCsvData(result.data);
                setFileName(result.fileName);
                setShowResults(true);
                setImportedRowCount(0);
                setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
                setSocrataDatasetId('');
                setSocrataFieldNameMap({});

                setStatus({ message: 'Analyzing columns...', type: 'info' });
                const columns = Object.keys(result.data[0]);
                const stats: Record<string, ColumnInfo> = {};
                const displayNameMap: Record<string, string> = {};
                columns.forEach((col) => {
                    const values = result.data.map((row) => row[col]);
                    stats[col] = analyzeColumn(col, values);
                    displayNameMap[col] = col;
                });
                setColumnStats(stats);

                const initialCsvResults: GeneratedResults = {
                    datasetTitle: '',
                    datasetDescription: '',
                    rowLabel: '',
                    category: '',
                    tags: [],
                    licenseId: '',
                    attribution: '',
                    contactEmail: '',
                    periodOfTime: '',
                    postingFrequency: '',
                    columnDescriptions: {},
                    columnDisplayNames: displayNameMap,
                    columnFieldNames: {},
                };
                setGeneratedResults(initialCsvResults);
                setInitialResults(initialCsvResults);

                // Add tab
                setDatasetTabs(prev => [...prev, { id: newId, fileName: result.fileName }]);
                lastDatasetPageRef.current = { page: 'data', fieldName: null };

                setStatus({ message: 'CSV loaded successfully.', type: 'success', autoHide: 3000 });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Error reading CSV: ${detail}`, type: 'error' });
            } finally {
                setIsProcessing(false);
            }
        },
        [saveCurrentDataset]
    );

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const handleCloseDataset = useCallback(() => {
        const closingId = activeDatasetIdRef.current;

        // Abort any ongoing processing
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Remove from tabs
        const remainingTabs = datasetTabs.filter(t => t.id !== closingId);
        setDatasetTabs(remainingTabs);

        // Clean up saved state
        if (closingId) savedDatasetsRef.current.delete(closingId);

        if (remainingTabs.length > 0) {
            // Switch to the last remaining tab
            const nextTab = remainingTabs[remainingTabs.length - 1];
            restoreDataset(nextTab.id);
            activeDatasetIdRef.current = nextTab.id;
            setActiveDatasetId(nextTab.id);
            savedDatasetsRef.current.delete(nextTab.id);
        } else {
            // No datasets left - reset everything
            activeDatasetIdRef.current = null;
            setActiveDatasetId(null);
            setCsvData(null);
            setFileName('');
            setColumnStats({});
            setGeneratedResults({
                datasetTitle: '',
                datasetDescription: '',
                rowLabel: '',
                category: '',
                tags: [],
                licenseId: '',
                attribution: '',
                contactEmail: '',
                periodOfTime: '',
                postingFrequency: '',
                columnDescriptions: {},
                columnDisplayNames: {},
                columnFieldNames: {},
            });
            setInitialResults(null);
            setShowResults(false);
            setImportedRowCount(0);
            setGeneratingColumns(new Set());
            setRegeneratingDataset(false);
            setRegeneratingColumns(new Set());
            setSuggestingDataset(false);
            setDatasetSuggestions([]);
            setSuggestingColumns(new Set());
            setColumnSuggestions({});
            setPendingDatasetDescription(null);
            setPendingColumnDescriptions({});
            setPendingDatasetTitle(null);
            setPendingRowLabel(null);
            setPendingCategory(null);
            setPendingTags(null);
            setPendingPeriodOfTime(null);
            setIsGeneratingEmpty(false);
            setGeneratingRowLabel(false);
            setGeneratingDatasetTitle(false);
            setGeneratingCategory(false);
            setGeneratingTags(false);
            setGeneratingPeriodOfTime(false);
            setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
            setSocrataDatasetId('');
            setSocrataFieldNameMap({});
            setIsPushingSocrata(false);
            setIsProcessing(false);
            setStatus(null);
            navigate('import');
        }
    }, [datasetTabs, navigate, restoreDataset]);

    const closeTab = useCallback((id: string) => {
        if (id === activeDatasetIdRef.current) {
            handleCloseDataset();
        } else {
            // Close an inactive tab - just remove it from tabs and saved state
            savedDatasetsRef.current.delete(id);
            setDatasetTabs(prev => prev.filter(t => t.id !== id));
        }
    }, [handleCloseDataset]);

    const handleRegenerateDataset = useCallback(
        async (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            if (!csvData) return;
            const regenDatasetId = activeDatasetIdRef.current;
            if (!regenDatasetId) return;
            setRegeneratingDataset(true);
            setPendingDatasetDescription('');
            try {
                const prompt = buildDatasetPrompt(
                    csvData, fileName, columnStats, modifier, customInstruction, importedRowCount || undefined,
                );
                const mode = modifier === '' ? 'default' : modifier;
                let fullContent = '';
                const result = await callOpenAIStream(
                    prompt, openaiConfig, promptTemplates.systemPrompt,
                    (chunk) => {
                        fullContent += chunk;
                        setPendingDatasetDescriptionForDataset(regenDatasetId, fullContent);
                    },
                    undefined, mode,
                );
                addTokenUsage(result.usage);
                setStatus({
                    message: 'New description ready — review and keep or discard.',
                    type: 'success',
                });
            } catch (error) {
                setPendingDatasetDescriptionForDataset(regenDatasetId, null);
                setStatus({
                    message: `Error regenerating: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error'
                });
            } finally {
                setRegeneratingDatasetForDataset(regenDatasetId, false);
            }
        },
        [csvData, fileName, columnStats, importedRowCount, openaiConfig, promptTemplates.systemPrompt, buildDatasetPrompt, callOpenAIStream, addTokenUsage, setPendingDatasetDescriptionForDataset, setRegeneratingDatasetForDataset]
    );

    const handleRegenerateColumn = useCallback(
        async (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            const regenDatasetId = activeDatasetIdRef.current;
            if (!regenDatasetId) return;
            setRegeneratingColumns((prev) => new Set(prev).add(columnName));
            setPendingColumnDescriptions((prev) => ({ ...prev, [columnName]: '' }));
            try {
                const info = columnStats[columnName];
                const colValues = csvData?.map(row => row[columnName]);
                const prompt = buildColumnPrompt(
                    columnName, info, generatedResults.datasetDescription, colValues, modifier, customInstruction,
                );
                const mode = modifier === '' ? 'default' : modifier;
                let fullContent = '';
                const result = await callOpenAIStream(
                    prompt, openaiConfig, promptTemplates.systemPrompt,
                    (chunk) => {
                        fullContent += chunk;
                        setPendingColumnDescriptionForDataset(regenDatasetId, columnName, fullContent);
                    },
                    undefined, mode,
                );
                addTokenUsage(result.usage);
                setStatus({
                    message: `New "${columnName}" description ready — review and keep or discard.`,
                    type: 'success',
                });
            } catch (error) {
                setPendingColumnDescriptionForDataset(regenDatasetId, columnName, null);
                handleRegenerationError(error, setStatus);
            } finally {
                setRegeneratingColumnForDataset(regenDatasetId, columnName, false);
            }
        },
        [csvData, columnStats, generatedResults.datasetDescription, openaiConfig, promptTemplates.systemPrompt, buildColumnPrompt, callOpenAIStream, addTokenUsage, setPendingColumnDescriptionForDataset, setRegeneratingColumnForDataset]
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
            }, undefined, 'suggest');
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
        const regenDatasetId = activeDatasetIdRef.current;
        if (!regenDatasetId) return;
        setRegeneratingDataset(true);
        setDatasetSuggestions([]);
        setPendingDatasetDescription('');
        try {
            // Route through the sanitized builder so dataset name/columns/cell
            // values pass through fence-aware escaping before being fed back
            // into the regenerated prompt.
            const originalPrompt = buildDatasetPromptFromTemplate(
                csvData,
                fileName,
                columnStats,
                DEFAULT_DATASET_PROMPT,
                '',
                undefined,
                importedRowCount || undefined,
            );

            const prompt = buildRegenerateWithSuggestionsPrompt(originalPrompt, datasetSuggestions);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setPendingDatasetDescriptionForDataset(regenDatasetId, fullContent);
            });
            addTokenUsage(result.usage);
            setStatus({
                message: 'New description ready — review and keep or discard.',
                type: 'success',
            });
        } catch (error) {
            setPendingDatasetDescriptionForDataset(regenDatasetId, null);
            setStatus({
                message: `Error applying suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setRegeneratingDatasetForDataset(regenDatasetId, false);
        }
    }, [csvData, fileName, columnStats, generatedResults.datasetDescription, datasetSuggestions, importedRowCount, openaiConfig, promptTemplates.systemPrompt, callOpenAIStream, addTokenUsage, buildDatasetPromptFromTemplate, setPendingDatasetDescriptionForDataset, setRegeneratingDatasetForDataset]);

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
            }, undefined, 'suggest');
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
        const regenDatasetId = activeDatasetIdRef.current;
        if (!regenDatasetId) return;

        // Capture suggestions before clearing state — the closure reads a stale
        // reference if we read from the state variable inside the async callback.
        const suggestions = columnSuggestions[columnName] || [];

        setRegeneratingColumns((prev) => new Set(prev).add(columnName));
        setColumnSuggestions((prev) => {
            const next = { ...prev };
            delete next[columnName];
            return next;
        });
        setPendingColumnDescriptions((prev) => ({ ...prev, [columnName]: '' }));
        try {
            const originalPrompt = buildColumnPrompt(
                columnName, info, generatedResults.datasetDescription || '', colValues, '', undefined
            );
            const prompt = buildRegenerateWithSuggestionsPrompt(originalPrompt, suggestions);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                setPendingColumnDescriptionForDataset(regenDatasetId, columnName, fullContent);
            });
            addTokenUsage(result.usage);
            setStatus({
                message: `New "${columnName}" description ready — review and keep or discard.`,
                type: 'success',
            });
        } catch (error) {
            setPendingColumnDescriptionForDataset(regenDatasetId, columnName, null);
            handleRegenerationError(error, setStatus);
        } finally {
            setRegeneratingColumnForDataset(regenDatasetId, columnName, false);
        }
    }, [csvData, columnStats, generatedResults, columnSuggestions, openaiConfig, promptTemplates.systemPrompt, buildColumnPrompt, callOpenAIStream, addTokenUsage, setPendingColumnDescriptionForDataset, setRegeneratingColumnForDataset]);

    const handleEditDatasetDescription = useCallback((newDescription: string) => {
        setGeneratedResults((prev) => ({ ...prev, datasetDescription: newDescription }));
    }, []);

    const handleAcceptPendingDataset = useCallback(() => {
        setPendingDatasetDescription((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, datasetDescription: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingDataset = useCallback(() => {
        setPendingDatasetDescription(null);
    }, []);

    const handleAcceptPendingColumn = useCallback((columnName: string) => {
        setPendingColumnDescriptions((prev) => {
            const pending = prev[columnName];
            if (pending !== undefined) {
                setGeneratedResults((res) => ({
                    ...res,
                    columnDescriptions: { ...res.columnDescriptions, [columnName]: pending },
                }));
            }
            const next = { ...prev };
            delete next[columnName];
            return next;
        });
    }, []);

    const handleDiscardPendingColumn = useCallback((columnName: string) => {
        setPendingColumnDescriptions((prev) => {
            const next = { ...prev };
            delete next[columnName];
            return next;
        });
    }, []);

    const handleAcceptPendingDatasetTitle = useCallback(() => {
        setPendingDatasetTitle((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, datasetTitle: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingDatasetTitle = useCallback(() => {
        setPendingDatasetTitle(null);
    }, []);

    const handleAcceptPendingRowLabel = useCallback(() => {
        setPendingRowLabel((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, rowLabel: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingRowLabel = useCallback(() => {
        setPendingRowLabel(null);
    }, []);

    const handleAcceptPendingCategory = useCallback(() => {
        setPendingCategory((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, category: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingCategory = useCallback(() => {
        setPendingCategory(null);
    }, []);

    const handleAcceptPendingTags = useCallback(() => {
        setPendingTags((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, tags: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingTags = useCallback(() => {
        setPendingTags(null);
    }, []);

    const handleAcceptPendingPeriodOfTime = useCallback(() => {
        setPendingPeriodOfTime((pending) => {
            if (pending !== null) {
                setGeneratedResults((prev) => ({ ...prev, periodOfTime: pending }));
            }
            return null;
        });
    }, []);

    const handleDiscardPendingPeriodOfTime = useCallback(() => {
        setPendingPeriodOfTime(null);
    }, []);

    const handleEditColumnDescription = useCallback((columnName: string, newDescription: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnDescriptions: { ...prev.columnDescriptions, [columnName]: newDescription },
        }));
    }, []);

    const handleEditColumnDisplayName = useCallback((columnName: string, newDisplayName: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnDisplayNames: { ...prev.columnDisplayNames, [columnName]: newDisplayName },
        }));
    }, []);

    const handleEditColumnFieldName = useCallback((columnName: string, newFieldName: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnFieldNames: { ...prev.columnFieldNames, [columnName]: newFieldName },
        }));
    }, []);

    const handleEditRowLabel = useCallback((newLabel: string) => {
        setGeneratedResults((prev) => ({ ...prev, rowLabel: newLabel }));
    }, []);

    const handleGenerateRowLabel = useCallback(async () => {
        if (!csvData) return;
        const genId = activeDatasetIdRef.current;
        if (!genId) return;
        setGeneratingRowLabel(true);
        setPendingRowLabelForDataset(genId, '');
        try {
            await generateRowLabel(csvData, fileName, columnStats, importedRowCount || undefined, (value) => {
                setPendingRowLabelForDataset(genId, value);
            });
            setStatus({ message: 'Successfully generated row label!', type: 'success' });
        } catch (error) {
            setPendingRowLabelForDataset(genId, null);
            setStatus({
                message: `Error generating row label: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingRowLabel(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateRowLabel, setPendingRowLabelForDataset]);

    const handleEditDatasetTitle = useCallback((newTitle: string) => {
        setGeneratedResults((prev) => ({ ...prev, datasetTitle: newTitle }));
    }, []);

    const handleGenerateDatasetTitle = useCallback(async () => {
        if (!csvData) return;
        const genId = activeDatasetIdRef.current;
        if (!genId) return;
        setGeneratingDatasetTitle(true);
        setPendingDatasetTitleForDataset(genId, '');
        try {
            await generateDatasetTitle(csvData, fileName, columnStats, importedRowCount || undefined, (value) => {
                setPendingDatasetTitleForDataset(genId, value);
            });
            setStatus({ message: 'Successfully generated dataset title!', type: 'success' });
        } catch (error) {
            setPendingDatasetTitleForDataset(genId, null);
            setStatus({
                message: `Error generating dataset title: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingDatasetTitle(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateDatasetTitle, setPendingDatasetTitleForDataset]);

    const handleEditCategory = useCallback((newCategory: string) => {
        setGeneratedResults((prev) => ({ ...prev, category: newCategory }));
    }, []);

    const handleGenerateCategory = useCallback(async () => {
        if (!csvData) return;
        if (allowedCategories.length === 0) {
            setStatus({
                message: 'Categories are unavailable right now — cannot generate.',
                type: 'warning',
            });
            return;
        }
        const genId = activeDatasetIdRef.current;
        if (!genId) return;
        setGeneratingCategory(true);
        try {
            const result = await generateCategory(csvData, fileName, columnStats, importedRowCount || undefined, (value) => {
                setPendingCategoryForDataset(genId, value);
            });
            if (result.content) {
                setStatus({ message: 'Successfully generated category!', type: 'success' });
            }
        } catch (error) {
            setPendingCategoryForDataset(genId, null);
            setStatus({
                message: `Error generating category: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingCategory(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateCategory, allowedCategories, setPendingCategoryForDataset]);

    const handleEditTags = useCallback((newTags: string[]) => {
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const raw of newTags) {
            const tag = raw.trim();
            if (!tag) continue;
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(tag);
        }
        setGeneratedResults((prev) => ({ ...prev, tags: deduped }));
    }, []);

    const handleAddTag = useCallback((tag: string) => {
        const clean = tag.trim();
        if (!clean) return;
        setGeneratedResults((prev) => {
            const key = clean.toLowerCase();
            if (prev.tags.some((t) => t.toLowerCase() === key)) return prev;
            return { ...prev, tags: [...prev.tags, clean] };
        });
    }, []);

    const handleRemoveTag = useCallback((tag: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            tags: prev.tags.filter((t) => t !== tag),
        }));
    }, []);

    const handleGenerateTags = useCallback(async () => {
        if (!csvData) return;
        const genId = activeDatasetIdRef.current;
        if (!genId) return;
        setGeneratingTags(true);
        setPendingTagsForDataset(genId, []);
        try {
            await generateTags(csvData, fileName, columnStats, importedRowCount || undefined, (value) => {
                setPendingTagsForDataset(genId, value);
            });
            setStatus({ message: 'Successfully generated tags!', type: 'success' });
        } catch (error) {
            setPendingTagsForDataset(genId, null);
            setStatus({
                message: `Error generating tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingTags(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generateTags, setPendingTagsForDataset]);

    const buildPeriodOfTimePrompt = useCallback((
        data: CsvRow[],
        name: string,
        stats: Record<string, ColumnInfo>,
        rowCountOverride?: number,
    ): string => {
        return buildDatasetPromptFromTemplate(data, name, stats, promptTemplates.periodOfTime, '', undefined, rowCountOverride);
    }, [promptTemplates.periodOfTime, buildDatasetPromptFromTemplate]);

    const generatePeriodOfTime = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            rowCountOverride: number | undefined,
            onPartial: (value: string) => void,
        ): Promise<{content: string}> => {
            const prompt = buildPeriodOfTimePrompt(data, name, stats, rowCountOverride);
            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, promptTemplates.systemPrompt, (chunk) => {
                fullContent += chunk;
                onPartial(fullContent.trim().replace(/^["']|["']$/g, ''));
            });
            addTokenUsage(result.usage);
            const cleaned = fullContent.trim().replace(/^["']|["']$/g, '');
            onPartial(cleaned);
            return { content: cleaned };
        },
        [openaiConfig, promptTemplates.systemPrompt, buildPeriodOfTimePrompt, callOpenAIStream, addTokenUsage]
    );

    const handleEditLicenseId = useCallback((newLicenseId: string) => {
        setGeneratedResults((prev) => ({ ...prev, licenseId: newLicenseId }));
    }, []);

    const handleEditAttribution = useCallback((newAttribution: string) => {
        setGeneratedResults((prev) => ({ ...prev, attribution: newAttribution }));
    }, []);

    const handleEditContactEmail = useCallback((newContactEmail: string) => {
        setGeneratedResults((prev) => ({ ...prev, contactEmail: newContactEmail }));
    }, []);

    const handleEditPeriodOfTime = useCallback((newPeriodOfTime: string) => {
        setGeneratedResults((prev) => ({ ...prev, periodOfTime: newPeriodOfTime }));
    }, []);

    const handleEditPostingFrequency = useCallback((newPostingFrequency: string) => {
        setGeneratedResults((prev) => ({ ...prev, postingFrequency: newPostingFrequency }));
    }, []);

    const handleGeneratePeriodOfTime = useCallback(async () => {
        if (!csvData) return;
        const genId = activeDatasetIdRef.current;
        if (!genId) return;
        setGeneratingPeriodOfTime(true);
        setPendingPeriodOfTimeForDataset(genId, '');
        try {
            await generatePeriodOfTime(csvData, fileName, columnStats, importedRowCount || undefined, (value) => {
                setPendingPeriodOfTimeForDataset(genId, value);
            });
            setStatus({ message: 'Successfully generated Period of Time!', type: 'success' });
        } catch (error) {
            setPendingPeriodOfTimeForDataset(genId, null);
            setStatus({
                message: `Error generating Period of Time: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setGeneratingPeriodOfTime(false);
        }
    }, [csvData, fileName, columnStats, importedRowCount, generatePeriodOfTime, setPendingPeriodOfTimeForDataset]);

    const handleSocrataImport = useCallback(
        async (datasetId: string) => {
            setIsProcessing(true);
            setStatus({
                message: socrataDomain
                    ? `Importing dataset from ${socrataDomain}...`
                    : 'Importing dataset...',
                type: 'info',
            });

            try {
                const result = await fetchSocrataImport(datasetId);

                if (!result.sampleRows || result.sampleRows.length === 0) {
                    setStatus({ message: 'No data found in dataset', type: 'error' });
                    setIsProcessing(false);
                    return;
                }

                // Save current dataset before switching
                if (activeDatasetIdRef.current && datasetStateRef.current.showResults) {
                    saveCurrentDataset();
                }

                // Create new tab
                const newId = crypto.randomUUID();
                activeDatasetIdRef.current = newId;
                setActiveDatasetId(newId);

                // Store sample rows (sufficient for display & AI prompts)
                setCsvData(result.sampleRows);
                setFileName(result.fileName);
                setImportedRowCount(result.totalRowCount);
                setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
                setSocrataDatasetId(datasetId);

                // Use pre-computed stats from SODA API — no client-side analyzeColumn
                const enrichedColumnStats = { ...result.columnStats };
                result.columns.forEach((c) => {
                    const key = c.name || c.fieldName;
                    if (enrichedColumnStats[key]) {
                        enrichedColumnStats[key].originalType = c.dataTypeName;
                    }
                });
                setColumnStats(enrichedColumnStats);

                const columns = Object.keys(enrichedColumnStats);
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
                const displayNameMap: Record<string, string> = {};
                const fieldNameMap: Record<string, string> = {};
                columns.forEach((col) => {
                    columnDescriptions[col] = fieldNameDescMap.get(col) || displayNameDescMap.get(col) || '';
                    if (fieldNameSet.has(col)) {
                        fieldMap[col] = col;
                    } else if (nameToFieldName.has(col)) {
                        fieldMap[col] = nameToFieldName.get(col)!;
                    }
                    displayNameMap[col] = col;
                    fieldNameMap[col] = fieldMap[col] || col;
                });
                setSocrataFieldNameMap(fieldMap);

                const initialSocrataResults: GeneratedResults = {
                    datasetTitle: result.datasetName || '',
                    datasetDescription: result.datasetDescription || '',
                    rowLabel: result.rowLabel || '',
                    category: result.category || '',
                    tags: result.tags || [],
                    licenseId: result.licenseId || '',
                    attribution: result.attribution || '',
                    contactEmail: result.contactEmail || '',
                    periodOfTime: result.periodOfTime || '',
                    postingFrequency: result.postingFrequency || '',
                    columnDescriptions,
                    columnDisplayNames: displayNameMap,
                    columnFieldNames: fieldNameMap,
                };
                setGeneratedResults(initialSocrataResults);
                setInitialResults(initialSocrataResults);

                setShowResults(true);

                // Add tab
                setDatasetTabs(prev => [...prev, { id: newId, fileName: result.fileName }]);
                lastDatasetPageRef.current = { page: 'data', fieldName: null };

                setStatus({
                    message: `Imported "${result.datasetName}" with ${columns.length} columns (${result.totalRowCount.toLocaleString()} rows). Existing descriptions pre-populated — edit or improve with AI.`,
                    type: 'success',
                    autoHide: 3000,
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Import error: ${detail}`, type: 'error' });
            } finally {
                setIsProcessing(false);
            }
        },
        [saveCurrentDataset, socrataDomain]
    );

    // Auto-import dataset from ?dataset_id=<id> query parameter on mount
    const urlDatasetIdHandledRef = useRef(false);
    useEffect(() => {
        if (urlDatasetIdHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const datasetIdFromUrl = params.get('dataset_id');
        if (!datasetIdFromUrl) return;

        urlDatasetIdHandledRef.current = true;

        // Strip dataset_id from URL while preserving other params and hash
        params.delete('dataset_id');
        const remainingQuery = params.toString();
        const newUrl = window.location.pathname
            + (remainingQuery ? `?${remainingQuery}` : '')
            + window.location.hash;
        window.history.replaceState(null, '', newUrl);

        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleSocrataImport(datasetIdFromUrl).then();
    }, [handleSocrataImport]);

    const handleOpenAIConfigSave = useCallback(
        async (
            baseURL: string,
            apiKey: string,
            model: string,
            modelConcise: string,
            modelDetailed: string,
            modelSuggest: string,
        ) => {
            try {
                await saveOpenAIConfig(baseURL, apiKey, model, modelConcise, modelDetailed, modelSuggest);
                setIsOpenAIConfigured(true);
                setApiConfig({ baseURL, apiKey: '' }); // Don't keep key in memory
                setModel(model);
                setModelConcise(modelConcise);
                setModelDetailed(modelDetailed);
                setModelSuggest(modelSuggest);
                setStatus({ message: 'OpenAI configuration saved', type: 'success' });
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                setStatus({ message: `Failed to save OpenAI config: ${detail}`, type: 'error' });
            }
        },
        []
    );

    const handleOpenAIConfigClear = useCallback(async () => {
        try {
            await logoutOpenAI();
            setIsOpenAIConfigured(false);
            setApiConfig({ baseURL: '', apiKey: '' });
            setModel('');
            setModelConcise('');
            setModelDetailed('');
            setModelSuggest('');
            setStatus({ message: 'OpenAI configuration cleared', type: 'success' });
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({ message: `Failed to clear OpenAI config: ${detail}`, type: 'error' });
        }
    }, []);

    const handleResetField = useCallback(<K extends keyof GeneratedResults>(field: K) => {
        if (!initialResults) return;
        setGeneratedResults((prev) => ({ ...prev, [field]: initialResults[field] }));
    }, [initialResults]);

    const handleResetColumnField = useCallback(
        (columnName: string, field: ResettableColumnField) => {
            if (!initialResults) return;
            const mapKey: 'columnDescriptions' | 'columnDisplayNames' | 'columnFieldNames' =
                field === 'description' ? 'columnDescriptions'
                    : field === 'displayName' ? 'columnDisplayNames'
                        : 'columnFieldNames';
            const original = initialResults[mapKey][columnName] ?? '';
            setGeneratedResults((prev) => ({
                ...prev,
                [mapKey]: { ...prev[mapKey], [columnName]: original },
            }));
        },
        [initialResults]
    );

    const handlePushToSocrata = useCallback(async () => {
        if (!socrataDatasetId) return;
        setIsPushingSocrata(true);
        setStatus({
            message: socrataDomain
                ? `Pushing metadata to ${socrataDomain}...`
                : 'Pushing metadata...',
            type: 'info',
        });

        try {
            const columnKeys = new Set<string>([
                ...Object.keys(generatedResults.columnDescriptions),
                ...Object.keys(generatedResults.columnDisplayNames),
                ...Object.keys(generatedResults.columnFieldNames),
            ]);

            const columnUpdates: PushSocrataMetadataOptions['columns'] = [];
            for (const colName of columnKeys) {
                const originalFieldName = socrataFieldNameMap[colName] || colName;
                const desc = generatedResults.columnDescriptions[colName];
                const displayName = generatedResults.columnDisplayNames[colName];
                const fieldName = generatedResults.columnFieldNames[colName];

                const update: PushSocrataMetadataOptions['columns'][number] = {
                    fieldName: originalFieldName,
                };
                let hasChange = false;
                if (desc) {
                    update.description = desc;
                    hasChange = true;
                }
                if (displayName && displayName !== colName) {
                    update.name = displayName;
                    hasChange = true;
                }
                if (fieldName && fieldName !== originalFieldName) {
                    update.newFieldName = fieldName;
                    hasChange = true;
                }
                if (hasChange) columnUpdates.push(update);
            }

            const result = await pushSocrataMetadata({
                datasetId: socrataDatasetId,
                datasetTitle: generatedResults.datasetTitle || undefined,
                datasetDescription: generatedResults.datasetDescription || undefined,
                rowLabel: generatedResults.rowLabel || undefined,
                category: generatedResults.category || undefined,
                tags: generatedResults.tags.length > 0 ? generatedResults.tags : undefined,
                licenseId: generatedResults.licenseId || undefined,
                attribution: generatedResults.attribution || undefined,
                contactEmail: generatedResults.contactEmail || undefined,
                periodOfTime: generatedResults.periodOfTime || undefined,
                postingFrequency: generatedResults.postingFrequency || undefined,
                columns: columnUpdates,
            });

            setStatus({ message: result.message, type: 'success' });
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Unknown error';
            setStatus({ message: `Push error: ${detail}`, type: 'error' });
        } finally {
            setIsPushingSocrata(false);
        }
    }, [socrataDatasetId, socrataDomain, generatedResults, socrataFieldNameMap]);

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
                </div>
            );
        }

        return null;
    }, [tokenUsage]);

    const value: AppContextType = {
        currentPage,
        currentFieldName,
        navigate,
        datasetTabs,
        activeDatasetId,
        switchToDataset,
        openaiConfig,
        isOpenAIConfigured,
        promptTemplates,
        setPromptTemplates,
        handleOpenAIConfigSave,
        handleOpenAIConfigClear,
        socrataDomain,
        allowedCategories,
        allowedTags,
        allowedLicenses,
        csvData,
        fileName,
        columnStats,
        generatedResults,
        initialResults,
        showResults,
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
        generatingDatasetTitle,
        generatingCategory,
        generatingTags,
        generatingPeriodOfTime,
        socrataDatasetId,
        isPushingSocrata,
        socrataOAuthUser,
        isSocrataOAuthAuthenticating,
        handleSocrataOAuthLogin,
        handleSocrataOAuthLogout,
        socrataApiKeyId,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
        handleAnalyze,
        handleSocrataImport,
        handleStop,
        handleRegenerateDataset,
        handleRegenerateColumn,
        pendingDatasetDescription,
        pendingColumnDescriptions,
        pendingDatasetTitle,
        pendingRowLabel,
        pendingCategory,
        pendingTags,
        pendingPeriodOfTime,
        handleAcceptPendingDataset,
        handleDiscardPendingDataset,
        handleAcceptPendingColumn,
        handleDiscardPendingColumn,
        handleAcceptPendingDatasetTitle,
        handleDiscardPendingDatasetTitle,
        handleAcceptPendingRowLabel,
        handleDiscardPendingRowLabel,
        handleAcceptPendingCategory,
        handleDiscardPendingCategory,
        handleAcceptPendingTags,
        handleDiscardPendingTags,
        handleAcceptPendingPeriodOfTime,
        handleDiscardPendingPeriodOfTime,
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
        handleEditColumnDisplayName,
        handleEditColumnFieldName,
        handleEditRowLabel,
        handleGenerateRowLabel,
        handleEditDatasetTitle,
        handleGenerateDatasetTitle,
        handleEditCategory,
        handleGenerateCategory,
        handleEditTags,
        handleAddTag,
        handleRemoveTag,
        handleGenerateTags,
        handleEditLicenseId,
        handleEditAttribution,
        handleEditContactEmail,
        handleEditPeriodOfTime,
        handleGeneratePeriodOfTime,
        handleEditPostingFrequency,
        handleResetField,
        handleResetColumnField,
        handlePushToSocrata,
        handleCloseDataset,
        closeTab,
        renderTokenUsage,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
