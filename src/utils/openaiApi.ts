import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

interface OpenAISession {
    isConfigured: boolean;
    baseURL?: string;
    model?: string;
    modelConcise?: string;
    modelDetailed?: string;
    modelSuggest?: string;
}

export async function fetchOpenAISession(): Promise<OpenAISession> {
    const response = await fetch(`${API_BASE_URL}/api/auth/openai/session`, {
        credentials: 'include',
    });
    if (!response.ok) return { isConfigured: false };
    return response.json();
}

export async function saveOpenAIConfig(
    baseURL: string,
    apiKey: string,
    model: string,
    modelConcise: string,
    modelDetailed: string,
    modelSuggest: string,
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/openai/config`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
            baseURL,
            apiKey,
            model,
            modelConcise,
            modelDetailed,
            modelSuggest,
        }),
    });
    await assertResponseOk(response, 'Failed to save OpenAI configuration');
}

export async function logoutOpenAI(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/openai/logout`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
    });
}
