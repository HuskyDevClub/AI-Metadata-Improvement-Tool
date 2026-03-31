import { useState } from 'react';
import './EditableDescription.css';

interface EditableDescriptionProps {
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    onSuggestImprovement: () => void;
    onDismissSuggestions: () => void;
    suggestions: string;
    isSuggesting: boolean;
    isRegenerating: boolean;
    isStreaming?: boolean;
    compact?: boolean;
    suggestLabel?: string;
    suggestionsTitle?: string;
}

export function EditableDescription({
                                        description,
                                        onEdit,
                                        onRegenerate,
                                        onSuggestImprovement,
                                        onDismissSuggestions,
                                        suggestions,
                                        isSuggesting,
                                        isRegenerating,
                                        isStreaming = false,
                                        compact = false,
                                        suggestLabel = 'Suggest',
                                        suggestionsTitle = 'Suggestions',
                                    }: EditableDescriptionProps) {
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
    const cls = compact ? 'ed ed-compact' : 'ed';

    return (
        <div className={cls}>
            {isEditing ? (
                <div className="ed-edit-mode">
                    <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="ed-edit-textarea"
                    />
                    <div className="ed-edit-actions">
                        <button className="ed-btn-primary" onClick={handleSave}>
                            Save
                        </button>
                        <button className="ed-btn-secondary" onClick={handleCancel}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className={`ed-description ${isStreaming ? 'ed-streaming' : ''}`}>
                        <p>
                            {description || (isStreaming ? '' : 'No description')}
                            {isStreaming && <span className="ed-cursor">|</span>}
                        </p>
                        {!isStreaming && (
                            <span
                                className="ed-edit-icon"
                                onClick={() => {
                                    setEditValue(description);
                                    setIsEditing(true);
                                }}
                                title="Edit description"
                            >
                                &#9998;
                            </span>
                        )}
                    </div>

                    {(suggestions || isSuggesting) && (
                        <div className="ed-suggestions">
                            <div className="ed-suggestions-header">
                                <span className="ed-suggestions-title">{suggestionsTitle}</span>
                                {!isSuggesting && (
                                    <button
                                        className="ed-suggestions-dismiss"
                                        onClick={onDismissSuggestions}
                                        title="Dismiss suggestions"
                                    >
                                        &#10005;
                                    </button>
                                )}
                            </div>
                            <div className="ed-suggestions-content">
                                {suggestions || ''}
                                {isSuggesting && <span className="ed-suggestions-cursor">|</span>}
                            </div>
                        </div>
                    )}

                    {!isStreaming && (
                        <div className="ed-regenerate-controls">
                            {isRegenerating ? (
                                <span className="ed-regenerating">
                                    <span className="ed-spinner"></span> Regenerating...
                                </span>
                            ) : (
                                <>
                                    <span className="ed-label">Regenerate:</span>
                                    <button className="ed-btn-regenerate" onClick={() => onRegenerate('')}
                                            disabled={isBusy}
                                            title="Regenerate">Again
                                    </button>
                                    <button
                                        className="ed-btn-regenerate concise"
                                        onClick={() => onRegenerate('concise')}
                                        disabled={isBusy}
                                        title="Make more concise"
                                    >Concise
                                    </button>
                                    <button
                                        className="ed-btn-regenerate detailed"
                                        onClick={() => onRegenerate('detailed')}
                                        disabled={isBusy}
                                        title="Make more detailed"
                                    >Detailed
                                    </button>
                                    <button
                                        className="ed-btn-regenerate suggest"
                                        onClick={onSuggestImprovement}
                                        disabled={isBusy}
                                        title="Get AI suggestions to improve the current description"
                                    >{isSuggesting ? (
                                        <>
                                            <span className="ed-spinner"></span> Analyzing...
                                        </>
                                    ) : suggestLabel}
                                    </button>
                                    <div className="ed-custom-instruction-wrapper">
                                        <input
                                            type="text"
                                            value={customInstruction}
                                            onChange={(e) => setCustomInstruction(e.target.value)}
                                            className="ed-custom-instruction-input"
                                            placeholder="Custom..."
                                        />
                                        <button className="ed-btn-regenerate" onClick={handleCustomApply}
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
