import { useState } from 'react';
import type { SuggestionItem } from '../../utils/prompts';
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
    notes?: string[];
    onEditNote?: (index: number, text: string) => void;
    onDeleteNote?: (index: number) => void;
    onAddNote?: (text: string) => void;
    onGenerateNote?: () => void;
    isGeneratingNote?: boolean;
    pendingNote?: string;
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
                                       notes = [],
                                       onEditNote,
                                       onDeleteNote,
                                       onAddNote,
                                       onGenerateNote,
                                       isGeneratingNote = false,
                                       pendingNote = '',
                                   }: DatasetDescriptionProps) {
    const [isEditingRowLabel, setIsEditingRowLabel] = useState(false);
    const [rowLabelEditValue, setRowLabelEditValue] = useState(rowLabel);
    const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
    const [noteEditValue, setNoteEditValue] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNoteValue, setNewNoteValue] = useState('');

    const handleRowLabelSave = () => {
        onEditRowLabel?.(rowLabelEditValue);
        setIsEditingRowLabel(false);
    };

    const handleRowLabelCancel = () => {
        setRowLabelEditValue(rowLabel);
        setIsEditingRowLabel(false);
    };

    const handleNoteSave = (index: number) => {
        onEditNote?.(index, noteEditValue);
        setEditingNoteIndex(null);
    };

    const handleNoteCancel = () => {
        setEditingNoteIndex(null);
    };

    const handleAddNoteSave = () => {
        if (newNoteValue.trim()) {
            onAddNote?.(newNoteValue.trim());
            setNewNoteValue('');
        }
        setIsAddingNote(false);
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

                {onAddNote && (
                    <div className="dataset-notes">
                        <div className="dataset-notes-header">
                            <span className="dataset-notes-title">Notes</span>
                            <span className="dataset-notes-header-actions">
                                <button
                                    className="dataset-row-label-btn"
                                    onClick={() => {
                                        setNewNoteValue('');
                                        setIsAddingNote(true);
                                    }}
                                    disabled={isGeneratingNote}
                                >
                                    + Add
                                </button>
                                <button
                                    className="dataset-row-label-btn generate"
                                    onClick={onGenerateNote}
                                    disabled={isGeneratingNote}
                                    title="Generate a note with AI"
                                >
                                    {isGeneratingNote ? 'Generating...' : 'Generate'}
                                </button>
                            </span>
                        </div>

                        {notes.length === 0 && !isGeneratingNote && !isAddingNote && (
                            <div className="dataset-notes-empty">
                                <em className="dataset-row-label-empty">No notes yet</em>
                            </div>
                        )}

                        <div className="dataset-notes-list">
                            {notes.map((note, index) => (
                                <div key={index} className="dataset-note-item">
                                    {editingNoteIndex === index ? (
                                        <div className="dataset-notes-edit">
                                            <textarea
                                                value={noteEditValue}
                                                onChange={(e) => setNoteEditValue(e.target.value)}
                                                className="dataset-notes-textarea"
                                                rows={3}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') handleNoteCancel();
                                                }}
                                            />
                                            <div className="dataset-notes-edit-actions">
                                                <button className="dataset-row-label-btn save"
                                                        onClick={() => handleNoteSave(index)}>Save
                                                </button>
                                                <button className="dataset-row-label-btn cancel"
                                                        onClick={handleNoteCancel}>Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="dataset-note-display">
                                            <span className="dataset-note-text">{note}</span>
                                            <span className="dataset-note-actions">
                                                <button
                                                    className="dataset-row-label-btn edit"
                                                    onClick={() => {
                                                        setNoteEditValue(note);
                                                        setEditingNoteIndex(index);
                                                    }}
                                                    title="Edit note"
                                                >
                                                    &#9998;
                                                </button>
                                                <button
                                                    className="dataset-note-delete-btn"
                                                    onClick={() => onDeleteNote?.(index)}
                                                    title="Delete note"
                                                >
                                                    &times;
                                                </button>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isGeneratingNote && pendingNote && (
                                <div className="dataset-note-item dataset-note-generating">
                                    <span className="dataset-row-label-generating">
                                        {pendingNote}
                                        <span className="ed-cursor">|</span>
                                    </span>
                                </div>
                            )}

                            {isGeneratingNote && !pendingNote && (
                                <div className="dataset-note-item dataset-note-generating">
                                    <span className="dataset-row-label-generating">
                                        Generating...
                                        <span className="ed-cursor">|</span>
                                    </span>
                                </div>
                            )}

                            {isAddingNote && (
                                <div className="dataset-note-item">
                                    <div className="dataset-notes-edit">
                                        <textarea
                                            value={newNoteValue}
                                            onChange={(e) => setNewNoteValue(e.target.value)}
                                            className="dataset-notes-textarea"
                                            placeholder="Add a note: data limitations, update frequency, methodology, caveats..."
                                            rows={3}
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape') setIsAddingNote(false);
                                            }}
                                        />
                                        <div className="dataset-notes-edit-actions">
                                            <button className="dataset-row-label-btn save"
                                                    onClick={handleAddNoteSave}>Add
                                            </button>
                                            <button className="dataset-row-label-btn cancel"
                                                    onClick={() => setIsAddingNote(false)}>Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
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
