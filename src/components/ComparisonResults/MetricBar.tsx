import './MetricBar.css';

interface MetricBarProps {
    label: string;
    scoreA: number;
    scoreB: number;
}

export function MetricBar({label, scoreA, scoreB}: MetricBarProps) {
    const maxScore = 10;
    const percentA = (scoreA / maxScore) * 100;
    const percentB = (scoreB / maxScore) * 100;

    const winnerClass =
        scoreA > scoreB ? 'a-wins' : scoreB > scoreA ? 'b-wins' : 'tie';

    return (
        <div className={`metric-bar ${winnerClass}`}>
            <div className="metric-label">{label}</div>
            <div className="metric-scores">
                <div className="metric-score-container model-a">
                    <div className="metric-bar-fill" style={{width: `${percentA}%`}}></div>
                    <span className="metric-score-value">{scoreA}</span>
                </div>
                <div className="metric-divider">vs</div>
                <div className="metric-score-container model-b">
                    <div className="metric-bar-fill" style={{width: `${percentB}%`}}></div>
                    <span className="metric-score-value">{scoreB}</span>
                </div>
            </div>
        </div>
    );
}
