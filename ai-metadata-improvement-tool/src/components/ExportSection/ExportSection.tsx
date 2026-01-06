import styles from './ExportSection.module.css';

interface ExportSectionProps {
    onExport: () => void;
}

export function ExportSection({onExport}: ExportSectionProps) {
    return (
        <div className={styles.exportSection}>
            <h4>Export Results</h4>
            <button className={styles.btnExport} onClick={onExport}>
                Download as JSON
            </button>
        </div>
    );
}
