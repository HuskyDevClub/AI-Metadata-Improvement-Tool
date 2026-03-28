import { useState } from 'react';
import './SocrataImport.css';

interface SocrataImportProps {
    onImport: (datasetId: string, appToken?: string, apiKeyId?: string, apiKeySecret?: string) => void;
    disabled?: boolean;
}

export function SocrataImport({ onImport, disabled }: SocrataImportProps) {
    const [datasetId, setDatasetId] = useState('');
    const [appToken, setAppToken] = useState(import.meta.env.VITE_SOCRATA_APP_TOKEN || '');
    const [showApiKey, setShowApiKey] = useState(false);
    const [apiKeyId, setApiKeyId] = useState(import.meta.env.VITE_SOCRATA_API_KEY_ID || '');
    const [apiKeySecret, setApiKeySecret] = useState(import.meta.env.VITE_SOCRATA_API_KEY_SECRET || '');

    const handleSubmit = () => {
        if (!datasetId.trim()) return;
        onImport(
            datasetId.trim(),
            appToken || undefined,
            apiKeyId || undefined,
            apiKeySecret || undefined
        );
    };

    return (
        <div className="socrata-import">
            <div className="import-divider">
                <span>or import from data.wa.gov</span>
            </div>

            <div className="socrata-import-fields">
                <div className="socrata-import-group">
                    <label htmlFor="socrataDatasetId">Dataset ID *</label>
                    <input
                        id="socrataDatasetId"
                        type="text"
                        placeholder="e.g. 6fex-3r7d"
                        value={datasetId}
                        onChange={(e) => setDatasetId(e.target.value)}
                    />
                    <p className="socrata-import-help">
                        The dataset identifier from the data.wa.gov URL
                    </p>
                </div>

                <div className="socrata-import-group">
                    <label htmlFor="socrataAppToken">Socrata App Token</label>
                    <input
                        id="socrataAppToken"
                        type="password"
                        placeholder="Enter your Socrata app token"
                        value={appToken}
                        onChange={(e) => setAppToken(e.target.value)}
                    />
                    <p className="socrata-import-help">
                        Optional — leave empty to use SOCRATA_APP_TOKEN from .env
                    </p>
                </div>

                <label className="socrata-import-toggle">
                    <input
                        type="checkbox"
                        checked={showApiKey}
                        onChange={(e) => setShowApiKey(e.target.checked)}
                    />
                    Private dataset (requires API Key)
                </label>

                {showApiKey && (
                    <>
                        <div className="socrata-import-group">
                            <label htmlFor="socrataApiKeyId">API Key ID</label>
                            <input
                                id="socrataApiKeyId"
                                type="text"
                                placeholder="Key ID"
                                value={apiKeyId}
                                onChange={(e) => setApiKeyId(e.target.value)}
                            />
                        </div>
                        <div className="socrata-import-group">
                            <label htmlFor="socrataApiKeySecret">API Key Secret</label>
                            <input
                                id="socrataApiKeySecret"
                                type="password"
                                placeholder="Key Secret"
                                value={apiKeySecret}
                                onChange={(e) => setApiKeySecret(e.target.value)}
                            />
                        </div>
                        <p className="socrata-import-help">
                            Leave empty to use SOCRATA_API_KEY_ID / SOCRATA_API_KEY_SECRET from .env
                        </p>
                    </>
                )}
            </div>

            <button
                className="socrata-import-btn"
                onClick={handleSubmit}
                disabled={disabled || !datasetId.trim()}
            >
                Import from data.wa.gov
            </button>
            <p className="socrata-import-footer">
                Fetches metadata and CSV data, then pre-populates existing descriptions
            </p>
        </div>
    );
}
