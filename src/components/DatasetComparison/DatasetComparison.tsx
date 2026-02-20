import type { DatasetComparisonResult, ScoringCategory } from '../../types';
import type { RegenerationModifier } from '../ComparisonResults/RegenerationControls';
import { SideBySideView } from '../ComparisonResults/SideBySideView';
import { JudgeScoreCard } from '../ComparisonResults/JudgeScoreCard';
import './DatasetComparison.css';

interface DatasetComparisonProps {
    result: DatasetComparisonResult;
    fileName: string;
    rowCount: number;
    columnCount: number;
    modelNames: string[];
    generatingModels: Set<number>;
    regeneratingModels: Set<number>;
    onRegenerate?: (slotIndex: number, modifier: RegenerationModifier, customInstruction?: string) => void;
    onReJudge?: () => void;
    isReJudging?: boolean;
    scoringCategories?: ScoringCategory[];
}

export function DatasetComparison({
                                      result,
                                      fileName,
                                      rowCount,
                                      columnCount,
                                      modelNames,
                                      generatingModels,
                                      regeneratingModels,
                                      onRegenerate,
                                      onReJudge,
                                      isReJudging = false,
                                      scoringCategories,
                                  }: DatasetComparisonProps) {
    return (
        <div className="dataset-comparison-section">
            <div className="dataset-comparison-header">
                <h2 className="dataset-comparison-title">Dataset Description Comparison</h2>
                <p className="dataset-comparison-meta">
                    <strong>File:</strong> {fileName} | <strong>Rows:</strong> {rowCount.toLocaleString()} |{' '}
                    <strong>Columns:</strong> {columnCount}
                </p>
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
                onReJudge={onReJudge}
                isReJudging={isReJudging}
                modelNames={modelNames}
                scoringCategories={scoringCategories}
            />
        </div>
    );
}
