import type { JudgeResult, ScoringCategory } from '../../types';
import { getModelColor } from '../../utils/modelColors';
import { MetricBar } from './MetricBar';
import './JudgeScoreCard.css';

interface JudgeScoreCardProps {
    result: JudgeResult | null;
    isJudging: boolean;
    compact?: boolean;
    onReJudge?: () => void;
    isReJudging?: boolean;
    scoringCategories?: ScoringCategory[];
    modelNames?: string[];
}

export function JudgeScoreCard({
                                   result,
                                   isJudging,
                                   compact = false,
                                   onReJudge,
                                   isReJudging = false,
                                   scoringCategories = [],
                                   modelNames = [],
                               }: JudgeScoreCardProps) {
    if (isJudging || isReJudging) {
        return (
            <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
                <div className="judge-loading">
                    <div className="judge-spinner"></div>
                    <span>{isReJudging ? 'Re-judging...' : 'Judge is evaluating...'}</span>
                </div>
            </div>
        );
    }

    if (!result) {
        return null;
    }

    const getWinnerDisplay = () => {
        if (result.winnerIndex === null) {
            return {text: 'Tie', className: 'tie'};
        }
        const winnerNum = result.winnerIndex + 1;
        const name = modelNames[result.winnerIndex] || `Model ${winnerNum}`;
        return {
            text: `${name} Wins`,
            className: 'has-winner',
        };
    };

    const winner = getWinnerDisplay();
    const winnerColor = result.winnerIndex !== null ? getModelColor(result.winnerIndex) : null;

    const maxTotal = scoringCategories.reduce((sum, cat) => sum + cat.maxScore, 0);
    const modelTotals = result.models.map((m) =>
        Object.values(m.scores).reduce((a, b) => a + b, 0)
    );

    return (
        <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
            <div className="judge-header">
                <span className="judge-title">Judge Evaluation</span>
                <div className="judge-header-actions">
                    <span
                        className={`judge-winner ${winner.className}`}
                        style={winnerColor ? {
                            background: winnerColor.light,
                            color: winnerColor.text,
                        } : undefined}
                    >
                        {winner.text}
                    </span>
                    {onReJudge && (
                        <button
                            className="rejudge-btn"
                            onClick={onReJudge}
                            title="Re-run judge evaluation"
                        >
                            ⟳
                        </button>
                    )}
                </div>
            </div>

            <div className="judge-metrics">
                {scoringCategories.map(cat => (
                    <MetricBar
                        key={cat.key}
                        label={cat.label}
                        scores={result.models.map((m, i) => ({
                            modelIndex: i,
                            score: m.scores[cat.key] ?? 0,
                            modelName: modelNames[i] || `M${i + 1}`,
                        }))}
                        maxScore={cat.maxScore}
                    />
                ))}
            </div>

            <div className="judge-totals">
                {modelTotals.map((total, i) => {
                    const color = getModelColor(i);
                    return (
                        <span key={i} className="total" style={{color: color.primary}}>
                            {modelNames[i] || `M${i + 1}`}: {total}/{maxTotal}
                        </span>
                    );
                })}
            </div>

            <div className="judge-reasoning">
                <strong>Reasoning:</strong> {result.winnerReasoning}
            </div>

            {!compact && (
                <div
                    className="judge-individual-reasoning"
                    style={{gridTemplateColumns: `repeat(${result.models.length}, 1fr)`}}
                >
                    {result.models.map((m, i) => {
                        const color = getModelColor(i);
                        return (
                            <div
                                key={i}
                                className="reasoning-section"
                                style={{borderLeftColor: color.primary}}
                            >
                                <strong>{modelNames[i] || `Model ${i + 1}`}:</strong> {m.reasoning}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
