import type { SuggestionItem } from '@/utils/prompts';
import { sanitizeId } from '@/utils/columnAnalyzer';
import { EditableDescription } from '@/components/EditableDescription/EditableDescription';
import { InfoTooltip } from '@/components/InfoTooltip/InfoTooltip';
import { ColumnFieldHistory } from '@/components/FieldHistoryButton/ConnectedFieldHistory';
import '@/components/ColumnCard/ColumnCard.css';

interface ColumnCardProps {
    name: string;
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
    onDeleteSuggestion: (id: string) => void;
    onApplySuggestions: (sourceText?: string) => void;
    pendingDescription?: string | null;
    onAcceptPending?: () => void;
    onDiscardPending?: () => void;
    onReset?: () => void;
    canReset?: boolean;
}

export function ColumnCard({
                               name,
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
                               onDeleteSuggestion,
                               onApplySuggestions,
                               pendingDescription = null,
                               onAcceptPending,
                               onDiscardPending,
                               onReset,
                               canReset = false,
                           }: ColumnCardProps) {

    return (
        <div className="column-card" id={ `column-${ sanitizeId(name) }` }>
            <h4>
                Description
                <InfoTooltip
                    text="What does the column name mean and what does this field include? Describe the range of possible values, their unit of measurement, and the way the data is collected (by humans? By sensors? Is the data standardized in any way?). Always explain what empty cells could mean."
                    width="400px"/>
                <ColumnFieldHistory columnName={ name } kind="description" title="Description"/>
            </h4>

            <EditableDescription
                description={ description }
                onEdit={ onEdit }
                onRegenerate={ onRegenerate }
                onSuggestImprovement={ onSuggestImprovement }
                onDismissSuggestions={ onDismissSuggestions }
                suggestions={ suggestions }
                isSuggesting={ isSuggesting }
                isRegenerating={ isRegenerating }
                isStreaming={ isGenerating }
                compact
                onToggleSuggestion={ onToggleSuggestion }
                onEditSuggestion={ onEditSuggestion }
                onAddSuggestion={ onAddSuggestion }
                onDeleteSuggestion={ onDeleteSuggestion }
                onApplySuggestions={ onApplySuggestions }
                pendingDescription={ pendingDescription }
                onAcceptPending={ onAcceptPending }
                onDiscardPending={ onDiscardPending }
                onReset={ onReset }
                canReset={ canReset }
            />
        </div>
    );
}
