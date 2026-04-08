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
        socrataApiKeySecret,
        handleSocrataApiKeySave,
        handleSocrataApiKeyClear,
    } = useAppContext();

    const [dragging, setDragging] = useState(false);

    // Socrata form state
    const [datasetId, setDatasetId] = useState('');
    const [showApiKey, setShowApiKey] = useState(!!socrataApiKeyId);
    const [apiKeyIdInput, setApiKeyIdInput] = useState(socrataApiKeyId);
    const [apiKeySecretInput, setApiKeySecretInput] = useState(socrataApiKeySecret);
    const apiKeysSaved = !!(socrataApiKeyId && socrataApiKeySecret);

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
            handleAnalyze('file', file);
            e.target.value = '';
        }
    };

    const handleSocrataSubmit = () => {
        if (!datasetId.trim()) return;
        handleSocrataImport(datasetId.trim());
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
            handleAnalyze('file', file);
        }
    }, [handleAnalyze]);

    return (
        <div className="import-page">
            {/* Primary: data.wa.gov — always visible */}
            <div className="import-primary">
                <div className="import-primary-header">
                    <div className="import-primary-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <ellipse cx="12" cy="5" rx="9" ry="3"/>
                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                    </div>
                    <div>
                        <div className="import-primary-title">Import from data.wa.gov</div>
                        <div className="import-primary-desc">Enter a Socrata dataset ID to get started</div>
                    </div>
                </div>

                <div className="import-primary-form">
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
                        The identifier from the data.wa.gov URL
                    </span>

                    <div className="import-form-divider">or authenticate for private datasets</div>

                    <label className="import-form-toggle">
                        <input
                            type="checkbox"
                            checked={showApiKey}
                            onChange={(e) => setShowApiKey(e.target.checked)}
                        />
                        Use API Key
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
                </div>
            </div>

            {/* Divider */}
            <div className="import-or-divider">or</div>

            {/* Secondary: Upload CSV */}
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
