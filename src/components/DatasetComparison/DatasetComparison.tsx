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

export function DatasetComparison({
                                      result,
                                      fileName,
                                      rowCount,
                                      columnCount,
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
                onReJudge={onReJudge}
                isReJudging={isReJudging}
                scoringCategories={scoringCategories}
            />
        </div>
    );
}
