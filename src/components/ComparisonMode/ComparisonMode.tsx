import type { ComparisonConfig, OpenAIConfig } from '../../types';
import './ComparisonMode.css';

interface ComparisonModeProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    config: ComparisonConfig;
    onChange: (config: ComparisonConfig) => void;
    defaultConfig: OpenAIConfig;
}

export function ComparisonMode({
                                   enabled,
                                   onToggle,
                                   config,
                                   onChange,
                                   defaultConfig,
                               }: ComparisonModeProps) {
    const handleChange = (field: keyof ComparisonConfig, value: string) => {
        onChange({...config, [field]: value});
    };

    const copyFromDefault = () => {
        onChange({
            ...config,
            baseURL: defaultConfig.baseURL,
            apiKey: defaultConfig.apiKey,
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
                        Compare outputs from two models side-by-side with AI-powered evaluation.
                        All models use the same API endpoint.
                    </p>

                    <div className="comparison-shared-config">
                        <div className="shared-config-header">
                            <span className="shared-config-title">API Configuration</span>
                            <button
                                className="copy-default-btn"
                                onClick={copyFromDefault}
                                title="Copy from default OpenAI configuration"
                            >
                                Copy from default
                            </button>
                        </div>
                        <div className="shared-config-fields">
                            <div className="config-input-group">
                                <label>Base URL</label>
                                <input
                                    type="text"
                                    placeholder="https://api.openai.com/v1"
                                    value={config.baseURL}
                                    onChange={(e) => handleChange('baseURL', e.target.value)}
                                />
                            </div>
                            <div className="config-input-group">
                                <label>API Key</label>
                                <input
                                    type="password"
                                    placeholder="API key"
                                    value={config.apiKey}
                                    onChange={(e) => handleChange('apiKey', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="comparison-models-config">
                        <div className="model-input-group model-a">
                            <label>Model A</label>
                            <input
                                type="text"
                                placeholder="e.g., gpt-4o"
                                value={config.modelA}
                                onChange={(e) => handleChange('modelA', e.target.value)}
                            />
                        </div>
                        <div className="model-input-group model-b">
                            <label>Model B</label>
                            <input
                                type="text"
                                placeholder="e.g., gpt-4o-mini"
                                value={config.modelB}
                                onChange={(e) => handleChange('modelB', e.target.value)}
                            />
                        </div>
                        <div className="model-input-group judge">
                            <label>Judge Model</label>
                            <input
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
