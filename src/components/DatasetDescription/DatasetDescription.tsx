import { useState } from 'react';
import { type SuggestionItem } from '../../utils/prompts';
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
    category?: string;
    allowedCategories?: string[];
    onEditCategory?: (newCategory: string) => void;
    onGenerateCategory?: () => void;
    isGeneratingCategory?: boolean;
    tags?: string[];
    onAddTag?: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
    onGenerateTags?: () => void;
    isGeneratingTags?: boolean;
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
                                       category = '',
                                       allowedCategories = [],
                                       onEditCategory,
                                       onGenerateCategory,
                                       isGeneratingCategory = false,
                                       tags = [],
                                       onAddTag,
                                       onRemoveTag,
                                       onGenerateTags,
                                       isGeneratingTags = false,
                                   }: DatasetDescriptionProps) {
    const [isEditingRowLabel, setIsEditingRowLabel] = useState(false);
    const [rowLabelEditValue, setRowLabelEditValue] = useState(rowLabel);
    const [newTagInput, setNewTagInput] = useState('');

    const categoriesUnavailable = allowedCategories.length === 0;
    const categoryOptions = allowedCategories.includes(category) || !category
        ? allowedCategories
        : [...allowedCategories, category];

    const commitNewTag = () => {
        const value = newTagInput.trim();
        if (!value) return;
        onAddTag?.(value);
        setNewTagInput('');
    };

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
                                <button className="dataset-row-label-btn save" onClick={handleRowLabelSave}>Save
                                </button>
                                <button className="dataset-row-label-btn cancel" onClick={handleRowLabelCancel}>Cancel
                                </button>
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

                {onEditCategory && (
                    <div className="dataset-category">
                        <span className="dataset-category-title">Category</span>
                        <div className="dataset-category-display">
                            <select
                                className="dataset-category-select"
                                value={category}
                                onChange={(e) => onEditCategory(e.target.value)}
                                disabled={isGeneratingCategory || categoriesUnavailable}
                            >
                                <option value="">Not set</option>
                                {categoryOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            {!categoriesUnavailable && category && !allowedCategories.includes(category) && (
                                <span
                                    className="dataset-category-warning"
                                    title="This category is not in the list from data.wa.gov. Pick one from the dropdown to use a recognized value."
                                >
                                    not in data.wa.gov list
                                </span>
                            )}
                            <button
                                className="dataset-row-label-btn generate"
                                onClick={onGenerateCategory}
                                disabled={isGeneratingCategory || categoriesUnavailable}
                                title="Pick a category with AI (from the data.wa.gov list only)"
                            >
                                {isGeneratingCategory ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                        {categoriesUnavailable && (
                            <div className="dataset-category-unavailable">
                                Categories unavailable — try again after connection is restored
                            </div>
                        )}
                    </div>
                )}

                {onAddTag && onRemoveTag && (
                    <div className="dataset-tags">
                        <div className="dataset-tags-header">
                            <span className="dataset-category-title">Tags and Keywords</span>
                            <button
                                className="dataset-row-label-btn generate"
                                onClick={onGenerateTags}
                                disabled={isGeneratingTags}
                                title="Generate tags with AI"
                            >
                                {isGeneratingTags ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                        <div className="dataset-tags-chips">
                            {tags.length === 0 && !isGeneratingTags && (
                                <em className="dataset-row-label-empty">No tags yet</em>
                            )}
                            {tags.map((tag) => (
                                <span key={tag} className="dataset-tag-chip">
                                    {tag}
                                    <button
                                        type="button"
                                        className="dataset-tag-chip-remove"
                                        onClick={() => onRemoveTag(tag)}
                                        aria-label={`Remove tag ${tag}`}
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                            {isGeneratingTags && tags.length === 0 && (
                                <span className="dataset-row-label-generating">
                                    Generating...
                                    <span className="ed-cursor">|</span>
                                </span>
                            )}
                        </div>
                        <div className="dataset-tags-add">
                            <input
                                type="text"
                                className="dataset-row-label-input"
                                placeholder="Add a tag and press Enter"
                                value={newTagInput}
                                onChange={(e) => setNewTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitNewTag();
                                    }
                                }}
                                disabled={isGeneratingTags}
                            />
                            <button
                                type="button"
                                className="dataset-row-label-btn save"
                                onClick={commitNewTag}
                                disabled={!newTagInput.trim() || isGeneratingTags}
                            >
                                Add
                            </button>
                        </div>
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
