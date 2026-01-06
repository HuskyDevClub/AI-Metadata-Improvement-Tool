import type { Status } from '../../types';
import './StatusMessage.css';

interface StatusMessageProps {
    status: Status | null;
}

export function StatusMessage({status}: StatusMessageProps) {
    if (!status) return null;

    return (
        <div className={`status-message status-message-${status.type}`}>
            {status.message}
        </div>
    );
}
