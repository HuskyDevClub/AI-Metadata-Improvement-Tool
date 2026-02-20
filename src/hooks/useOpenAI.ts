import { useCallback } from 'react';
import type { OpenAIConfig, TokenUsage } from '../types';

// For Databricks deployment, use empty string (relative URL) when not specified
// For local development, default to localhost:3001 (Express) or localhost:8000 (Python)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function useOpenAI() {
    const callOpenAIStream = useCallback(
        async (
            prompt: string,
            config: OpenAIConfig,
            systemPrompt: string,
            onChunk: (chunk: string) => void,
            abortSignal?: AbortSignal
        ): Promise<{ usage: TokenUsage; aborted: boolean }> => {
            const response = await fetch(`${API_BASE_URL}/api/openai/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    systemPrompt,
                    baseURL: config.baseURL,
                    apiKey: config.apiKey,
                    model: config.model,
                }),
                signal: abortSignal,
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                throw new Error(errorBody?.detail || `API error (${response.status})`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let usage: TokenUsage = {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            };

            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value, {stream: true});
                    const lines = text.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.type === 'content' && parsed.content) {
                                    onChunk(parsed.content);
                                } else if (parsed.type === 'usage' && parsed.usage) {
                                    usage = {
                                        promptTokens: parsed.usage.promptTokens,
                                        completionTokens: parsed.usage.completionTokens,
                                        totalTokens: parsed.usage.totalTokens,
                                    };
                                } else if (parsed.type === 'error') {
                                    throw new Error(parsed.error);
                                }
                            } catch (e) {
                                // Ignore JSON parse errors for incomplete chunks
                                if (e instanceof SyntaxError) continue;
                                throw e;
                            }
                        }
                    }
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return {usage, aborted: true};
                }
                throw error;
            }

            return {usage, aborted: false};
        },
        []
    );

    return {callOpenAIStream};
}
