import type { Status } from '../../types';
import styles from './StatusMessage.module.css';

interface StatusMessageProps {
    status: Status | null;
}

export function StatusMessage({status}: StatusMessageProps) {
    if (!status) return null;

    return (
        <div className={`${styles.status} ${styles[status.type]}`}>
            {status.message}
        </div>
    );
}
