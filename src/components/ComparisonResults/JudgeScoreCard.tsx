import type { JudgeResult, ScoringCategory } from '../../types';
import { MetricBar } from './MetricBar';
import './JudgeScoreCard.css';

interface JudgeScoreCardProps {
    result: JudgeResult | null;
    isJudging: boolean;
    compact?: boolean;
    onReJudge?: () => void;
    isReJudging?: boolean;
    scoringCategories?: ScoringCategory[];
}

export function JudgeScoreCard({
                                   result,
                                   isJudging,
                                   compact = false,
                                   onReJudge,
                                   isReJudging = false,
                                   scoringCategories = []
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
        if (result.winner === 'tie') {
            return {text: 'Tie', className: 'tie'};
        }
        return {
            text: `Model ${result.winner} Wins`,
            className: result.winner === 'A' ? 'model-a' : 'model-b',
        };
    };

    const winner = getWinnerDisplay();

    const totalA = Object.values(result.modelA.scores).reduce((a, b) => a + b, 0);
    const totalB = Object.values(result.modelB.scores).reduce((a, b) => a + b, 0);
    const maxTotal = scoringCategories.reduce((sum, cat) => sum + cat.maxScore, 0);

    return (
        <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
            <div className="judge-header">
                <span className="judge-title">Judge Evaluation</span>
                <div className="judge-header-actions">
                    <span className={`judge-winner ${winner.className}`}>{winner.text}</span>
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
                        scoreA={result.modelA.scores[cat.key] ?? 0}
                        scoreB={result.modelB.scores[cat.key] ?? 0}
                        maxScore={cat.maxScore}
                    />
                ))}
            </div>

            <div className="judge-totals">
                <span className="total model-a">A: {totalA}/{maxTotal}</span>
                <span className="total model-b">B: {totalB}/{maxTotal}</span>
            </div>

            <div className="judge-reasoning">
                <strong>Reasoning:</strong> {result.winnerReasoning}
            </div>

            {!compact && (
                <div className="judge-individual-reasoning">
                    <div className="reasoning-section model-a">
                        <strong>Model A:</strong> {result.modelA.reasoning}
                    </div>
                    <div className="reasoning-section model-b">
                        <strong>Model B:</strong> {result.modelB.reasoning}
                    </div>
                </div>
            )}
        </div>
    );
}
