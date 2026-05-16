import { useState } from 'react';
import './SocrataApiConfig.css';

interface SocrataApiConfigProps {
    keyId: string;
    onSave: (keyId: string, keySecret: string) => Promise<void>;
    onClear: () => void;
    socrataDomain: string | null;
}

export function SocrataApiConfig({
                                     keyId,
                                     onSave,
                                     onClear,
                                     socrataDomain,
                                 }: SocrataApiConfigProps) {
    const [keyIdInput, setKeyIdInput] = useState(keyId);
    const [keySecretInput, setKeySecretInput] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const isConfigured = !!keyId;
    const dirty = keyIdInput !== keyId || keySecretInput !== '';
    const canSave = !isSaving && (dirty || !isConfigured) && keyIdInput.trim() !== '' && (isConfigured ? true : keySecretInput.trim() !== '');

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(keyIdInput.trim(), keySecretInput.trim());
            setKeySecretInput('');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="socrata-api-config-section">
            <div className="socrata-api-config-header">
                <div className="socrata-api-config-section-title">
                    {socrataDomain ? `${socrataDomain} API Credentials` : 'API Credentials'}
                </div>
                {isConfigured && !dirty && (
                    <span className="socrata-api-config-status-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Configured
                    </span>
                )}
            </div>
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
                    <label htmlFor="socrataSettingsApiKeySecret">API Key Secret {isConfigured ? '(Saved)' : '*'}</label>
                    <div className="socrata-api-config-input-wrapper">
                        <input
                            id="socrataSettingsApiKeySecret"
                            type={showSecret ? 'text' : 'password'}
                            placeholder={isConfigured ? '••••••••••••••••' : 'Your Socrata API Key Secret'}
                            value={keySecretInput}
                            onChange={(e) => setKeySecretInput(e.target.value)}
                        />
                        <button
                            type="button"
                            className="socrata-api-config-reveal-btn"
                            onClick={() => setShowSecret((v) => !v)}
                            disabled={!keySecretInput}
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
                    onClick={handleSave}
                    disabled={!canSave}
                >
                    {isSaving ? 'Saving...' : isConfigured ? 'Update keys' : 'Save keys'}
                </button>
                <button
                    type="button"
                    className="socrata-api-config-clear-btn"
                    onClick={() => {
                        if (window.confirm('Clear saved Socrata API credentials? This will remove the API configuration from the server-side session.')) {
                            onClear();
                            setKeyIdInput('');
                            setKeySecretInput('');
                        }
                    }}
                    disabled={!isConfigured && keyIdInput === '' && keySecretInput === ''}
                >
                    Clear
                </button>
                {dirty && !isSaving && (
                    <span className="socrata-api-config-dirty-hint">Unsaved changes</span>
                )}
            </div>
            <span className="socrata-api-config-help-text">
                {socrataDomain && (
                    <>Generate API keys from your {socrataDomain} profile &gt; Developer Settings.{' '}</>
                )}
                Keys are stored in an encrypted server-side session cookie.
            </span>
        </div>
    );
}
