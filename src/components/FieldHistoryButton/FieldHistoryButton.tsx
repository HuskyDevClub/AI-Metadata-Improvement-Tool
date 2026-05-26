import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldRevision, FieldRevisionSource } from '../../types';
import { valuesEqual } from '../../utils/fieldRevisions';
import './FieldHistoryButton.css';

interface FieldHistoryButtonProps {
    revisions: FieldRevision[];
    currentValue: string | string[];
    onRevert: (revisionId: string) => void;
    title?: string;
    formatValue?: (value: string | string[]) => ReactNode;
    disabled?: boolean;
}

const SOURCE_LABEL: Record<FieldRevisionSource, string> = {
    original: 'Original',
    ai: 'AI',
    user: 'You',
};

function defaultFormat(value: string | string[]): ReactNode {
    if (Array.isArray(value)) {
        if (value.length === 0) return <em className="fh-empty">No tags</em>;
        return value.join(', ');
    }
    if (!value) return <em className="fh-empty">Empty</em>;
    return value;
}

function relativeTime(ts: number, now: number): string {
    const diffMs = Math.max(0, now - ts);
    const sec = Math.floor(diffMs / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

export function FieldHistoryButton({
                                       revisions,
                                       currentValue,
                                       onRevert,
                                       title,
                                       formatValue = defaultFormat,
                                       disabled = false,
                                   }: FieldHistoryButtonProps) {
    const [open, setOpen] = useState(false);
    // Freeze the reference timestamp when the popover opens — calling Date.now()
    // during render trips React's purity rule, and the relative labels don't
    // need to tick while the popover is open.
    const [referenceNow, setReferenceNow] = useState(0);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);

    // Most-recent-first ordering; "modified" indicator only when more than the
    // seeded 'original' revision exists.
    const ordered = useMemo(() => [...revisions].slice().reverse(), [revisions]);
    const hasHistory = revisions.length > 1;

    // The current value may match any past revision (after a revert) — flag the
    // first match so users see exactly which draft is live.
    const currentRevisionId = useMemo(() => {
        for (let i = ordered.length - 1; i >= 0; i--) {
            if (valuesEqual(ordered[i].value, currentValue)) return ordered[i].id;
        }
        return null;
    }, [ordered, currentValue]);

    const handleToggle = () => {
        setReferenceNow(Date.now());
        setOpen((v) => !v);
    };

    useEffect(() => {
        if (!open) return;
        const onDocMouseDown = (e: MouseEvent) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocMouseDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!hasHistory) return null;

    const tooltip = title
        ? `${title} — ${revisions.length} revisions`
        : `${revisions.length} revisions`;

    return (
        <span className="fh-wrap" ref={wrapperRef}>
            <button
                type="button"
                className={`fh-dot ${open ? 'fh-dot-open' : ''}`}
                onClick={handleToggle}
                title={tooltip}
                aria-label={tooltip}
                aria-expanded={open}
                disabled={disabled}
            >
                <span className="fh-dot-inner"/>
            </button>
            {open && (
                <div className="fh-popover" role="dialog">
                    <div className="fh-popover-header">
                        <span className="fh-popover-title">{title ? `${title} history` : 'Revision history'}</span>
                        <button
                            type="button"
                            className="fh-popover-close"
                            onClick={() => setOpen(false)}
                            aria-label="Close history"
                        >
                            &#10005;
                        </button>
                    </div>
                    <ul className="fh-popover-list">
                        {ordered.map((rev) => {
                            const isCurrent = rev.id === currentRevisionId;
                            return (
                                <li key={rev.id} className={`fh-item ${isCurrent ? 'fh-item-current' : ''}`}>
                                    <div className="fh-item-meta">
                                        <span className={`fh-badge fh-badge-${rev.source}`}>
                                            {SOURCE_LABEL[rev.source]}
                                        </span>
                                        <span className="fh-time">
                                            {rev.source === 'original' ? 'on import' : relativeTime(rev.timestamp, referenceNow)}
                                        </span>
                                        {isCurrent ? (
                                            <span className="fh-current-pill">Current</span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="fh-revert-btn"
                                                onClick={() => {
                                                    onRevert(rev.id);
                                                    setOpen(false);
                                                }}
                                                title="Revert to this revision"
                                                disabled={disabled}
                                            >
                                                Revert
                                            </button>
                                        )}
                                    </div>
                                    <div className="fh-item-value">{formatValue(rev.value)}</div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </span>
    );
}
