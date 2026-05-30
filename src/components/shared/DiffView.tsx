import type { ReactNode } from 'react';
import '@/components/shared/DiffView.css';

interface DiffViewProps {
    currentLabel?: string;
    currentValue: ReactNode;
    currentEmptyState?: ReactNode;

    newLabel?: string;
    newValue: ReactNode;
    newEmptyState?: ReactNode;

    isGenerating?: boolean;

    onAccept: () => void;
    onDiscard: () => void;

    className?: string;
    acceptTooltip?: string;
    discardTooltip?: string;
}

export function DiffView({
                             currentLabel = 'Current',
                             currentValue,
                             currentEmptyState = <em className="diff-view-empty">Not set</em>,

                             newLabel = 'New',
                             newValue,
                             newEmptyState = <em className="diff-view-empty">Empty</em>,

                             isGenerating = false,

                             onAccept,
                             onDiscard,

                             className = '',
                             acceptTooltip = 'Keep the newly generated value',
                             discardTooltip = 'Discard the newly generated value and keep the current one'
                         }: DiffViewProps) {
    return (
        <div className={`diff-view ${className}`.trim()}>
            <div className="diff-view-block diff-view-current">
                <div className="diff-view-label">{currentLabel}</div>
                <div className="diff-view-text">
                    {currentValue || currentEmptyState}
                </div>
            </div>

            <div className="diff-view-block diff-view-new">
                <div className="diff-view-label">{newLabel}</div>
                <div className="diff-view-text">
                    {newValue || (isGenerating ? '' : newEmptyState)}
                    {isGenerating && <span className="ed-cursor">|</span>}
                </div>
            </div>

            <div className="diff-view-actions">
                <button
                    className="btn btn-primary btn-md"
                    onClick={onAccept}
                    disabled={isGenerating || !onAccept}
                    title={acceptTooltip}
                >
                    Keep new
                </button>
                <button
                    className="btn btn-secondary btn-md"
                    onClick={onDiscard}
                    disabled={isGenerating || !onDiscard}
                    title={discardTooltip}
                >
                    Discard
                </button>
            </div>
        </div>
    );
}
