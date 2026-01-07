import { useCallback } from 'react';
import OpenAI from 'openai';
import type { OpenAIConfig } from '../types';

export function useOpenAI() {
    const callOpenAI = useCallback(
        async (prompt: string, config: OpenAIConfig): Promise<string> => {
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
            return content;
        },
        []
    );

    return {callOpenAI};
}
