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
