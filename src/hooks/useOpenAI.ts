import { useCallback } from 'react';
import type { GenerationMode, OpenAIConfig, TokenUsage } from '@/types';
import { API_BASE_URL } from '@/utils/config';
import { assertResponseOk } from '@/utils/api';

export function useOpenAI() {
    const callOpenAIStream = useCallback(
        async (
            prompt: string,
            config: OpenAIConfig,
            systemPrompt: string,
            onChunk: (chunk: string) => void,
            abortSignal?: AbortSignal,
            mode: GenerationMode = 'default'
        ): Promise<{ usage: TokenUsage; aborted: boolean }> => {
            // The server resolves the model from the encrypted session config and
            // .env fallbacks based on `mode`, so we don't send `model` here.
            const response = await fetch(`${ API_BASE_URL }/api/openai/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    systemPrompt,
                    baseURL: config.baseURL,
                    apiKey: config.apiKey,
                    mode,
                }),
                credentials: 'include',
                signal: abortSignal,
            });

            await assertResponseOk(response, 'API error');

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

            // SSE events arrive as `data: …` lines, but `reader.read()` chunks
            // are not line-aligned — a single event can be split across two
            // reads. Buffer the trailing partial line and only parse lines we
            // know are complete.
            let buffer = '';

            const processLine = (line: string) => {
                if (!line.startsWith('data: ')) return;
                const data = line.slice(6);
                if (data === '[DONE]') return;
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
                    // Swallow parse errors from a garbled line, but let a real
                    // error event (thrown above) propagate.
                    if (e instanceof SyntaxError) return;
                    throw e;
                }
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    // Whatever follows the last newline may be incomplete —
                    // hold it back until the next read appends to it.
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        processLine(line);
                    }
                }
                // Flush a final line that arrived without a trailing newline.
                if (buffer) processLine(buffer);
            } catch (error) {
                reader.cancel().catch(() => {
                });
                reader.releaseLock();
                if (error instanceof Error && error.name === 'AbortError') {
                    return { usage, aborted: true };
                }
                throw error;
            }

            return { usage, aborted: false };
        },
        []
    );

    return { callOpenAIStream };
}
