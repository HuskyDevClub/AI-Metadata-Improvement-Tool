import type { ColumnInfo } from '../../types';
import { formatColumnStats, sanitizeId } from '../../utils/columnAnalyzer';
import { EditableDescription } from '../EditableDescription/EditableDescription';
import './ColumnCard.css';

interface ColumnCardProps {
    name: string;
    info: ColumnInfo;
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string) => void;
    onSuggestImprovement: () => void;
    onDismissSuggestions: () => void;
    suggestions: string;
    isSuggesting: boolean;
    isRegenerating: boolean;
    isGenerating: boolean;
}

export function ColumnCard({
                               name,
                               info,
                               description,
                               onEdit,
                               onRegenerate,
                               onSuggestImprovement,
                               onDismissSuggestions,
                               suggestions,
                               isSuggesting,
                               isRegenerating,
                               isGenerating,
                           }: ColumnCardProps) {
    const getTypeClass = () => {
        switch (info.type) {
            case 'numeric':
                return 'column-card-type-numeric';
            case 'categorical':
                return 'column-card-type-categorical';
            default:
                return 'column-card-type-text';
        }
    };

    return (
        <div className="column-card" id={`column-${sanitizeId(name)}`}>
            <h4>
                {name}
                <span className={`column-card-type ${getTypeClass()}`}>{info.type}</span>
            </h4>
            <div className="column-card-stats">{formatColumnStats(info)}</div>

            <EditableDescription
                description={description}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                onSuggestImprovement={onSuggestImprovement}
                onDismissSuggestions={onDismissSuggestions}
                suggestions={suggestions}
                isSuggesting={isSuggesting}
                isRegenerating={isRegenerating}
                isStreaming={isGenerating}
                compact
            />
        </div>
    );
}
