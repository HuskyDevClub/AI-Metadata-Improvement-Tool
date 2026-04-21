import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppContext } from '../contexts/AppContext';
import './ImportPage.css';

export function ImportPage() {
    const {
        handleAnalyze,
        handleSocrataImport,
        isProcessing,
        showResults,
        navigate,
        socrataApiKeyId,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
    } = useAppContext();

    const [dragging, setDragging] = useState(false);

    // Socrata form state
    const [datasetId, setDatasetId] = useState('');
    const [showApiKey, setShowApiKey] = useState(!!socrataApiKeyId);
    const [apiKeyIdInput, setApiKeyIdInput] = useState(socrataApiKeyId);
    const [apiKeySecretInput, setApiKeySecretInput] = useState('');
    const [rememberKey, setRememberKey] = useState(true);
    const apiKeysSaved = !!socrataApiKeyId;

    const csvFileRef = useRef<HTMLInputElement>(null);
    const prevShowResults = useRef(showResults);
    const dragCounter = useRef(0);

    useEffect(() => {
        if (showResults && !prevShowResults.current) {
            navigate('data');
        }
        prevShowResults.current = showResults;
    }, [showResults, navigate]);

    const handleCsvClick = () => {
        if (isProcessing) return;
        csvFileRef.current?.click();
    };

    const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleAnalyze(file);
            e.target.value = '';
        }
    };

    const handleSocrataSubmit = () => {
        if (!datasetId.trim()) return;

        const trimmedKeyId = apiKeyIdInput.trim();
        const trimmedKeySecret = apiKeySecretInput.trim();
        const hasCredentials = !!(trimmedKeyId && trimmedKeySecret);

        if (rememberKey && hasCredentials) {
            handleSocrataApiKeySave(trimmedKeyId, trimmedKeySecret);
        } else if (!rememberKey && (socrataApiKeyId)) {
            handleSocrataApiKeyClear();
        }

        handleSocrataImport(datasetId.trim(), trimmedKeyId, trimmedKeySecret);
    };

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        dragCounter.current = 0;

        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith('.csv')) {
            handleAnalyze(file);
        }
    }, [handleAnalyze]);

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
                        />
                    </div>
                    <label className="import-form-remember">
                        <input
                            type="checkbox"
                            checked={rememberKey}
                            onChange={(e) => setRememberKey(e.target.checked)}
                        />
                        Remember this API key on this browser
                    </label>
                    <span className="import-form-hint">
                        Generate API keys from your data.wa.gov profile &gt; Developer Settings
                    </span>
                </div>
            )}

            {/* Divider */}
            <div className="import-or-divider">or</div>

            {/* Upload CSV */}
            <button
                className={`import-csv-btn${dragging ? ' dragging' : ''}`}
                onClick={handleCsvClick}
                disabled={isProcessing}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <polyline points="9 15 12 12 15 15"/>
                </svg>
                Upload CSV file
            </button>

            {/* Hidden file input */}
            <input ref={csvFileRef} type="file" accept=".csv" onChange={handleCsvFileChange}
                   style={{ display: 'none' }}/>

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
