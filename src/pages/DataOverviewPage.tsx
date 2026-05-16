import { useMemo, useState } from 'react';
import { DatasetDescription } from '../components/DatasetDescription/DatasetDescription';
import { DataTypeBadge } from '../components/DataTypeBadge/DataTypeBadge';
import { useAppContext } from '../contexts/AppContext';
import './DataOverviewPage.css';

export function DataOverviewPage() {
    const {
        csvData,
        columnStats,
        generatedResults,
        initialResults,
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
        pendingDatasetDescription,
        handleAcceptPendingDataset,
        handleDiscardPendingDataset,
        pendingRowLabel,
        handleAcceptPendingRowLabel,
        handleDiscardPendingRowLabel,
        pendingCategory,
        handleAcceptPendingCategory,
        handleDiscardPendingCategory,
        pendingTags,
        handleAcceptPendingTags,
        handleDiscardPendingTags,
        pendingPeriodOfTime,
        handleAcceptPendingPeriodOfTime,
        handleDiscardPendingPeriodOfTime,
        handleGenerateSelectedDescriptions,
        handleEditRowLabel,
        handleGenerateRowLabel,
        generatingRowLabel,
        handleEditCategory,
        handleGenerateCategory,
        generatingCategory,
        allowedCategories,
        allowedTags,
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
        handleResetField,
        renderTokenUsage,
        socrataDomain,
    } = useAppContext();

    const isDatasetFieldChanged = useMemo(() => {
        return (field:
                    | 'datasetDescription'
                    | 'rowLabel'
                    | 'category'
                    | 'tags'
                    | 'licenseId'
                    | 'attribution'
                    | 'contactEmail'
                    | 'periodOfTime'
                    | 'postingFrequency'): boolean => {
            if (!initialResults) return false;
            if (field === 'tags') {
                const a = generatedResults.tags;
                const b = initialResults.tags;
                if (a.length !== b.length) return true;
                for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
                return false;
            }
            return generatedResults[field] !== initialResults[field];
        };
    }, [generatedResults, initialResults]);

    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const columnNames = useMemo(() => Object.keys(columnStats), [columnStats]);
    const emptyColumns = useMemo(
        () => columnNames.filter(col => !generatedResults.columnDescriptions[col]?.trim()),
        [columnNames, generatedResults.columnDescriptions]
    );
    const nonEmptyColumns = useMemo(
        () => columnNames.filter(col => generatedResults.columnDescriptions[col]?.trim()),
        [columnNames, generatedResults.columnDescriptions]
    );

    const filteredColumnNames = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return columnNames;
        return columnNames.filter(name => {
            if (name.toLowerCase().includes(q)) return true;
            const machine = generatedResults.columnFieldNames[name];
            if (machine && machine.toLowerCase().includes(q)) return true;
            const title = generatedResults.columnDisplayNames[name];
            if (title && title.toLowerCase().includes(q)) return true;
            const desc = generatedResults.columnDescriptions[name];
            if (desc && desc.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [
        columnNames,
        searchQuery,
        generatedResults.columnFieldNames,
        generatedResults.columnDisplayNames,
        generatedResults.columnDescriptions,
    ]);

    const toggleColumn = (col: string) => {
        setSelectedColumns(prev => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col);
            else next.add(col);
            return next;
        });
    };

    const selectAll = () => setSelectedColumns(new Set(filteredColumnNames));
    const selectNone = () => setSelectedColumns(new Set());
    const selectEmpty = () => setSelectedColumns(new Set(emptyColumns));
    const selectNonEmpty = () => setSelectedColumns(new Set(nonEmptyColumns));

    const handleGenerateSelected = () => {
        handleGenerateSelectedDescriptions(Array.from(selectedColumns)).then();
    };

    const truncate = (text: string, max: number) =>
        text.length > max ? text.slice(0, max) + '...' : text;

    return (
        <div className="data-overview-page">
            {csvData && (
                <DatasetDescription
                    description={generatedResults.datasetDescription}
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
                    pendingDescription={pendingDatasetDescription}
                    onAcceptPending={handleAcceptPendingDataset}
                    onDiscardPending={handleDiscardPendingDataset}
                    rowLabel={generatedResults.rowLabel}
                    onEditRowLabel={handleEditRowLabel}
                    onGenerateRowLabel={handleGenerateRowLabel}
                    isGeneratingRowLabel={generatingRowLabel}
                    pendingRowLabel={pendingRowLabel}
                    onAcceptPendingRowLabel={handleAcceptPendingRowLabel}
                    onDiscardPendingRowLabel={handleDiscardPendingRowLabel}
                    category={generatedResults.category}
                    allowedCategories={allowedCategories}
                    onEditCategory={handleEditCategory}
                    onGenerateCategory={handleGenerateCategory}
                    isGeneratingCategory={generatingCategory}
                    pendingCategory={pendingCategory}
                    onAcceptPendingCategory={handleAcceptPendingCategory}
                    onDiscardPendingCategory={handleDiscardPendingCategory}
                    tags={generatedResults.tags}
                    allowedTags={allowedTags}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    onGenerateTags={handleGenerateTags}
                    isGeneratingTags={generatingTags}
                    pendingTags={pendingTags}
                    onAcceptPendingTags={handleAcceptPendingTags}
                    onDiscardPendingTags={handleDiscardPendingTags}
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
                    pendingPeriodOfTime={pendingPeriodOfTime}
                    onAcceptPendingPeriodOfTime={handleAcceptPendingPeriodOfTime}
                    onDiscardPendingPeriodOfTime={handleDiscardPendingPeriodOfTime}
                    postingFrequency={generatedResults.postingFrequency}
                    onEditPostingFrequency={handleEditPostingFrequency}
                    onResetField={handleResetField}
                    isFieldChanged={isDatasetFieldChanged}
                    socrataDomain={socrataDomain}
                />
            )}

            <div className="section">
                <div className="sectionTitle">
                    Fields ({columnNames.length}
                    {searchQuery.trim() && ` · ${filteredColumnNames.length} shown`})
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
                    <input
                        type="search"
                        className="field-table-search"
                        placeholder="Search fields by name, title, or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                                    checked={
                                        filteredColumnNames.length > 0 &&
                                        filteredColumnNames.every(n => selectedColumns.has(n))
                                    }
                                    onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                                />
                            </th>
                            <th>Column Name</th>
                            <th>Description</th>
                            <th>API Field Name</th>
                            <th>Data Type</th>
                            <th>Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filteredColumnNames.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="field-table-empty">
                                    No fields match "{searchQuery}".
                                </td>
                            </tr>
                        ) : filteredColumnNames.map(name => {
                            const info = columnStats[name];
                            const desc = generatedResults.columnDescriptions[name] || '';
                            const machineName = generatedResults.columnFieldNames[name] || name;
                            const title = generatedResults.columnDisplayNames[name] ?? name;
                            const isGenerating = generatingColumns.has(name);
                            const hasDesc = desc.trim().length > 0;
                            const titleDiffers = title.trim().length > 0 && title !== machineName;

                            return (
                                <tr key={name} className={selectedColumns.has(name) ? 'field-row-selected' : ''}>
                                    <td className="field-table-td-check">
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.has(name)}
                                            onChange={() => toggleColumn(name)}
                                        />
                                    </td>
                                    <td className="field-title-cell">
                                        {titleDiffers ? (
                                            <button
                                                className="field-name-link"
                                                onClick={() => navigate('field', name)}
                                            >
                                                {title}
                                            </button>
                                        ) : title ? (
                                            <button
                                                className="field-name-link field-title-same"
                                                onClick={() => navigate('field', name)}
                                                title="Same as API field name — AI has not customized this"
                                            >
                                                {title}
                                            </button>
                                        ) : (
                                            <span className="field-no-desc">—</span>
                                        )}
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
                                        <span className="field-name-mono">{machineName}</span>
                                    </td>
                                    <td>
                                        <DataTypeBadge type={info.type} originalType={info.originalType}/>
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
