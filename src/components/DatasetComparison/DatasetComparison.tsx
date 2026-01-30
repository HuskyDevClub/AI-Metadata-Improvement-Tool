import type { DatasetComparisonResult } from '../../types';
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
    onRegenerateA?: () => void;
    onRegenerateB?: () => void;
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
                                  }: DatasetComparisonProps) {
    const isGenerating = isGeneratingA || isGeneratingB;

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
            />

            {!isGenerating && (onRegenerateA || onRegenerateB) && (
                <div className="dataset-comparison-actions">
                    {onRegenerateA && (
                        <button className="regen-btn model-a" onClick={onRegenerateA}>
                            Regenerate A
                        </button>
                    )}
                    {onRegenerateB && (
                        <button className="regen-btn model-b" onClick={onRegenerateB}>
                            Regenerate B
                        </button>
                    )}
                </div>
            )}

            <JudgeScoreCard result={result.judgeResult} isJudging={result.isJudging}/>
        </div>
    );
}
