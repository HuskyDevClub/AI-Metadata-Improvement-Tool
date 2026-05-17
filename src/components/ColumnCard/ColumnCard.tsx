import type { SuggestionItem } from '../../utils/prompts';
import type { ColumnInfo } from '../../types';
import { formatColumnStats, sanitizeId } from '../../utils/columnAnalyzer';
import { EditableDescription } from '../EditableDescription/EditableDescription';
import './ColumnCard.css';

interface ColumnCardProps {
    name: string;
    info: ColumnInfo;
    description: string;
    onEdit: (newDescription: string) => void;
    onRegenerate: (modifier: '' | 'concise' | 'detailed', customInstruction?: string, sourceText?: string) => void;
    onSuggestImprovement: (sourceText?: string) => void;
    onDismissSuggestions: () => void;
    suggestions: SuggestionItem[];
    isSuggesting: boolean;
    isRegenerating: boolean;
    isGenerating: boolean;
    onToggleSuggestion: (id: string) => void;
    onEditSuggestion: (id: string, text: string) => void;
    onAddSuggestion: (text: string) => void;
    onApplySuggestions: (sourceText?: string) => void;
    pendingDescription?: string | null;
    onAcceptPending?: () => void;
    onDiscardPending?: () => void;
    onReset?: () => void;
    canReset?: boolean;
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
                               onToggleSuggestion,
                               onEditSuggestion,
                               onAddSuggestion,
                               onApplySuggestions,
                               pendingDescription = null,
                               onAcceptPending,
                               onDiscardPending,
                               onReset,
                               canReset = false,
                           }: ColumnCardProps) {

    return (
        <div className="column-card" id={`column-${sanitizeId(name)}`}>
            <h4>
                Description
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
                onToggleSuggestion={onToggleSuggestion}
                onEditSuggestion={onEditSuggestion}
                onAddSuggestion={onAddSuggestion}
                onApplySuggestions={onApplySuggestions}
                pendingDescription={pendingDescription}
                onAcceptPending={onAcceptPending}
                onDiscardPending={onDiscardPending}
                onReset={onReset}
                canReset={canReset}
            />
        </div>
    );
}
