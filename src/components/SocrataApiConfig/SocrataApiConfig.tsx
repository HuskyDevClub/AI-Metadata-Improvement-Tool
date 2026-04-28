import { useState } from 'react';
import './SocrataApiConfig.css';

interface SocrataApiConfigProps {
    keyId: string;
    keySecret: string;
    onSave: (keyId: string, keySecret: string) => void;
    onClear: () => void;
}

export function SocrataApiConfig({
                                     keyId,
                                     keySecret,
                                     onSave,
                                     onClear,
                                 }: SocrataApiConfigProps) {
    const [keyIdInput, setKeyIdInput] = useState(keyId);
    const [keySecretInput, setKeySecretInput] = useState(keySecret);
    const [showSecret, setShowSecret] = useState(false);

    const dirty = keyIdInput !== keyId || keySecretInput !== keySecret;
    const canSave = dirty && keyIdInput.trim() !== '' && keySecretInput.trim() !== '';
    const hasSaved = !!(keyId && keySecret);

    return (
        <div className="socrata-api-config-section">
            <div className="socrata-api-config-section-title">data.wa.gov API Credentials</div>
            <div className="socrata-api-config-grid">
                <div className="socrata-api-config-input-group">
                    <label htmlFor="socrataSettingsApiKeyId">API Key ID *</label>
                    <input
                        id="socrataSettingsApiKeyId"
                        type="text"
                        placeholder="Your Socrata API Key ID"
                        value={keyIdInput}
                        onChange={(e) => setKeyIdInput(e.target.value)}
                    />
                </div>
                <div className="socrata-api-config-input-group">
                    <label htmlFor="socrataSettingsApiKeySecret">API Key Secret *</label>
                    <div className="socrata-api-config-input-wrapper">
                        <input
                            id="socrataSettingsApiKeySecret"
                            type={showSecret ? 'text' : 'password'}
                            placeholder="Your Socrata API Key Secret"
                            value={keySecretInput}
                            onChange={(e) => setKeySecretInput(e.target.value)}
                        />
                        <button
                            type="button"
                            className="socrata-api-config-reveal-btn"
                            onClick={() => setShowSecret((v) => !v)}
                            aria-label={showSecret ? 'Hide API key secret' : 'Show API key secret'}
                            title={showSecret ? 'Hide API key secret' : 'Show API key secret'}
                        >
                            {showSecret ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path
                                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                    <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            <div className="socrata-api-config-actions">
                <button
                    type="button"
                    className="socrata-api-config-save-btn"
                    onClick={() => onSave(keyIdInput.trim(), keySecretInput.trim())}
                    disabled={!canSave}
                >
                    {hasSaved ? 'Update keys' : 'Save keys'}
                </button>
                <button
                    type="button"
                    className="socrata-api-config-clear-btn"
                    onClick={() => {
                        if (window.confirm('Clear saved Socrata API credentials? This will remove the API Key ID and Secret from this browser.')) {
                            onClear();
                            setKeyIdInput('');
                            setKeySecretInput('');
                        }
                    }}
                    disabled={!hasSaved && keyIdInput === '' && keySecretInput === ''}
                >
                    Clear
                </button>
            </div>
            <span className="socrata-api-config-help-text">
                Generate API keys from your data.wa.gov profile &gt; Developer Settings. Keys are stored locally in your browser.
            </span>
        </div>
    );
}
