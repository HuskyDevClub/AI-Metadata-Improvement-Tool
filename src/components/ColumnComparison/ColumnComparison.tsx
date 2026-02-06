import type { ColumnComparisonResult, ColumnInfo, ScoringCategory } from '../../types';
import type { RegenerationModifier } from '../ComparisonResults/RegenerationControls';
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
    // Regeneration props
    onRegenerateA?: (modifier: RegenerationModifier, customInstruction?: string) => void;
    onRegenerateB?: (modifier: RegenerationModifier, customInstruction?: string) => void;
    isRegeneratingA?: boolean;
    isRegeneratingB?: boolean;
    // Re-judge props
    onReJudge?: () => void;
    isReJudging?: boolean;
    scoringCategories?: ScoringCategory[];
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
                                     onRegenerateA,
                                     onRegenerateB,
                                     isRegeneratingA = false,
                                     isRegeneratingB = false,
                                     onReJudge,
                                     isReJudging = false,
                                     scoringCategories,
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
                onRegenerateA={onRegenerateA}
                onRegenerateB={onRegenerateB}
                isRegeneratingA={isRegeneratingA}
                isRegeneratingB={isRegeneratingB}
                isJudging={result.isJudging}
            />

            <JudgeScoreCard
                result={result.judgeResult}
                isJudging={result.isJudging}
                compact
                onReJudge={onReJudge}
                isReJudging={isReJudging}
                scoringCategories={scoringCategories}
            />
        </div>
    );
}
