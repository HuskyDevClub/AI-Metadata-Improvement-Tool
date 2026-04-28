import './DataTypeBadge.css';

interface DataTypeBadgeProps {
    type: string;
    originalType?: string;
    size?: 'small' | 'large';
}

export function DataTypeBadge({ type, originalType, size = 'small' }: DataTypeBadgeProps) {
    const sanitizedOriginal = originalType?.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const badgeClass = `data-type-badge data-type-badge-${size} data-type-badge-${type}${sanitizedOriginal ? ` data-type-badge-${sanitizedOriginal}` : ''}`;
    const displayType = originalType || type;

    if (originalType) {
        return (
            <a
                href={`https://dev.socrata.com/docs/datatypes/${originalType.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className={badgeClass}
                title="View Socrata Datatype Documentation"
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
