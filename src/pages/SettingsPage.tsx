import { OpenAIConfig } from '../components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '../components/PromptEditor/PromptEditor';
import { useAppContext } from '../contexts/AppContext';
import './SettingsPage.css';

export function SettingsPage() {
    const {
        openaiConfig,
        handleOpenAIConfigChange,
        promptTemplates,
        setPromptTemplates,
    } = useAppContext();

    return (
        <div className="settings-page">
            <div className="settings-page-section">
                <OpenAIConfig
                    config={openaiConfig}
                    onChange={handleOpenAIConfigChange}
                />
            </div>

            <div className="settings-page-section">
                <PromptEditor
                    templates={promptTemplates}
                    onChange={setPromptTemplates}
                />
            </div>
        </div>
    );
}
