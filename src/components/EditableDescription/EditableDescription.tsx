import { useState } from 'react';
import type { SuggestionItem } from '../../utils/prompts';
import './EditableDescription.css';

interface EditableDescriptionProps {
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    onSuggestImprovement: () => void;
    onDismissSuggestions: () => void;
    suggestions: SuggestionItem[];
    isSuggesting: boolean;
    isRegenerating: boolean;
    isStreaming?: boolean;
    compact?: boolean;
    suggestLabel?: string;
    suggestionsTitle?: string;
    onToggleSuggestion?: (id: string) => void;
    onEditSuggestion?: (id: string, text: string) => void;
    onAddSuggestion?: (text: string) => void;
    onApplySuggestions?: () => void;
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
                                        onToggleSuggestion,
                                        onEditSuggestion,
                                        onAddSuggestion,
                                        onApplySuggestions,
                                    }: EditableDescriptionProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(description);
    const [customInstruction, setCustomInstruction] = useState('');
    const [newSuggestionText, setNewSuggestionText] = useState('');
    const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
    const [editingSuggestionText, setEditingSuggestionText] = useState('');

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

    const handleAddSuggestion = () => {
        if (newSuggestionText.trim() && onAddSuggestion) {
            onAddSuggestion(newSuggestionText.trim());
            setNewSuggestionText('');
        }
    };

    const handleStartEdit = (suggestion: SuggestionItem) => {
        setEditingSuggestionId(suggestion.id);
        setEditingSuggestionText(suggestion.text);
    };

    const handleSaveEdit = (id: string) => {
        if (onEditSuggestion && editingSuggestionText.trim()) {
            onEditSuggestion(id, editingSuggestionText.trim());
        }
        setEditingSuggestionId(null);
        setEditingSuggestionText('');
    };

    const handleCancelEdit = () => {
        setEditingSuggestionId(null);
        setEditingSuggestionText('');
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

                    {(suggestions.length > 0 || isSuggesting) && (
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
                                {suggestions.length === 0 && isSuggesting && (
                                    <span className="ed-suggestions-cursor">Analyzing...</span>
                                )}
                                {suggestions.map((suggestion) => (
                                    <div key={suggestion.id} className="ed-suggestion-item">
                                        <input
                                            type="checkbox"
                                            checked={suggestion.selected}
                                            onChange={() => onToggleSuggestion?.(suggestion.id)}
                                            className="ed-suggestion-checkbox"
                                            title="Toggle this suggestion"
                                        />
                                        {editingSuggestionId === suggestion.id ? (
                                            <div className="ed-suggestion-edit-mode">
                                                <input
                                                    type="text"
                                                    value={editingSuggestionText}
                                                    onChange={(e) => setEditingSuggestionText(e.target.value)}
                                                    className="ed-suggestion-text-input"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit(suggestion.id);
                                                        if (e.key === 'Escape') handleCancelEdit();
                                                    }}
                                                />
                                                <button
                                                    className="ed-suggestion-edit-save"
                                                    onClick={() => handleSaveEdit(suggestion.id)}
                                                    title="Save"
                                                >
                                                    &#10003;
                                                </button>
                                                <button
                                                    className="ed-suggestion-edit-cancel"
                                                    onClick={handleCancelEdit}
                                                    title="Cancel"
                                                >
                                                    &#10005;
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="ed-suggestion-text-wrapper">
                                                <span
                                                    className={`ed-suggestion-text ${suggestion.edited ? 'edited' : ''}`}
                                                    title="Click edit to modify"
                                                >
                                                    {suggestion.text}
                                                </span>
                                                <button
                                                    className="ed-suggestion-edit-btn"
                                                    onClick={() => handleStartEdit(suggestion)}
                                                    title="Edit suggestion"
                                                >
                                                    &#9998;
                                                </button>
                                                <button
                                                    className="ed-suggestion-delete"
                                                    onClick={() => onDismissSuggestions?.()}
                                                    title="Remove suggestion"
                                                >
                                                    &#10005;
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {!isSuggesting && (
                                    <div className="ed-suggestion-add-row">
                                        <input
                                            type="text"
                                            value={newSuggestionText}
                                            onChange={(e) => setNewSuggestionText(e.target.value)}
                                            className="ed-suggestion-add-input"
                                            placeholder="Add a custom suggestion..."
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleAddSuggestion();
                                            }}
                                        />
                                        <button
                                            className="ed-btn-regenerate"
                                            onClick={handleAddSuggestion}
                                            disabled={!newSuggestionText.trim()}
                                            title="Add suggestion"
                                        >
                                            Add
                                        </button>
                                    </div>
                                )}

                                {!isSuggesting && suggestions.length > 0 && (
                                    <div className="ed-apply-suggestions-row">
                                        <button
                                            className="ed-btn-primary ed-btn-apply"
                                            onClick={onApplySuggestions}
                                            disabled={isBusy || suggestions.filter(s => s.selected).length === 0}
                                            title="Regenerate description using selected suggestions"
                                        >
                                            Apply Suggestions
                                        </button>
                                    </div>
                                )}
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
