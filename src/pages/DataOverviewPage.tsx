import { useEffect, useMemo, useState } from 'react';
import { DatasetDescription } from '../components/DatasetDescription/DatasetDescription';
import { DataTypeBadge } from '../components/DataTypeBadge/DataTypeBadge';
import { ResetFieldButton } from '../components/ResetFieldButton/ResetFieldButton';
import { InfoTooltip } from '../components/InfoTooltip/InfoTooltip';
import { DiffView } from '../components/shared/DiffView';
import { ColumnFieldHistory, DatasetFieldHistory } from '../components/FieldHistoryButton/ConnectedFieldHistory';
import { useAppContext } from '../contexts/AppContext';
import { analyzeTemporalCoverage, getPeriodOfTimeWarning } from '../utils/temporalCoverage';
import './DataOverviewPage.css';

export function DataOverviewPage() {
    const {
        csvData,
        importedRowCount,
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
        handleDeleteDatasetSuggestion,
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
        tagsBaseline,
        handleAcceptPendingTags,
        handleDiscardPendingTags,
        handleFinishTagReview,
        handleRevertTagReview,
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

    // Detected date/year coverage for the dataset — drives the Period of Time
    // warning. Recomputed only when the underlying data/stats change.
    const temporalCoverage = useMemo(
        () => analyzeTemporalCoverage(csvData ?? [], columnStats),
        [csvData, columnStats]
    );

    // Warn when a Period of Time isn't backed by the data — but only once the
    // field has actually been generated/edited (pending review or changed from
    // its loaded value), so untouched portal values don't raise false alarms.
    const periodOfTimeWarning = useMemo(() => {
        if (generatingPeriodOfTime) return null;
        const touched = pendingPeriodOfTime !== null || isDatasetFieldChanged('periodOfTime');
        if (!touched) return null;
        // AI returned an empty result that's now under review.
        if (pendingPeriodOfTime !== null && !pendingPeriodOfTime.trim()) {
            return temporalCoverage.hasSignal
                ? `The AI returned no Period of Time, though date fields were detected (data spans ${temporalCoverage.dataMinYear}–${temporalCoverage.dataMaxYear}). Try regenerating, or set it manually.`
                : 'No date or year fields were detected in this data, so the AI could not determine a Period of Time. Set it manually if you know the coverage.';
        }
        const effective = pendingPeriodOfTime !== null ? pendingPeriodOfTime : (generatedResults.periodOfTime ?? '');
        return getPeriodOfTimeWarning(temporalCoverage, effective);
    }, [temporalCoverage, pendingPeriodOfTime, generatedResults.periodOfTime, generatingPeriodOfTime, isDatasetFieldChanged]);

    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditingRowLabel, setIsEditingRowLabel] = useState(false);
    const [rowLabelEditValue, setRowLabelEditValue] = useState(generatedResults.rowLabel || '');

    useEffect(() => {
        if (!isEditingRowLabel) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRowLabelEditValue(generatedResults.rowLabel || '');
        }
    }, [generatedResults.rowLabel, isEditingRowLabel]);
    const handleRowLabelSave = () => {
        handleEditRowLabel?.(rowLabelEditValue);
        setIsEditingRowLabel(false);
    };

    const handleRowLabelCancel = () => {
        setRowLabelEditValue(generatedResults.rowLabel || '');
        setIsEditingRowLabel(false);
    };

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
                    onDeleteSuggestion={handleDeleteDatasetSuggestion}
                    onApplySuggestions={handleApplyDatasetSuggestions}
                    pendingDescription={pendingDatasetDescription}
                    onAcceptPending={handleAcceptPendingDataset}
                    onDiscardPending={handleDiscardPendingDataset}
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
                    tagsBaseline={tagsBaseline}
                    onAcceptPendingTags={handleAcceptPendingTags}
                    onDiscardPendingTags={handleDiscardPendingTags}
                    onFinishTagReview={handleFinishTagReview}
                    onRevertTagReview={handleRevertTagReview}
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
                    periodOfTimeWarning={periodOfTimeWarning}
                    postingFrequency={generatedResults.postingFrequency}
                    onEditPostingFrequency={handleEditPostingFrequency}
                    onResetField={handleResetField}
                    isFieldChanged={isDatasetFieldChanged}
                    socrataDomain={socrataDomain}
                />
            )}

            {csvData && (
                <div className="section">
                    <div className="section-header">
                        <div className="section-title">What's in this Dataset</div>
                    </div>
                    <div className="dataset-stats">
                        <div className="stat-item">
                            <span className="stat-label">Rows</span>
                            <div style={{ display: 'flex', alignItems: 'center', minHeight: '32px' }}>
                                <span
                                    className="stat-value"
                                    title={(importedRowCount > 0 ? importedRowCount : csvData.length).toLocaleString()}
                                >
                                    {new Intl.NumberFormat('en-US', {
                                        notation: 'compact',
                                        maximumFractionDigits: 1,
                                    }).format(importedRowCount > 0 ? importedRowCount : csvData.length)}
                                </span>
                            </div>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Columns</span>
                            <div style={{ display: 'flex', alignItems: 'center', minHeight: '32px' }}>
                                <span className="stat-value">{columnNames.length}</span>
                            </div>
                        </div>
                        <div className="stat-item" style={{ flex: 1 }}>
                            <span className="stat-label">
                                Row Label
                                <InfoTooltip
                                    text="A short description of what distinguishes one row from another. Ideally each row is one unique observation, e.g., the number of adult fish counted at a specific site on a certain date."
                                    width="350px"/>
                                <DatasetFieldHistory field="rowLabel" title="Row Label"/>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', minHeight: '32px', width: '100%' }}>
                                {pendingRowLabel !== null ? (
                                    <div style={{ width: '100%' }}>
                                        <DiffView
                                            currentValue={generatedResults.rowLabel}
                                            newValue={pendingRowLabel}
                                            isGenerating={generatingRowLabel}
                                            onAccept={handleAcceptPendingRowLabel}
                                            onDiscard={handleDiscardPendingRowLabel}
                                            className="dataset-field-pending"
                                            acceptTooltip="Replace the current row label with the new one"
                                            discardTooltip="Discard the new row label and keep the current one"
                                        />
                                    </div>
                                ) : isEditingRowLabel ? (
                                    <div className="dataset-row-label-edit" style={{ width: '100%' }}>
                                        <input
                                            type="text"
                                            value={rowLabelEditValue}
                                            onChange={(e) => setRowLabelEditValue(e.target.value)}
                                            className="dataset-row-label-input"
                                            placeholder="e.g. license record, traffic incident..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRowLabelSave();
                                                if (e.key === 'Escape') handleRowLabelCancel();
                                            }}
                                            style={{ width: '100%', maxWidth: '600px' }}
                                        />
                                        <button className="btn btn-primary btn-md"
                                                onClick={handleRowLabelSave}>Save
                                        </button>
                                        <button className="btn btn-ghost btn-md"
                                                onClick={handleRowLabelCancel}>Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div className="dataset-row-label-display" style={{ minHeight: 'unset' }}>
                                        <span className="stat-value">
                                            {generatingRowLabel ? (
                                                <span className="dataset-row-label-generating">
                                                    {generatedResults.rowLabel || 'Generating...'}
                                                    <span className="ed-cursor">|</span>
                                                </span>
                                            ) : (
                                                generatedResults.rowLabel || <span style={{
                                                    color: 'var(--text-tertiary)',
                                                    fontWeight: 'normal'
                                                }}>—</span>
                                            )}
                                        </span>
                                        {!generatingRowLabel && (
                                            <span className="dataset-row-label-actions">
                                                <button
                                                    className="btn btn-ghost btn-md"
                                                    onClick={() => {
                                                        setRowLabelEditValue(generatedResults.rowLabel);
                                                        setIsEditingRowLabel(true);
                                                    }}
                                                    title="Edit row label"
                                                >
                                                    &#9998;
                                                </button>
                                                <button
                                                    className="btn btn-primary btn-md"
                                                    onClick={handleGenerateRowLabel}
                                                    title="Generate row label with AI"
                                                >
                                                    Generate
                                                </button>
                                                <ResetFieldButton
                                                    show={isDatasetFieldChanged('rowLabel')}
                                                    onReset={() => handleResetField('rowLabel')}
                                                    title="Reset row label to the value loaded from the dataset"
                                                />
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="section">
                <div className="section-header">
                    <div className="section-title">
                        Fields ({columnNames.length}
                        {searchQuery.trim() && ` · ${filteredColumnNames.length} shown`})
                    </div>
                </div>

                <div className="field-table-controls">
                    <div className="field-table-select-group">
                        <span className="field-table-select-label">Select:</span>
                        <button className="btn btn-secondary btn-md" onClick={selectAll}>All</button>
                        <button className="btn btn-secondary btn-md" onClick={selectNone}>None</button>
                        <button className="btn btn-secondary btn-md" onClick={selectEmpty}>
                            Empty ({emptyColumns.length})
                        </button>
                        <button className="btn btn-secondary btn-md" onClick={selectNonEmpty}>
                            Non-empty ({nonEmptyColumns.length})
                        </button>
                        {selectedColumns.size > 0 && (
                            <button
                                className="btn btn-primary btn-md"
                                onClick={handleGenerateSelected}
                                disabled={isGeneratingEmpty || isProcessing}
                            >
                                {isGeneratingEmpty
                                    ? 'Generating...'
                                    : `Generate for ${selectedColumns.size} selected`}
                            </button>
                        )}
                    </div>
                    <input
                        type="search"
                        className="field-table-search"
                        placeholder="Search fields by name, title, or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                            <th>Source</th>
                            <th>API Field Name</th>
                            <th>Data Type</th>
                            <th>Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filteredColumnNames.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="field-table-empty">
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
                                    <td className="field-source-cell">
                                        {hasDesc ? (
                                            <ColumnFieldHistory
                                                columnName={name}
                                                kind="description"
                                                title="Description"
                                                alwaysShow
                                            />
                                        ) : (
                                            <span className="field-no-desc">—</span>
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
