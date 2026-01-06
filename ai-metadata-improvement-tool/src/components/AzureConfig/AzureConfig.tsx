import type { AzureConfig as AzureConfigType } from '../../types';
import styles from './AzureConfig.module.css';

interface AzureConfigProps {
    config: AzureConfigType;
    onChange: (config: AzureConfigType) => void;
}

export function AzureConfig({config, onChange}: AzureConfigProps) {
    const handleChange = (field: keyof AzureConfigType, value: string) => {
        onChange({...config, [field]: value});
    };

    return (
        <div className={styles.section}>
            <div className={styles.sectionTitle}>Azure OpenAI Configuration</div>
            <div className={styles.configGrid}>
                <div className={styles.inputGroup}>
                    <label htmlFor="azureEndpoint">Azure OpenAI Endpoint *</label>
                    <input
                        id="azureEndpoint"
                        type="text"
                        placeholder="https://your-resource.openai.azure.com"
                        value={config.endpoint}
                        onChange={(e) => handleChange('endpoint', e.target.value)}
                    />
                    <span className={styles.helpText}>Your Azure OpenAI resource endpoint</span>
                </div>
                <div className={styles.inputGroup}>
                    <label htmlFor="azureKey">API Key *</label>
                    <input
                        id="azureKey"
                        type="password"
                        placeholder="Your Azure OpenAI API key"
                        value={config.key}
                        onChange={(e) => handleChange('key', e.target.value)}
                    />
                    <span className={styles.helpText}>Found in Azure Portal under Keys and Endpoint</span>
                </div>
                <div className={styles.inputGroup}>
                    <label htmlFor="azureDeployment">Deployment Name *</label>
                    <input
                        id="azureDeployment"
                        type="text"
                        placeholder="gpt-4"
                        value={config.deployment}
                        onChange={(e) => handleChange('deployment', e.target.value)}
                    />
                    <span className={styles.helpText}>Your model deployment name (e.g., gpt-4, gpt-35-turbo)</span>
                </div>
            </div>
        </div>
    );
}
