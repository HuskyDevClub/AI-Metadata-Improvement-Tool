import type { JudgeResult } from '../../types';
import { MetricBar } from './MetricBar';
import './JudgeScoreCard.css';

interface JudgeScoreCardProps {
    result: JudgeResult | null;
    isJudging: boolean;
    compact?: boolean;
}

export function JudgeScoreCard({result, isJudging, compact = false}: JudgeScoreCardProps) {
    if (isJudging) {
        return (
            <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
                <div className="judge-loading">
                    <div className="judge-spinner"></div>
                    <span>Judge is evaluating...</span>
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

    const totalA =
        result.modelA.clarity +
        result.modelA.completeness +
        result.modelA.accuracy +
        result.modelA.conciseness +
        result.modelA.plainLanguage;

    const totalB =
        result.modelB.clarity +
        result.modelB.completeness +
        result.modelB.accuracy +
        result.modelB.conciseness +
        result.modelB.plainLanguage;

    return (
        <div className={`judge-score-card ${compact ? 'compact' : ''}`}>
            <div className="judge-header">
                <span className="judge-title">Judge Evaluation</span>
                <span className={`judge-winner ${winner.className}`}>{winner.text}</span>
            </div>

            <div className="judge-metrics">
                <MetricBar label="Clarity" scoreA={result.modelA.clarity} scoreB={result.modelB.clarity}/>
                <MetricBar label="Completeness" scoreA={result.modelA.completeness}
                           scoreB={result.modelB.completeness}/>
                <MetricBar label="Accuracy" scoreA={result.modelA.accuracy} scoreB={result.modelB.accuracy}/>
                <MetricBar label="Conciseness" scoreA={result.modelA.conciseness} scoreB={result.modelB.conciseness}/>
                <MetricBar label="Plain Language" scoreA={result.modelA.plainLanguage}
                           scoreB={result.modelB.plainLanguage}/>
            </div>

            <div className="judge-totals">
                <span className="total model-a">A: {totalA}/50</span>
                <span className="total model-b">B: {totalB}/50</span>
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
