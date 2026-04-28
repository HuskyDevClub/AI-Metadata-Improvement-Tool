import { useEffect, useRef, useState } from 'react';
import type { OpenAIConfig, PromptTemplates } from '../../types';
import { useOpenAI } from '../../hooks/useOpenAI';
import {
    DEFAULT_CATEGORY_PROMPT,
    DEFAULT_COLUMN_PROMPT,
    DEFAULT_COLUMN_SUGGESTION_PROMPT,
    DEFAULT_DATASET_PROMPT,
    DEFAULT_DATASET_SUGGESTION_PROMPT,
    DEFAULT_DATASET_TITLE_PROMPT,
    DEFAULT_PERIOD_OF_TIME_PROMPT,
    DEFAULT_ROW_LABEL_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_TAGS_PROMPT,
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
    datasetTitle: {
        description: 'Template for generating a short, descriptive title for the dataset (e.g. "Washington State Vehicle Registrations").',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}',
    },
    category: {
        description: 'Template for picking exactly one category from the list. The AI is asked to return a number from the list; the backend maps it to the category name.',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}, {categoryList}',
    },
    tags: {
        description: 'Template for generating keyword tags. No vocabulary constraint — the AI produces free-form tags based on the dataset content.',
        placeholders: '{fileName}, {rowCount}, {columnInfo}, {sampleRows}, {sampleCount}',
    },
    periodOfTime: {
        description: 'Template for inferring the real-world time span the data covers (not the update cadence).',
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
    datasetTitle: DEFAULT_DATASET_TITLE_PROMPT,
    category: DEFAULT_CATEGORY_PROMPT,
    tags: DEFAULT_TAGS_PROMPT,
    periodOfTime: DEFAULT_PERIOD_OF_TIME_PROMPT,
    datasetSuggestion: DEFAULT_DATASET_SUGGESTION_PROMPT,
    columnSuggestion: DEFAULT_COLUMN_SUGGESTION_PROMPT,
};

const PROMPT_FIELDS: {key: keyof PromptTemplates; label: string}[] = [
    { key: 'systemPrompt', label: 'System Prompt' },
    { key: 'dataset', label: 'Dataset Description Prompt' },
    { key: 'column', label: 'Column Description Prompt' },
    { key: 'rowLabel', label: 'Row Label Prompt' },
    { key: 'datasetTitle', label: 'Dataset Title Prompt' },
    { key: 'category', label: 'Category Prompt' },
    { key: 'tags', label: 'Tags Prompt' },
    { key: 'periodOfTime', label: 'Period of Time Prompt' },
    { key: 'datasetSuggestion', label: 'Dataset Description Suggestion Prompt' },
    { key: 'columnSuggestion', label: 'Column Description Suggestion Prompt' },
];

type AiMode = 'ask' | 'improve';

const IMPROVE_SYSTEM_PROMPT = `You are a prompt-engineering assistant. The user is editing a prompt template that another AI will use. They will give you the current template and an instruction describing how they want it changed.

Return ONLY the revised prompt template, with no preamble, explanation, commentary, or markdown code fences.

Preserve any placeholder tokens wrapped in curly braces (e.g. {columnName}, {sampleRows}) exactly as written unless the user explicitly asks you to remove or rename them.`;

const ASK_SYSTEM_PROMPT = `You are a prompt-engineering assistant. The user is reviewing a prompt template that another AI will use. Answer their questions about the template concisely and helpfully — explain what it does, what specific phrasing achieves, what placeholders mean, potential issues, or improvement ideas.

Do NOT rewrite the full prompt unless the user explicitly asks for a revised version. Focus on answering the question clearly in plain prose.`;

function buildImproveUserMessage(currentPrompt: string, instruction: string, placeholders?: string) {
    const placeholderLine = placeholders
        ? `\nKnown placeholders that must be preserved verbatim: ${placeholders}\n`
        : '';
    return `=== CURRENT PROMPT ===
${currentPrompt}

=== INSTRUCTION ===
${instruction}
${placeholderLine}
Return the revised prompt only.`;
}

function buildAskUserMessage(currentPrompt: string, question: string, placeholders?: string) {
    const placeholderLine = placeholders ? `\nKnown placeholders: ${placeholders}\n` : '';
    return `=== CURRENT PROMPT ===
${currentPrompt}
${placeholderLine}
=== QUESTION ===
${question}`;
}

function AutoResizeTextarea({ value, onChange }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.style.height = 'auto';
            textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={textAreaRef}
            value={value}
            onChange={onChange}
            style={{ overflow: 'hidden' }}
        />
    );
}

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
    openaiConfig: OpenAIConfig;
}

export function PromptEditor({ templates, onChange, openaiConfig }: PromptEditorProps) {
    const [resetTarget, setResetTarget] = useState<keyof PromptTemplates | null>(null);
    const [aiTarget, setAiTarget] = useState<keyof PromptTemplates | null>(null);
    const [aiMode, setAiMode] = useState<AiMode>('ask');
    const [aiInput, setAiInput] = useState('');
    const [aiOutput, setAiOutput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const { callOpenAIStream } = useOpenAI();

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

    const closeAi = () => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setAiTarget(null);
        setAiInput('');
        setAiOutput('');
        setIsGenerating(false);
        setAiError(null);
    };

    const openAi = (key: keyof PromptTemplates) => {
        setAiTarget(key);
        setAiMode('ask');
        setAiInput('');
        setAiOutput('');
        setIsGenerating(false);
        setAiError(null);
    };

    const switchMode = (mode: AiMode) => {
        if (mode === aiMode || isGenerating) return;
        setAiMode(mode);
        setAiInput('');
        setAiOutput('');
        setAiError(null);
    };

    const runAi = async () => {
        if (!aiTarget || !aiInput.trim() || isGenerating) return;
        const current = templates[aiTarget];
        const info = PROMPT_INFO[aiTarget];
        const userMessage = aiMode === 'improve'
            ? buildImproveUserMessage(current, aiInput.trim(), info?.placeholders)
            : buildAskUserMessage(current, aiInput.trim(), info?.placeholders);
        const systemPrompt = aiMode === 'improve' ? IMPROVE_SYSTEM_PROMPT : ASK_SYSTEM_PROMPT;
        const controller = new AbortController();
        abortRef.current = controller;
        setIsGenerating(true);
        setAiOutput('');
        setAiError(null);
        try {
            await callOpenAIStream(
                userMessage,
                openaiConfig,
                systemPrompt,
                (chunk) => setAiOutput((p) => p + chunk),
                controller.signal
            );
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                setAiError(err instanceof Error ? err.message : String(err));
            }
        } finally {
            setIsGenerating(false);
            abortRef.current = null;
        }
    };

    const stopAi = () => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setIsGenerating(false);
    };

    const applyProposal = () => {
        if (!aiTarget || !aiOutput.trim() || aiMode !== 'improve') return;
        onChange({ ...templates, [aiTarget]: aiOutput });
        closeAi();
    };

    useEffect(() => {
        if (!aiTarget) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isGenerating) closeAi();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const targetLabel = resetTarget
        ? PROMPT_FIELDS.find((f) => f.key === resetTarget)?.label
        : null;
    const aiLabel = aiTarget
        ? PROMPT_FIELDS.find((f) => f.key === aiTarget)?.label
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
                                <div className="prompt-editor-box-actions">
                                    <button
                                        className="prompt-improve-btn"
                                        onClick={() => openAi(key)}
                                        title="Ask AI about this prompt or request an improved version"
                                    >
                                        Ask AI
                                    </button>
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
                            </div>
                            <AutoResizeTextarea
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
            {aiTarget && (
                <div
                    className="prompt-reset-modal-backdrop"
                    onClick={() => {
                        if (!isGenerating) closeAi();
                    }}
                    role="presentation"
                >
                    <div
                        className="prompt-improve-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="prompt-improve-modal-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="prompt-improve-modal-title" className="prompt-reset-modal-title">
                            AI assist for <span className="prompt-improve-modal-target">{aiLabel}</span>
                        </h3>
                        <div className="prompt-ai-mode-tabs" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={aiMode === 'ask'}
                                className={`prompt-ai-mode-tab${aiMode === 'ask' ? ' is-active' : ''}`}
                                onClick={() => switchMode('ask')}
                                disabled={isGenerating}
                            >
                                Ask a question
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={aiMode === 'improve'}
                                className={`prompt-ai-mode-tab${aiMode === 'improve' ? ' is-active' : ''}`}
                                onClick={() => switchMode('improve')}
                                disabled={isGenerating}
                            >
                                Improve prompt
                            </button>
                        </div>
                        <p className="prompt-reset-modal-body">
                            {aiMode === 'improve' ? (
                                <>
                                    Describe what you want changed. The AI will rewrite the prompt and preserve
                                    placeholders like
                                    <code className="prompt-improve-inline-code">{'{columnName}'}</code>.
                                </>
                            ) : (
                                <>
                                    Ask anything about this prompt — what it does, how phrasing choices affect output,
                                    potential issues, ideas for improvement. The AI won&apos;t modify the prompt.
                                </>
                            )}
                        </p>
                        <label className="prompt-improve-label">
                            {aiMode === 'improve' ? 'Your instruction' : 'Your question'}
                        </label>
                        <textarea
                            className="prompt-improve-instruction"
                            placeholder={aiMode === 'improve'
                                ? 'e.g. Make it more concise and emphasize neutral, factual tone.'
                                : 'e.g. Why does this prompt ask for exactly two sentences? What would change if I removed that?'}
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                    e.preventDefault();
                                    runAi();
                                }
                            }}
                            disabled={isGenerating}
                            autoFocus
                        />
                        <div className="prompt-improve-proposal-header">
                            <label className="prompt-improve-label">
                                {aiMode === 'improve' ? 'Proposed prompt' : 'Answer'}
                            </label>
                            {isGenerating && <span className="prompt-improve-streaming">generating…</span>}
                        </div>
                        {aiMode === 'improve' ? (
                            <textarea
                                className="prompt-improve-proposal"
                                value={aiOutput}
                                onChange={(e) => setAiOutput(e.target.value)}
                                placeholder="The revised prompt will appear here. You can edit it before applying."
                            />
                        ) : (
                            <div className="prompt-ai-answer">
                                {aiOutput || (
                                    <span className="prompt-ai-answer-placeholder">
                                        The AI&apos;s answer will appear here.
                                    </span>
                                )}
                            </div>
                        )}
                        {aiError && (
                            <div className="prompt-improve-error">{aiError}</div>
                        )}
                        <div className="prompt-reset-modal-actions">
                            <button
                                type="button"
                                className="prompt-reset-modal-btn prompt-reset-modal-btn-cancel"
                                onClick={closeAi}
                                disabled={isGenerating}
                            >
                                {aiMode === 'ask' ? 'Close' : 'Cancel'}
                            </button>
                            {isGenerating ? (
                                <button
                                    type="button"
                                    className="prompt-reset-modal-btn prompt-improve-stop-btn"
                                    onClick={stopAi}
                                >
                                    Stop
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="prompt-reset-modal-btn prompt-improve-generate-btn"
                                    onClick={runAi}
                                    disabled={!aiInput.trim()}
                                >
                                    {aiOutput
                                        ? (aiMode === 'improve' ? 'Regenerate' : 'Ask again')
                                        : (aiMode === 'improve' ? 'Generate' : 'Ask')}
                                </button>
                            )}
                            {aiMode === 'improve' && (
                                <button
                                    type="button"
                                    className="prompt-reset-modal-btn prompt-improve-apply-btn"
                                    onClick={applyProposal}
                                    disabled={!aiOutput.trim() || isGenerating}
                                >
                                    Apply
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
