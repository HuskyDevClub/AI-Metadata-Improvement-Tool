import { useEffect, useState } from 'react';
import type { OpenAIConfig as OpenAIConfigType } from '../../types';
import './OpenAIConfig.css';

interface OpenAIConfigProps {
    config: OpenAIConfigType;
    onChange: (config: OpenAIConfigType) => void;
    onClear?: () => void;
    showModel?: boolean;
}

export function OpenAIConfig({
                                 config,
                                 onChange,
                                 onClear,
                                 showModel = true,
                             }: OpenAIConfigProps) {
    const [baseURLInput, setBaseURLInput] = useState(config.baseURL);
    const [apiKeyInput, setApiKeyInput] = useState(config.apiKey);
    const [modelInput, setModelInput] = useState(config.model);
    const [showApiKey, setShowApiKey] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    useEffect(() => {
        setBaseURLInput(config.baseURL);
        setApiKeyInput(config.apiKey);
        setModelInput(config.model);
    }, [config.baseURL, config.apiKey, config.model]);

    const dirty =
        baseURLInput !== config.baseURL ||
        apiKeyInput !== config.apiKey ||
        modelInput !== config.model;

    const canSave =
        dirty &&
        baseURLInput.trim() !== '' &&
        apiKeyInput.trim() !== '' &&
        (!showModel || modelInput.trim() !== '');

    const handleSave = () => {
        onChange({
            baseURL: baseURLInput.trim(),
            apiKey: apiKeyInput.trim(),
            model: modelInput.trim(),
        });
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 1500);
    };

    return (
        <div className="openai-config-section">
            <div className="openai-config-section-title">API Configuration</div>
            <div className="openai-config-grid">
                <div className="openai-config-input-group">
                    <label htmlFor="openaiBaseURL">Base URL *</label>
                    <input
                        id="openaiBaseURL"
                        type="text"
                        placeholder="https://api.openai.com/v1"
                        value={baseURLInput}
                        onChange={(e) => setBaseURLInput(e.target.value)}
                    />
                    <span className="openai-config-help-text">API base URL (use default for OpenAI, or custom for compatible APIs)</span>
                </div>
                <div className="openai-config-input-group">
                    <label htmlFor="openaiKey">API Key *</label>
                    <div className="openai-config-input-wrapper">
                        <input
                            id="openaiKey"
                            type={showApiKey ? 'text' : 'password'}
                            placeholder="Your API key"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                        />
                        <button
                            type="button"
                            className="openai-config-reveal-btn"
                            onClick={() => setShowApiKey((v) => !v)}
                            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            title={showApiKey ? 'Hide API key' : 'Show API key'}
                        >
                            {showApiKey ? (
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
                    <span className="openai-config-help-text">Your API key</span>
                </div>
                {showModel && (
                    <div className="openai-config-input-group">
                        <label htmlFor="openaiModel">Model *</label>
                        <input
                            id="openaiModel"
                            type="text"
                            placeholder="e.g., gpt-5, gpt-4o, gpt-4-turbo"
                            value={modelInput}
                            onChange={(e) => setModelInput(e.target.value)}
                        />
                        <span className="openai-config-help-text">Model name (e.g., gpt-5, gpt-4o, gpt-4-turbo)</span>
                    </div>
                )}
            </div>
            <div className="openai-config-actions">
                <button
                    type="button"
                    className="openai-config-save-btn"
                    onClick={handleSave}
                    disabled={!canSave}
                >
                    {justSaved ? 'Saved' : 'Save configuration'}
                </button>
                {onClear && (
                    <button
                        type="button"
                        className="openai-config-clear-btn"
                        onClick={() => {
                            if (window.confirm('Clear saved API configuration? This will remove the Base URL, API Key, and Model from this browser.')) {
                                onClear();
                            }
                        }}
                    >
                        Clear
                    </button>
                )}
                {dirty && !justSaved && (
                    <span className="openai-config-dirty-hint">Unsaved changes</span>
                )}
            </div>
        </div>
    );
}
