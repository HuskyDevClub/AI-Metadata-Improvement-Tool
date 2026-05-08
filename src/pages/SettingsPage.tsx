import { OpenAIConfig } from '../components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '../components/PromptEditor/PromptEditor';
import { SocrataApiConfig } from '../components/SocrataApiConfig/SocrataApiConfig';
import { useAppContext } from '../contexts/AppContext';
import './SettingsPage.css';

export function SettingsPage() {
    const {
        openaiConfig,
        isOpenAIConfigured,
        handleOpenAIConfigSave,
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
                    key={`${openaiConfig.baseURL}-${isOpenAIConfigured}-${openaiConfig.model}-${openaiConfig.modelConcise ?? ''}-${openaiConfig.modelDetailed ?? ''}-${openaiConfig.modelSuggest ?? ''}`}
                    config={openaiConfig}
                    isConfigured={isOpenAIConfigured}
                    onSave={handleOpenAIConfigSave}
                    onClear={handleOpenAIConfigClear}
                />
            </div>

            <div className="settings-page-section">
                <SocrataApiConfig
                    key={socrataApiKeyId || 'none'}
                    keyId={socrataApiKeyId}
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
