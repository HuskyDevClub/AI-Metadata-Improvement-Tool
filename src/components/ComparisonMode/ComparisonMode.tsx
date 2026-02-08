import type { ComparisonConfig } from '../../types';
import { getModelColor } from '../../utils/modelColors';
import { generateDefaultEvaluationPrompt, generateJudgeSystemPrompt } from '../../hooks/useComparisonState';
import './ComparisonMode.css';

interface ComparisonModeProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    config: ComparisonConfig;
    onChange: (config: ComparisonConfig) => void;
    isGenerating?: boolean;
}

const MAX_MODELS = 5;
const MIN_MODELS = 2;

export function ComparisonMode({
                                   enabled,
                                   onToggle,
                                   config,
                                   onChange,
                                   isGenerating = false,
                               }: ComparisonModeProps) {
    const handleModelChange = (index: number, value: string) => {
        const newModels = [...config.models];
        newModels[index] = value;
        onChange({...config, models: newModels});
    };

    const handleJudgeModelChange = (value: string) => {
        onChange({...config, judgeModel: value});
    };

    const handleAddModel = () => {
        if (config.models.length >= MAX_MODELS || isGenerating) return;
        const newModels = [...config.models, ''];
        const newCount = newModels.length;
        onChange({
            ...config,
            models: newModels,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, newCount),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(newCount),
        });
    };

    const handleRemoveModel = (index: number) => {
        if (config.models.length <= MIN_MODELS || isGenerating) return;
        const newModels = config.models.filter((_, i) => i !== index);
        const newCount = newModels.length;
        onChange({
            ...config,
            models: newModels,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, newCount),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(newCount),
        });
    };

    return (
        <div className="comparison-mode-section">
            <div className="comparison-mode-header">
                <div className="comparison-mode-title">
                    <span>Comparison Mode</span>
                    <span className="comparison-mode-badge">Beta</span>
                </div>
                <label className="comparison-mode-toggle">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => onToggle(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{enabled ? 'ON' : 'OFF'}</span>
                </label>
            </div>

            {enabled && (
                <>
                    <p className="comparison-mode-description">
                        Compare outputs from {config.models.length} models side-by-side with AI-powered evaluation.
                        All models use the same API endpoint configured above.
                    </p>

                    <div className="comparison-models-config">
                        {config.models.map((modelName, index) => {
                            const color = getModelColor(index);
                            return (
                                <div
                                    key={index}
                                    className="model-input-group"
                                    style={{
                                        borderColor: color.border,
                                        background: `linear-gradient(135deg, ${color.lighter} 0%, ${color.light} 100%)`,
                                    }}
                                >
                                    <div className="model-input-header">
                                        <label
                                            htmlFor={`comparisonModel${index}`}
                                            style={{color: color.text}}
                                        >
                                            Model {index + 1}
                                        </label>
                                        {config.models.length > MIN_MODELS && (
                                            <button
                                                className="model-remove-btn"
                                                onClick={() => handleRemoveModel(index)}
                                                disabled={isGenerating}
                                                title={`Remove Model ${index + 1}`}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        id={`comparisonModel${index}`}
                                        type="text"
                                        placeholder={`e.g., gpt-4o${index > 0 ? '-mini' : ''}`}
                                        value={modelName}
                                        onChange={(e) => handleModelChange(index, e.target.value)}
                                    />
                                </div>
                            );
                        })}

                        {config.models.length < MAX_MODELS && (
                            <button
                                className="model-add-btn"
                                onClick={handleAddModel}
                                disabled={isGenerating}
                                title="Add another model"
                            >
                                + Add Model
                            </button>
                        )}

                        <div className="model-input-group judge">
                            <label htmlFor="comparisonJudgeModel">Judge Model</label>
                            <input
                                id="comparisonJudgeModel"
                                type="text"
                                placeholder="e.g., gpt-4o"
                                value={config.judgeModel}
                                onChange={(e) => handleJudgeModelChange(e.target.value)}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
