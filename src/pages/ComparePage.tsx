import { useMemo } from 'react';
import { ComparisonMode } from '../components/ComparisonMode/ComparisonMode';
import { DatasetComparison } from '../components/DatasetComparison/DatasetComparison';
import { ColumnComparison } from '../components/ColumnComparison/ColumnComparison';
import { ExportSection } from '../components/ExportSection/ExportSection';
import { useAppContext } from '../contexts/AppContext';
import './ComparePage.css';

export function ComparePage() {
    const {
        csvData,
        fileName,
        columnStats,
        isImportedData,
        importedRowCount,
        isPushingSocrata,
        socrataDatasetId,
        comparisonEnabled,
        comparisonConfig,
        datasetComparison,
        columnComparisons,
        comparisonSlotCount,
        comparisonSlotNames,
        comparisonSlotShortNames,
        generatingDatasetModels,
        regeneratingDatasetModels,
        reJudgingDataset,
        reJudgingColumns,
        isAnyModelGenerating,
        promptTemplates,
        navigate,
        handleComparisonToggle,
        handleComparisonConfigChange,
        handleRegenerateComparisonDataset,
        handleReJudgeDataset,
        handleReJudgeColumn,
        handleRegenerateComparisonColumn,
        getColumnGeneratingModels,
        getColumnRegeneratingModels,
        handleExport,
        handlePushToSocrata,
        renderTokenUsage,
    } = useAppContext();

    const columnNames = useMemo(() => Object.keys(columnStats), [columnStats]);
    const rowCount = csvData?.length || importedRowCount;

    const hasResults = datasetComparison.outputs.some(o => o) ||
        Object.values(columnComparisons).some(c => c.outputs.some(o => o));

    return (
        <div className="compare-page">
            <div className="compare-page-config">
                <ComparisonMode
                    enabled={comparisonEnabled}
                    onToggle={handleComparisonToggle}
                    config={comparisonConfig}
                    onChange={handleComparisonConfigChange}
                    isGenerating={isAnyModelGenerating}
                    promptTemplates={promptTemplates}
                />
            </div>

            {!comparisonEnabled && (
                <div className="compare-page-disabled">
                    <p>Enable comparison mode above to compare outputs from multiple models or prompt variants side by side.</p>
                    <p className="compare-page-hint">
                        After enabling, go to the <button onClick={() => navigate('import')} className="compare-page-link">Import page</button> and
                        import a CSV to generate comparison results.
                    </p>
                </div>
            )}

            {comparisonEnabled && !hasResults && (
                <div className="compare-page-empty">
                    <p>No comparison results yet.</p>
                    <p className="compare-page-hint">
                        Import a CSV from the <button onClick={() => navigate('import')} className="compare-page-link">Import page</button> with
                        comparison mode enabled to generate side-by-side results.
                    </p>
                </div>
            )}

            {comparisonEnabled && hasResults && (
                <>
                    {isImportedData && (
                        <div className="import-warning-banner">
                            Viewing imported results. Regeneration requires the original CSV data.
                        </div>
                    )}

                    {datasetComparison.outputs.some(o => o) && (
                        <DatasetComparison
                            result={datasetComparison}
                            fileName={fileName}
                            rowCount={rowCount}
                            columnCount={columnNames.length}
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

                    {renderTokenUsage()}

                    <ExportSection
                        onExport={handleExport}
                        onPushToSocrata={handlePushToSocrata}
                        isPushingSocrata={isPushingSocrata}
                        showSocrataPush={!!socrataDatasetId}
                    />
                </>
            )}
        </div>
    );
}
