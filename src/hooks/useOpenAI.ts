import { useCallback } from 'react';
import OpenAI from 'openai';
import type { OpenAIConfig, OpenAIResponse, TokenUsage } from '../types';

export function useOpenAI() {
    const callOpenAI = useCallback(
        async (prompt: string, config: OpenAIConfig): Promise<OpenAIResponse> => {
            const client = new OpenAI({
                baseURL: config.baseURL,
                apiKey: config.apiKey,
                dangerouslyAllowBrowser: true,
            });

            const response = await client.chat.completions.create({
                model: config.model,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a data analyst expert who creates clear, concise, and informative descriptions of datasets and their columns.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });

            const content = response.choices[0].message.content;
            if (!content) {
                throw new Error('No response content from OpenAI');
            }

            return {
                content,
                usage: {
                    promptTokens: response.usage?.prompt_tokens ?? 0,
                    completionTokens: response.usage?.completion_tokens ?? 0,
                    totalTokens: response.usage?.total_tokens ?? 0,
                },
            };
        },
        []
    );

    const callOpenAIStream = useCallback(
        async (
            prompt: string,
            config: OpenAIConfig,
            onChunk: (chunk: string) => void,
            abortSignal?: AbortSignal
        ): Promise<{ usage: TokenUsage; aborted: boolean }> => {
            const client = new OpenAI({
                baseURL: config.baseURL,
                apiKey: config.apiKey,
                dangerouslyAllowBrowser: true,
            });

            const stream = await client.chat.completions.create(
                {
                    model: config.model,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a data analyst expert who creates clear, concise, and informative descriptions of datasets and their columns.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    stream: true,
                    stream_options: {include_usage: true},
                },
                {signal: abortSignal}
            );

            let usage: TokenUsage = {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            };

            try {
                for await (const chunk of stream) {
                    if (abortSignal?.aborted) {
                        return {usage, aborted: true};
                    }
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        onChunk(content);
                    }
                    if (chunk.usage) {
                        usage = {
                            promptTokens: chunk.usage.prompt_tokens ?? 0,
                            completionTokens: chunk.usage.completion_tokens ?? 0,
                            totalTokens: chunk.usage.total_tokens ?? 0,
                        };
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

    return {callOpenAI, callOpenAIStream};
}
