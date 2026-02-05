import { useCallback } from 'react';
import type { JudgeResult, OpenAIConfig, TokenUsage } from '../types';
import { useOpenAI } from './useOpenAI';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ParallelGenerationResult {
    modelAOutput: string;
    modelBOutput: string;
    modelAUsage: TokenUsage;
    modelBUsage: TokenUsage;
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
            prompt: string,
            configA: OpenAIConfig,
            configB: OpenAIConfig,
            systemPrompt: string,
            onChunkA: (chunk: string) => void,
            onChunkB: (chunk: string) => void,
            abortSignal?: AbortSignal
        ): Promise<ParallelGenerationResult> => {
            const resultA = callOpenAIStream(prompt, configA, systemPrompt, onChunkA, abortSignal);
            const resultB = callOpenAIStream(prompt, configB, systemPrompt, onChunkB, abortSignal);

            const [resA, resB] = await Promise.all([resultA, resultB]);

            return {
                modelAOutput: '', // Caller tracks output via onChunk callbacks
                modelBOutput: '',
                modelAUsage: resA.usage,
                modelBUsage: resB.usage,
                aborted: resA.aborted || resB.aborted,
            };
        },
        [callOpenAIStream]
    );

    const callJudge = useCallback(
        async (
            context: string,
            candidateA: string,
            candidateB: string,
            judgeConfig: OpenAIConfig
        ): Promise<JudgeCallResult> => {
            const response = await fetch(`${API_BASE_URL}/api/openai/judge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context,
                    candidateA,
                    candidateB,
                    baseURL: judgeConfig.baseURL,
                    apiKey: judgeConfig.apiKey,
                    model: judgeConfig.model,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to call judge API');
            }

            const data = await response.json();

            return {
                result: {
                    modelA: {
                        clarity: data.modelA.clarity,
                        completeness: data.modelA.completeness,
                        accuracy: data.modelA.accuracy,
                        conciseness: data.modelA.conciseness,
                        plainLanguage: data.modelA.plainLanguage,
                        reasoning: data.modelA.reasoning,
                    },
                    modelB: {
                        clarity: data.modelB.clarity,
                        completeness: data.modelB.completeness,
                        accuracy: data.modelB.accuracy,
                        conciseness: data.modelB.conciseness,
                        plainLanguage: data.modelB.plainLanguage,
                        reasoning: data.modelB.reasoning,
                    },
                    winner: data.winner as 'A' | 'B' | 'tie',
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
