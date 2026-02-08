import { getModelColor } from '../../utils/modelColors';
import { RegenerationControls, type RegenerationModifier } from './RegenerationControls';
import './SideBySideView.css';

export interface ModelPanelData {
    modelIndex: number;
    modelName: string;
    output: string;
    isGenerating: boolean;
    isRegenerating: boolean;
    onRegenerate?: (modifier: RegenerationModifier, customInstruction?: string) => void;
}

interface SideBySideViewProps {
    panels: ModelPanelData[];
    winnerIndex?: number | null;
    isJudging?: boolean;
}

export function SideBySideView({
                                   panels,
                                   winnerIndex,
                                   isJudging = false,
                               }: SideBySideViewProps) {
    const getWinnerClass = (modelIndex: number) => {
        if (winnerIndex === undefined || winnerIndex === null) {
            if (winnerIndex === null) return 'tie';
            return '';
        }
        return winnerIndex === modelIndex ? 'winner' : 'loser';
    };

    const showRegenerationControls = !panels.some(p => p.isGenerating);
    const anyRegenerating = panels.some(p => p.isRegenerating);

    return (
        <div
            className="side-by-side-view"
            style={{gridTemplateColumns: `repeat(${panels.length}, 1fr)`}}
        >
            {panels.map((panel) => {
                const color = getModelColor(panel.modelIndex);
                const winClass = getWinnerClass(panel.modelIndex);

                return (
                    <div
                        key={panel.modelIndex}
                        className={`side-panel ${winClass}`}
                        style={{
                            borderColor: winClass === 'winner' ? color.primary : winClass === 'tie' ? '#9ca3af' : color.border,
                            ...(winClass === 'winner' ? {boxShadow: `0 0 0 3px ${color.focusShadow}`} : {}),
                        }}
                    >
                        <div
                            className="panel-header"
                            style={{
                                background: `linear-gradient(135deg, ${color.lighter} 0%, ${color.light} 100%)`,
                                borderBottomColor: color.border,
                            }}
                        >
                            <span className="panel-label" style={{color: color.text}}>
                                {panel.modelName}
                            </span>
                            {winnerIndex === panel.modelIndex && <span className="winner-badge">Winner</span>}
                        </div>
                        <div className="panel-content">
                            {panel.output || (panel.isGenerating ? '' :
                                <span className="placeholder">Waiting...</span>)}
                            {panel.isGenerating && <span className="streaming-cursor">|</span>}
                        </div>
                        {showRegenerationControls && panel.onRegenerate && (
                            <RegenerationControls
                                modelIndex={panel.modelIndex}
                                isRegenerating={panel.isRegenerating}
                                isGenerating={panel.isGenerating}
                                isJudging={isJudging}
                                onRegenerate={panel.onRegenerate}
                                disabled={anyRegenerating && !panel.isRegenerating}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
