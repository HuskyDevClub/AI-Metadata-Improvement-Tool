import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppContext } from '@/contexts/AppContext';
import { ACCEPTED_UPLOAD_EXTENSIONS, isSupportedDataFile } from '@/utils/socrataApi';
import '@/pages/ImportPage.css';

const DATASET_ID_PATTERN = /(?:^|\/)([a-z0-9]{4}-[a-z0-9]{4})(?:$|\/|\?)/i;

/** Pull a Socrata dataset ID out of a bare ID or a full dataset URL. */
function extractDatasetId(input: string): string | null {
    const match = input.trim().match(DATASET_ID_PATTERN);
    return match ? match[1].toLowerCase() : null;
}

/** Pull the portal host out of a pasted dataset URL. Null for a bare ID. */
function extractDomain(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const host = new URL(withScheme).hostname.toLowerCase();
        // A bare dataset id ("6fex-3r7d") parses to a host with no dot —
        // reject those so only real URLs/domains count as a portal.
        return host.includes('.') ? host : null;
    } catch {
        return null;
    }
}

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
        socrataDomain,
        enableConfigSave,
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

    const handleSocrataSubmit = async () => {
        if (!datasetId.trim()) return;

        const parsedId = extractDatasetId(datasetId) ?? datasetId.trim();
        // A pasted URL carries its own portal — read from it for this import
        // only. The configured portal stays put (switch it manually in Settings).
        const parsedDomain = extractDomain(datasetId) ?? undefined;

        try {
            const trimmedKeyId = apiKeyIdInput.trim();
            const trimmedKeySecret = apiKeySecretInput.trim();
            const hasNewCredentials = !!(trimmedKeyId && trimmedKeySecret);
            // Remembering persists the key to the session cookie, which the
            // backend only allows when ENABLE_CONFIG_SAVE is on.
            const remember = rememberKey && enableConfigSave;

            if (hasNewCredentials && remember) {
                // Persist the key, then import via the session cookie.
                await handleSocrataApiKeySave(trimmedKeyId, trimmedKeySecret);
                await handleSocrataImport(parsedId, undefined, parsedDomain);
            } else if (hasNewCredentials) {
                // Single-use: pass the key inline so it's never written to the
                // session. Drop any previously-saved key only if the user
                // actively opted out (the checkbox is available and unchecked).
                if (enableConfigSave && !rememberKey && socrataApiKeyId) {
                    await handleSocrataApiKeyClear();
                }
                await handleSocrataImport(parsedId, {
                    apiKeyId: trimmedKeyId,
                    apiKeySecret: trimmedKeySecret,
                }, parsedDomain);
                setApiKeyIdInput('');
                setApiKeySecretInput('');
            } else {
                // No new key entered: reuse the saved key, unless the user
                // actively opted out of remembering it.
                if (enableConfigSave && !rememberKey && socrataApiKeyId) {
                    await handleSocrataApiKeyClear();
                }
                await handleSocrataImport(parsedId, undefined, parsedDomain);
            }
        } catch (error) {
            console.error("Failed to submit Socrata dataset:", error);
            // Error is naturally handled by AppContext handlers propagating to Status state
        }
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
        if (file && isSupportedDataFile(file)) {
            handleAnalyze(file);
        }
    }, [handleAnalyze]);

    // When the input is a URL (not a bare ID), surface the ID we extracted
    // so the user can confirm before import.
    const trimmedDatasetInput = datasetId.trim();
    const detectedId = extractDatasetId(trimmedDatasetInput);
    const detectedDomain = extractDomain(trimmedDatasetInput);
    const isUrlInput = detectedId !== null && trimmedDatasetInput.toLowerCase() !== detectedId;

    return (
        <div className="import-page">
            <h1 className="import-title">Import Dataset</h1>
            <p className="import-subtitle">
                Enter a dataset ID{socrataDomain ? ` from ${socrataDomain}` : ''}
            </p>

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
                    className="btn btn-primary btn-lg"
                    onClick={handleSocrataSubmit}
                    disabled={!datasetId.trim() || isProcessing}
                >
                    {isProcessing ? 'Importing...' : 'Import'}
                </button>
            </div>
            {isUrlInput && (
                <span className="import-form-detected-id">
                    Will import dataset <code>{detectedId}</code>
                    {detectedDomain && <> from <code>{detectedDomain}</code></>}
                </span>
            )}
            <span className="import-form-hint">
                The identifier or full URL of the dataset
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
                    {enableConfigSave && (
                        <label className="import-form-remember">
                            <input
                                type="checkbox"
                                checked={rememberKey}
                                onChange={(e) => setRememberKey(e.target.checked)}
                            />
                            Remember this API key on this browser
                        </label>
                    )}
                    <span className="import-form-hint">
                        {socrataDomain && (
                            <>Generate API keys from your {socrataDomain} profile &gt; Developer Settings.{' '}</>
                        )}
                        {enableConfigSave
                            ? 'Saved keys live in an encrypted HttpOnly session cookie.'
                            : 'The key is used once for this import and not stored.'}
                    </span>
                </div>
            )}

            {/* Divider */}
            <div className="import-or-divider">or</div>

            {/* Upload CSV or Excel */}
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
                Upload CSV or Excel file
            </button>

            {/* Hidden file input */}
            <input ref={csvFileRef} type="file" accept={ACCEPTED_UPLOAD_EXTENSIONS.join(',')}
                   onChange={handleCsvFileChange} style={{ display: 'none' }}/>

            {isProcessing && (
                <div className="import-processing">
                    <div className="spinner spinner-lg"/>
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
                        className="btn btn-success btn-md import-page-goto-btn"
                        onClick={() => navigate('data')}
                    >
                        Go to Data Overview
                    </button>
                </div>
            )}
        </div>
    );
}
