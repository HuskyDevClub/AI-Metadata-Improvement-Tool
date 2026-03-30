import type { ColumnComparisonResult, ColumnInfo, ScoringCategory } from '../../types';
import type { RegenerationModifier } from '../ComparisonResults/RegenerationControls';
import { SideBySideView } from '../ComparisonResults/SideBySideView';
import { JudgeScoreCard } from '../ComparisonResults/JudgeScoreCard';
import { TYPE_COLORS } from '../../utils/modelColors';
import './ColumnComparison.css';

interface ColumnComparisonProps {
    columnName: string;
    columnInfo: ColumnInfo;
    result: ColumnComparisonResult;
    modelNames: string[];
    generatingModels: Set<number>;
    regeneratingModels: Set<number>;
    onRegenerate?: (slotIndex: number, modifier: RegenerationModifier, customInstruction?: string) => void;
    onReJudge?: () => void;
    isReJudging?: boolean;
    scoringCategories?: ScoringCategory[];
}

export function ColumnComparison({
                                     columnName,
                                     columnInfo,
                                     result,
                                     modelNames,
                                     generatingModels,
                                     regeneratingModels,
                                     onRegenerate,
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
                    style={{ backgroundColor: TYPE_COLORS[columnInfo.type] }}
                >
                    {columnInfo.type}
                </span>
            </div>

            <SideBySideView
                outputs={result.outputs}
                modelNames={modelNames}
                generatingModels={generatingModels}
                regeneratingModels={regeneratingModels}
                winnerIndex={result.judgeResult ? result.judgeResult.winnerIndex : undefined}
                onRegenerate={onRegenerate}
                isJudging={result.isJudging}
            />

            <JudgeScoreCard
                result={result.judgeResult}
                isJudging={result.isJudging}
                compact
                onReJudge={onReJudge}
                isReJudging={isReJudging}
                modelNames={modelNames}
                scoringCategories={scoringCategories}
            />
        </div>
    );
}
