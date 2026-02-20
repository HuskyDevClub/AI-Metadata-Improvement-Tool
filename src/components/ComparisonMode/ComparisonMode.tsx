import type { ComparisonConfig, ComparisonSubMode, PromptTemplates } from '../../types';
import { getModelColor } from '../../utils/modelColors';
import {
    createDefaultPromptVariant,
    generateDefaultEvaluationPrompt,
    generateJudgeSystemPrompt
} from '../../hooks/useComparisonState';
import { PromptVariantEditor } from './PromptVariantEditor';
import './ComparisonMode.css';

interface ComparisonModeProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    config: ComparisonConfig;
    onChange: (config: ComparisonConfig) => void;
    isGenerating: boolean;
    promptTemplates: PromptTemplates;
}

const MAX_SLOTS = 5;
const MIN_SLOTS = 2;

export function ComparisonMode({
                                   enabled,
                                   onToggle,
                                   config,
                                   onChange,
                                   isGenerating,
                                   promptTemplates,
                               }: ComparisonModeProps) {
    const handleSubModeChange = (subMode: ComparisonSubMode) => {
        if (subMode === config.subMode || isGenerating) return;

        if (subMode === 'prompts') {
            // Switch to prompt mode: initialize variants from current global templates
            const variants = config.promptVariants.length >= MIN_SLOTS
                ? config.promptVariants
                : Array.from({length: MIN_SLOTS}, (_, i) =>
                    createDefaultPromptVariant(i, promptTemplates)
                );
            const labelPrefix = 'Prompt';
            onChange({
                ...config,
                subMode,
                promptVariants: variants,
                judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, variants.length, labelPrefix),
                judgeEvaluationPrompt: generateDefaultEvaluationPrompt(variants.length, labelPrefix),
            });
        } else {
            // Switch to model mode
            const models = config.models.length >= MIN_SLOTS
                ? config.models
                : Array(MIN_SLOTS).fill('');
            const labelPrefix = 'Model';
            onChange({
                ...config,
                subMode,
                models,
                judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, models.length, labelPrefix),
                judgeEvaluationPrompt: generateDefaultEvaluationPrompt(models.length, labelPrefix),
            });
        }
    };

    const handleModelChange = (index: number, value: string) => {
        const models = [...config.models];
        models[index] = value;
        onChange({...config, models});
    };

    const handleAddModel = () => {
        if (config.models.length >= MAX_SLOTS) return;
        const models = [...config.models, ''];
        onChange({
            ...config,
            models,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, models.length),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(models.length),
        });
    };

    const handleRemoveModel = (index: number) => {
        if (config.models.length <= MIN_SLOTS) return;
        const models = config.models.filter((_, i) => i !== index);
        onChange({
            ...config,
            models,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, models.length),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(models.length),
        });
    };

    const handleVariantChange = (index: number, variant: typeof config.promptVariants[number]) => {
        const variants = [...config.promptVariants];
        variants[index] = variant;
        onChange({...config, promptVariants: variants});
    };

    const handleAddVariant = () => {
        if (config.promptVariants.length >= MAX_SLOTS) return;
        const variants = [...config.promptVariants, createDefaultPromptVariant(config.promptVariants.length, promptTemplates)];
        onChange({
            ...config,
            promptVariants: variants,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, variants.length, 'Prompt'),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(variants.length, 'Prompt'),
        });
    };

    const handleRemoveVariant = (index: number) => {
        if (config.promptVariants.length <= MIN_SLOTS) return;
        const variants = config.promptVariants.filter((_, i) => i !== index);
        onChange({
            ...config,
            promptVariants: variants,
            judgeSystemPrompt: generateJudgeSystemPrompt(config.scoringCategories, variants.length, 'Prompt'),
            judgeEvaluationPrompt: generateDefaultEvaluationPrompt(variants.length, 'Prompt'),
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
                        Compare outputs side-by-side with AI-powered evaluation.
                        All models use the same API endpoint configured above.
                    </p>

                    <div className="comparison-submode-toggle">
                        <button
                            className={`submode-btn ${config.subMode === 'models' ? 'active' : ''}`}
                            onClick={() => handleSubModeChange('models')}
                            disabled={isGenerating}
                        >
                            Compare Models
                        </button>
                        <button
                            className={`submode-btn ${config.subMode === 'prompts' ? 'active' : ''}`}
                            onClick={() => handleSubModeChange('prompts')}
                            disabled={isGenerating}
                        >
                            Compare Prompts
                        </button>
                    </div>

                    {config.subMode === 'models' ? (
                        <div className="comparison-models-config">
                            {config.models.map((modelName, i) => {
                                const color = getModelColor(i);
                                return (
                                    <div
                                        key={i}
                                        className="model-input-group"
                                        style={{
                                            borderColor: color.border,
                                            background: `linear-gradient(135deg, ${color.lighter} 0%, ${color.light} 100%)`
                                        }}
                                    >
                                        <div className="model-input-header">
                                            <label htmlFor={`comparisonModel${i}`} style={{color: color.text}}>
                                                Model {i + 1}
                                            </label>
                                            {config.models.length > MIN_SLOTS && (
                                                <button
                                                    className="model-remove-btn"
                                                    onClick={() => handleRemoveModel(i)}
                                                    disabled={isGenerating}
                                                    title={`Remove Model ${i + 1}`}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            id={`comparisonModel${i}`}
                                            type="text"
                                            placeholder="e.g., gpt-4o"
                                            value={modelName}
                                            onChange={(e) => handleModelChange(i, e.target.value)}
                                        />
                                    </div>
                                );
                            })}
                            {config.models.length < MAX_SLOTS && (
                                <button
                                    className="model-add-btn"
                                    onClick={handleAddModel}
                                    disabled={isGenerating}
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
                                    onChange={(e) => onChange({...config, judgeModel: e.target.value})}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="comparison-prompts-config">
                            <div className="model-input-group prompt-model">
                                <label htmlFor="promptModel">Model (shared)</label>
                                <input
                                    id="promptModel"
                                    type="text"
                                    placeholder="e.g., gpt-4o"
                                    value={config.promptModel}
                                    onChange={(e) => onChange({...config, promptModel: e.target.value})}
                                />
                            </div>

                            <div className="prompt-variants-list">
                                {config.promptVariants.map((variant, i) => (
                                    <PromptVariantEditor
                                        key={i}
                                        index={i}
                                        variant={variant}
                                        onChange={(v) => handleVariantChange(i, v)}
                                        onRemove={() => handleRemoveVariant(i)}
                                        canRemove={config.promptVariants.length > MIN_SLOTS}
                                        isGenerating={isGenerating}
                                    />
                                ))}
                            </div>

                            {config.promptVariants.length < MAX_SLOTS && (
                                <button
                                    className="model-add-btn"
                                    onClick={handleAddVariant}
                                    disabled={isGenerating}
                                >
                                    + Add Prompt Variant
                                </button>
                            )}

                            <div className="model-input-group judge">
                                <label htmlFor="comparisonJudgeModelPrompt">Judge Model</label>
                                <input
                                    id="comparisonJudgeModelPrompt"
                                    type="text"
                                    placeholder="e.g., gpt-4o"
                                    value={config.judgeModel}
                                    onChange={(e) => onChange({...config, judgeModel: e.target.value})}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
