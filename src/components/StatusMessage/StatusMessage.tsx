import { useEffect, useState } from 'react';
import type { Status } from '@/types';
import '@/components/StatusMessage/StatusMessage.css';

interface StatusMessageProps {
    status: Status | null;
    isProcessing?: boolean;
    onStop?: () => void;
}

export function StatusMessage({ status, isProcessing, onStop }: StatusMessageProps) {
    const [hidden, setHidden] = useState(false);
    const [fading, setFading] = useState(false);

    const autoHideMs = status?.autoHide ?? (status?.type === 'success' ? 3000 : undefined);

    useEffect(() => {
        // A new status (or a re-fire of an identical one — same key, no
        // remount) must restart from fully visible. The component is keyed on
        // the status in Layout, so this only does work on a same-key re-fire.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(false);
        setFading(false);

        if (!autoHideMs) return;

        const fadeTimer = setTimeout(() => setFading(true), autoHideMs);
        const hideTimer = setTimeout(() => setHidden(true), autoHideMs + 500);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
        };
    }, [status, autoHideMs]);

    if (!status || hidden) return null;

    return (
        <div className={`status-message status-message-${status.type}${fading ? ' status-message-fading' : ''}`}>
            <span className="status-message-text">{status.message}</span>
            {isProcessing && onStop && (
                <div className="status-message-actions">
                    <button className="btn btn-danger btn-md" onClick={onStop}>
                        Stop
                    </button>
                </div>
            )}
        </div>
    );
}
