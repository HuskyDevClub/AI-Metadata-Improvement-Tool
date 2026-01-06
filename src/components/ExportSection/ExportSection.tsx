import './ExportSection.css';

interface ExportSectionProps {
    onExport: () => void;
}

export function ExportSection({onExport}: ExportSectionProps) {
    return (
        <div className="export-section">
            <h4>Export Results</h4>
            <button className="export-section-btn" onClick={onExport}>
                Download as JSON
            </button>
        </div>
    );
}
