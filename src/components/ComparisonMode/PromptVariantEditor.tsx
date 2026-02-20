import { useState } from 'react';
import type { PromptVariant } from '../../types';
import { getModelColor } from '../../utils/modelColors';
import './PromptVariantEditor.css';

interface PromptVariantEditorProps {
    index: number;
    variant: PromptVariant;
    onChange: (variant: PromptVariant) => void;
    onRemove: () => void;
    canRemove: boolean;
    isGenerating: boolean;
}

export function PromptVariantEditor({
                                        index,
                                        variant,
                                        onChange,
                                        onRemove,
                                        canRemove,
                                        isGenerating,
                                    }: PromptVariantEditorProps) {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const color = getModelColor(index);

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    return (
        <div
            className="prompt-variant-card"
            style={{
                borderColor: color.border,
                background: `linear-gradient(135deg, ${color.lighter} 0%, ${color.light} 100%)`,
            }}
        >
            <div className="prompt-variant-header">
                <label style={{color: color.text}}>
                    Prompt {index + 1}
                </label>
                {canRemove && (
                    <button
                        className="model-remove-btn"
                        onClick={onRemove}
                        disabled={isGenerating}
                        title={`Remove Prompt ${index + 1}`}
                    >
                        ×
                    </button>
                )}
            </div>

            <div className="prompt-variant-label-row">
                <input
                    type="text"
                    placeholder={`Prompt ${index + 1}`}
                    value={variant.label}
                    onChange={(e) => onChange({...variant, label: e.target.value})}
                    className="prompt-variant-label-input"
                />
            </div>

            <div className="prompt-variant-sections">
                <div className="prompt-variant-section">
                    <div
                        className={`prompt-variant-section-toggle ${expandedSections.has('system') ? 'expanded' : ''}`}
                        onClick={() => toggleSection('system')}
                    >
                        System Prompt
                    </div>
                    {expandedSections.has('system') && (
                        <textarea
                            value={variant.systemPrompt}
                            onChange={(e) => onChange({...variant, systemPrompt: e.target.value})}
                            placeholder="Enter system prompt for this variant..."
                            rows={5}
                            className="prompt-variant-textarea"
                        />
                    )}
                </div>

                <div className="prompt-variant-section">
                    <div
                        className={`prompt-variant-section-toggle ${expandedSections.has('dataset') ? 'expanded' : ''}`}
                        onClick={() => toggleSection('dataset')}
                    >
                        Dataset Prompt Template
                    </div>
                    {expandedSections.has('dataset') && (
                        <textarea
                            value={variant.datasetPrompt}
                            onChange={(e) => onChange({...variant, datasetPrompt: e.target.value})}
                            placeholder="Enter dataset description prompt template..."
                            rows={5}
                            className="prompt-variant-textarea"
                        />
                    )}
                </div>

                <div className="prompt-variant-section">
                    <div
                        className={`prompt-variant-section-toggle ${expandedSections.has('column') ? 'expanded' : ''}`}
                        onClick={() => toggleSection('column')}
                    >
                        Column Prompt Template
                    </div>
                    {expandedSections.has('column') && (
                        <textarea
                            value={variant.columnPrompt}
                            onChange={(e) => onChange({...variant, columnPrompt: e.target.value})}
                            placeholder="Enter column description prompt template..."
                            rows={5}
                            className="prompt-variant-textarea"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
