import { useState } from 'react';
import type { ComparisonSubMode, PromptTemplates, ScoringCategory } from '../../types';
import './PromptEditor.css';

interface PromptEditorProps {
    templates: PromptTemplates;
    onChange: (templates: PromptTemplates) => void;
    comparisonEnabled?: boolean;
    comparisonSubMode?: ComparisonSubMode;
    judgeSystemPrompt?: string;
    onJudgeSystemPromptChange?: (prompt: string) => void;
    judgeEvaluationPrompt?: string;
    onJudgeEvaluationPromptChange?: (prompt: string) => void;
    scoringCategories?: ScoringCategory[];
    onScoringCategoriesChange?: (categories: ScoringCategory[]) => void;
}

export function PromptEditor({
                                 templates,
                                 onChange,
                                 comparisonEnabled = false,
                                 comparisonSubMode,
                                 judgeSystemPrompt,
                                 onJudgeSystemPromptChange,
                                 judgeEvaluationPrompt,
                                 onJudgeEvaluationPromptChange,
                                 scoringCategories,
                                 onScoringCategoriesChange,
                             }: PromptEditorProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    const hideGlobalPrompts = comparisonEnabled && comparisonSubMode === 'prompts';
    const showJudgeSection = comparisonEnabled;

    const handleCategoryChange = (index: number, field: keyof ScoringCategory, value: string | number) => {
        if (!scoringCategories || !onScoringCategoriesChange) return;
        const updated = [...scoringCategories];
        if (field === 'label' && typeof value === 'string') {
            // Auto-update key from label (camelCase)
            const key = value.trim().split(/\s+/)
                .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join('');
            updated[index] = {...updated[index], label: value, key};
        } else {
            updated[index] = {...updated[index], [field]: value};
        }
        onScoringCategoriesChange(updated);
    };

    const handleAddCategory = () => {
        if (!scoringCategories || !onScoringCategoriesChange) return;
        const key = `category_${Date.now()}`;
        onScoringCategoriesChange([
            ...scoringCategories,
            {key, label: '', description: '', minScore: 0, maxScore: 10},
        ]);
    };

    const handleRemoveCategory = (index: number) => {
        if (!scoringCategories || !onScoringCategoriesChange) return;
        onScoringCategoriesChange(scoringCategories.filter((_, i) => i !== index));
    };

    return (
        <div className="prompt-editor-section">
            <div
                className={`prompt-editor-section-title prompt-editor-toggle ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                Customize AI Prompts (Optional)
            </div>
            <div className={`prompt-editor-content ${isCollapsed ? 'content-collapsed' : ''}`}>
                {!hideGlobalPrompts && (
                    <>
                        <div className="prompt-editor-box">
                            <h4>System Prompt</h4>
                            <textarea
                                value={templates.systemPrompt}
                                onChange={(e) => onChange({...templates, systemPrompt: e.target.value})}
                            />
                            <p className="prompt-editor-field-help">
                                Instructs the AI how to generate descriptions (e.g., tone, style, focus areas). A
                                default prompt
                                optimized for government open data is provided.
                            </p>
                        </div>

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
                            Use
                            placeholders: {'{fileName}'}, {'{rowCount}'}, {'{columnInfo}'}, {'{datasetDescription}'},{' '}
                            {'{columnName}'}, {'{columnStats}'}
                        </p>
                    </>
                )}

                {hideGlobalPrompts && (
                    <p className="prompt-editor-help-text" style={{marginTop: 15}}>
                        System, dataset, and column prompts are configured per-variant in the Comparison Mode section
                        above.
                    </p>
                )}

                {showJudgeSection && (
                    <>
                        <div className="prompt-editor-box judge-prompt-box">
                            <h4>Judge System Prompt</h4>
                            <textarea
                                value={judgeSystemPrompt || ''}
                                onChange={(e) => onJudgeSystemPromptChange?.(e.target.value)}
                            />
                            <p className="prompt-editor-field-help">
                                Controls how the judge evaluates and scores candidate descriptions.
                            </p>
                        </div>

                        <div className="prompt-editor-box judge-prompt-box">
                            <h4>Judge Evaluation Prompt</h4>
                            <textarea
                                value={judgeEvaluationPrompt || ''}
                                onChange={(e) => onJudgeEvaluationPromptChange?.(e.target.value)}
                            />
                            <p className="prompt-editor-field-help">
                                Template for the evaluation request sent to the judge.
                                Use {'{context}'} and {'{output_N}'} placeholders.
                            </p>
                        </div>

                        {scoringCategories && onScoringCategoriesChange && (
                            <div className="prompt-editor-box judge-prompt-box">
                                <h4>Scoring Categories</h4>
                                {scoringCategories.map((cat, i) => (
                                    <div key={cat.key} style={{
                                        display: 'flex',
                                        gap: 8,
                                        marginBottom: 8,
                                        alignItems: 'center',
                                        flexWrap: 'wrap'
                                    }}>
                                        <input
                                            type="text"
                                            value={cat.label}
                                            onChange={(e) => handleCategoryChange(i, 'label', e.target.value)}
                                            placeholder="Label"
                                            style={{
                                                width: 120,
                                                padding: '4px 8px',
                                                fontSize: 13,
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={cat.description}
                                            onChange={(e) => handleCategoryChange(i, 'description', e.target.value)}
                                            placeholder="Description"
                                            style={{
                                                flex: 1,
                                                minWidth: 150,
                                                padding: '4px 8px',
                                                fontSize: 13,
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4
                                            }}
                                        />
                                        <input
                                            type="number"
                                            value={cat.minScore}
                                            onChange={(e) => handleCategoryChange(i, 'minScore', Number(e.target.value))}
                                            style={{
                                                width: 50,
                                                padding: '4px 8px',
                                                fontSize: 13,
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4
                                            }}
                                            title="Min score"
                                        />
                                        <span style={{fontSize: 12, color: '#6b7280'}}>-</span>
                                        <input
                                            type="number"
                                            value={cat.maxScore}
                                            onChange={(e) => handleCategoryChange(i, 'maxScore', Number(e.target.value))}
                                            style={{
                                                width: 50,
                                                padding: '4px 8px',
                                                fontSize: 13,
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4
                                            }}
                                            title="Max score"
                                        />
                                        <button
                                            onClick={() => handleRemoveCategory(i)}
                                            style={{
                                                background: 'none',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 4,
                                                color: '#9ca3af',
                                                cursor: 'pointer',
                                                padding: '2px 6px',
                                                fontSize: 14,
                                            }}
                                            title="Remove category"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={handleAddCategory}
                                    style={{
                                        marginTop: 4,
                                        padding: '4px 12px',
                                        fontSize: 13,
                                        border: '1px dashed #d1d5db',
                                        borderRadius: 4,
                                        background: 'transparent',
                                        color: '#6b7280',
                                        cursor: 'pointer',
                                    }}
                                >
                                    + Add Category
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
