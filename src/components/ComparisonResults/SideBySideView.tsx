import type { JudgeResult } from '../../types';
import './SideBySideView.css';

interface SideBySideViewProps {
    modelAOutput: string;
    modelBOutput: string;
    modelAName?: string;
    modelBName?: string;
    isGeneratingA: boolean;
    isGeneratingB: boolean;
    winner?: JudgeResult['winner'] | null;
}

export function SideBySideView({
                                   modelAOutput,
                                   modelBOutput,
                                   modelAName = 'Model A',
                                   modelBName = 'Model B',
                                   isGeneratingA,
                                   isGeneratingB,
                                   winner,
                               }: SideBySideViewProps) {
    const getWinnerClass = (model: 'A' | 'B') => {
        if (!winner) return '';
        if (winner === 'tie') return 'tie';
        return winner === model ? 'winner' : 'loser';
    };

    return (
        <div className="side-by-side-view">
            <div className={`side-panel model-a ${getWinnerClass('A')}`}>
                <div className="panel-header">
                    <span className="panel-label">{modelAName}</span>
                    {winner === 'A' && <span className="winner-badge">Winner</span>}
                </div>
                <div className="panel-content">
                    {modelAOutput || (isGeneratingA ? '' : <span className="placeholder">Waiting...</span>)}
                    {isGeneratingA && <span className="streaming-cursor">|</span>}
                </div>
            </div>

            <div className={`side-panel model-b ${getWinnerClass('B')}`}>
                <div className="panel-header">
                    <span className="panel-label">{modelBName}</span>
                    {winner === 'B' && <span className="winner-badge">Winner</span>}
                </div>
                <div className="panel-content">
                    {modelBOutput || (isGeneratingB ? '' : <span className="placeholder">Waiting...</span>)}
                    {isGeneratingB && <span className="streaming-cursor">|</span>}
                </div>
            </div>
        </div>
    );
}
