import { useEffect, useMemo, useRef, useState } from 'react';
import { type SuggestionItem } from '../../utils/prompts';
import type { SocrataLicense } from '../../types';
import { EditableDescription } from '../EditableDescription/EditableDescription';
import { ResetFieldButton } from '../ResetFieldButton/ResetFieldButton';
import './DatasetDescription.css';

type DatasetFieldKey =
    | 'datasetDescription'
    | 'rowLabel'
    | 'category'
    | 'tags'
    | 'licenseId'
    | 'attribution'
    | 'contactEmail'
    | 'periodOfTime'
    | 'postingFrequency';

const POSTING_FREQUENCY_OPTIONS = [
    'Annually',
    'Biannually',
    'Quarterly',
    'Monthly',
    'Weekly',
    'Daily',
    'Nightly',
    'Continuous / Real-time',
    'Biennially',
    'As needed',
    'One time',
    'No longer updated',
] as const;
const POSTING_FREQUENCY_OTHER = '__other__';

interface DatasetDescriptionProps {
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string, sourceText?: string) => void;
    onSuggestImprovement: (sourceText?: string) => void;
    onDismissSuggestions: () => void;
    suggestions: SuggestionItem[];
    isSuggesting: boolean;
    isRegenerating: boolean;
    onToggleSuggestion: (id: string) => void;
    onEditSuggestion: (id: string, text: string) => void;
    onAddSuggestion: (text: string) => void;
    onApplySuggestions: (sourceText?: string) => void;
    pendingDescription?: string | null;
    onAcceptPending?: () => void;
    onDiscardPending?: () => void;
    rowLabel?: string;
    onEditRowLabel?: (newLabel: string) => void;
    onGenerateRowLabel?: () => void;
    isGeneratingRowLabel?: boolean;
    pendingRowLabel?: string | null;
    onAcceptPendingRowLabel?: () => void;
    onDiscardPendingRowLabel?: () => void;
    category?: string;
    allowedCategories?: string[];
    onEditCategory?: (newCategory: string) => void;
    onGenerateCategory?: () => void;
    isGeneratingCategory?: boolean;
    pendingCategory?: string | null;
    onAcceptPendingCategory?: () => void;
    onDiscardPendingCategory?: () => void;
    tags?: string[];
    allowedTags?: string[];
    onAddTag?: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
    onGenerateTags?: () => void;
    isGeneratingTags?: boolean;
    pendingTags?: string[] | null;
    onAcceptPendingTags?: () => void;
    onDiscardPendingTags?: () => void;
    licenseId?: string;
    allowedLicenses?: SocrataLicense[];
    onEditLicenseId?: (newLicenseId: string) => void;
    attribution?: string;
    onEditAttribution?: (newAttribution: string) => void;
    contactEmail?: string;
    onEditContactEmail?: (newContactEmail: string) => void;
    periodOfTime?: string;
    onEditPeriodOfTime?: (newPeriodOfTime: string) => void;
    onGeneratePeriodOfTime?: () => void;
    isGeneratingPeriodOfTime?: boolean;
    pendingPeriodOfTime?: string | null;
    onAcceptPendingPeriodOfTime?: () => void;
    onDiscardPendingPeriodOfTime?: () => void;
    postingFrequency?: string;
    onEditPostingFrequency?: (newPostingFrequency: string) => void;
    onResetField?: (field: DatasetFieldKey) => void;
    isFieldChanged?: (field: DatasetFieldKey) => boolean;
    socrataDomain?: string | null;
}

export function DatasetDescription({
                                       description,
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
                                       pendingDescription = null,
                                       onAcceptPending,
                                       onDiscardPending,
                                       rowLabel = '',
                                       onEditRowLabel,
                                       onGenerateRowLabel,
                                       isGeneratingRowLabel = false,
                                       pendingRowLabel = null,
                                       onAcceptPendingRowLabel,
                                       onDiscardPendingRowLabel,
                                       category = '',
                                       allowedCategories = [],
                                       onEditCategory,
                                       onGenerateCategory,
                                       isGeneratingCategory = false,
                                       pendingCategory = null,
                                       onAcceptPendingCategory,
                                       onDiscardPendingCategory,
                                       tags = [],
                                       allowedTags = [],
                                       onAddTag,
                                       onRemoveTag,
                                       onGenerateTags,
                                       isGeneratingTags = false,
                                       pendingTags = null,
                                       onAcceptPendingTags,
                                       onDiscardPendingTags,
                                       licenseId = '',
                                       allowedLicenses = [],
                                       onEditLicenseId,
                                       attribution = '',
                                       onEditAttribution,
                                       contactEmail = '',
                                       onEditContactEmail,
                                       periodOfTime = '',
                                       onEditPeriodOfTime,
                                       onGeneratePeriodOfTime,
                                       isGeneratingPeriodOfTime = false,
                                       pendingPeriodOfTime = null,
                                       onAcceptPendingPeriodOfTime,
                                       onDiscardPendingPeriodOfTime,
                                       postingFrequency = '',
                                       onEditPostingFrequency,
                                       onResetField,
                                       isFieldChanged,
                                       socrataDomain = null,
                                   }: DatasetDescriptionProps) {
    const canReset = (field: DatasetFieldKey) => !!onResetField && !!isFieldChanged?.(field);
    const resetHandler = (field: DatasetFieldKey) => () => onResetField?.(field);
    const [isEditingRowLabel, setIsEditingRowLabel] = useState(false);
    const [rowLabelEditValue, setRowLabelEditValue] = useState(rowLabel);
    const [newTagInput, setNewTagInput] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [activeTagSuggestion, setActiveTagSuggestion] = useState(0);
    const tagInputWrapperRef = useRef<HTMLDivElement | null>(null);

    const isPresetFrequency = (POSTING_FREQUENCY_OPTIONS as readonly string[]).includes(postingFrequency);
    const [postingFrequencyCustom, setPostingFrequencyCustom] = useState(
        !!postingFrequency && !isPresetFrequency,
    );
    const [prevPostingFrequency, setPrevPostingFrequency] = useState(postingFrequency);
    if (postingFrequency !== prevPostingFrequency) {
        setPrevPostingFrequency(postingFrequency);
        if (postingFrequency && !(POSTING_FREQUENCY_OPTIONS as readonly string[]).includes(postingFrequency)) {
            setPostingFrequencyCustom(true);
        }
    }

    const filteredTagSuggestions = useMemo(() => {
        const query = newTagInput.trim().toLowerCase();
        const selected = new Set(tags.map((t) => t.toLowerCase()));
        const pool = allowedTags.filter((t) => !selected.has(t.toLowerCase()));
        if (!query) return pool.slice(0, 50);
        const starts: string[] = [];
        const contains: string[] = [];
        for (const t of pool) {
            const lower = t.toLowerCase();
            if (lower.startsWith(query)) starts.push(t);
            else if (lower.includes(query)) contains.push(t);
        }
        return [...starts, ...contains].slice(0, 50);
    }, [newTagInput, allowedTags, tags]);

    useEffect(() => {
        if (!showTagSuggestions) return;
        const handleClick = (e: MouseEvent) => {
            if (!tagInputWrapperRef.current) return;
            if (!tagInputWrapperRef.current.contains(e.target as Node)) {
                setShowTagSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showTagSuggestions]);

    const categoriesUnavailable = allowedCategories.length === 0;
    const categoryOptions = allowedCategories.includes(category) || !category
        ? allowedCategories
        : [...allowedCategories, category];

    const licensesUnavailable = allowedLicenses.length === 0;
    const selectedLicenseKnown = allowedLicenses.some((l) => l.id === licenseId);
    const licenseOptions = licenseId && !selectedLicenseKnown
        ? [...allowedLicenses, { id: licenseId, name: licenseId }]
        : allowedLicenses;

    const commitNewTag = (override?: string) => {
        const value = (override ?? newTagInput).trim();
        if (!value) return;
        onAddTag?.(value);
        setNewTagInput('');
        setShowTagSuggestions(false);
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
                    pendingDescription={pendingDescription}
                    onAcceptPending={onAcceptPending}
                    onDiscardPending={onDiscardPending}
                    onReset={onResetField ? resetHandler('datasetDescription') : undefined}
                    canReset={canReset('datasetDescription')}
                />

                {onEditRowLabel && (
                    <div className="dataset-row-label">
                        <span className="dataset-row-label-title">Row Label</span>
                        <span className="dataset-row-label-hint">
                            Describe what each row in the asset represents (if applicable).
                        </span>
                        {pendingRowLabel !== null ? (
                            <div className="ed-pending dataset-field-pending">
                                <div className="ed-pending-block ed-pending-current">
                                    <div className="ed-pending-label">Current</div>
                                    <p className="ed-pending-text">
                                        {rowLabel || <em className="ed-pending-empty">Not set</em>}
                                    </p>
                                </div>
                                <div className="ed-pending-block ed-pending-new">
                                    <div className="ed-pending-label">New</div>
                                    <p className="ed-pending-text">
                                        {pendingRowLabel || (isGeneratingRowLabel ? '' :
                                            <em className="ed-pending-empty">Empty</em>)}
                                        {isGeneratingRowLabel && <span className="ed-cursor">|</span>}
                                    </p>
                                </div>
                                <div className="ed-pending-actions">
                                    <button
                                        className="ed-btn-primary"
                                        onClick={onAcceptPendingRowLabel}
                                        disabled={isGeneratingRowLabel || !onAcceptPendingRowLabel}
                                        title="Replace the current row label with the new one"
                                    >
                                        Keep new
                                    </button>
                                    <button
                                        className="ed-btn-secondary"
                                        onClick={onDiscardPendingRowLabel}
                                        disabled={isGeneratingRowLabel || !onDiscardPendingRowLabel}
                                        title="Discard the new row label and keep the current one"
                                    >
                                        Discard
                                    </button>
                                </div>
                            </div>
                        ) : isEditingRowLabel ? (
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
                                        <ResetFieldButton
                                            show={canReset('rowLabel')}
                                            onReset={resetHandler('rowLabel')}
                                            title="Reset row label to the value loaded from the dataset"
                                        />
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {onEditCategory && (
                    <div className="dataset-category">
                        <span className="dataset-category-title">Category</span>
                        {pendingCategory !== null ? (
                            <div className="ed-pending dataset-field-pending">
                                <div className="ed-pending-block ed-pending-current">
                                    <div className="ed-pending-label">Current</div>
                                    <p className="ed-pending-text">
                                        {category || <em className="ed-pending-empty">Not set</em>}
                                    </p>
                                </div>
                                <div className="ed-pending-block ed-pending-new">
                                    <div className="ed-pending-label">New</div>
                                    <p className="ed-pending-text">
                                        {pendingCategory || (isGeneratingCategory ? '' :
                                            <em className="ed-pending-empty">Empty</em>)}
                                        {isGeneratingCategory && <span className="ed-cursor">|</span>}
                                    </p>
                                </div>
                                <div className="ed-pending-actions">
                                    <button
                                        className="ed-btn-primary"
                                        onClick={onAcceptPendingCategory}
                                        disabled={isGeneratingCategory || !onAcceptPendingCategory}
                                        title="Replace the current category with the new one"
                                    >
                                        Keep new
                                    </button>
                                    <button
                                        className="ed-btn-secondary"
                                        onClick={onDiscardPendingCategory}
                                        disabled={isGeneratingCategory || !onDiscardPendingCategory}
                                        title="Discard the new category and keep the current one"
                                    >
                                        Discard
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
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
                                            title={`This category is not in the portal's list${socrataDomain ? ` (${socrataDomain})` : ''}. Pick one from the dropdown to use a recognized value.`}
                                        >
                                            {socrataDomain ? `not in ${socrataDomain} list` : 'not in portal list'}
                                        </span>
                                    )}
                                    <button
                                        className="dataset-row-label-btn generate"
                                        onClick={onGenerateCategory}
                                        disabled={isGeneratingCategory || categoriesUnavailable}
                                        title={`Pick a category with AI (from the portal's list${socrataDomain ? ` on ${socrataDomain}` : ''} only)`}
                                    >
                                        {isGeneratingCategory ? 'Generating...' : 'Generate'}
                                    </button>
                                    <ResetFieldButton
                                        show={canReset('category')}
                                        onReset={resetHandler('category')}
                                        disabled={isGeneratingCategory}
                                        title="Reset category to the value loaded from the dataset"
                                    />
                                </div>
                                {categoriesUnavailable && (
                                    <div className="dataset-category-unavailable">
                                        Categories unavailable — try again after connection is restored
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {onAddTag && onRemoveTag && pendingTags !== null && (
                    <div className="dataset-tags">
                        <div className="dataset-tags-header">
                            <span className="dataset-category-title">Tags and Keywords</span>
                        </div>
                        <div className="ed-pending dataset-field-pending">
                            <div className="ed-pending-block ed-pending-current">
                                <div className="ed-pending-label">Current</div>
                                <div className="dataset-tags-chips dataset-tags-chips-pending">
                                    {tags.length === 0 ? (
                                        <em className="ed-pending-empty">No tags</em>
                                    ) : (
                                        tags.map((tag) => {
                                            const removed = !pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                                            return (
                                                <span
                                                    key={tag}
                                                    className={`dataset-tag-chip dataset-tag-chip-static ${removed ? 'dataset-tag-chip-removed' : ''}`}
                                                >
                                                    {tag}
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="ed-pending-block ed-pending-new">
                                <div className="ed-pending-label">New</div>
                                <div className="dataset-tags-chips dataset-tags-chips-pending">
                                    {pendingTags.length === 0 && !isGeneratingTags ? (
                                        <em className="ed-pending-empty">Empty</em>
                                    ) : (
                                        pendingTags.map((tag) => {
                                            const added = !tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                                            return (
                                                <span
                                                    key={tag}
                                                    className={`dataset-tag-chip dataset-tag-chip-static ${added ? 'dataset-tag-chip-added' : ''}`}
                                                >
                                                    {tag}
                                                </span>
                                            );
                                        })
                                    )}
                                    {isGeneratingTags && <span className="ed-cursor">|</span>}
                                </div>
                            </div>
                            <div className="ed-pending-actions">
                                <button
                                    className="ed-btn-primary"
                                    onClick={onAcceptPendingTags}
                                    disabled={isGeneratingTags || !onAcceptPendingTags}
                                    title="Replace the current tags with the new ones"
                                >
                                    Keep new
                                </button>
                                <button
                                    className="ed-btn-secondary"
                                    onClick={onDiscardPendingTags}
                                    disabled={isGeneratingTags || !onDiscardPendingTags}
                                    title="Discard the new tags and keep the current ones"
                                >
                                    Discard
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {onAddTag && onRemoveTag && pendingTags === null && (
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
                            <ResetFieldButton
                                show={canReset('tags')}
                                onReset={resetHandler('tags')}
                                disabled={isGeneratingTags}
                                title="Reset tags to the values loaded from the dataset"
                            />
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
                            <div className="dataset-tags-input-wrap" ref={tagInputWrapperRef}>
                                <input
                                    type="text"
                                    className="dataset-row-label-input"
                                    placeholder="Add a tag and press Enter"
                                    value={newTagInput}
                                    onChange={(e) => {
                                        setNewTagInput(e.target.value);
                                        setShowTagSuggestions(true);
                                        setActiveTagSuggestion(0);
                                    }}
                                    onFocus={() => {
                                        setShowTagSuggestions(true);
                                        setActiveTagSuggestion(0);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'ArrowDown') {
                                            if (filteredTagSuggestions.length > 0) {
                                                e.preventDefault();
                                                setShowTagSuggestions(true);
                                                setActiveTagSuggestion((i) =>
                                                    Math.min(i + 1, filteredTagSuggestions.length - 1)
                                                );
                                            }
                                        } else if (e.key === 'ArrowUp') {
                                            if (filteredTagSuggestions.length > 0) {
                                                e.preventDefault();
                                                setActiveTagSuggestion((i) => Math.max(i - 1, 0));
                                            }
                                        } else if (e.key === 'Escape') {
                                            setShowTagSuggestions(false);
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (
                                                showTagSuggestions &&
                                                filteredTagSuggestions.length > 0 &&
                                                activeTagSuggestion < filteredTagSuggestions.length
                                            ) {
                                                commitNewTag(filteredTagSuggestions[activeTagSuggestion]);
                                            } else {
                                                commitNewTag();
                                            }
                                        }
                                    }}
                                    disabled={isGeneratingTags}
                                    autoComplete="off"
                                />
                                {showTagSuggestions && filteredTagSuggestions.length > 0 && (
                                    <ul className="dataset-tags-suggestions" role="listbox">
                                        {filteredTagSuggestions.map((suggestion, idx) => (
                                            <li
                                                key={suggestion}
                                                role="option"
                                                aria-selected={idx === activeTagSuggestion}
                                                className={
                                                    idx === activeTagSuggestion
                                                        ? 'dataset-tags-suggestion active'
                                                        : 'dataset-tags-suggestion'
                                                }
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    commitNewTag(suggestion);
                                                }}
                                                onMouseEnter={() => setActiveTagSuggestion(idx)}
                                            >
                                                {suggestion}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button
                                type="button"
                                className="dataset-row-label-btn save"
                                onClick={() => commitNewTag()}
                                disabled={!newTagInput.trim() || isGeneratingTags}
                            >
                                Add
                            </button>
                        </div>
                    </div>
                )}

                {onEditLicenseId && onEditAttribution && (
                    <div className="dataset-license">
                        <span className="dataset-category-title">Licensing and Attribution</span>
                        <div className="dataset-license-row">
                            <label className="dataset-license-label">License</label>
                            <select
                                className="dataset-category-select"
                                value={licenseId}
                                onChange={(e) => onEditLicenseId(e.target.value)}
                                disabled={licensesUnavailable}
                            >
                                <option value="">Not set</option>
                                {licenseOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                            <ResetFieldButton
                                show={canReset('licenseId')}
                                onReset={resetHandler('licenseId')}
                                title="Reset license to the value loaded from the dataset"
                            />
                        </div>
                        {licensesUnavailable && (
                            <div className="dataset-category-unavailable">
                                Licenses unavailable — try again after connection is restored
                            </div>
                        )}
                        <div className="dataset-license-row">
                            <label className="dataset-license-label">Attribution</label>
                            <input
                                type="text"
                                className="dataset-row-label-input dataset-license-input"
                                placeholder="Issuing organization (e.g. Department of Licensing)"
                                value={attribution}
                                onChange={(e) => onEditAttribution(e.target.value)}
                            />
                            <ResetFieldButton
                                show={canReset('attribution')}
                                onReset={resetHandler('attribution')}
                                title="Reset attribution to the value loaded from the dataset"
                            />
                        </div>
                    </div>
                )}

                {(onEditPeriodOfTime || onEditPostingFrequency) && (
                    <div className="dataset-temporal">
                        <span className="dataset-category-title">Temporal</span>
                        {onEditPeriodOfTime && pendingPeriodOfTime !== null && (
                            <div className="dataset-temporal-pending-row">
                                <label className="dataset-license-label">Period of Time</label>
                                <div className="ed-pending dataset-field-pending dataset-temporal-pending">
                                    <div className="ed-pending-block ed-pending-current">
                                        <div className="ed-pending-label">Current</div>
                                        <p className="ed-pending-text">
                                            {periodOfTime || <em className="ed-pending-empty">Not set</em>}
                                        </p>
                                    </div>
                                    <div className="ed-pending-block ed-pending-new">
                                        <div className="ed-pending-label">New</div>
                                        <p className="ed-pending-text">
                                            {pendingPeriodOfTime || (isGeneratingPeriodOfTime ? '' :
                                                <em className="ed-pending-empty">Empty</em>)}
                                            {isGeneratingPeriodOfTime && <span className="ed-cursor">|</span>}
                                        </p>
                                    </div>
                                    <div className="ed-pending-actions">
                                        <button
                                            className="ed-btn-primary"
                                            onClick={onAcceptPendingPeriodOfTime}
                                            disabled={isGeneratingPeriodOfTime || !onAcceptPendingPeriodOfTime}
                                            title="Replace the current Period of Time with the new one"
                                        >
                                            Keep new
                                        </button>
                                        <button
                                            className="ed-btn-secondary"
                                            onClick={onDiscardPendingPeriodOfTime}
                                            disabled={isGeneratingPeriodOfTime || !onDiscardPendingPeriodOfTime}
                                            title="Discard the new Period of Time and keep the current one"
                                        >
                                            Discard
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {onEditPeriodOfTime && pendingPeriodOfTime === null && (
                            <div className="dataset-license-row">
                                <label className="dataset-license-label">Period of Time</label>
                                <input
                                    type="text"
                                    className="dataset-row-label-input dataset-license-input"
                                    placeholder="e.g. January 2020 through December 2023"
                                    value={periodOfTime}
                                    onChange={(e) => onEditPeriodOfTime(e.target.value)}
                                    disabled={isGeneratingPeriodOfTime}
                                />
                                {onGeneratePeriodOfTime && (
                                    <button
                                        className="dataset-row-label-btn generate"
                                        onClick={onGeneratePeriodOfTime}
                                        disabled={isGeneratingPeriodOfTime}
                                        title="Generate Period of Time with AI"
                                    >
                                        {isGeneratingPeriodOfTime ? 'Generating...' : 'Generate'}
                                    </button>
                                )}
                                <ResetFieldButton
                                    show={canReset('periodOfTime')}
                                    onReset={resetHandler('periodOfTime')}
                                    disabled={isGeneratingPeriodOfTime}
                                    title="Reset Period of Time to the value loaded from the dataset"
                                />
                            </div>
                        )}
                        {onEditPostingFrequency && (
                            <>
                                <div className="dataset-license-row">
                                    <label className="dataset-license-label">Posting Frequency</label>
                                    <select
                                        className="dataset-category-select"
                                        value={postingFrequencyCustom ? POSTING_FREQUENCY_OTHER : postingFrequency}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === POSTING_FREQUENCY_OTHER) {
                                                setPostingFrequencyCustom(true);
                                                onEditPostingFrequency('');
                                            } else {
                                                setPostingFrequencyCustom(false);
                                                onEditPostingFrequency(v);
                                            }
                                        }}
                                    >
                                        <option value="">Not set</option>
                                        {POSTING_FREQUENCY_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                        <option value={POSTING_FREQUENCY_OTHER}>Other...</option>
                                    </select>
                                    <ResetFieldButton
                                        show={canReset('postingFrequency')}
                                        onReset={resetHandler('postingFrequency')}
                                        title="Reset posting frequency to the value loaded from the dataset"
                                    />
                                </div>
                                {postingFrequencyCustom && (
                                    <div className="dataset-license-row">
                                        <label className="dataset-license-label"/>
                                        <input
                                            type="text"
                                            className="dataset-row-label-input dataset-license-input"
                                            placeholder="Describe the posting frequency"
                                            value={postingFrequency}
                                            onChange={(e) => onEditPostingFrequency(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {onEditContactEmail && (
                    <div className="dataset-contact">
                        <span className="dataset-category-title">Contact Email</span>
                        <div className="dataset-license-row">
                            <input
                                type="email"
                                className="dataset-row-label-input dataset-license-input"
                                placeholder="e.g. opendata@example.wa.gov"
                                value={contactEmail}
                                onChange={(e) => onEditContactEmail(e.target.value)}
                            />
                            <ResetFieldButton
                                show={canReset('contactEmail')}
                                onReset={resetHandler('contactEmail')}
                                title="Reset contact email to the value loaded from the dataset"
                            />
                        </div>
                    </div>
                )}

                <p className="dataset-desc-tip">Tip: Use &#9998; to edit or regenerate buttons to modify the
                    description</p>
            </div>
        </div>
    );
}
