// For Databricks deployment, use empty string (relative URL) when not specified
// For local development, default to localhost:8000 (Python)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
