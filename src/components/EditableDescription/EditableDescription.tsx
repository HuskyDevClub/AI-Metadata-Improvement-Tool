import { useEffect, useState } from 'react';
import type { SuggestionItem } from '@/utils/prompts';
import { renderInlineMarkdown } from '@/utils/inlineMarkdown';
import { ResetFieldButton } from '@/components/ResetFieldButton/ResetFieldButton';
import { DiffView } from '@/components/shared/DiffView';
import '@/components/EditableDescription/EditableDescription.css';

interface EditableDescriptionProps {
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string, sourceText?: string) => void;
    onSuggestImprovement: (sourceText?: string) => void;
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
    onDeleteSuggestion?: (id: string) => void;
    onApplySuggestions?: (sourceText?: string) => void;
    pendingDescription?: string | null;
    onAcceptPending?: () => void;
    onDiscardPending?: () => void;
    onReset?: () => void;
    canReset?: boolean;
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
                                        onDeleteSuggestion,
                                        onApplySuggestions,
                                        pendingDescription = null,
                                        onAcceptPending,
                                        onDiscardPending,
                                        onReset,
                                        canReset = false,
                                    }: EditableDescriptionProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(description);
    const [customInstruction, setCustomInstruction] = useState('');
    const [newSuggestionText, setNewSuggestionText] = useState('');
    const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
    const [editingSuggestionText, setEditingSuggestionText] = useState('');

    useEffect(() => {
        if (!isEditing) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditValue(description);
        }
    }, [description, isEditing]);

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
            onRegenerate('', customInstruction, refineSource);
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

    const hasPending = pendingDescription !== null;
    // When the user iterates from the compare view, refine the candidate they're
    // reviewing instead of the saved description (or a fresh generation).
    const refineSource = hasPending && pendingDescription ? pendingDescription : undefined;
    // On a fresh import the description still matches the value loaded from the
    // dataset (canReset only flips once it diverges), so nothing has been
    // AI-generated yet. Label the controls "Generate" rather than the confusing
    // "Regenerate / Again", matching the sibling category/tags/period controls.
    const isPristine = !hasPending && !canReset;
    // With no text to work from, the modifier/suggest/custom controls have
    // nothing to act on — show only the Generate button. (When reviewing a
    // pending draft the buttons target that draft, so check it instead.)
    const isEmpty = ((refineSource ?? description) || '').trim() === '';

    const suggestionsPanel = (suggestions.length > 0 || isSuggesting) && (
        <div className="ed-suggestions">
            <div className="ed-suggestions-header">
                <span className="ed-suggestions-title">{ suggestionsTitle }</span>
                { !isSuggesting && (
                    <button
                        className="ed-suggestions-dismiss"
                        onClick={ onDismissSuggestions }
                        title="Dismiss suggestions"
                    >
                        &#10005;
                    </button>
                ) }
            </div>
            <div className="ed-suggestions-content">
                { suggestions.length === 0 && isSuggesting && (
                    <span className="ed-suggestions-cursor">Analyzing...</span>
                ) }
                { suggestions.map((suggestion) => (
                    <div key={ suggestion.id } className="ed-suggestion-item">
                        <input
                            type="checkbox"
                            checked={ suggestion.selected }
                            onChange={ () => onToggleSuggestion?.(suggestion.id) }
                            className="ed-suggestion-checkbox"
                            title="Toggle this suggestion"
                        />
                        { editingSuggestionId === suggestion.id ? (
                            <div className="ed-suggestion-edit-mode">
                                <input
                                    type="text"
                                    value={ editingSuggestionText }
                                    onChange={ (e) => setEditingSuggestionText(e.target.value) }
                                    className="ed-suggestion-text-input"
                                    autoFocus
                                    onKeyDown={ (e) => {
                                        if (e.key === 'Enter') handleSaveEdit(suggestion.id);
                                        if (e.key === 'Escape') handleCancelEdit();
                                    } }
                                />
                                <button
                                    className="ed-suggestion-edit-save"
                                    onClick={ () => handleSaveEdit(suggestion.id) }
                                    title="Save"
                                >
                                    &#10003;
                                </button>
                                <button
                                    className="ed-suggestion-edit-cancel"
                                    onClick={ handleCancelEdit }
                                    title="Cancel"
                                >
                                    &#10005;
                                </button>
                            </div>
                        ) : (
                            <div className="ed-suggestion-text-wrapper">
                                <span
                                    className={ `ed-suggestion-text ${ suggestion.edited ? 'edited' : '' }` }
                                    title="Click edit to modify"
                                >
                                    { renderInlineMarkdown(suggestion.text) }
                                </span>
                                <button
                                    className="ed-suggestion-edit-btn"
                                    onClick={ () => handleStartEdit(suggestion) }
                                    title="Edit suggestion"
                                >
                                    &#9998;
                                </button>
                                { onDeleteSuggestion && (
                                    <button
                                        className="ed-suggestion-delete-btn"
                                        onClick={ () => onDeleteSuggestion(suggestion.id) }
                                        title="Delete suggestion"
                                        aria-label="Delete suggestion"
                                    >
                                        &#128465;
                                    </button>
                                ) }
                            </div>
                        ) }
                    </div>
                )) }

                { !isSuggesting && (
                    <div className="ed-suggestion-add-row">
                        <input
                            type="text"
                            value={ newSuggestionText }
                            onChange={ (e) => setNewSuggestionText(e.target.value) }
                            className="ed-suggestion-add-input"
                            placeholder="Add a custom suggestion..."
                            onKeyDown={ (e) => {
                                if (e.key === 'Enter') handleAddSuggestion();
                            } }
                        />
                        <button
                            className="btn btn-secondary btn-md"
                            onClick={ handleAddSuggestion }
                            disabled={ !newSuggestionText.trim() }
                            title="Add suggestion"
                        >
                            Add
                        </button>
                    </div>
                ) }

                { !isSuggesting && suggestions.length > 0 && (
                    <div className="ed-apply-suggestions-row">
                        <button
                            className="btn btn-primary btn-md ed-btn-apply"
                            onClick={ () => onApplySuggestions?.(refineSource) }
                            disabled={ isBusy || suggestions.filter(s => s.selected).length === 0 }
                            title={ refineSource
                                ? 'Refine the new draft using selected suggestions'
                                : 'Regenerate description using selected suggestions' }
                        >
                            Apply Suggestions
                        </button>
                    </div>
                ) }
            </div>
        </div>
    );

    const regenerateControls = !isStreaming && (
        <div className="ed-regenerate-controls">
            { isRegenerating ? (
                <span className="ed-regenerating">
                    <span className="spinner"></span> { isPristine ? 'Generating...' : 'Regenerating...' }
                </span>
            ) : (
                <>
                    <button className="btn btn-secondary btn-md"
                            onClick={ () => onRegenerate('', undefined, refineSource) }
                            disabled={ isBusy }
                            title={ refineSource ? 'Rephrase the new draft' : isPristine ? 'Generate a description' : 'Regenerate from scratch' }>{ refineSource ? 'Refine' : isPristine ? 'Generate' : 'Regenerate' }
                    </button>
                    { !isEmpty && (
                        <>
                            <button
                                className="btn btn-secondary btn-md ed-btn-concise"
                                onClick={ () => onRegenerate('concise', undefined, refineSource) }
                                disabled={ isBusy }
                                title={ refineSource ? 'Make the new draft more concise' : 'Make more concise' }
                            >Concise
                            </button>
                            <button
                                className="btn btn-secondary btn-md ed-btn-detailed"
                                onClick={ () => onRegenerate('detailed', undefined, refineSource) }
                                disabled={ isBusy }
                                title={ refineSource ? 'Make the new draft more detailed' : 'Make more detailed' }
                            >Detailed
                            </button>
                            <button
                                className="btn btn-secondary btn-md ed-btn-suggest"
                                onClick={ () => onSuggestImprovement(refineSource) }
                                disabled={ isBusy }
                                title={ refineSource
                                    ? 'Get AI suggestions to improve the new draft'
                                    : 'Get AI suggestions to improve the current description' }
                            >{ isSuggesting ? (
                                <>
                                    <span className="spinner"></span> Analyzing...
                                </>
                            ) : suggestLabel }
                            </button>
                            <div className="ed-custom-instruction-wrapper">
                                <input
                                    type="text"
                                    value={ customInstruction }
                                    onChange={ (e) => setCustomInstruction(e.target.value) }
                                    className="ed-custom-instruction-input"
                                    placeholder="Custom..."
                                />
                                <button className="btn btn-secondary btn-md" onClick={ handleCustomApply }
                                        disabled={ isBusy }
                                        title="Apply">Apply
                                </button>
                            </div>
                        </>
                    ) }
                    { onReset && (
                        <ResetFieldButton
                            show={ canReset }
                            onReset={ onReset }
                            disabled={ isBusy }
                            label="Reset"
                            title="Reset description to the value loaded from the dataset"
                        />
                    ) }
                </>
            ) }
        </div>
    );

    return (
        <div className={ cls }>
            { isEditing ? (
                <div className="ed-edit-mode">
                    <textarea
                        value={ editValue }
                        onChange={ (e) => setEditValue(e.target.value) }
                        className="ed-edit-textarea"
                    />
                    <div className="ed-edit-actions">
                        <button className="btn btn-primary btn-md" onClick={ handleSave }>
                            Save
                        </button>
                        <button className="btn btn-secondary btn-md" onClick={ handleCancel }>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : hasPending ? (
                <>
                    <DiffView
                        currentValue={ description }
                        currentEmptyState={ <em className="diff-view-empty">No description</em> }
                        newValue={ pendingDescription }
                        isGenerating={ isRegenerating }
                        onAccept={ onAcceptPending! }
                        onDiscard={ onDiscardPending! }
                        acceptTooltip="Replace the current description with the new one"
                        discardTooltip="Discard the new description and keep the current one"
                    />
                    { suggestionsPanel }
                    { regenerateControls }
                </>
            ) : (
                <>
                    <div className={ `ed-description ${ isStreaming ? 'ed-streaming' : '' }` }>
                        <p>
                            { description || (isStreaming ? '' : 'No description') }
                            { isStreaming && <span className="ed-cursor">|</span> }
                        </p>
                        { !isStreaming && (
                            <span
                                className="ed-edit-icon"
                                onClick={ () => {
                                    setEditValue(description);
                                    setIsEditing(true);
                                } }
                                title="Edit description"
                            >
                                &#9998;
                            </span>
                        ) }
                    </div>

                    { suggestionsPanel }
                    { regenerateControls }
                </>
            ) }
        </div>
    );
}
