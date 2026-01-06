import { useState } from 'react';
import type { PromptTemplates } from '../../types';
import styles from './PromptEditor.module.css';

interface PromptEditorProps {
    templates: PromptTemplates;
    onChange: (templates: PromptTemplates) => void;
}

export function PromptEditor({templates, onChange}: PromptEditorProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className={styles.section}>
            <div
                className={`${styles.sectionTitle} ${styles.toggle} ${isCollapsed ? styles.collapsed : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                Customize AI Prompts (Optional)
            </div>
            <div className={`${styles.content} ${isCollapsed ? styles.contentCollapsed : ''}`}>
                <div className={styles.promptEditor}>
                    <h4>Dataset Description Prompt Template</h4>
                    <textarea
                        value={templates.dataset}
                        onChange={(e) => onChange({...templates, dataset: e.target.value})}
                    />
                </div>

                <div className={styles.promptEditor}>
                    <h4>Column Description Prompt Template</h4>
                    <textarea
                        value={templates.column}
                        onChange={(e) => onChange({...templates, column: e.target.value})}
                    />
                </div>
                <p className={styles.helpText}>
                    Use placeholders: {'{fileName}'}, {'{rowCount}'}, {'{columnInfo}'}, {'{datasetDescription}'},{' '}
                    {'{columnName}'}, {'{columnStats}'}
                </p>
            </div>
        </div>
    );
}
