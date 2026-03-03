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
    onSuggestImprovement: () => void;
    onDismissSuggestions: () => void;
    suggestions: string;
    isSuggesting: boolean;
    isRegenerating: boolean;
    isGenerating: boolean;
}

export function ColumnCard({
                               name,
                               info,
                               description,
                               onEdit,
                               onRegenerate,
                               onSuggestImprovement,
                               onDismissSuggestions,
                               suggestions,
                               isSuggesting,
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

    const isBusy = isRegenerating || isSuggesting;

    return (
        <div className="column-card" id={`column-${sanitizeId(name)}`}>
            <h4>
                {name}
                <span className={`column-card-type ${getTypeClass()}`}>{info.type}</span>
            </h4>
            <div className="column-card-stats">{formatColumnStats(info)}</div>

            {isEditing ? (
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
                    <div className={`column-card-description ${isGenerating ? 'column-card-streaming' : ''}`}>
                        <p>
                            {description || (isGenerating ? '' : 'No description')}
                            {isGenerating && <span className="column-card-cursor">|</span>}
                        </p>
                        {!isGenerating && (
                            <span
                                className="column-card-edit-icon"
                                onClick={() => {
                                    setEditValue(description);
                                    setIsEditing(true);
                                }}
                                title="Edit description"
                            >
                            </span>
                        )}
                    </div>

                    {(suggestions || isSuggesting) && (
                        <div className="column-card-suggestions">
                            <div className="column-card-suggestions-header">
                                <span className="column-card-suggestions-title">Suggestions</span>
                                {!isSuggesting && (
                                    <button
                                        className="column-card-suggestions-dismiss"
                                        onClick={onDismissSuggestions}
                                        title="Dismiss suggestions"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <div className="column-card-suggestions-content">
                                {suggestions || ''}
                                {isSuggesting && <span className="column-card-suggestions-cursor">|</span>}
                            </div>
                        </div>
                    )}

                    {!isGenerating && (
                        <div className="column-card-regenerate-controls">
                            {isRegenerating ? (
                                <span className="column-card-regenerating"><span className="column-card-spinner"></span> Regenerating...</span>
                            ) : (
                                <>
                                    <span className="column-card-label">Regenerate:</span>
                                    <button className="column-card-btn-regenerate" onClick={() => onRegenerate('')}
                                            disabled={isBusy}
                                            title="Regenerate">Again
                                    </button>
                                    <button
                                        className="column-card-btn-regenerate concise"
                                        onClick={() => onRegenerate('concise')}
                                        disabled={isBusy}
                                        title="Make more concise"
                                    >Concise
                                    </button>
                                    <button
                                        className="column-card-btn-regenerate detailed"
                                        onClick={() => onRegenerate('detailed')}
                                        disabled={isBusy}
                                        title="Make more detailed"
                                    >Detailed
                                    </button>
                                    <button
                                        className="column-card-btn-regenerate suggest"
                                        onClick={onSuggestImprovement}
                                        disabled={isBusy}
                                        title="Get AI suggestions to improve the current description"
                                    >{isSuggesting ? (
                                        <>
                                            <span className="column-card-spinner"></span> Analyzing...
                                        </>
                                    ) : 'Suggest'}
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
                                                disabled={isBusy}
                                                title="Apply">Apply
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
