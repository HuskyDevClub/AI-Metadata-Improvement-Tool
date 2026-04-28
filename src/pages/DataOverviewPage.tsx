import { useMemo, useState } from 'react';
import { DatasetDescription } from '../components/DatasetDescription/DatasetDescription';
import { DataTypeBadge } from '../components/DataTypeBadge/DataTypeBadge';
import { useAppContext } from '../contexts/AppContext';
import './DataOverviewPage.css';

export function DataOverviewPage() {
    const {
        csvData,
        fileName,
        columnStats,
        generatedResults,
        importedRowCount,
        isProcessing,
        generatingColumns,
        regeneratingDataset,
        suggestingDataset,
        datasetSuggestions,
        isGeneratingEmpty,
        navigate,
        handleEditDatasetDescription,
        handleRegenerateDataset,
        handleSuggestDatasetImprovement,
        handleDismissDatasetSuggestions,
        handleToggleDatasetSuggestion,
        handleEditDatasetSuggestion,
        handleAddDatasetSuggestion,
        handleApplyDatasetSuggestions,
        handleGenerateSelectedDescriptions,
        handleEditRowLabel,
        handleGenerateRowLabel,
        generatingRowLabel,
        handleEditCategory,
        handleGenerateCategory,
        generatingCategory,
        allowedCategories,
        handleAddTag,
        handleRemoveTag,
        handleGenerateTags,
        generatingTags,
        allowedLicenses,
        handleEditLicenseId,
        handleEditAttribution,
        handleEditContactEmail,
        handleEditPeriodOfTime,
        handleGeneratePeriodOfTime,
        generatingPeriodOfTime,
        handleEditPostingFrequency,
        renderTokenUsage,
    } = useAppContext();

    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());

    const columnNames = useMemo(() => Object.keys(columnStats), [columnStats]);
    const emptyColumns = useMemo(
        () => columnNames.filter(col => !generatedResults.columnDescriptions[col]?.trim()),
        [columnNames, generatedResults.columnDescriptions]
    );
    const nonEmptyColumns = useMemo(
        () => columnNames.filter(col => generatedResults.columnDescriptions[col]?.trim()),
        [columnNames, generatedResults.columnDescriptions]
    );

    const rowCount = importedRowCount || csvData?.length || 0;

    const toggleColumn = (col: string) => {
        setSelectedColumns(prev => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col);
            else next.add(col);
            return next;
        });
    };

    const selectAll = () => setSelectedColumns(new Set(columnNames));
    const selectNone = () => setSelectedColumns(new Set());
    const selectEmpty = () => setSelectedColumns(new Set(emptyColumns));
    const selectNonEmpty = () => setSelectedColumns(new Set(nonEmptyColumns));

    const handleGenerateSelected = () => {
        handleGenerateSelectedDescriptions(Array.from(selectedColumns));
    };

    const truncate = (text: string, max: number) =>
        text.length > max ? text.slice(0, max) + '...' : text;

    return (
        <div className="data-overview-page">
            {csvData && (
                <DatasetDescription
                    description={generatedResults.datasetDescription}
                    fileName={fileName}
                    rowCount={rowCount}
                    columnCount={columnNames.length}
                    onEdit={handleEditDatasetDescription}
                    onRegenerate={handleRegenerateDataset}
                    onSuggestImprovement={handleSuggestDatasetImprovement}
                    onDismissSuggestions={handleDismissDatasetSuggestions}
                    suggestions={datasetSuggestions}
                    isSuggesting={suggestingDataset}
                    isRegenerating={regeneratingDataset}
                    onToggleSuggestion={handleToggleDatasetSuggestion}
                    onEditSuggestion={handleEditDatasetSuggestion}
                    onAddSuggestion={handleAddDatasetSuggestion}
                    onApplySuggestions={handleApplyDatasetSuggestions}
                    rowLabel={generatedResults.rowLabel}
                    onEditRowLabel={handleEditRowLabel}
                    onGenerateRowLabel={handleGenerateRowLabel}
                    isGeneratingRowLabel={generatingRowLabel}
                    category={generatedResults.category}
                    allowedCategories={allowedCategories}
                    onEditCategory={handleEditCategory}
                    onGenerateCategory={handleGenerateCategory}
                    isGeneratingCategory={generatingCategory}
                    tags={generatedResults.tags}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    onGenerateTags={handleGenerateTags}
                    isGeneratingTags={generatingTags}
                    licenseId={generatedResults.licenseId}
                    allowedLicenses={allowedLicenses}
                    onEditLicenseId={handleEditLicenseId}
                    attribution={generatedResults.attribution}
                    onEditAttribution={handleEditAttribution}
                    contactEmail={generatedResults.contactEmail}
                    onEditContactEmail={handleEditContactEmail}
                    periodOfTime={generatedResults.periodOfTime}
                    onEditPeriodOfTime={handleEditPeriodOfTime}
                    onGeneratePeriodOfTime={handleGeneratePeriodOfTime}
                    isGeneratingPeriodOfTime={generatingPeriodOfTime}
                    postingFrequency={generatedResults.postingFrequency}
                    onEditPostingFrequency={handleEditPostingFrequency}
                />
            )}

            <div className="section">
                <div className="sectionTitle">
                    Fields ({columnNames.length})
                </div>

                <div className="field-table-controls">
                    <div className="field-table-select-group">
                        <span className="field-table-select-label">Select:</span>
                        <button className="field-table-select-btn" onClick={selectAll}>All</button>
                        <button className="field-table-select-btn" onClick={selectNone}>None</button>
                        <button className="field-table-select-btn" onClick={selectEmpty}>
                            Empty ({emptyColumns.length})
                        </button>
                        <button className="field-table-select-btn" onClick={selectNonEmpty}>
                            Non-empty ({nonEmptyColumns.length})
                        </button>
                    </div>
                    {selectedColumns.size > 0 && (
                        <button
                            className="field-table-generate-btn"
                            onClick={handleGenerateSelected}
                            disabled={isGeneratingEmpty || isProcessing}
                        >
                            {isGeneratingEmpty
                                ? 'Generating...'
                                : `Generate for ${selectedColumns.size} selected`}
                        </button>
                    )}
                </div>

                <div className="field-table-wrapper">
                    <table className="field-table">
                        <thead>
                        <tr>
                            <th className="field-table-th-check">
                                <input
                                    type="checkbox"
                                    checked={selectedColumns.size === columnNames.length && columnNames.length > 0}
                                    onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                                />
                            </th>
                            <th>Field Name</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {columnNames.map(name => {
                            const info = columnStats[name];
                            const desc = generatedResults.columnDescriptions[name] || '';
                            const isGenerating = generatingColumns.has(name);
                            const hasDesc = desc.trim().length > 0;

                            return (
                                <tr key={name} className={selectedColumns.has(name) ? 'field-row-selected' : ''}>
                                    <td className="field-table-td-check">
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.has(name)}
                                            onChange={() => toggleColumn(name)}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            className="field-name-link"
                                            onClick={() => navigate('field', name)}
                                        >
                                            {name}
                                        </button>
                                    </td>
                                    <td>
                                        <DataTypeBadge type={info.type} originalType={info.originalType}/>
                                    </td>
                                    <td className="field-desc-cell">
                                        {isGenerating ? (
                                            <span className="field-generating">
                                                    {desc ? truncate(desc, 100) : 'Generating...'}
                                                <span className="field-cursor">|</span>
                                                </span>
                                        ) : (
                                            desc ? truncate(desc, 120) :
                                                <span className="field-no-desc">No description</span>
                                        )}
                                    </td>
                                    <td>
                                        {isGenerating ? (
                                            <span
                                                className="field-status-badge field-status-generating">Generating</span>
                                        ) : hasDesc ? (
                                            <span className="field-status-badge field-status-done">Done</span>
                                        ) : (
                                            <span className="field-status-badge field-status-empty">Empty</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </div>

            {renderTokenUsage()}
        </div>
    );
}
