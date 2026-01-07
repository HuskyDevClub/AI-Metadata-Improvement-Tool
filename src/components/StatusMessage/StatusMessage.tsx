import type { Status } from '../../types';
import './StatusMessage.css';

interface StatusMessageProps {
    status: Status | null;
    isProcessing?: boolean;
    onStop?: () => void;
}

export function StatusMessage({status, isProcessing, onStop}: StatusMessageProps) {
    if (!status) return null;

    return (
        <div className={`status-message status-message-${status.type}`}>
            <span className="status-message-text">{status.message}</span>
            {isProcessing && onStop && (
                <div className="status-message-actions">
                    <button className="status-btn status-btn-stop" onClick={onStop}>
                        Stop
                    </button>
                </div>
            )}
        </div>
    );
}
