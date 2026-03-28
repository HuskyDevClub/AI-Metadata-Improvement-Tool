import './ExportSection.css';

interface ExportSectionProps {
    onExport: () => void;
    onPushToSocrata?: () => void;
    isPushingSocrata?: boolean;
    showSocrataPush?: boolean;
}

export function ExportSection({ onExport, onPushToSocrata, isPushingSocrata, showSocrataPush }: ExportSectionProps) {
    return (
        <div className="export-section">
            <h4>Export Results</h4>
            <div className="export-section-buttons">
                <button className="export-section-btn" onClick={onExport}>
                    Download as JSON
                </button>
                {showSocrataPush && onPushToSocrata && (
                    <button
                        className="export-section-btn export-section-btn--socrata"
                        onClick={onPushToSocrata}
                        disabled={isPushingSocrata}
                    >
                        {isPushingSocrata ? 'Pushing...' : 'Push to data.wa.gov'}
                    </button>
                )}
            </div>
        </div>
    );
}
