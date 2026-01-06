import { useCallback } from 'react';
import type { AzureConfig } from '../types';

export function useAzureOpenAI() {
    const callAzureOpenAI = useCallback(
        async (prompt: string, config: AzureConfig): Promise<string> => {
            const url = `${config.endpoint.replace(/\/$/, '')}/openai/deployments/${config.deployment}/chat/completions?api-version=2025-01-01-preview`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.key}`,
                },
                body: JSON.stringify({
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
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        },
        []
    );

    return {callAzureOpenAI};
}
