import { useState } from 'react';
import type { PromptTemplates } from '../../types';
import './PromptEditor.css';

interface PromptEditorProps {
    templates: PromptTemplates;
    onChange: (templates: PromptTemplates) => void;
}

export function PromptEditor({templates, onChange}: PromptEditorProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className="prompt-editor-section">
            <div
                className={`prompt-editor-section-title prompt-editor-toggle ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                Customize AI Prompts (Optional)
            </div>
            <div className={`prompt-editor-content ${isCollapsed ? 'content-collapsed' : ''}`}>
                <div className="prompt-editor-box">
                    <h4>Dataset Description Prompt Template</h4>
                    <textarea
                        value={templates.dataset}
                        onChange={(e) => onChange({...templates, dataset: e.target.value})}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Column Description Prompt Template</h4>
                    <textarea
                        value={templates.column}
                        onChange={(e) => onChange({...templates, column: e.target.value})}
                    />
                </div>
                <p className="prompt-editor-help-text">
                    Use placeholders: {'{fileName}'}, {'{rowCount}'}, {'{columnInfo}'}, {'{datasetDescription}'},{' '}
                    {'{columnName}'}, {'{columnStats}'}
                </p>
            </div>
        </div>
    );
}
