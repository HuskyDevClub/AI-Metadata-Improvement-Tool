import { useEffect, useMemo, useRef, useState } from 'react';
import { type SuggestionItem } from '../../utils/prompts';
import type { SocrataLicense } from '../../types';
import { EditableDescription } from '../EditableDescription/EditableDescription';
import './DatasetDescription.css';

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
    pendingDescription?: string | null;
    onAcceptPending?: () => void;
    onDiscardPending?: () => void;
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
    allowedTags?: string[];
    onAddTag?: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
    onGenerateTags?: () => void;
    isGeneratingTags?: boolean;
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
    postingFrequency?: string;
    onEditPostingFrequency?: (newPostingFrequency: string) => void;
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
                                       category = '',
                                       allowedCategories = [],
                                       onEditCategory,
                                       onGenerateCategory,
                                       isGeneratingCategory = false,
                                       tags = [],
                                       allowedTags = [],
                                       onAddTag,
                                       onRemoveTag,
                                       onGenerateTags,
                                       isGeneratingTags = false,
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
                                       postingFrequency = '',
                                       onEditPostingFrequency,
                                   }: DatasetDescriptionProps) {
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
                />

                {onEditRowLabel && (
                    <div className="dataset-row-label">
                        <span className="dataset-row-label-title">Row Label</span>
                        <span className="dataset-row-label-hint">
                            Describe what each row in the asset represents (if applicable).
                        </span>
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
                        </div>
                    </div>
                )}

                {(onEditPeriodOfTime || onEditPostingFrequency) && (
                    <div className="dataset-temporal">
                        <span className="dataset-category-title">Temporal</span>
                        {onEditPeriodOfTime && (
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
                        </div>
                    </div>
                )}

                <p className="dataset-desc-tip">Tip: Use &#9998; to edit or regenerate buttons to modify the
                    description</p>
            </div>
        </div>
    );
}
