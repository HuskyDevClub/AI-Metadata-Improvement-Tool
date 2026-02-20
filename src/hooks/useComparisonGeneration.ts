import { useCallback } from 'react';
import type { JudgeResult, OpenAIConfig, ScoringCategory, TokenUsage } from '../types';
import { useOpenAI } from './useOpenAI';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ParallelGenerationResult {
    usages: TokenUsage[];
    aborted: boolean;
}

interface JudgeCallResult {
    result: JudgeResult;
    usage: TokenUsage;
}

export function useComparisonGeneration() {
    const {callOpenAIStream} = useOpenAI();

    const generateParallel = useCallback(
        async (
            prompts: string[],
            configs: OpenAIConfig[],
            systemPrompts: string | string[],
            onChunks: ((chunk: string) => void)[],
            abortSignal?: AbortSignal
        ): Promise<ParallelGenerationResult> => {
            const count = prompts.length;
            const systemPromptArray = typeof systemPrompts === 'string'
                ? Array(count).fill(systemPrompts)
                : systemPrompts;

            const results = await Promise.all(
                Array.from({length: count}, (_, i) =>
                    callOpenAIStream(prompts[i], configs[i], systemPromptArray[i], onChunks[i], abortSignal)
                )
            );

            return {
                usages: results.map(r => r.usage),
                aborted: results.some(r => r.aborted),
            };
        },
        [callOpenAIStream]
    );

    const callJudge = useCallback(
        async (
            context: string,
            outputs: string[],
            judgeConfig: OpenAIConfig,
            judgeSystemPrompt: string,
            judgeEvaluationPrompt: string,
            scoringCategories: ScoringCategory[]
        ): Promise<JudgeCallResult> => {
            const response = await fetch(`${API_BASE_URL}/api/openai/judge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context,
                    outputs,
                    judgeSystemPrompt,
                    judgeEvaluationPrompt,
                    scoringCategories,
                    baseURL: judgeConfig.baseURL,
                    apiKey: judgeConfig.apiKey,
                    model: judgeConfig.model,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                throw new Error(errorBody?.detail || `Judge API error (${response.status})`);
            }

            const data = await response.json();

            return {
                result: {
                    models: data.models,
                    winnerIndex: data.winnerIndex,
                    winnerReasoning: data.winnerReasoning,
                },
                usage: {
                    promptTokens: data.usage.promptTokens,
                    completionTokens: data.usage.completionTokens,
                    totalTokens: data.usage.totalTokens,
                },
            };
        },
        []
    );

    return {generateParallel, callJudge};
}
