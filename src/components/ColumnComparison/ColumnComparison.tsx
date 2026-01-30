import type { ColumnComparisonResult, ColumnInfo } from '../../types';
import { SideBySideView } from '../ComparisonResults/SideBySideView';
import { JudgeScoreCard } from '../ComparisonResults/JudgeScoreCard';
import './ColumnComparison.css';

interface ColumnComparisonProps {
    columnName: string;
    columnInfo: ColumnInfo;
    result: ColumnComparisonResult;
    modelAName?: string;
    modelBName?: string;
    isGeneratingA: boolean;
    isGeneratingB: boolean;
}

const TYPE_COLORS: Record<string, string> = {
    numeric: '#3b82f6',
    categorical: '#22c55e',
    text: '#f59e0b',
    empty: '#9ca3af',
};

export function ColumnComparison({
                                     columnName,
                                     columnInfo,
                                     result,
                                     modelAName = 'Model A',
                                     modelBName = 'Model B',
                                     isGeneratingA,
                                     isGeneratingB,
                                 }: ColumnComparisonProps) {
    return (
        <div className="column-comparison-card">
            <div className="column-comparison-header">
                <span className="column-name">{columnName}</span>
                <span
                    className="column-type-badge"
                    style={{backgroundColor: TYPE_COLORS[columnInfo.type]}}
                >
                    {columnInfo.type}
                </span>
            </div>

            <SideBySideView
                modelAOutput={result.modelAOutput}
                modelBOutput={result.modelBOutput}
                modelAName={modelAName}
                modelBName={modelBName}
                isGeneratingA={isGeneratingA}
                isGeneratingB={isGeneratingB}
                winner={result.judgeResult?.winner}
            />

            <JudgeScoreCard result={result.judgeResult} isJudging={result.isJudging} compact/>
        </div>
    );
}
