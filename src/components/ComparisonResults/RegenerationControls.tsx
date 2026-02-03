import { useState } from 'react';
import './RegenerationControls.css';

export type RegenerationModifier = '' | 'concise' | 'detailed';

interface RegenerationControlsProps {
    model: 'A' | 'B';
    isRegenerating: boolean;
    isGenerating: boolean;
    isJudging?: boolean;
    onRegenerate: (modifier: RegenerationModifier, customInstruction?: string) => void;
    disabled?: boolean;
}

export function RegenerationControls({
                                         model,
                                         isRegenerating,
                                         isGenerating,
                                         isJudging = false,
                                         onRegenerate,
                                         disabled = false,
                                     }: RegenerationControlsProps) {
    const [customInstruction, setCustomInstruction] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    const isDisabled = disabled || isRegenerating || isGenerating || isJudging;

    const handlePresetClick = (modifier: RegenerationModifier) => {
        if (isDisabled) return;
        onRegenerate(modifier);
    };

    const handleCustomApply = () => {
        if (isDisabled || !customInstruction.trim()) return;
        onRegenerate('', customInstruction.trim());
        setCustomInstruction('');
        setShowCustomInput(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCustomApply();
        }
        if (e.key === 'Escape') {
            setShowCustomInput(false);
            setCustomInstruction('');
        }
    };

    return (
        <div className={`regeneration-controls model-${model.toLowerCase()}`}>
            {isRegenerating ? (
                <div className="regenerating-indicator">
                    <span className="spinner"></span>
                    <span>Regenerating...</span>
                </div>
            ) : (
                <>
                    <div className="preset-buttons">
                        <button
                            className="regen-btn again"
                            onClick={() => handlePresetClick('')}
                            disabled={isDisabled}
                            title="Regenerate with same settings"
                        >
                            Again
                        </button>
                        <button
                            className="regen-btn concise"
                            onClick={() => handlePresetClick('concise')}
                            disabled={isDisabled}
                            title="Regenerate with more concise output"
                        >
                            More Concise
                        </button>
                        <button
                            className="regen-btn detailed"
                            onClick={() => handlePresetClick('detailed')}
                            disabled={isDisabled}
                            title="Regenerate with more detailed output"
                        >
                            More Detailed
                        </button>
                        <button
                            className={`regen-btn custom-toggle ${showCustomInput ? 'active' : ''}`}
                            onClick={() => setShowCustomInput(!showCustomInput)}
                            disabled={isDisabled}
                            title="Add custom instruction"
                        >
                            Custom
                        </button>
                    </div>

                    {showCustomInput && (
                        <div className="custom-instruction-container">
                            <input
                                type="text"
                                className="custom-instruction-input"
                                placeholder="Enter custom instruction..."
                                value={customInstruction}
                                onChange={(e) => setCustomInstruction(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isDisabled}
                                autoFocus
                            />
                            <button
                                className="regen-btn apply"
                                onClick={handleCustomApply}
                                disabled={isDisabled || !customInstruction.trim()}
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
