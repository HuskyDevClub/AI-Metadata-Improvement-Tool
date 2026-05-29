import { OpenAIConfig } from '../components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '../components/PromptEditor/PromptEditor';
import { SocrataApiConfig } from '../components/SocrataApiConfig/SocrataApiConfig';
import { SocrataDomainConfig } from '../components/SocrataDomainConfig/SocrataDomainConfig';
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
        socrataDomain,
        socrataDefaultDomain,
        handleSocrataDomainSave,
        enableConfigSave,
    } = useAppContext();

    return (
        <div className="settings-page">
            <SocrataDomainConfig
                key={socrataDomain || 'none'}
                domain={socrataDomain}
                defaultDomain={socrataDefaultDomain}
                onSave={handleSocrataDomainSave}
            />

            <SocrataApiConfig
                key={socrataApiKeyId || 'none'}
                keyId={socrataApiKeyId}
                onSave={handleSocrataApiKeySave}
                onClear={handleSocrataApiKeyClear}
                socrataDomain={socrataDomain}
                saveEnabled={enableConfigSave}
            />

            <OpenAIConfig
                key={`${openaiConfig.baseURL}-${isOpenAIConfigured}-${openaiConfig.model}-${openaiConfig.modelConcise ?? ''}-${openaiConfig.modelDetailed ?? ''}-${openaiConfig.modelSuggest ?? ''}`}
                config={openaiConfig}
                isConfigured={isOpenAIConfigured}
                onSave={handleOpenAIConfigSave}
                onClear={handleOpenAIConfigClear}
                saveEnabled={enableConfigSave}
            />

            <PromptEditor
                templates={promptTemplates}
                onChange={setPromptTemplates}
                openaiConfig={openaiConfig}
                socrataDomain={socrataDomain}
            />

            <footer className="settings-page-footer">
                <span className="settings-page-footer-credit">
                    <a
                        className="settings-page-footer-repo"
                        href="https://github.com/HuskyDevClub/AI-Metadata-Improvement-Tool"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        AI Metadata Improvement Tool
                    </a>
                    {' by Wynter Lin, Danny Yue, Felix Zhao, and Julia Zhu'}
                </span>
                <span className="settings-page-footer-version">
                    Build {__BUILD_DATE__} · commit {__BUILD_COMMIT__}
                </span>
            </footer>
        </div>
    );
}
