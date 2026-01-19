import { useState } from 'react';
import './CsvInput.css';

interface CsvInputProps {
    onAnalyze: (method: 'file' | 'url', file?: File, url?: string) => void;
    isProcessing: boolean;
}

export function CsvInput({onAnalyze, isProcessing}: CsvInputProps) {
    const [inputMethod, setInputMethod] = useState<'file' | 'url'>('url');
    const [file, setFile] = useState<File | null>(null);
    const [url, setUrl] = useState('https://data.wa.gov/api/v3/views/6fex-3r7d/query.csv');

    const handleAnalyze = () => {
        if (inputMethod === 'file' && file) {
            onAnalyze('file', file);
        } else if (inputMethod === 'url' && url) {
            onAnalyze('url', undefined, url);
        }
    };

    return (
        <div className="csv-input-section">
            <div className="csv-input-section-title">CSV Data Source</div>
            <div className="csv-input-group">
                <label>Choose Input Method</label>
                <select value={inputMethod} onChange={(e) => setInputMethod(e.target.value as 'file' | 'url')}>
                    <option value="url">Load from URL</option>
                    <option value="file">Upload Local File</option>
                </select>
            </div>

            {inputMethod === 'file' ? (
                <div className="csv-input-group" style={{marginTop: '15px'}}>
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
            ) : (
                <div style={{marginTop: '15px'}}>
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
                </div>
            )}

            <button
                className="csv-input-btn-primary"
                onClick={handleAnalyze}
                disabled={isProcessing || (inputMethod === 'file' && !file) || (inputMethod === 'url' && !url)}
                style={{marginTop: '20px'}}
            >
                {isProcessing ? 'Processing...' : 'Analyze CSV'}
            </button>
        </div>
    );
}
