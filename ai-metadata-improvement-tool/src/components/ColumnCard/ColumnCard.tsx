import { useState } from 'react';
import type { ColumnInfo } from '../../types';
import { formatColumnStats, sanitizeId } from '../../utils/columnAnalyzer';
import styles from './ColumnCard.module.css';

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
                return styles.typeNumeric;
            case 'categorical':
                return styles.typeCategorical;
            default:
                return styles.typeText;
        }
    };

    return (
        <div className={styles.columnCard} id={`column-${sanitizeId(name)}`}>
            <h4>
                {name}
                <span className={`${styles.columnType} ${getTypeClass()}`}>{info.type}</span>
            </h4>
            <div className={styles.columnStats}>{formatColumnStats(info)}</div>

            {isGenerating ? (
                <div className={styles.generating}>Generating description...</div>
            ) : isEditing ? (
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
                <>
                    <div className={styles.columnDescription}>
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
                                    Concise
                                </button>
                                <button
                                    className={`${styles.btnRegenerate} ${styles.detailed}`}
                                    onClick={() => onRegenerate('detailed')}
                                    title="Make more detailed"
                                >
                                    Detailed
                                </button>
                                <div className={styles.customInstructionWrapper}>
                                    <input
                                        type="text"
                                        value={customInstruction}
                                        onChange={(e) => setCustomInstruction(e.target.value)}
                                        className={styles.customInstructionInput}
                                        placeholder="Custom..."
                                    />
                                    <button className={styles.btnRegenerate} onClick={handleCustomApply} title="Apply">
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
