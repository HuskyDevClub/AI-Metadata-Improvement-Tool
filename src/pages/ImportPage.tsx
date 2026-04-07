import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppContext } from '../contexts/AppContext';
import { extractSocrataDatasetId } from '../utils/csvParser';
import './ImportPage.css';

type SourceType = 'url' | 'socrata' | null;

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

    const [expandedSource, setExpandedSource] = useState<SourceType>(null);
    const [dragging, setDragging] = useState(false);

    // URL form state
    const [url, setUrl] = useState('');

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

    const handleCardClick = (source: string) => {
        if (isProcessing) return;
        if (source === 'csv-file') {
            csvFileRef.current?.click();
        } else {
            setExpandedSource(prev => prev === source ? null : source as SourceType);
        }
    };

    const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleAnalyze('file', file);
            e.target.value = '';
        }
    };

    const handleUrlSubmit = () => {
        if (!url) return;
        const detectedId = extractSocrataDatasetId(url);
        if (detectedId) {
            handleSocrataImport(detectedId);
        } else {
            handleAnalyze('url', undefined, url);
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
            <h2 className="import-page-title">Import Data</h2>
            <p className="import-page-subtitle">Choose a source to get started</p>

            <div className="import-source-grid">
                {/* Upload CSV */}
                <button
                    className={`import-source-card drop-zone${dragging ? ' dragging' : ''}`}
                    onClick={() => handleCardClick('csv-file')}
                    disabled={isProcessing}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <div className="import-source-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="12" y1="18" x2="12" y2="12"/>
                            <polyline points="9 15 12 12 15 15"/>
                        </svg>
                    </div>
                    <div className="import-source-title">Upload CSV</div>
                    <div className="import-source-desc">Click to browse or drag & drop</div>
                </button>

                {/* From URL */}
                <button
                    className={`import-source-card${expandedSource === 'url' ? ' active' : ''}`}
                    onClick={() => handleCardClick('url')}
                    disabled={isProcessing}
                >
                    <div className="import-source-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <path
                                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                    </div>
                    <div className="import-source-title">From URL</div>
                    <div className="import-source-desc">Load CSV from a web link</div>
                </button>

                {/* data.wa.gov */}
                <button
                    className={`import-source-card${expandedSource === 'socrata' ? ' active' : ''}`}
                    onClick={() => handleCardClick('socrata')}
                    disabled={isProcessing}
                >
                    <div className="import-source-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <ellipse cx="12" cy="5" rx="9" ry="3"/>
                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                    </div>
                    <div className="import-source-title">data.wa.gov</div>
                    <div className="import-source-desc">Import from Socrata</div>
                </button>

            </div>

            {/* Hidden file inputs */}
            <input ref={csvFileRef} type="file" accept=".csv" onChange={handleCsvFileChange}
                   style={{ display: 'none' }}/>

            {/* URL form panel */}
            {expandedSource === 'url' && (
                <div className="import-form-panel">
                    <div className="import-form-group">
                        <label htmlFor="csvUrl">
                            CSV URL
                            <span className="import-form-info-wrapper">
                                <svg className="import-form-info-icon" width="14" height="14" viewBox="0 0 24 24"
                                     fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="16" x2="12" y2="12"/>
                                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                                <span className="import-form-tooltip">
                                    Non-Socrata URLs load the entire file in the browser. Very large CSV files may cause performance issues or fail to load.
                                </span>
                            </span>
                        </label>
                        <input
                            id="csvUrl"
                            type="text"
                            placeholder="https://example.com/data.csv"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUrlSubmit();
                            }}
                            autoFocus
                        />
                        <span className="import-form-hint">
                            Socrata URLs (data.wa.gov) will auto-detect and fetch via API
                        </span>
                    </div>
                    <button
                        className="import-form-submit"
                        onClick={handleUrlSubmit}
                        disabled={!url || isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Load'}
                    </button>
                </div>
            )}

            {/* Socrata form panel */}
            {expandedSource === 'socrata' && (
                <div className="import-form-panel">
                    <div className="import-form-group">
                        <label htmlFor="socrataDatasetId">Dataset ID</label>
                        <input
                            id="socrataDatasetId"
                            type="text"
                            placeholder="e.g. 6fex-3r7d"
                            value={datasetId}
                            onChange={(e) => setDatasetId(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSocrataSubmit();
                            }}
                            autoFocus
                        />
                        <span className="import-form-hint">
                            The identifier from the data.wa.gov URL
                        </span>
                    </div>

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

                    <button
                        className="import-form-submit"
                        onClick={handleSocrataSubmit}
                        disabled={!datasetId.trim() || isProcessing}
                    >
                        {isProcessing ? 'Importing...' : 'Import'}
                    </button>
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
