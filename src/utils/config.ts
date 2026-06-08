// Default to relative URLs. In dev, Vite's server.proxy forwards /api/* to the
// backend on :8000 (same origin, so the OAuth session cookie works). In prod,
// the backend serves the built frontend at the same origin.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Set to `true` to allow users to edit the API field name. When off, the field
// name is read-only in the UI and is omitted entirely from metadata exports.
export const ENABLE_API_FIELD_NAME_EDIT = false;
