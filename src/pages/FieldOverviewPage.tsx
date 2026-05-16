import { useMemo } from 'react';
import { ColumnCard } from '../components/ColumnCard/ColumnCard';
import { DataTypeBadge } from '../components/DataTypeBadge/DataTypeBadge';
import { ResetFieldButton } from '../components/ResetFieldButton/ResetFieldButton';
import { useAppContext } from '../contexts/AppContext';
import { formatColumnStats } from '../utils/columnAnalyzer';
import './FieldOverviewPage.css';

export function FieldOverviewPage() {
    const {
        currentFieldName: fieldName,
        columnStats,
        generatedResults,
        initialResults,
        csvData,
        socrataDatasetId,
        generatingColumns,
        regeneratingColumns,
        suggestingColumns,
        columnSuggestions,
        navigate,
        handleEditColumnDescription,
        handleEditColumnDisplayName,
        handleEditColumnFieldName,
        handleRegenerateColumn,
        handleSuggestColumnImprovement,
        handleDismissColumnSuggestions,
        handleToggleColumnSuggestion,
        handleEditColumnSuggestion,
        handleAddColumnSuggestion,
        handleApplyColumnSuggestions,
        pendingColumnDescriptions,
        handleAcceptPendingColumn,
        handleDiscardPendingColumn,
        handleResetColumnField,
        renderTokenUsage,
        socrataDomain,
    } = useAppContext();

    const columnNames = useMemo(() => Object.keys(columnStats), [columnStats]);
    const currentIndex = fieldName ? columnNames.indexOf(fieldName) : -1;

    if (!fieldName || currentIndex === -1) {
        return (
            <div className="field-overview-notfound">
                <p>Field "{fieldName}" not found.</p>
                <button onClick={() => navigate('data')} className="field-overview-back">Back to Data Overview</button>
            </div>
        );
    }

    const info = columnStats[fieldName];
    const description = generatedResults.columnDescriptions[fieldName] || '';
    const displayName = generatedResults.columnDisplayNames[fieldName] ?? fieldName;
    const apiFieldName = generatedResults.columnFieldNames[fieldName] ?? '';
    const isSocrataSourced = Boolean(socrataDatasetId);
    const initialDescription = initialResults?.columnDescriptions[fieldName] ?? '';
    const initialDisplayName = initialResults?.columnDisplayNames[fieldName] ?? '';
    const initialApiFieldName = initialResults?.columnFieldNames[fieldName] ?? '';
    const descriptionChanged = !!initialResults && description !== initialDescription;
    const displayNameChanged = !!initialResults && displayName !== initialDisplayName;
    const apiFieldNameChanged = !!initialResults && apiFieldName !== initialApiFieldName;
    const prevField = currentIndex > 0 ? columnNames[currentIndex - 1] : null;
    const nextField = currentIndex < columnNames.length - 1 ? columnNames[currentIndex + 1] : null;
    const statsText = formatColumnStats(info);
    const nullPercent = info.totalCount > 0
        ? ((info.nullCount / info.totalCount) * 100).toFixed(1)
        : '0.0';
    const completeness = info.totalCount > 0
        ? (((info.totalCount - info.nullCount) / info.totalCount) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="field-overview-page">
            <div className="field-overview-nav">
                <button onClick={() => navigate('data')} className="field-overview-back">
                    Back to Data Overview
                </button>
                <div className="field-overview-pager">
                    <div className="field-overview-pager-group">
                        {prevField && <span className="field-overview-pager-label" title={prevField}>{prevField}</span>}
                        {prevField ? (
                            <button onClick={() => navigate('field', prevField)} className="field-overview-pager-btn">
                                Prev
                            </button>
                        ) : (
                            <span className="field-overview-pager-btn disabled">Prev</span>
                        )}
                    </div>
                    <span className="field-overview-pager-info">
                        {currentIndex + 1} / {columnNames.length}
                    </span>
                    <div className="field-overview-pager-group">
                        {nextField ? (
                            <button onClick={() => navigate('field', nextField)} className="field-overview-pager-btn">
                                Next
                            </button>
                        ) : (
                            <span className="field-overview-pager-btn disabled">Next</span>
                        )}
                        {nextField && <span className="field-overview-pager-label" title={nextField}>{nextField}</span>}
                    </div>
                </div>
            </div>

            <div className="field-overview-header">
                <h2 className="field-overview-name">{fieldName}</h2>
                <DataTypeBadge type={info.type} originalType={info.originalType} size="large"/>
            </div>

            <div className="field-overview-stats">
                <div className="field-overview-stats-title">Column Statistics</div>
                <div className="field-overview-stats-grid">
                    <div className="field-overview-stat">
                        <span className="field-overview-stat-label">Total Rows</span>
                        <span className="field-overview-stat-value">{info.totalCount.toLocaleString()}</span>
                    </div>
                    <div className="field-overview-stat">
                        <span className="field-overview-stat-label">Null Count</span>
                        <span
                            className="field-overview-stat-value">{info.nullCount.toLocaleString()} ({nullPercent}%)</span>
                    </div>
                    <div className="field-overview-stat">
                        <span className="field-overview-stat-label">Completeness</span>
                        <span className="field-overview-stat-value">{completeness}%</span>
                    </div>
                    <div className="field-overview-stat">
                        <span className="field-overview-stat-label">Data Type</span>
                        <span className="field-overview-stat-value">{info.originalType || info.type}</span>
                    </div>
                </div>
                {statsText && (
                    <div className="field-overview-stats-detail">
                        <div className="field-overview-stats-line">{statsText}</div>
                    </div>
                )}
            </div>

            {csvData && (
                <div className="field-overview-samples">
                    <div className="field-overview-samples-title">Sample Values</div>
                    <div className="field-overview-samples-list">
                        {csvData.slice(0, 8).map((row, i) => (
                            <span key={i} className="field-overview-sample-item">
                                {row[fieldName] || <em className="field-overview-null">null</em>}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="field-overview-identifiers">
                <div className="field-overview-identifiers-title">Field Identifiers</div>
                <div className="field-overview-identifiers-grid">
                    <label className="field-overview-identifier">
                        <span className="field-overview-identifier-label">
                            Display Name
                            <ResetFieldButton
                                show={displayNameChanged}
                                onReset={() => handleResetColumnField(fieldName, 'displayName')}
                                title="Reset display name to the value loaded from the dataset"
                            />
                        </span>
                        <input
                            type="text"
                            className="field-overview-identifier-input"
                            value={displayName}
                            onChange={(e) => handleEditColumnDisplayName(fieldName, e.target.value)}
                            placeholder="Human-readable column name"
                        />
                        {socrataDomain && (
                            <span className="field-overview-identifier-hint">
                                Shown to viewers on {socrataDomain}.
                            </span>
                        )}
                    </label>
                    {isSocrataSourced && (
                        <label className="field-overview-identifier">
                            <span className="field-overview-identifier-label">
                                API Field Name
                                <ResetFieldButton
                                    show={apiFieldNameChanged}
                                    onReset={() => handleResetColumnField(fieldName, 'fieldName')}
                                    title="Reset API field name to the value loaded from the dataset"
                                />
                            </span>
                            <input
                                type="text"
                                className="field-overview-identifier-input field-overview-identifier-mono"
                                value={apiFieldName}
                                onChange={(e) => handleEditColumnFieldName(fieldName, e.target.value)}
                                placeholder="lowercase_with_underscores"
                            />
                            <span className="field-overview-identifier-hint">
                                Used in SODA queries. Lowercase letters, digits, and underscores only.
                            </span>
                        </label>
                    )}
                </div>
            </div>

            <div className="field-overview-description">
                <ColumnCard
                    name={fieldName}
                    info={info}
                    description={description}
                    onEdit={(newDesc) => handleEditColumnDescription(fieldName, newDesc)}
                    onRegenerate={(modifier, customInstruction) =>
                        handleRegenerateColumn(fieldName, modifier, customInstruction)
                    }
                    onSuggestImprovement={() => handleSuggestColumnImprovement(fieldName)}
                    onDismissSuggestions={() => handleDismissColumnSuggestions(fieldName)}
                    suggestions={columnSuggestions[fieldName] || []}
                    isSuggesting={suggestingColumns.has(fieldName)}
                    isRegenerating={regeneratingColumns.has(fieldName)}
                    isGenerating={generatingColumns.has(fieldName)}
                    onToggleSuggestion={(id) => handleToggleColumnSuggestion(fieldName, id)}
                    onEditSuggestion={(id, text) => handleEditColumnSuggestion(fieldName, id, text)}
                    onAddSuggestion={(text) => handleAddColumnSuggestion(fieldName, text)}
                    onApplySuggestions={() => handleApplyColumnSuggestions(fieldName)}
                    pendingDescription={
                        Object.prototype.hasOwnProperty.call(pendingColumnDescriptions, fieldName)
                            ? pendingColumnDescriptions[fieldName]
                            : null
                    }
                    onAcceptPending={() => handleAcceptPendingColumn(fieldName)}
                    onDiscardPending={() => handleDiscardPendingColumn(fieldName)}
                    onReset={() => handleResetColumnField(fieldName, 'description')}
                    canReset={descriptionChanged}
                />
            </div>

            {renderTokenUsage()}
        </div>
    );
}
