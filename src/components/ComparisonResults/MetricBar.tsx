import { getModelColor } from '../../utils/modelColors';
import './MetricBar.css';

interface ModelScore {
    modelIndex: number;
    score: number;
    modelName?: string;
}

interface MetricBarProps {
    label: string;
    scores: ModelScore[];
    maxScore?: number;
}

export function MetricBar({label, scores, maxScore = 10}: MetricBarProps) {
    const highestScore = Math.max(...scores.map(s => s.score));

    return (
        <div className="metric-bar">
            <div className="metric-label">{label}</div>
            <div className="metric-scores-stacked">
                {scores.map((s) => {
                    const percent = (s.score / maxScore) * 100;
                    const color = getModelColor(s.modelIndex);
                    const isWinner = s.score === highestScore && scores.filter(x => x.score === highestScore).length === 1;

                    return (
                        <div key={s.modelIndex} className="metric-score-row">
                            <span
                                className="metric-model-label"
                                style={{color: color.text}}
                            >
                                {s.modelName || `M${s.modelIndex + 1}`}
                            </span>
                            <div className="metric-score-container">
                                <div
                                    className="metric-bar-fill"
                                    style={{
                                        width: `${percent}%`,
                                        background: `linear-gradient(90deg, ${color.barGradientFrom} 0%, ${color.barGradientTo} 100%)`,
                                    }}
                                ></div>
                                <span
                                    className="metric-score-value"
                                    style={{color: isWinner ? color.text : '#374151'}}
                                >
                                    {s.score}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
