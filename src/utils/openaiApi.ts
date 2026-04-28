import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

export interface OpenAISession {
    isConfigured: boolean;
    baseURL?: string;
    model?: string;
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
    model: string
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/openai/config`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ baseURL, apiKey, model }),
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
