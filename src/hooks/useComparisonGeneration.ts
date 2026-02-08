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
            systemPrompt: string,
            onChunks: ((chunk: string) => void)[],
            abortSignal?: AbortSignal
        ): Promise<ParallelGenerationResult> => {
            const promises = configs.map((config, i) =>
                callOpenAIStream(prompts[i], config, systemPrompt, onChunks[i], abortSignal)
            );

            const results = await Promise.all(promises);

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
            candidates: string[],
            judgeConfig: OpenAIConfig,
            judgeSystemPrompt?: string,
            judgeEvaluationPrompt?: string,
            scoringCategories?: ScoringCategory[]
        ): Promise<JudgeCallResult> => {
            const response = await fetch(`${API_BASE_URL}/api/openai/judge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context,
                    candidates,
                    baseURL: judgeConfig.baseURL,
                    apiKey: judgeConfig.apiKey,
                    model: judgeConfig.model,
                    judgeSystemPrompt: judgeSystemPrompt || undefined,
                    judgeEvaluationPrompt: judgeEvaluationPrompt || undefined,
                    scoringCategories: scoringCategories || undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to call judge API');
            }

            const data = await response.json();

            return {
                result: {
                    models: data.models.map((m: { scores: Record<string, number>; reasoning: string }) => ({
                        scores: m.scores,
                        reasoning: m.reasoning,
                    })),
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
