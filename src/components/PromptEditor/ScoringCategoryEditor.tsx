import type { ScoringCategory } from '../../types';
import './ScoringCategoryEditor.css';

interface ScoringCategoryEditorProps {
    categories: ScoringCategory[];
    onChange: (categories: ScoringCategory[]) => void;
}

function toCamelCase(label: string): string {
    return label
        .trim()
        .split(/\s+/)
        .map((word, i) =>
            i === 0
                ? word.toLowerCase()
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
}

export function ScoringCategoryEditor({categories, onChange}: ScoringCategoryEditorProps) {
    const handleLabelChange = (index: number, newLabel: string) => {
        const updated = categories.map((cat, i) =>
            i === index ? {...cat, label: newLabel, key: toCamelCase(newLabel)} : cat
        );
        onChange(updated);
    };

    const handleDescriptionChange = (index: number, newDescription: string) => {
        const updated = categories.map((cat, i) =>
            i === index ? {...cat, description: newDescription} : cat
        );
        onChange(updated);
    };

    const handleMinScoreChange = (index: number, value: string) => {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            const updated = categories.map((cat, i) =>
                i === index ? {...cat, minScore: num} : cat
            );
            onChange(updated);
        }
    };

    const handleMaxScoreChange = (index: number, value: string) => {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            const updated = categories.map((cat, i) =>
                i === index ? {...cat, maxScore: num} : cat
            );
            onChange(updated);
        }
    };

    const handleRemove = (index: number) => {
        onChange(categories.filter((_, i) => i !== index));
    };

    const handleAdd = () => {
        onChange([...categories, {key: '', label: '', description: '', minScore: 1, maxScore: 10}]);
    };

    return (
        <div className="scoring-category-editor">
            <h4>Scoring Categories</h4>
            <p className="scoring-category-help">
                Define the criteria the judge uses to score each candidate.
                Set the score range per category. The judge system prompt will auto-update when categories change.
            </p>
            <div className="scoring-category-list">
                {categories.map((cat, index) => (
                    <div key={index} className="scoring-category-row">
                        <input
                            type="text"
                            className="scoring-category-label"
                            value={cat.label}
                            onChange={(e) => handleLabelChange(index, e.target.value)}
                            placeholder="Label (e.g., Clarity)"
                        />
                        <input
                            type="text"
                            className="scoring-category-description"
                            value={cat.description}
                            onChange={(e) => handleDescriptionChange(index, e.target.value)}
                            placeholder="Description (e.g., How easy is it to understand?)"
                        />
                        <div className="scoring-category-range">
                            <input
                                type="number"
                                className="scoring-category-range-input"
                                value={cat.minScore}
                                onChange={(e) => handleMinScoreChange(index, e.target.value)}
                                title="Min score"
                            />
                            <span className="scoring-category-range-sep">-</span>
                            <input
                                type="number"
                                className="scoring-category-range-input"
                                value={cat.maxScore}
                                onChange={(e) => handleMaxScoreChange(index, e.target.value)}
                                title="Max score"
                            />
                        </div>
                        <button
                            className="scoring-category-remove"
                            onClick={() => handleRemove(index)}
                            title="Remove category"
                        >
                            x
                        </button>
                    </div>
                ))}
            </div>
            <button className="scoring-category-add" onClick={handleAdd}>
                + Add Category
            </button>
        </div>
    );
}
