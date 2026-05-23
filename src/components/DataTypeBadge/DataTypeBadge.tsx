import './DataTypeBadge.css';

interface DataTypeBadgeProps {
    type: string;
    originalType?: string;
    size?: 'small' | 'large';
}

export function DataTypeBadge({ type, originalType, size = 'small' }: DataTypeBadgeProps) {
    // Relabel only ambiguous text-like Socrata types when the tool detects
    // they're actually categorical — types like `checkbox`/`flag` already
    // communicate categorical nature, so showing "Categorical" would hide
    // useful info. The link still points to the original Socrata type doc.
    const AMBIGUOUS_TEXT_TYPES = new Set(['text', 'html']);
    const isReclassifiedCategorical =
        !!originalType
        && type === 'categorical'
        && AMBIGUOUS_TEXT_TYPES.has(originalType.toLowerCase());
    const displayType = isReclassifiedCategorical
        ? 'Categorical'
        : (originalType || type);

    // Style by what we're actually showing. When the label is the original
    // Socrata type (e.g. "checkbox"), drop the classified-type class so the
    // categorical CSS rule doesn't paint a checkbox column purple.
    const sanitizedOriginal = originalType?.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const showingOriginalLabel = !!originalType && !isReclassifiedCategorical;
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
                title={isReclassifiedCategorical
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
