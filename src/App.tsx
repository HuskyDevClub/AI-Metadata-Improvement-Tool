import { useCallback, useState } from 'react';
import { Header } from './components/Header/Header';
import { HowItWorks } from './components/HowItWorks/HowItWorks';
import { AzureConfig } from './components/AzureConfig/AzureConfig';
import { PromptEditor } from './components/PromptEditor/PromptEditor';
import { CsvInput } from './components/CsvInput/CsvInput';
import { StatusMessage } from './components/StatusMessage/StatusMessage';
import { DatasetDescription } from './components/DatasetDescription/DatasetDescription';
import { ColumnCard } from './components/ColumnCard/ColumnCard';
import { ExportSection } from './components/ExportSection/ExportSection';
import { useAzureOpenAI } from './hooks/useAzureOpenAI';
import { parseFile, parseUrl } from './utils/csvParser';
import { analyzeColumn, getColumnStatsText } from './utils/columnAnalyzer';
import type {
    AzureConfig as AzureConfigType,
    CategoricalStats,
    ColumnInfo,
    CsvRow,
    GeneratedResults,
    NumericStats,
    PromptTemplates,
    Status,
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

function App() {
    const [azureConfig, setAzureConfig] = useState<AzureConfigType>({
        endpoint: '',
        key: '',
        deployment: 'gpt-5-nano',
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

    const {callAzureOpenAI} = useAzureOpenAI();

    const validateConfig = useCallback((): boolean => {
        if (!azureConfig.endpoint || !azureConfig.key || !azureConfig.deployment) {
            setStatus({message: 'Please fill in all Azure OpenAI configuration fields', type: 'error'});
            return false;
        }
        return true;
    }, [azureConfig]);

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
            customInstruction?: string
        ): Promise<string> => {
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

            return await callAzureOpenAI(prompt, azureConfig);
        },
        [azureConfig, promptTemplates.dataset, buildColumnInfo, callAzureOpenAI]
    );

    const generateColumnDescription = useCallback(
        async (
            columnName: string,
            info: ColumnInfo,
            datasetDesc: string,
            modifier: '' | 'concise' | 'detailed' = '',
            customInstruction?: string
        ): Promise<string> => {
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

            return await callAzureOpenAI(prompt, azureConfig);
        },
        [azureConfig, promptTemplates.column, callAzureOpenAI]
    );

    const handleAnalyze = useCallback(
        async (method: 'file' | 'url', file?: File, url?: string, appToken?: string) => {
            if (!validateConfig()) return;

            setIsProcessing(true);
            setShowResults(false);
            setGeneratedResults({datasetDescription: '', columnDescriptions: {}});

            try {
                // Parse CSV
                setStatus({
                    message: method === 'file' ? 'Reading CSV file...' : 'Fetching CSV from URL...',
                    type: 'info'
                });

                const result = method === 'file' && file ? await parseFile(file) : await parseUrl(url!, appToken);

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
                const datasetDesc = await generateDatasetDescription(result.data, result.fileName, stats);

                setGeneratedResults((prev) => ({...prev, datasetDescription: datasetDesc}));

                // Generate column descriptions one by one
                const columnDescriptions: Record<string, string> = {};

                for (let i = 0; i < columns.length; i++) {
                    const col = columns[i];
                    const info = stats[col];

                    setStatus({
                        message: `Generating description for column "${col}" (${i + 1}/${columns.length})`,
                        type: 'info'
                    });
                    setGeneratingColumns(new Set([col]));

                    const colDesc = await generateColumnDescription(col, info, datasetDesc);
                    columnDescriptions[col] = colDesc;

                    setGeneratedResults((prev) => ({
                        ...prev,
                        columnDescriptions: {...prev.columnDescriptions, [col]: colDesc},
                    }));
                }

                setGeneratingColumns(new Set());
                setStatus({message: 'Analysis complete! All descriptions generated successfully.', type: 'success'});
            } catch (error) {
                setStatus({
                    message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error'
                });
            } finally {
                setIsProcessing(false);
            }
        },
        [validateConfig, generateDatasetDescription, generateColumnDescription]
    );

    const handleRegenerateDataset = useCallback(
        async (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            if (!validateConfig() || !csvData) return;

            setRegeneratingDataset(true);
            try {
                const newDesc = await generateDatasetDescription(csvData, fileName, columnStats, modifier, customInstruction);
                setGeneratedResults((prev) => ({...prev, datasetDescription: newDesc}));
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
        [validateConfig, csvData, fileName, columnStats, generateDatasetDescription]
    );

    const handleRegenerateColumn = useCallback(
        async (columnName: string, modifier: '' | 'concise' | 'detailed', customInstruction?: string) => {
            if (!validateConfig()) return;

            setRegeneratingColumns((prev) => new Set(prev).add(columnName));
            try {
                const info = columnStats[columnName];
                const newDesc = await generateColumnDescription(
                    columnName,
                    info,
                    generatedResults.datasetDescription,
                    modifier,
                    customInstruction
                );
                setGeneratedResults((prev) => ({
                    ...prev,
                    columnDescriptions: {...prev.columnDescriptions, [columnName]: newDesc},
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
        [validateConfig, columnStats, generatedResults.datasetDescription, generateColumnDescription]
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
                <AzureConfig config={azureConfig} onChange={setAzureConfig}/>
                <PromptEditor templates={promptTemplates} onChange={setPromptTemplates}/>
                <CsvInput onAnalyze={handleAnalyze} isProcessing={isProcessing}/>

                <StatusMessage status={status}/>

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
