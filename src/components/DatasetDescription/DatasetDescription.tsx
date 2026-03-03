import { useState } from 'react';
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
    suggestions: string;
    isSuggesting: boolean;
    isRegenerating: boolean;
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
                                   }: DatasetDescriptionProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(description);
    const [customInstruction, setCustomInstruction] = useState('');

    const handleSave = () => {
        onEdit(editValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditValue(description);
        setIsEditing(false);
    };

    const handleCustomApply = () => {
        if (customInstruction.trim()) {
            onRegenerate('', customInstruction);
            setCustomInstruction('');
        }
    };

    const isBusy = isRegenerating || isSuggesting;

    return (
        <div className="dataset-desc-section">
            <div className="dataset-desc-section-title">Dataset Description</div>
            <div className="dataset-desc-box">
                <h3>Overview</h3>

                {isEditing ? (
                    <div className="dataset-desc-edit-mode">
            <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="dataset-desc-edit-textarea"
            />
                        <div className="dataset-desc-edit-actions">
                            <button className="dataset-desc-btn-primary" onClick={handleSave}>
                                Save
                            </button>
                            <button className="dataset-desc-btn-secondary" onClick={handleCancel}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="dataset-desc-editable">
                        <p>{description}</p>
                        <span
                            className="dataset-desc-edit-icon"
                            onClick={() => {
                                setEditValue(description);
                                setIsEditing(true);
                            }}
                            title="Edit description"
                        >
              ✏️
            </span>
                    </div>
                )}

                {(suggestions || isSuggesting) && (
                    <div className="dataset-desc-suggestions">
                        <div className="dataset-desc-suggestions-header">
                            <span className="dataset-desc-suggestions-title">Improvement Suggestions</span>
                            {!isSuggesting && (
                                <button
                                    className="dataset-desc-suggestions-dismiss"
                                    onClick={onDismissSuggestions}
                                    title="Dismiss suggestions"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                        <div className="dataset-desc-suggestions-content">
                            {suggestions || ''}
                            {isSuggesting && <span className="dataset-desc-suggestions-cursor">|</span>}
                        </div>
                    </div>
                )}

                <p className="dataset-desc-meta">
                    <strong>File:</strong> {fileName} | <strong>Rows:</strong> {rowCount} |{' '}
                    <strong>Columns:</strong> {columnCount}
                </p>

                {!isEditing && (
                    <div className="dataset-desc-regenerate-controls">
                        {isRegenerating ? (
                            <span className="dataset-desc-regenerating">
                <span className="dataset-desc-spinner"></span> Regenerating...
              </span>
                        ) : (
                            <>
                                <span className="dataset-desc-label">Regenerate:</span>
                                <button className="dataset-desc-btn-regenerate" onClick={() => onRegenerate('')}
                                        disabled={isBusy}
                                        title="Regenerate">
                                    Again
                                </button>
                                <button
                                    className="dataset-desc-btn-regenerate concise"
                                    onClick={() => onRegenerate('concise')}
                                    disabled={isBusy}
                                    title="Make more concise"
                                >
                                    More Concise
                                </button>
                                <button
                                    className="dataset-desc-btn-regenerate detailed"
                                    onClick={() => onRegenerate('detailed')}
                                    disabled={isBusy}
                                    title="Make more detailed"
                                >
                                    More Detailed
                                </button>
                                <button
                                    className="dataset-desc-btn-regenerate suggest"
                                    onClick={onSuggestImprovement}
                                    disabled={isBusy}
                                    title="Get AI suggestions to improve the current description"
                                >
                                    {isSuggesting ? (
                                        <>
                                            <span className="dataset-desc-spinner"></span> Analyzing...
                                        </>
                                    ) : (
                                        'Suggest Improvement'
                                    )}
                                </button>
                                <div className="dataset-desc-custom-instruction-wrapper">
                                    <input
                                        type="text"
                                        value={customInstruction}
                                        onChange={(e) => setCustomInstruction(e.target.value)}
                                        className="dataset-desc-custom-instruction-input"
                                        placeholder="Custom instruction..."
                                    />
                                    <button className="dataset-desc-btn-regenerate" onClick={handleCustomApply}
                                            disabled={isBusy}
                                            title="Apply custom instruction">
                                        Apply
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <p className="dataset-desc-tip">Tip: Use ✏️ to edit or regenerate buttons to modify the description</p>
            </div>
        </div>
    );
}
