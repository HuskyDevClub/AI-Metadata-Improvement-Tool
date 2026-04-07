import { useState } from 'react';
import type { SuggestionItem } from '../../utils/prompts';
import { EditableDescription } from '../EditableDescription/EditableDescription';
import './DatasetDescription.css';

interface DatasetDescriptionProps {
    description: string;
    fileName: string;
    rowCount: number;
    columnCount: number;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    onSuggestImprovement: () => void;
    onDismissSuggestions: () => void;
    suggestions: SuggestionItem[];
    isSuggesting: boolean;
    isRegenerating: boolean;
    onToggleSuggestion: (id: string) => void;
    onEditSuggestion: (id: string, text: string) => void;
    onAddSuggestion: (text: string) => void;
    onApplySuggestions: () => void;
    rowLabel?: string;
    onEditRowLabel?: (newLabel: string) => void;
    onGenerateRowLabel?: () => void;
    isGeneratingRowLabel?: boolean;
}

export function DatasetDescription({
                                       description,
                                       fileName,
                                       rowCount,
                                       columnCount,
                                       onEdit,
                                       onRegenerate,
                                       onSuggestImprovement,
                                       onDismissSuggestions,
                                       suggestions,
                                       isSuggesting,
                                       isRegenerating,
                                       onToggleSuggestion,
                                       onEditSuggestion,
                                       onAddSuggestion,
                                       onApplySuggestions,
                                       rowLabel = '',
                                       onEditRowLabel,
                                       onGenerateRowLabel,
                                       isGeneratingRowLabel = false,
                                   }: DatasetDescriptionProps) {
    const [isEditingRowLabel, setIsEditingRowLabel] = useState(false);
    const [rowLabelEditValue, setRowLabelEditValue] = useState(rowLabel);

    const handleRowLabelSave = () => {
        onEditRowLabel?.(rowLabelEditValue);
        setIsEditingRowLabel(false);
    };

    const handleRowLabelCancel = () => {
        setRowLabelEditValue(rowLabel);
        setIsEditingRowLabel(false);
    };

    return (
        <div className="dataset-desc-section">
            <div className="dataset-desc-section-title">Dataset Description</div>
            <div className="dataset-desc-box">
                <h3>Overview</h3>

                <EditableDescription
                    description={description}
                    onEdit={onEdit}
                    onRegenerate={onRegenerate}
                    onSuggestImprovement={onSuggestImprovement}
                    onDismissSuggestions={onDismissSuggestions}
                    suggestions={suggestions}
                    isSuggesting={isSuggesting}
                    isRegenerating={isRegenerating}
                    suggestLabel="Suggest Improvement"
                    suggestionsTitle="Improvement Suggestions"
                    onToggleSuggestion={onToggleSuggestion}
                    onEditSuggestion={onEditSuggestion}
                    onAddSuggestion={onAddSuggestion}
                    onApplySuggestions={onApplySuggestions}
                />

                {onEditRowLabel && (
                    <div className="dataset-row-label">
                        <span className="dataset-row-label-title">Row Label</span>
                        {isEditingRowLabel ? (
                            <div className="dataset-row-label-edit">
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
                                />
                                <button className="dataset-row-label-btn save" onClick={handleRowLabelSave}>Save</button>
                                <button className="dataset-row-label-btn cancel" onClick={handleRowLabelCancel}>Cancel</button>
                            </div>
                        ) : (
                            <div className="dataset-row-label-display">
                                <span className="dataset-row-label-value">
                                    {isGeneratingRowLabel ? (
                                        <span className="dataset-row-label-generating">
                                            {rowLabel || 'Generating...'}
                                            <span className="ed-cursor">|</span>
                                        </span>
                                    ) : (
                                        rowLabel || <em className="dataset-row-label-empty">Not set</em>
                                    )}
                                </span>
                                {!isGeneratingRowLabel && (
                                    <span className="dataset-row-label-actions">
                                        <button
                                            className="dataset-row-label-btn edit"
                                            onClick={() => {
                                                setRowLabelEditValue(rowLabel);
                                                setIsEditingRowLabel(true);
                                            }}
                                            title="Edit row label"
                                        >
                                            &#9998;
                                        </button>
                                        <button
                                            className="dataset-row-label-btn generate"
                                            onClick={onGenerateRowLabel}
                                            title="Generate row label with AI"
                                        >
                                            Generate
                                        </button>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <p className="dataset-desc-meta">
                    <strong>File:</strong> {fileName} | <strong>Rows:</strong> {rowCount} |{' '}
                    <strong>Columns:</strong> {columnCount}
                </p>

                <p className="dataset-desc-tip">Tip: Use &#9998; to edit or regenerate buttons to modify the
                    description</p>
            </div>
        </div>
    );
}
