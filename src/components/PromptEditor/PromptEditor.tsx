import { useEffect, useState } from 'react';
import type { PromptTemplates } from '../../types';
import {
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_COLUMN_SUGGESTION_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_DATASET_SUGGESTION_PROMPT,
    DEFAULT_NOTES_PROMPT,
    DEFAULT_ROW_LABEL_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
} from '../../utils/prompts';
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

const DEFAULTS: Record<keyof PromptTemplates, string> = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    dataset: DEFAULT_DATASET_PROMPT,
    column: DEFAULT_COLUMN_PROMPT,
    rowLabel: DEFAULT_ROW_LABEL_PROMPT,
    notes: DEFAULT_NOTES_PROMPT,
    datasetSuggestion: DEFAULT_DATASET_SUGGESTION_PROMPT,
    columnSuggestion: DEFAULT_COLUMN_SUGGESTION_PROMPT,
};

const PROMPT_FIELDS: {key: keyof PromptTemplates; label: string}[] = [
    { key: 'systemPrompt', label: 'System Prompt' },
    { key: 'dataset', label: 'Dataset Description Prompt' },
    { key: 'column', label: 'Column Description Prompt' },
    { key: 'rowLabel', label: 'Row Label Prompt' },
    { key: 'notes', label: 'Notes Prompt' },
    { key: 'datasetSuggestion', label: 'Dataset Description Suggestion Prompt' },
    { key: 'columnSuggestion', label: 'Column Description Suggestion Prompt' },
];

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
    const [resetTarget, setResetTarget] = useState<keyof PromptTemplates | null>(null);

    const cancelReset = () => setResetTarget(null);
    const confirmReset = () => {
        if (resetTarget) {
            onChange({ ...templates, [resetTarget]: DEFAULTS[resetTarget] });
            setResetTarget(null);
        }
    };

    useEffect(() => {
        if (!resetTarget) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cancelReset();
            else if (e.key === 'Enter') confirmReset();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const targetLabel = resetTarget
        ? PROMPT_FIELDS.find((f) => f.key === resetTarget)?.label
        : null;

    return (
        <div className="prompt-editor-section">
            <div className="prompt-editor-section-title">
                Customize AI Prompts (Optional)
            </div>
            <div className="prompt-editor-content">
                {PROMPT_FIELDS.map(({ key, label }) => {
                    const isModified = templates[key] !== DEFAULTS[key];
                    return (
                        <div className="prompt-editor-box" key={key}>
                            <div className="prompt-editor-box-header">
                                <h4>{label} <InfoIcon promptKey={key}/></h4>
                                {isModified && (
                                    <button
                                        className="prompt-reset-btn"
                                        onClick={() => setResetTarget(key)}
                                        title="Reset to default"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                            <textarea
                                value={templates[key]}
                                onChange={(e) => onChange({ ...templates, [key]: e.target.value })}
                            />
                        </div>
                    );
                })}
            </div>
            {resetTarget && (
                <div
                    className="prompt-reset-modal-backdrop"
                    onClick={cancelReset}
                    role="presentation"
                >
                    <div
                        className="prompt-reset-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="prompt-reset-modal-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="prompt-reset-modal-title" className="prompt-reset-modal-title">
                            Reset to default?
                        </h3>
                        <p className="prompt-reset-modal-body">
                            Your changes to the <strong>{targetLabel}</strong> will be replaced with the default. This
                            cannot be undone.
                        </p>
                        <div className="prompt-reset-modal-actions">
                            <button
                                type="button"
                                className="prompt-reset-modal-btn prompt-reset-modal-btn-cancel"
                                onClick={cancelReset}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="prompt-reset-modal-btn prompt-reset-modal-btn-confirm"
                                onClick={confirmReset}
                                autoFocus
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}