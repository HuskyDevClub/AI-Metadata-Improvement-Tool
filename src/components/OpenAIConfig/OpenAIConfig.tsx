import type { OpenAIConfig as OpenAIConfigType } from '../../types';
import './OpenAIConfig.css';

interface OpenAIConfigProps {
    config: OpenAIConfigType;
    onChange: (config: OpenAIConfigType) => void;
    showModel?: boolean;
}

export function OpenAIConfig({
                                 config,
                                 onChange,
                                 showModel = true,
                             }: OpenAIConfigProps) {
    const handleChange = (field: keyof OpenAIConfigType, value: string) => {
        onChange({...config, [field]: value});
    };

    return (
        <div className="openai-config-section">
            <div className="openai-config-section-title">API Configuration</div>
            <div className="openai-config-grid">
                <div className="openai-config-input-group">
                    <label htmlFor="openaiBaseURL">Base URL *</label>
                    <input
                        id="openaiBaseURL"
                        type="text"
                        placeholder="https://api.openai.com/v1"
                        value={config.baseURL}
                        onChange={(e) => handleChange('baseURL', e.target.value)}
                    />
                    <span className="openai-config-help-text">API base URL (use default for OpenAI, or custom for compatible APIs)</span>
                </div>
                <div className="openai-config-input-group">
                    <label htmlFor="openaiKey">API Key *</label>
                    <input
                        id="openaiKey"
                        type="password"
                        placeholder="Your API key"
                        value={config.apiKey}
                        onChange={(e) => handleChange('apiKey', e.target.value)}
                    />
                    <span className="openai-config-help-text">Your API key</span>
                </div>
                {showModel && (
                    <div className="openai-config-input-group">
                        <label htmlFor="openaiModel">Model *</label>
                        <input
                            id="openaiModel"
                            type="text"
                            placeholder="e.g., gpt-5, gpt-4o, gpt-4-turbo"
                            value={config.model}
                            onChange={(e) => handleChange('model', e.target.value)}
                        />
                        <span className="openai-config-help-text">Model name (e.g., gpt-5, gpt-4o, gpt-4-turbo)</span>
                    </div>
                )}
            </div>
        </div>
    );
}
