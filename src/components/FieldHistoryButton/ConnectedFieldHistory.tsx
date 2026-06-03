import { type ReactNode } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
    type ColumnFieldKind,
    columnKey,
    type DatasetFieldKey,
    datasetKey,
    getRevisions,
} from '@/utils/fieldRevisions';
import { FieldHistoryButton } from '@/components/FieldHistoryButton/FieldHistoryButton';

interface DatasetFieldHistoryProps {
    field: DatasetFieldKey;
    title?: string;
    formatValue?: (value: string | string[]) => ReactNode;
    disabled?: boolean;
}

export function DatasetFieldHistory({
                                        field,
                                        title,
                                        formatValue,
                                        disabled,
                                    }: DatasetFieldHistoryProps) {
    const { fieldRevisions, generatedResults, handleRevertDatasetField } = useAppContext();
    const revisions = getRevisions(fieldRevisions, datasetKey(field));
    const currentValue: string | string[] = field === 'tags'
        ? generatedResults.tags
        : (generatedResults[field] as string);
    return (
        <FieldHistoryButton
            revisions={ revisions }
            currentValue={ currentValue }
            onRevert={ (revisionId) => handleRevertDatasetField(field, revisionId) }
            title={ title }
            formatValue={ formatValue }
            disabled={ disabled }
        />
    );
}

interface ColumnFieldHistoryProps {
    columnName: string;
    kind: ColumnFieldKind;
    title?: string;
    formatValue?: (value: string | string[]) => ReactNode;
    disabled?: boolean;
    alwaysShow?: boolean;
}

export function ColumnFieldHistory({
                                       columnName,
                                       kind,
                                       title,
                                       formatValue,
                                       disabled,
                                       alwaysShow,
                                   }: ColumnFieldHistoryProps) {
    const { fieldRevisions, generatedResults, handleRevertColumnField } = useAppContext();
    const revisions = getRevisions(fieldRevisions, columnKey(columnName, kind));
    const mapKey: 'columnDescriptions' | 'columnDisplayNames' | 'columnFieldNames' =
        kind === 'description' ? 'columnDescriptions'
            : kind === 'displayName' ? 'columnDisplayNames'
                : 'columnFieldNames';
    const currentValue = generatedResults[mapKey][columnName] ?? '';
    return (
        <FieldHistoryButton
            revisions={ revisions }
            currentValue={ currentValue }
            onRevert={ (revisionId) => handleRevertColumnField(columnName, kind, revisionId) }
            title={ title }
            formatValue={ formatValue }
            disabled={ disabled }
            alwaysShow={ alwaysShow }
        />
    );
}
