import { useEffect, useRef, useState } from 'react';

import { useAppContext } from '../contexts/AppContext';
import './ImportPage.css';

export function ImportPage() {
    const {
        handleSocrataImport,
        isProcessing,
        showResults,
        navigate,
        socrataApiKeyId,
        socrataApiKeySecret,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
    } = useAppContext();

    // Socrata form state
    const [datasetId, setDatasetId] = useState('');
    const [showApiKey, setShowApiKey] = useState(!!socrataApiKeyId);
    const [apiKeyIdInput, setApiKeyIdInput] = useState(socrataApiKeyId);
    const [apiKeySecretInput, setApiKeySecretInput] = useState(socrataApiKeySecret);
    const apiKeysSaved = !!(socrataApiKeyId && socrataApiKeySecret);

    const prevShowResults = useRef(showResults);

    useEffect(() => {
        if (showResults && !prevShowResults.current) {
            navigate('data');
        }
        prevShowResults.current = showResults;
    }, [showResults, navigate]);

    const handleSocrataSubmit = () => {
        if (!datasetId.trim()) return;
        handleSocrataImport(datasetId.trim());
    };

    return (
        <div className="import-page">
            <h1 className="import-title">Import Dataset</h1>
            <p className="import-subtitle">Enter a dataset ID from data.wa.gov</p>

            <div className="import-form-row">
                <input
                    id="socrataDatasetId"
                    type="text"
                    className="import-form-input"
                    placeholder="e.g. 6fex-3r7d"
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSocrataSubmit();
                    }}
                />
                <button
                    className="import-form-submit"
                    onClick={handleSocrataSubmit}
                    disabled={!datasetId.trim() || isProcessing}
                >
                    {isProcessing ? 'Importing...' : 'Import'}
                </button>
            </div>
            <span className="import-form-hint">
                The identifier from the dataset URL
            </span>

            <label className="import-form-toggle">
                <input
                    type="checkbox"
                    checked={showApiKey}
                    onChange={(e) => setShowApiKey(e.target.checked)}
                />
                API Key
                <span className="import-form-optional">optional</span>
                {apiKeysSaved && <span className="import-form-saved-badge">Saved</span>}
            </label>

            {showApiKey && (
                <div className="import-form-credentials">
                    <div className="import-form-group">
                        <label htmlFor="socrataApiKeyId">API Key ID</label>
                        <input
                            id="socrataApiKeyId"
                            type="text"
                            placeholder="Your Socrata API Key ID"
                            value={apiKeyIdInput}
                            onChange={(e) => setApiKeyIdInput(e.target.value)}
                            disabled={apiKeysSaved}
                        />
                    </div>
                    <div className="import-form-group">
                        <label htmlFor="socrataApiKeySecret">API Key Secret</label>
                        <input
                            id="socrataApiKeySecret"
                            type="password"
                            placeholder="Your Socrata API Key Secret"
                            value={apiKeySecretInput}
                            onChange={(e) => setApiKeySecretInput(e.target.value)}
                            disabled={apiKeysSaved}
                        />
                    </div>
                    {apiKeysSaved ? (
                        <button
                            type="button"
                            className="import-form-link-btn"
                            onClick={() => {
                                handleSocrataApiKeyClear();
                                setApiKeyIdInput('');
                                setApiKeySecretInput('');
                            }}
                        >
                            Clear saved keys
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="import-form-link-btn"
                            onClick={() => {
                                if (apiKeyIdInput.trim() && apiKeySecretInput.trim()) {
                                    handleSocrataApiKeySave(apiKeyIdInput.trim(), apiKeySecretInput.trim());
                                }
                            }}
                            disabled={!apiKeyIdInput.trim() || !apiKeySecretInput.trim()}
                        >
                            Save keys
                        </button>
                    )}
                    <span className="import-form-hint">
                        Generate API keys from your data.wa.gov profile &gt; Developer Settings
                    </span>
                </div>
            )}

            {isProcessing && (
                <div className="import-processing">
                    <div className="import-processing-spinner"/>
                    <span>Loading data...</span>
                </div>
            )}

            {showResults && (
                <div className="import-page-loaded">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>Data is loaded.</span>
                    <button
                        className="import-page-goto-btn"
                        onClick={() => navigate('data')}
                    >
                        Go to Data Overview
                    </button>
                </div>
            )}
        </div>
    );
}
