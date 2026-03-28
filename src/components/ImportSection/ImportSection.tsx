import { useRef } from 'react';
import './ImportSection.css';

interface ImportSectionProps {
    onImport: (file: File) => void;
    disabled?: boolean;
}

export function ImportSection({ onImport, disabled }: ImportSectionProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImport(file);
            // Reset so the same file can be re-imported
            e.target.value = '';
        }
    };

    return (
        <div className="import-section">
            <div className="import-divider">
                <span>or</span>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".json"
                onChange={handleChange}
                className="import-hidden-input"
            />
            <button
                className="import-section-btn"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
            >
                Import JSON Results
            </button>
            <p className="import-help-text">
                Load a previously exported JSON file to view and edit results
            </p>
        </div>
    );
}
