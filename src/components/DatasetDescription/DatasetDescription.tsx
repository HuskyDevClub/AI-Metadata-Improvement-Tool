import { useState } from 'react';
import './DatasetDescription.css';

interface DatasetDescriptionProps {
    description: string;
    fileName: string;
    rowCount: number;
    columnCount: number;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    isRegenerating: boolean;
}

export function DatasetDescription({
                                       description,
                                       fileName,
                                       rowCount,
                                       columnCount,
                                       onEdit,
                                       onRegenerate,
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
                                        title="Regenerate">
                                    Again
                                </button>
                                <button
                                    className="dataset-desc-btn-regenerate concise"
                                    onClick={() => onRegenerate('concise')}
                                    title="Make more concise"
                                >
                                    More Concise
                                </button>
                                <button
                                    className="dataset-desc-btn-regenerate detailed"
                                    onClick={() => onRegenerate('detailed')}
                                    title="Make more detailed"
                                >
                                    More Detailed
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
