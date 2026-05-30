import { getColumnTypeLabel } from '@/utils/columnAnalyzer';
import '@/components/DataTypeBadge/DataTypeBadge.css';

interface DataTypeBadgeProps {
    type: string;
    originalType?: string;
    // For categorical columns: underlying base type, so the badge can render
    // "Number (Categorical)" vs "Text (Categorical)".
    baseType?: 'numeric' | 'text';
    size?: 'small' | 'large';
}

// Socrata types that describe their own categorical nature — shown verbatim
// instead of being relabeled. Mirrors the set in columnAnalyzer.getColumnTypeLabel.
const SELF_DESCRIBING_CATEGORICAL = new Set(['checkbox', 'flag']);

export function DataTypeBadge({ type, originalType, baseType, size = 'small' }: DataTypeBadgeProps) {
    const displayType = getColumnTypeLabel({ type, originalType, baseType });

    // True when we're rendering the synthesized "<Base> (Categorical)" label
    // rather than a raw Socrata type — it drives both the chip colour and the
    // link tooltip. Self-describing types (checkbox/flag) keep their own label.
    const isLabeledCategorical =
        type === 'categorical'
        && !(originalType && SELF_DESCRIBING_CATEGORICAL.has(originalType.toLowerCase()));

    // Style by what we're actually showing. When the label is the original
    // Socrata type (e.g. "checkbox"), drop the classified-type class so the
    // categorical CSS rule doesn't paint a checkbox column purple.
    const sanitizedOriginal = originalType?.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const showingOriginalLabel = !!originalType && !isLabeledCategorical;
    const typeClass = showingOriginalLabel ? '' : ` data-type-badge-${type}`;
    const originalClass = sanitizedOriginal ? ` data-type-badge-${sanitizedOriginal}` : '';
    const badgeClass = `data-type-badge data-type-badge-${size}${typeClass}${originalClass}`;

    if (originalType) {
        return (
            <a
                href={`https://dev.socrata.com/docs/datatypes/${originalType.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className={badgeClass}
                title={isLabeledCategorical
                    ? `Originally Socrata "${originalType}" — view documentation`
                    : 'View Socrata Datatype Documentation'}
                style={{ textDecoration: 'none' }}
            >
                {displayType}
            </a>
        );
    }

    return (
        <span className={badgeClass}>
            {displayType}
        </span>
    );
}
