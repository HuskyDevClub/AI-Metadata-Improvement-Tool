import type { TokenUsage } from '../types';

// For Databricks deployment, use empty string (relative URL) when not specified
// For local development, default to localhost:8000 (Python)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const EMPTY_TOKEN_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
