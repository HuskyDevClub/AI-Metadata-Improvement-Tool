import { useState } from 'react';
import styles from './DatasetDescription.module.css';

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
        <div className={styles.section}>
            <div className={styles.sectionTitle}>Dataset Description</div>
            <div className={styles.descriptionBox}>
                <h3>Overview</h3>

                {isEditing ? (
                    <div className={styles.editMode}>
            <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className={styles.editTextarea}
            />
                        <div className={styles.editActions}>
                            <button className={styles.btnPrimary} onClick={handleSave}>
                                Save
                            </button>
                            <button className={styles.btnSecondary} onClick={handleCancel}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.editableDescription}>
                        <p>{description}</p>
                        <span
                            className={styles.editIcon}
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

                <p className={styles.meta}>
                    <strong>File:</strong> {fileName} | <strong>Rows:</strong> {rowCount} |{' '}
                    <strong>Columns:</strong> {columnCount}
                </p>

                {!isEditing && (
                    <div className={styles.regenerateControls}>
                        {isRegenerating ? (
                            <span className={styles.regenerating}>
                <span className={styles.spinner}></span> Regenerating...
              </span>
                        ) : (
                            <>
                                <span className={styles.label}>Regenerate:</span>
                                <button className={styles.btnRegenerate} onClick={() => onRegenerate('')}
                                        title="Regenerate">
                                    Again
                                </button>
                                <button
                                    className={`${styles.btnRegenerate} ${styles.concise}`}
                                    onClick={() => onRegenerate('concise')}
                                    title="Make more concise"
                                >
                                    More Concise
                                </button>
                                <button
                                    className={`${styles.btnRegenerate} ${styles.detailed}`}
                                    onClick={() => onRegenerate('detailed')}
                                    title="Make more detailed"
                                >
                                    More Detailed
                                </button>
                                <div className={styles.customInstructionWrapper}>
                                    <input
                                        type="text"
                                        value={customInstruction}
                                        onChange={(e) => setCustomInstruction(e.target.value)}
                                        className={styles.customInstructionInput}
                                        placeholder="Custom instruction..."
                                    />
                                    <button className={styles.btnRegenerate} onClick={handleCustomApply}
                                            title="Apply custom instruction">
                                        Apply
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <p className={styles.tip}>Tip: Use ✏️ to edit or regenerate buttons to modify the description</p>
            </div>
        </div>
    );
}
