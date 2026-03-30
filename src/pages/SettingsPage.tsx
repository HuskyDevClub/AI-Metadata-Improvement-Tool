import { OpenAIConfig } from '../components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '../components/PromptEditor/PromptEditor';
import { useAppContext } from '../contexts/AppContext';
import './SettingsPage.css';

export function SettingsPage() {
    const {
        openaiConfig,
        handleOpenAIConfigChange,
        comparisonEnabled,
        comparisonConfig,
        promptTemplates,
        setPromptTemplates,
        handleScoringCategoriesChange,
        setComparisonConfig,
        socrataCredentials,
        handleSocrataCredentialsChange,
    } = useAppContext();

    return (
        <div className="settings-page">
            <div className="settings-page-section">
                <OpenAIConfig
                    config={openaiConfig}
                    onChange={handleOpenAIConfigChange}
                    showModel={!comparisonEnabled}
                />
            </div>

            <div className="settings-page-section">
                <div className="openai-config-section">
                    <div className="openai-config-section-title">Socrata / data.wa.gov</div>
                    <div className="openai-config-grid">
                        <div className="openai-config-input-group">
                            <label htmlFor="socrataAppToken">App Token</label>
                            <input
                                id="socrataAppToken"
                                type="password"
                                placeholder="Your Socrata app token"
                                value={socrataCredentials.appToken || ''}
                                onChange={(e) => handleSocrataCredentialsChange({ appToken: e.target.value || undefined })}
                            />
                            <span className="openai-config-help-text">Required for Socrata API access</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-page-section">
                <PromptEditor
                    templates={promptTemplates}
                    onChange={setPromptTemplates}
                    comparisonEnabled={comparisonEnabled}
                    comparisonSubMode={comparisonConfig.subMode}
                    judgeSystemPrompt={comparisonConfig.judgeSystemPrompt}
                    onJudgeSystemPromptChange={(prompt) =>
                        setComparisonConfig((prev) => ({ ...prev, judgeSystemPrompt: prompt }))
                    }
                    judgeEvaluationPrompt={comparisonConfig.judgeEvaluationPrompt}
                    onJudgeEvaluationPromptChange={(prompt) =>
                        setComparisonConfig((prev) => ({ ...prev, judgeEvaluationPrompt: prompt }))
                    }
                    scoringCategories={comparisonConfig.scoringCategories}
                    onScoringCategoriesChange={handleScoringCategoriesChange}
                />
            </div>
        </div>
    );
}
