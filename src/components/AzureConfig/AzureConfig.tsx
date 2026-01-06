import type { AzureConfig as AzureConfigType } from '../../types';
import './AzureConfig.css';

interface AzureConfigProps {
    config: AzureConfigType;
    onChange: (config: AzureConfigType) => void;
}

export function AzureConfig({config, onChange}: AzureConfigProps) {
    const handleChange = (field: keyof AzureConfigType, value: string) => {
        onChange({...config, [field]: value});
    };

    return (
        <div className="azure-config-section">
            <div className="azure-config-section-title">Azure OpenAI Configuration</div>
            <div className="azure-config-grid">
                <div className="azure-config-input-group">
                    <label htmlFor="azureEndpoint">Azure OpenAI Endpoint *</label>
                    <input
                        id="azureEndpoint"
                        type="text"
                        placeholder="https://your-resource.openai.azure.com"
                        value={config.endpoint}
                        onChange={(e) => handleChange('endpoint', e.target.value)}
                    />
                    <span className="azure-config-help-text">Your Azure OpenAI resource endpoint</span>
                </div>
                <div className="azure-config-input-group">
                    <label htmlFor="azureKey">API Key *</label>
                    <input
                        id="azureKey"
                        type="password"
                        placeholder="Your Azure OpenAI API key"
                        value={config.key}
                        onChange={(e) => handleChange('key', e.target.value)}
                    />
                    <span className="azure-config-help-text">Found in Azure Portal under Keys and Endpoint</span>
                </div>
                <div className="azure-config-input-group">
                    <label htmlFor="azureDeployment">Deployment Name *</label>
                    <input
                        id="azureDeployment"
                        type="text"
                        placeholder="gpt-4"
                        value={config.deployment}
                        onChange={(e) => handleChange('deployment', e.target.value)}
                    />
                    <span
                        className="azure-config-help-text">Your model deployment name (e.g., gpt-4, gpt-35-turbo)</span>
                </div>
            </div>
        </div>
    );
}
