import type { Status } from '../types';

/**
 * Helper to handle errors consistently across regeneration handlers
 */
export function handleRegenerationError(
    error: unknown,
    setStatus: (status: Status) => void,
    type: 'error' | 'warning' = 'error'
): void {
    setStatus({
        message: `Error regenerating: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type,
    });
}