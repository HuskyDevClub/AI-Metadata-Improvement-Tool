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
    modelNames?: string[];
    scoringCategories?: ScoringCategory[];
}

export function JudgeScoreCard({
                                   result,
                                   isJudging,
                                   compact = false,
                                   onReJudge,
                                   isReJudging = false,
                                   modelNames,
                                   scoringCategories,
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
        if (result.winnerIndex === null || result.winnerIndex === undefined) {
            return {text: 'Tie', className: 'tie', style: {}};
        }
        const winnerName = modelNames?.[result.winnerIndex] || `Slot ${result.winnerIndex + 1}`;
        const color = getModelColor(result.winnerIndex);
        return {
            text: `${winnerName} Wins`,
            className: 'has-winner',
            style: {background: color.light, color: color.text},
        };
    };

    const winner = getWinnerDisplay();

    // Get scoring category keys from the categories prop or from the result data
    const categoryKeys = scoringCategories
        ? scoringCategories.map(c => ({key: c.key, label: c.label, maxScore: c.maxScore}))
        : Object.keys(result.models[0]?.scores || {}).map(key => ({key, label: key, maxScore: 10}));

    // Calculate total max score
    const maxTotal = categoryKeys.reduce((sum, c) => sum + c.maxScore, 0);

    return (
        <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
            <div className="judge-header">
                <span className="judge-title">Judge Evaluation</span>
                <div className="judge-header-actions">
                    <span className={`judge-winner ${winner.className}`} style={winner.style}>{winner.text}</span>
                    {onReJudge && (
                        <button
                            className="rejudge-btn"
                            onClick={onReJudge}
                            title="Re-run judge evaluation"
                        >
                            &#x27F3;
                        </button>
                    )}
                </div>
            </div>

            <div className="judge-metrics">
                {categoryKeys.map(({key, label, maxScore}) => {
                    const scores = result.models.map((m, i) => ({
                        modelIndex: i,
                        score: m.scores[key] || 0,
                        modelName: modelNames?.[i],
                    }));
                    return (
                        <MetricBar
                            key={key}
                            label={label}
                            scores={scores}
                            maxScore={maxScore}
                        />
                    );
                })}
            </div>

            <div className="judge-totals">
                {result.models.map((m, i) => {
                    const total = categoryKeys.reduce((sum, c) => sum + (m.scores[c.key] || 0), 0);
                    const color = getModelColor(i);
                    const name = modelNames?.[i] || `Slot ${i + 1}`;
                    return (
                        <span key={i} className="total" style={{color: color.text}}>
                            {name}: {total}/{maxTotal}
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
                        const name = modelNames?.[i] || `Slot ${i + 1}`;
                        return (
                            <div key={i} className="reasoning-section" style={{borderLeftColor: color.primary}}>
                                <strong style={{color: color.text}}>{name}:</strong> {m.reasoning}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
