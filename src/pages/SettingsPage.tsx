import { useEffect } from 'react';
import { OpenAIConfig } from '@/components/OpenAIConfig/OpenAIConfig';
import { PromptEditor } from '@/components/PromptEditor/PromptEditor';
import { SocrataApiConfig } from '@/components/SocrataApiConfig/SocrataApiConfig';
import { SocrataDomainConfig } from '@/components/SocrataDomainConfig/SocrataDomainConfig';
import { useAppContext } from '@/contexts/AppContext';
import '@/pages/SettingsPage.css';

export function SettingsPage({ onClose }: { onClose: () => void }) {
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

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Defer to a nested prompt sub-modal if one is open — its own
            // Escape handler should close it first, not this whole panel.
            if (e.key === 'Escape' && !document.querySelector('.prompt-reset-modal-backdrop')) {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="settings-modal-backdrop" onClick={ onClose }>
            <div
                className="modal-panel settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                onClick={ (e) => e.stopPropagation() }
            >
                <header className="settings-modal-header">
                    <h2 id="settings-modal-title" className="settings-modal-title">Settings</h2>
                    <button
                        type="button"
                        className="btn-square settings-modal-close"
                        onClick={ onClose }
                        aria-label="Close settings"
                        title="Close"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </header>

                <div className="settings-modal-body">
                    <SocrataDomainConfig
                        key={ socrataDomain || 'none' }
                        domain={ socrataDomain }
                        defaultDomain={ socrataDefaultDomain }
                        onSave={ handleSocrataDomainSave }
                    />

                    <SocrataApiConfig
                        key={ socrataApiKeyId || 'none' }
                        keyId={ socrataApiKeyId }
                        onSave={ handleSocrataApiKeySave }
                        onClear={ handleSocrataApiKeyClear }
                        socrataDomain={ socrataDomain }
                        saveEnabled={ enableConfigSave }
                    />

                    <OpenAIConfig
                        key={ `${ openaiConfig.baseURL }-${ isOpenAIConfigured }-${ openaiConfig.model }-${ openaiConfig.modelConcise ?? '' }-${ openaiConfig.modelDetailed ?? '' }-${ openaiConfig.modelSuggest ?? '' }` }
                        config={ openaiConfig }
                        isConfigured={ isOpenAIConfigured }
                        onSave={ handleOpenAIConfigSave }
                        onClear={ handleOpenAIConfigClear }
                        saveEnabled={ enableConfigSave }
                    />

                    <PromptEditor
                        templates={ promptTemplates }
                        onChange={ setPromptTemplates }
                        openaiConfig={ openaiConfig }
                        socrataDomain={ socrataDomain }
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
                            { ' by Wynter Lin, Danny Yue, Felix Zhao, and Julia Zhu' }
                        </span>
                        <span className="settings-page-footer-version">
                            Build { __BUILD_DATE__ } · commit { __BUILD_COMMIT__ }
                        </span>
                    </footer>
                </div>
            </div>
        </div>
    );
}
