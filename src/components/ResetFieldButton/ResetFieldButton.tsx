import './ResetFieldButton.css';

interface ResetFieldButtonProps {
    onReset: () => void;
    show: boolean;
    title?: string;
    className?: string;
    label?: string;
    disabled?: boolean;
}

export function ResetFieldButton({
                                     onReset,
                                     show,
                                     title = 'Reset to value loaded from the dataset',
                                     className = '',
                                     label,
                                     disabled = false,
                                 }: ResetFieldButtonProps) {
    if (!show) return null;
    return (
        <button
            type="button"
            className={`reset-field-btn ${className}`.trim()}
            onClick={onReset}
            title={title}
            aria-label={title}
            disabled={disabled}
        >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
                <polyline points="3 3 3 8 8 8"/>
            </svg>
            {label && <span className="reset-field-btn-label">{label}</span>}
        </button>
    );
}
