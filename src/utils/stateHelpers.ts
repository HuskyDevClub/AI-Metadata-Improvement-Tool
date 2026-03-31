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

/**
 * Helper to handle judge errors consistently
 */
export function handleJudgeError(
    error: unknown,
    setStatus: (status: Status) => void
): void {
    setStatus({
        message: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'warning',
    });
}