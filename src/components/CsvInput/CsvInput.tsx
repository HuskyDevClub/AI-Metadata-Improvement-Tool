import { useState } from 'react';
import './CsvInput.css';

type InputMethod = 'file' | 'url' | 'socrata';

interface CsvInputProps {
    onAnalyze: (method: 'file' | 'url', file?: File, url?: string, socrataToken?: string) => void;
    onSocrataImport: (datasetId: string, appToken?: string, apiKeyId?: string, apiKeySecret?: string) => void;
    isProcessing: boolean;
    oauthUser: { id: string; displayName: string; email?: string } | null;
    isOAuthAuthenticating: boolean;
    onOAuthLogin: () => void;
    onOAuthLogout: () => void;
}

export function CsvInput({
                             onAnalyze,
                             onSocrataImport,
                             isProcessing,
                             oauthUser,
                             isOAuthAuthenticating,
                             onOAuthLogin,
                             onOAuthLogout
                         }: CsvInputProps) {
    const [inputMethod, setInputMethod] = useState<InputMethod>('url');
    const [file, setFile] = useState<File | null>(null);
    const [url, setUrl] = useState('https://data.wa.gov/api/v3/views/6fex-3r7d/query.csv');
    const [socrataToken, setSocrataToken] = useState(import.meta.env.VITE_SOCRATA_APP_TOKEN || '');

    // Socrata fields
    const [datasetId, setDatasetId] = useState('');
    const [appToken, setAppToken] = useState(import.meta.env.VITE_SOCRATA_APP_TOKEN || '');
    const [showApiKey, setShowApiKey] = useState(false);
    const [apiKeyId, setApiKeyId] = useState(import.meta.env.VITE_SOCRATA_API_KEY_ID || '');
    const [apiKeySecret, setApiKeySecret] = useState(import.meta.env.VITE_SOCRATA_API_KEY_SECRET || '');

    const handleSubmit = () => {
        if (inputMethod === 'file' && file) {
            onAnalyze('file', file);
        } else if (inputMethod === 'url' && url) {
            onAnalyze('url', undefined, url, socrataToken || undefined);
        } else if (inputMethod === 'socrata' && datasetId.trim()) {
            onSocrataImport(
                datasetId.trim(),
                appToken || undefined,
                apiKeyId || undefined,
                apiKeySecret || undefined
            );
        }
    };

    const isDisabled = isProcessing
        || (inputMethod === 'file' && !file)
        || (inputMethod === 'url' && !url)
        || (inputMethod === 'socrata' && !datasetId.trim());

    const buttonLabel = inputMethod === 'socrata'
        ? (isProcessing ? 'Importing...' : 'Import from data.wa.gov')
        : (isProcessing ? 'Processing...' : 'Analyze CSV');

    return (
        <div className="csv-input-section">
            <div className="csv-input-section-title">CSV Data Source</div>
            <div className="csv-input-group">
                <label>Choose Input Method</label>
                <select value={inputMethod} onChange={(e) => setInputMethod(e.target.value as InputMethod)}>
                    <option value="url">Load from URL</option>
                    <option value="file">Upload Local File</option>
                    <option value="socrata">Import from data.wa.gov</option>
                </select>
            </div>

            {inputMethod === 'file' && (
                <div className="csv-input-group" style={{ marginTop: '15px' }}>
                    <label htmlFor="csvFile">Select CSV File *</label>
                    <div className="csv-input-file-wrapper">
                        <input
                            id="csvFile"
                            type="file"
                            accept=".csv"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                    </div>
                </div>
            )}

            {inputMethod === 'url' && (
                <div style={{ marginTop: '15px' }}>
                    <div className="csv-input-group">
                        <label htmlFor="csvUrl">CSV URL *</label>
                        <input
                            id="csvUrl"
                            type="text"
                            placeholder="https://example.com/data.csv"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="csv-input-url-input"
                        />
                        <span className="csv-input-help-text">Direct link to a CSV file</span>
                    </div>
                    <div className="csv-input-group" style={{ marginTop: '15px' }}>
                        <label htmlFor="socrataToken">Socrata API Token</label>
                        <input
                            id="socrataToken"
                            type="password"
                            placeholder="Enter your Socrata app token"
                            value={socrataToken}
                            onChange={(e) => setSocrataToken(e.target.value)}
                            className="csv-input-url-input"
                        />
                        <span className="csv-input-help-text">Optional — required for Socrata open data portals</span>
                    </div>
                </div>
            )}

            {inputMethod === 'socrata' && (
                <div style={{ marginTop: '15px' }}>
                    <div className="csv-input-group">
                        <label htmlFor="socrataDatasetId">Dataset ID *</label>
                        <input
                            id="socrataDatasetId"
                            type="text"
                            placeholder="e.g. 6fex-3r7d"
                            value={datasetId}
                            onChange={(e) => setDatasetId(e.target.value)}
                            className="csv-input-url-input"
                        />
                        <span className="csv-input-help-text">The dataset identifier from the data.wa.gov URL</span>
                    </div>

                    <div className="csv-input-oauth-section">
                        {oauthUser ? (
                            <div className="csv-input-oauth-status">
                                <span>Signed in as <strong>{oauthUser.displayName}</strong></span>
                                <button
                                    type="button"
                                    className="csv-input-oauth-logout"
                                    onClick={onOAuthLogout}
                                >
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="csv-input-oauth-btn"
                                onClick={onOAuthLogin}
                                disabled={isOAuthAuthenticating}
                            >
                                {isOAuthAuthenticating ? 'Signing in...' : 'Sign in with data.wa.gov'}
                            </button>
                        )}
                    </div>

                    {!oauthUser && (
                        <>
                            <div className="csv-input-oauth-divider">or enter credentials manually</div>
                            <div className="csv-input-group">
                                <label htmlFor="socrataAppToken">Socrata App Token</label>
                                <input
                                    id="socrataAppToken"
                                    type="password"
                                    placeholder="Enter your Socrata app token"
                                    value={appToken}
                                    onChange={(e) => setAppToken(e.target.value)}
                                    className="csv-input-url-input"
                                />
                                <span className="csv-input-help-text">
                                    Optional — leave empty to use SOCRATA_APP_TOKEN from .env
                                </span>
                            </div>
                            <label className="csv-input-toggle" style={{ marginTop: '15px' }}>
                                <input
                                    type="checkbox"
                                    checked={showApiKey}
                                    onChange={(e) => setShowApiKey(e.target.checked)}
                                />
                                Private dataset (requires API Key)
                            </label>
                            {showApiKey && (
                                <div style={{ marginTop: '10px' }}>
                                    <div className="csv-input-group">
                                        <label htmlFor="socrataApiKeyId">API Key ID</label>
                                        <input
                                            id="socrataApiKeyId"
                                            type="text"
                                            placeholder="Key ID"
                                            value={apiKeyId}
                                            onChange={(e) => setApiKeyId(e.target.value)}
                                            className="csv-input-url-input"
                                        />
                                    </div>
                                    <div className="csv-input-group" style={{ marginTop: '10px' }}>
                                        <label htmlFor="socrataApiKeySecret">API Key Secret</label>
                                        <input
                                            id="socrataApiKeySecret"
                                            type="password"
                                            placeholder="Key Secret"
                                            value={apiKeySecret}
                                            onChange={(e) => setApiKeySecret(e.target.value)}
                                            className="csv-input-url-input"
                                        />
                                    </div>
                                    <span className="csv-input-help-text">
                                        Leave empty to use SOCRATA_API_KEY_ID / SOCRATA_API_KEY_SECRET from .env
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    <p className="csv-input-help-text" style={{ marginTop: '10px' }}>
                        Fetches metadata and CSV data, then pre-populates existing descriptions
                    </p>
                </div>
            )}

            <button
                className="csv-input-btn-primary"
                onClick={handleSubmit}
                disabled={isDisabled}
                style={{ marginTop: '20px' }}
            >
                {buttonLabel}
            </button>
        </div>
    );
}
