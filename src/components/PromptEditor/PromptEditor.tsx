import { useState } from 'react';
import type { PromptTemplates, ScoringCategory } from '../../types';
import { ScoringCategoryEditor } from './ScoringCategoryEditor';
import './PromptEditor.css';

interface PromptEditorProps {
    templates: PromptTemplates;
    onChange: (templates: PromptTemplates) => void;
    comparisonEnabled?: boolean;
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
                                 comparisonEnabled,
                                 judgeSystemPrompt,
                                 onJudgeSystemPromptChange,
                                 judgeEvaluationPrompt,
                                 onJudgeEvaluationPromptChange,
                                 scoringCategories,
                                 onScoringCategoriesChange
                             }: PromptEditorProps) {
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
                    <h4>System Prompt</h4>
                    <textarea
                        value={templates.systemPrompt}
                        onChange={(e) => onChange({...templates, systemPrompt: e.target.value})}
                        placeholder="Enter the system prompt that defines the AI's behavior..."
                        rows={6}
                    />
                    <p className="prompt-editor-field-help">
                        Instructs the AI how to generate descriptions (e.g., tone, style, focus areas). A default prompt
                        optimized for government open data is provided.
                    </p>
                </div>

                {comparisonEnabled && scoringCategories && onScoringCategoriesChange && (
                    <ScoringCategoryEditor
                        categories={scoringCategories}
                        onChange={onScoringCategoriesChange}
                    />
                )}

                {comparisonEnabled && onJudgeSystemPromptChange && (
                    <div className="prompt-editor-box judge-prompt-box">
                        <h4>Judge System Prompt</h4>
                        <textarea
                            value={judgeSystemPrompt}
                            onChange={(e) => onJudgeSystemPromptChange(e.target.value)}
                            placeholder="Enter the system prompt for the judge model..."
                            rows={15}
                        />
                        <p className="prompt-editor-field-help">
                            Define how the judge model evaluates outputs. Include the scoring criteria and JSON response
                            format.
                        </p>
                    </div>
                )}

                {comparisonEnabled && onJudgeEvaluationPromptChange && (
                    <div className="prompt-editor-box judge-prompt-box">
                        <h4>Judge Evaluation Prompt</h4>
                        <textarea
                            value={judgeEvaluationPrompt}
                            onChange={(e) => onJudgeEvaluationPromptChange(e.target.value)}
                            placeholder="Enter the evaluation prompt template for the judge model..."
                            rows={8}
                        />
                        <p className="prompt-editor-field-help">
                            Template for the user message sent to the judge. Use placeholders: {'{context}'},{' '}
                            {'{candidateA}'}, {'{candidateB}'}.
                        </p>
                    </div>
                )}

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
