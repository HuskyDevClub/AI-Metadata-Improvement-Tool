import { useState } from 'react';
import type { ColumnInfo } from '../../types';
import { formatColumnStats, sanitizeId } from '../../utils/columnAnalyzer';
import './ColumnCard.css';

interface ColumnCardProps {
    name: string;
    info: ColumnInfo;
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    isRegenerating: boolean;
    isGenerating: boolean;
}

export function ColumnCard({
                               name,
                               info,
                               description,
                               onEdit,
                               onRegenerate,
                               isRegenerating,
                               isGenerating,
                           }: ColumnCardProps) {
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

    const getTypeClass = () => {
        switch (info.type) {
            case 'numeric':
                return 'column-card-type-numeric';
            case 'categorical':
                return 'column-card-type-categorical';
            default:
                return 'column-card-type-text';
        }
    };

    return (
        <div className="column-card" id={`column-${sanitizeId(name)}`}>
            <h4>
                {name}
                <span className={`column-card-type ${getTypeClass()}`}>{info.type}</span>
            </h4>
            <div className="column-card-stats">{formatColumnStats(info)}</div>

            {isGenerating ? (
                <div className="column-card-generating">Generating description...</div>
            ) : isEditing ? (
                <div className="column-card-edit-mode">
          <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="column-card-edit-textarea"
          />
                    <div className="column-card-edit-actions">
                        <button className="column-card-btn-primary" onClick={handleSave}>
                            Save
                        </button>
                        <button className="column-card-btn-secondary" onClick={handleCancel}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="column-card-description">
                        <p>{description}</p>
                        <span
                            className="column-card-edit-icon"
                            onClick={() => {
                                setEditValue(description);
                                setIsEditing(true);
                            }}
                            title="Edit description"
                        >
              ✏️
            </span>
                    </div>

                    <div className="column-card-regenerate-controls">
                        {isRegenerating ? (
                            <span className="column-card-regenerating">
                <span className="column-card-spinner"></span> Regenerating...
              </span>
                        ) : (
                            <>
                                <span className="column-card-label">Regenerate:</span>
                                <button className="column-card-btn-regenerate" onClick={() => onRegenerate('')}
                                        title="Regenerate">
                                    Again
                                </button>
                                <button
                                    className="column-card-btn-regenerate concise"
                                    onClick={() => onRegenerate('concise')}
                                    title="Make more concise"
                                >
                                    Concise
                                </button>
                                <button
                                    className="column-card-btn-regenerate detailed"
                                    onClick={() => onRegenerate('detailed')}
                                    title="Make more detailed"
                                >
                                    Detailed
                                </button>
                                <div className="column-card-custom-instruction-wrapper">
                                    <input
                                        type="text"
                                        value={customInstruction}
                                        onChange={(e) => setCustomInstruction(e.target.value)}
                                        className="column-card-custom-instruction-input"
                                        placeholder="Custom..."
                                    />
                                    <button className="column-card-btn-regenerate" onClick={handleCustomApply}
                                            title="Apply">
                                        Apply
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
