import type { ValidationResult } from '../../types';
import { getModelColor } from '../../utils/modelColors';
import { RegenerationControls, type RegenerationModifier } from './RegenerationControls';
import './SideBySideView.css';

interface SideBySideViewProps {
    outputs: string[];
    modelNames: string[];
    generatingModels: Set<number>;
    regeneratingModels: Set<number>;
    winnerIndex?: number | null;
    onRegenerate?: (slotIndex: number, modifier: RegenerationModifier, customInstruction?: string) => void;
    isJudging?: boolean;
    validationResults?: ValidationResult[];
}

export function SideBySideView({
                                   outputs,
                                   modelNames,
                                   generatingModels,
                                   regeneratingModels,
                                   winnerIndex,
                                   onRegenerate,
                                   isJudging = false,
                                   validationResults,
                               }: SideBySideViewProps) {
    const anyGenerating = generatingModels.size > 0;
    const anyRegenerating = regeneratingModels.size > 0;
    const showRegenerationControls = !anyGenerating;
    const slotCount = outputs.length;

    const getWinnerClass = (index: number) => {
        if (winnerIndex === undefined) return '';
        if (winnerIndex === null) return 'tie';
        return winnerIndex === index ? 'winner' : 'loser';
    };

    const getValidationColor = (score: number) => {
        if (score >= 80) return '#28a745';  // Green
        if (score >= 60) return '#ffc107';  // Yellow
        return '#dc3545';  // Red
    };

    return (
        <div
            className="side-by-side-view"
            style={{ gridTemplateColumns: `repeat(${slotCount}, 1fr)` }}
        >
            {outputs.map((output, i) => {
                const color = getModelColor(i);
                const isGenerating = generatingModels.has(i);
                const isRegenerating = regeneratingModels.has(i);
                const isWinner = winnerIndex === i;

                return (
                    <div
                        key={i}
                        className={`side-panel ${getWinnerClass(i)}`}
                        style={{
                            borderColor: isWinner ? color.primary : color.border,
                            boxShadow: isWinner ? `0 0 0 1px ${color.primary}` : undefined,
                        }}
                    >
                        <div
                            className="panel-header"
                            style={{
                                background: `linear-gradient(135deg, ${color.lighter} 0%, ${color.light} 100%)`,
                            }}
                        >
                            <span className="panel-label" style={{ color: color.text }}>
                                {modelNames[i] || `Slot ${i + 1}`}
                            </span>
                            <div className="panel-badges">
                                {validationResults && validationResults[i] && (
                                    <span 
                                        className="validation-badge"
                                        style={{ backgroundColor: getValidationColor(validationResults[i].score), color: 'white' }}
                                        title={`Validation Score: ${Math.round(validationResults[i].score)}`}
                                    >
                                        {Math.round(validationResults[i].score)}
                                    </span>
                                )}
                                {isWinner && <span className="winner-badge">Winner</span>}
                            </div>
                        </div>
                        <div className="panel-content">
                            {output || (isGenerating ? '' : <span className="placeholder">Waiting...</span>)}
                            {isGenerating && <span className="streaming-cursor">|</span>}
                        </div>
                        {showRegenerationControls && onRegenerate && (
                            <RegenerationControls
                                slotIndex={i}
                                isRegenerating={isRegenerating}
                                isGenerating={isGenerating}
                                isJudging={isJudging}
                                onRegenerate={(modifier, customInstruction) => onRegenerate(i, modifier, customInstruction)}
                                disabled={anyRegenerating && !isRegenerating}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
