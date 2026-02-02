import type { ComparisonConfig } from '../../types';
import './ComparisonMode.css';

interface ComparisonModeProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    config: ComparisonConfig;
    onChange: (config: ComparisonConfig) => void;
}

export function ComparisonMode({
                                   enabled,
                                   onToggle,
                                   config,
                                   onChange,
                               }: ComparisonModeProps) {
    const handleChange = (field: keyof ComparisonConfig, value: string) => {
        onChange({...config, [field]: value});
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
                        Compare outputs from two models side-by-side with AI-powered evaluation.
                        All models use the same API endpoint configured above.
                    </p>

                    <div className="comparison-models-config">
                        <div className="model-input-group model-a">
                            <label htmlFor="comparisonModelA">Model A</label>
                            <input
                                id="comparisonModelA"
                                type="text"
                                placeholder="e.g., gpt-4o"
                                value={config.modelA}
                                onChange={(e) => handleChange('modelA', e.target.value)}
                            />
                        </div>
                        <div className="model-input-group model-b">
                            <label htmlFor="comparisonModelB">Model B</label>
                            <input
                                id="comparisonModelB"
                                type="text"
                                placeholder="e.g., gpt-4o-mini"
                                value={config.modelB}
                                onChange={(e) => handleChange('modelB', e.target.value)}
                            />
                        </div>
                        <div className="model-input-group judge">
                            <label htmlFor="comparisonJudgeModel">Judge Model</label>
                            <input
                                id="comparisonJudgeModel"
                                type="text"
                                placeholder="e.g., gpt-4o"
                                value={config.judgeModel}
                                onChange={(e) => handleChange('judgeModel', e.target.value)}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
