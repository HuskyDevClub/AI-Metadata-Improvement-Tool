import type { ColumnComparisonResult, ColumnInfo, ScoringCategory } from '../../types';
import type { RegenerationModifier } from '../ComparisonResults/RegenerationControls';
import { type ModelPanelData, SideBySideView } from '../ComparisonResults/SideBySideView';
import { JudgeScoreCard } from '../ComparisonResults/JudgeScoreCard';
import './ColumnComparison.css';

interface ColumnComparisonProps {
    columnName: string;
    columnInfo: ColumnInfo;
    result: ColumnComparisonResult;
    modelNames: string[];
    generatingModels: Set<number>;
    regeneratingModels: Set<number>;
    onRegenerate?: (modelIndex: number, modifier: RegenerationModifier, customInstruction?: string) => void;
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
                                     modelNames,
                                     generatingModels,
                                     regeneratingModels,
                                     onRegenerate,
                                     onReJudge,
                                     isReJudging = false,
                                     scoringCategories,
                                 }: ColumnComparisonProps) {
    const panels: ModelPanelData[] = modelNames.map((name, i) => ({
        modelIndex: i,
        modelName: name,
        output: result.outputs[i] || '',
        isGenerating: generatingModels.has(i),
        isRegenerating: regeneratingModels.has(i),
        onRegenerate: onRegenerate
            ? (modifier: RegenerationModifier, customInstruction?: string) =>
                onRegenerate(i, modifier, customInstruction)
            : undefined,
    }));

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
                panels={panels}
                winnerIndex={result.judgeResult?.winnerIndex}
                isJudging={result.isJudging}
            />

            <JudgeScoreCard
                result={result.judgeResult}
                isJudging={result.isJudging}
                compact
                onReJudge={onReJudge}
                isReJudging={isReJudging}
                scoringCategories={scoringCategories}
                modelNames={modelNames}
            />
        </div>
    );
}
