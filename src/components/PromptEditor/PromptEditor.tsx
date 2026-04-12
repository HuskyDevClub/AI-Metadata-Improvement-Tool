import type { PromptTemplates } from '../../types';
import './PromptEditor.css';

const PROMPT_INFO: Record<string, {description: string; placeholders?: string}> = {
    systemPrompt: {
        description: 'Sets the AI\'s persona and rules for all generation tasks (tone, style, language guidelines). Applied as the system message in every request.',
    },
    dataset: {
        description: 'Template for generating a Brief Description of the entire dataset.',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}',
    },
    column: {
        description: 'Template for generating a description for a single column.',
        placeholders: '{columnName}, {datasetDescription}, {columnStats}, {dataType}, {nonNullCount}, {rowCount}, {completenessPercent}, {sampleValues}, {nullCount}',
    },
    rowLabel: {
        description: 'Template for determining a short noun phrase (e.g. "license record") that describes what one row represents.',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}',
    },
    notes: {
        description: 'Template for generating supplementary notes (limitations, update frequency, methodology, usage guidance).',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}',
    },
    datasetSuggestion: {
        description: 'Template for reviewing an existing dataset description and returning actionable improvement suggestions.',
        placeholders: '{currentDescription}',
    },
    columnSuggestion: {
        description: 'Template for reviewing an existing column description and returning actionable improvement suggestions.',
        placeholders: '{columnName}, {currentDescription}',
    },
};

function InfoIcon({ promptKey }: {promptKey: string}) {
    const info = PROMPT_INFO[promptKey];
    if (!info) return null;
    const tooltip = info.placeholders
        ? `${info.description}\n\nPlaceholders: ${info.placeholders}`
        : info.description;
    return (
        <span className="prompt-info-icon" data-tooltip={tooltip}>
            i
        </span>
    );
}

interface PromptEditorProps {
    templates: PromptTemplates;
    onChange: (templates: PromptTemplates) => void;
}

export function PromptEditor({ templates, onChange }: PromptEditorProps) {
    return (
        <div className="prompt-editor-section">
            <div className="prompt-editor-section-title">
                Customize AI Prompts (Optional)
            </div>
            <div className="prompt-editor-content">
                <div className="prompt-editor-box">
                    <h4>System Prompt <InfoIcon promptKey="systemPrompt"/></h4>
                    <textarea
                        value={templates.systemPrompt}
                        onChange={(e) => onChange({ ...templates, systemPrompt: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Dataset Description Prompt <InfoIcon promptKey="dataset"/></h4>
                    <textarea
                        value={templates.dataset}
                        onChange={(e) => onChange({ ...templates, dataset: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Column Description Prompt <InfoIcon promptKey="column"/></h4>
                    <textarea
                        value={templates.column}
                        onChange={(e) => onChange({ ...templates, column: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Row Label Prompt <InfoIcon promptKey="rowLabel"/></h4>
                    <textarea
                        value={templates.rowLabel}
                        onChange={(e) => onChange({ ...templates, rowLabel: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Notes Prompt <InfoIcon promptKey="notes"/></h4>
                    <textarea
                        value={templates.notes}
                        onChange={(e) => onChange({ ...templates, notes: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Dataset Description Suggestion Prompt <InfoIcon promptKey="datasetSuggestion"/></h4>
                    <textarea
                        value={templates.datasetSuggestion}
                        onChange={(e) => onChange({ ...templates, datasetSuggestion: e.target.value })}
                    />
                </div>

                <div className="prompt-editor-box">
                    <h4>Column Description Suggestion Prompt <InfoIcon promptKey="columnSuggestion"/></h4>
                    <textarea
                        value={templates.columnSuggestion}
                        onChange={(e) => onChange({ ...templates, columnSuggestion: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
}
