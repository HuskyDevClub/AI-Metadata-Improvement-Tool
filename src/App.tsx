import { useCallback, useRef, useState } from 'react';
import { Header } from './components/Header/Header';
import { HowItWorks } from './components/HowItWorks/HowItWorks';
import { OpenAIConfig } from './components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from './components/PromptEditor/PromptEditor';
import { CsvInput } from './components/CsvInput/CsvInput';
import { StatusMessage } from './components/StatusMessage/StatusMessage';
import { DatasetDescription } from './components/DatasetDescription/DatasetDescription';
import { ColumnCard } from './components/ColumnCard/ColumnCard';
import { ExportSection } from './components/ExportSection/ExportSection';
import { useOpenAI } from './hooks/useOpenAI';
import { parseFile, parseUrl } from './utils/csvParser';
import { analyzeColumn, getColumnStatsText } from './utils/columnAnalyzer';
import type {
    CategoricalStats,
    ColumnInfo,
    CsvRow,
    GeneratedResults,
    NumericStats,
    OpenAIConfig as OpenAIConfigType,
    PromptTemplates,
    Status,
    TokenUsage,
} from './types';
import './App.css';

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

// Pricing per 1M tokens (USD) - updated as of Jan 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-5-nano': {input: 0.05, output: 0.40},
    'gpt-5-mini': {input: 0.25, output: 2.00},
    'gpt-4o-mini': {input: 0.15, output: 0.60},
};

function getEstimatedCost(
    model: string,
    promptTokens: number,
    completionTokens: number
): number | null {
    // Find matching pricing (case-insensitive, partial match)
    const modelLower = model.toLowerCase();
    const pricingKey = Object.keys(MODEL_PRICING).find((key) =>
        modelLower.includes(key)
    );

    if (!pricingKey) return null;

    const pricing = MODEL_PRICING[pricingKey];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}

function App() {
    const [openaiConfig, setOpenaiConfig] = useState<OpenAIConfigType>({
        baseURL: import.meta.env.VITE_AZURE_ENDPOINT || '',
        apiKey: import.meta.env.VITE_AZURE_KEY || '',
        model: import.meta.env.VITE_AZURE_MODEL || '',
    });

    const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>({
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

    // Abort controller for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null);

    const {callOpenAIStream} = useOpenAI();

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

    const generateDatasetDescription = useCallback(
        async (
            data: CsvRow[],
            name: string,
            stats: Record<string, ColumnInfo>,
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string,
            abortSignal?: AbortSignal
        ): Promise<{ content: string; aborted: boolean }> => {
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

            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    datasetDescription: fullContent,
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return {content: fullContent, aborted: result.aborted};
        },
        [openaiConfig, promptTemplates.dataset, buildColumnInfo, callOpenAIStream, addTokenUsage]
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

            let fullContent = '';
            const result = await callOpenAIStream(prompt, openaiConfig, (chunk) => {
                fullContent += chunk;
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: {...prev.columnDescriptions, [columnName]: fullContent},
                }));
            }, abortSignal);
            addTokenUsage(result.usage);
            return {content: fullContent, aborted: result.aborted};
        },
        [openaiConfig, promptTemplates.column, callOpenAIStream, addTokenUsage]
    );

    const handleAnalyze = useCallback(
        async (method: 'file' | 'url', file?: File, url?: string) => {

            // Create new abort controller
            abortControllerRef.current = new AbortController();
            const abortSignal = abortControllerRef.current.signal;

            setIsProcessing(true);
            setShowResults(false);
            setGeneratedResults({datasetDescription: '', columnDescriptions: {}});
            setTokenUsage({promptTokens: 0, completionTokens: 0, totalTokens: 0});

            try {
                // Parse CSV
                setStatus({
                    message: method === 'file' ? 'Reading CSV file...' : 'Fetching CSV from URL...',
                    type: 'info'
                });

                const result = method === 'file' && file ? await parseFile(file) : await parseUrl(url!);

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

                // Generate dataset description
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
                setStatus({message: 'Analysis complete! All descriptions generated successfully.', type: 'success'});
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
        [generateDatasetDescription, generateColumnDescription]
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
                setStatus({
                    message: `Error regenerating: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error'
                });
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

    const handleEditDatasetDescription = useCallback((newDescription: string) => {
        setGeneratedResults((prev) => ({...prev, datasetDescription: newDescription}));
    }, []);

    const handleEditColumnDescription = useCallback((columnName: string, newDescription: string) => {
        setGeneratedResults((prev) => ({
            ...prev,
            columnDescriptions: {...prev.columnDescriptions, [columnName]: newDescription},
        }));
    }, []);

    const handleExport = useCallback(() => {
        if (!csvData) return;

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

        setStatus({message: 'File downloaded successfully!', type: 'success'});
    }, [csvData, fileName, columnStats, generatedResults]);

    return (
        <div className="container">
            <Header/>
            <div className="content">
                <HowItWorks/>
                <OpenAIConfig config={openaiConfig} onChange={setOpenaiConfig}/>
                <PromptEditor templates={promptTemplates} onChange={setPromptTemplates}/>
                <CsvInput onAnalyze={handleAnalyze} isProcessing={isProcessing}/>

                <StatusMessage
                    status={status}
                    isProcessing={isProcessing}
                    onStop={handleStop}
                />

                {tokenUsage.totalTokens > 0 && (
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
                )}

                {showResults && (
                    <div className="results">
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
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
