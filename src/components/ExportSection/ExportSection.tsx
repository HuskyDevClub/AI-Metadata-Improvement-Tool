import './ExportSection.css';

interface ExportSectionProps {
    onPushToSocrata?: () => void;
    isPushingSocrata?: boolean;
    showSocrataPush?: boolean;
}

export function ExportSection({ onPushToSocrata, isPushingSocrata, showSocrataPush }: ExportSectionProps) {
    if (!showSocrataPush || !onPushToSocrata) return null;

    return (
        <div className="export-section">
            <h4>Export Results</h4>
            <div className="export-section-buttons">
                <button
                    className="export-section-btn export-section-btn--socrata"
                    onClick={onPushToSocrata}
                    disabled={isPushingSocrata}
                >
                    {isPushingSocrata ? 'Pushing...' : 'Push to data.wa.gov'}
                </button>
            </div>
        </div>
    );
}
