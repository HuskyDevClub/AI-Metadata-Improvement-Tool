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

    const getConfidenceLevel = (score: number) => {
        if (score >= 0.8) return 'high';
        if (score >= 0.6) return 'medium';
        return 'low';
    };

    const getWinnerDisplay = () => {
        if (result.winnerIndex === null || result.winnerIndex === undefined) {
            return { text: 'Tie', className: 'tie', style: {} };
        }
        const winnerName = modelNames?.[result.winnerIndex] || `Slot ${result.winnerIndex + 1}`;
        const color = getModelColor(result.winnerIndex);
        return {
            text: `${winnerName} Wins`,
            className: 'has-winner',
            style: { background: color.light, color: color.text },
        };
    };

    const winner = getWinnerDisplay();

    // Get scoring category keys from the category prop or from the result data
    const categoryKeys = scoringCategories
        ? scoringCategories.map(c => ({ key: c.key, label: c.label, maxScore: c.maxScore }))
        : Object.keys(result.models[0]?.scores || {}).map(key => ({ key, label: key, maxScore: 10 }));

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
                {categoryKeys.map(({ key, label, maxScore }) => {
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
                        <span key={i} className="total" style={{ color: color.text }}>
                            {name}: {total}/{maxTotal}
                        </span>
                    );
                })}
            </div>

            {result.pairwiseComparisons && result.pairwiseComparisons.length > 0 && (
                <div className="pairwise-comparisons">
                    <div className="pairwise-header">
                        <span className="pairwise-title">Pairwise comparison results</span>
                    </div>
                    <div className="pairwise-grid">
                        {result.pairwiseComparisons.map((pair, idx) => {
                            const modelAName = modelNames?.[pair.modelAIndex] || `Slot ${pair.modelAIndex + 1}`;
                            const modelBName = modelNames?.[pair.modelBIndex] || `Slot ${pair.modelBIndex + 1}`;
                            const totalA = categoryKeys.reduce((sum, c) => sum + (pair.models[0]?.scores[c.key] || 0), 0);
                            const totalB = categoryKeys.reduce((sum, c) => sum + (pair.models[1]?.scores[c.key] || 0), 0);
                            const winnerText = pair.winnerIndex === null
                                ? 'Tie'
                                : pair.winnerIndex === pair.modelAIndex
                                    ? `${modelAName} wins`
                                    : `${modelBName} wins`;
                            const confidence = pair.confidenceMetrics?.composite_confidence_score;

                            return (
                                <div key={idx} className="pairwise-card">
                                    <div className="pairwise-label">
                                        {modelAName} vs {modelBName}
                                    </div>
                                    <div className="pairwise-score">
                                        {modelAName}: {totalA}/{maxTotal}, {modelBName}: {totalB}/{maxTotal}
                                    </div>
                                    <div className="pairwise-winner">{winnerText}</div>
                                    {confidence !== undefined && (
                                        <div className="pairwise-confidence">
                                            Confidence: {Math.round(confidence * 100)}%
                                        </div>
                                    )}
                                    <div className="pairwise-reasoning">
                                        {pair.winnerReasoning}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {result.confidenceMetrics && (
                <div className="confidence-metrics">
                    <div className="confidence-header">
                        <span className="confidence-title">Confidence Score</span>
                        <div className={`confidence-badge ${getConfidenceLevel(result.confidenceMetrics.composite_confidence_score)}`}>
                            {Math.round(result.confidenceMetrics.composite_confidence_score * 100)}%
                        </div>
                    </div>
                    <div className="confidence-bars">
                        <div className="confidence-bar">
                            <span className="confidence-label">Judge Certainty</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${result.confidenceMetrics.judge_certainty * 100}%` }}
                                />
                            </div>
                            <span className="confidence-value">{Math.round(result.confidenceMetrics.judge_certainty * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <span className="confidence-label">Model Agreement</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${result.confidenceMetrics.inter_model_agreement * 100}%` }}
                                />
                            </div>
                            <span className="confidence-value">{Math.round(result.confidenceMetrics.inter_model_agreement * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <span className="confidence-label">Statistical Plausibility</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${result.confidenceMetrics.statistical_plausibility * 100}%` }}
                                />
                            </div>
                            <span className="confidence-value">{Math.round(result.confidenceMetrics.statistical_plausibility * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <span className="confidence-label">Validation Strength</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${result.confidenceMetrics.rule_validation_strength * 100}%` }}
                                />
                            </div>
                            <span className="confidence-value">{Math.round(result.confidenceMetrics.rule_validation_strength * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <span className="confidence-label">Outlier Ratio</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${(1 - result.confidenceMetrics.outlier_ratio) * 100}%` }}
                                />
                            </div>
                            <span className="confidence-value">{Math.round(result.confidenceMetrics.outlier_ratio * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <span className="confidence-label">Likelihood Ratio</span>
                            <div className="confidence-progress">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${Math.min(result.confidenceMetrics.likelihood_ratio * 10, 100)}%` }}
                                />
                            </div>
                            <span className="confidence-value">{result.confidenceMetrics.likelihood_ratio.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="confidence-intervals">
                        <div className="confidence-interval">
                            <span className="interval-label">Agreement CI:</span>
                            <span className="interval-value">
                                [{Math.round(result.confidenceMetrics.agreement_ci_lower * 100)}%, {Math.round(result.confidenceMetrics.agreement_ci_upper * 100)}%]
                            </span>
                        </div>
                        <div className="confidence-interval">
                            <span className="interval-label">Score CI:</span>
                            <span className="interval-value">
                                [{result.confidenceMetrics.score_ci_lower.toFixed(1)}, {result.confidenceMetrics.score_ci_upper.toFixed(1)}]
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {result.confidenceMetrics && (
                <div className="advanced-statistics">
                    <div className="advanced-header">
                        <span className="advanced-title">Advanced Statistical Analysis</span>
                    </div>
                    <div className="advanced-metrics">
                        <div className="advanced-row">
                            <div className="advanced-metric">
                                <span className="metric-label">Effect Size (Cohen's d)</span>
                                <span className="metric-value">{result.confidenceMetrics.effect_size_cohens_d.toFixed(3)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Distribution Skewness</span>
                                <span className="metric-value">{result.confidenceMetrics.distribution_skewness.toFixed(3)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Distribution Kurtosis</span>
                                <span className="metric-value">{result.confidenceMetrics.distribution_kurtosis.toFixed(3)}</span>
                            </div>
                        </div>
                        <div className="advanced-row">
                            <div className="advanced-metric">
                                <span className="metric-label">Robust Median Score</span>
                                <span className="metric-value">{result.confidenceMetrics.robust_median_score.toFixed(2)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Trimmed Mean</span>
                                <span className="metric-value">{result.confidenceMetrics.robust_trimmed_mean.toFixed(2)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Ranking Consistency</span>
                                <span className="metric-value">{(result.confidenceMetrics.ranking_consistency * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                        <div className="advanced-row">
                            <div className="advanced-metric">
                                <span className="metric-label">Performance Stability (CV)</span>
                                <span className="metric-value">{(result.confidenceMetrics.performance_stability_cv * 100).toFixed(1)}%</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">ANOVA F-Statistic</span>
                                <span className="metric-value">{result.confidenceMetrics.statistical_significance_f.toFixed(3)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">p-value</span>
                                <span className="metric-value">{result.confidenceMetrics.statistical_significance_p < 0.001 ? '<0.001' : result.confidenceMetrics.statistical_significance_p.toFixed(3)}</span>
                            </div>
                        </div>
                        <div className="advanced-row">
                            <div className="advanced-metric">
                                <span className="metric-label">Category Correlation</span>
                                <span className="metric-value">{(result.confidenceMetrics.category_correlation_avg * 100).toFixed(1)}%</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Cronbach's Alpha</span>
                                <span className="metric-value">{result.confidenceMetrics.reliability_cronbach_alpha.toFixed(3)}</span>
                            </div>
                            <div className="advanced-metric">
                                <span className="metric-label">Outlier Ratio</span>
                                <span className="metric-value">{(result.confidenceMetrics.outlier_ratio * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="judge-reasoning">
                <strong>Reasoning:</strong> {result.winnerReasoning}
            </div>

            {!compact && (
                <div
                    className="judge-individual-reasoning"
                    style={{ gridTemplateColumns: `repeat(${result.models.length}, 1fr)` }}
                >
                    {result.models.map((m, i) => {
                        const color = getModelColor(i);
                        const name = modelNames?.[i] || `Slot ${i + 1}`;
                        return (
                            <div key={i} className="reasoning-section" style={{ borderLeftColor: color.primary }}>
                                <strong style={{ color: color.text }}>{name}:</strong> {m.reasoning}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
