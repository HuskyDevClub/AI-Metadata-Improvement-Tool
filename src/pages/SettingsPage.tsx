import { OpenAIConfig } from '../components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '../components/PromptEditor/PromptEditor';
import { SocrataApiConfig } from '../components/SocrataApiConfig/SocrataApiConfig';
import { useAppContext } from '../contexts/AppContext';
import './SettingsPage.css';

export function SettingsPage() {
    const {
        openaiConfig,
        handleOpenAIConfigChange,
        handleOpenAIConfigClear,
        promptTemplates,
        setPromptTemplates,
        socrataApiKeyId,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
    } = useAppContext();

    return (
        <div className="settings-page">
            <div className="settings-page-section">
                <OpenAIConfig
                    key={`${openaiConfig.baseURL}-${openaiConfig.apiKey}-${openaiConfig.model}`}
                    config={openaiConfig}
                    onChange={handleOpenAIConfigChange}
                    onClear={handleOpenAIConfigClear}
                />
            </div>

            <div className="settings-page-section">
                <SocrataApiConfig
                    key={socrataApiKeyId || 'none'}
                    keyId={socrataApiKeyId}
                    keySecret=""
                    onSave={handleSocrataApiKeySave}
                    onClear={handleSocrataApiKeyClear}
                />
            </div>

            <div className="settings-page-section">
                <PromptEditor
                    templates={promptTemplates}
                    onChange={setPromptTemplates}
                    openaiConfig={openaiConfig}
                />
            </div>
        </div>
    );
}
