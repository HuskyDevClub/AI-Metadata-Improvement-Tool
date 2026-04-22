// Pricing per 1M tokens (USD) - updated as of April 2026
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-5.4-nano': { input: 0.20, output: 1.25 },
    'gpt-5.4-mini': { input: 0.75, output: 4.50 },
    'gpt-5-mini': { input: 0.75, output: 4.50 }, // Alias for GPT-5 mini
    'gpt-5.4': { input: 2.50, output: 15.00 },
    'gpt-4o': { input: 2.50, output: 15.00 }, // Assuming GPT-4o maps to GPT-5.4
    'gpt-4o-mini': { input: 0.75, output: 4.50 },
    'gpt-5-nano': { input: 0.20, output: 1.25 },
    'gpt-5.2-chat': { input: 1.75, output: 14.00 },
    'grok-4-fast-non-reasoning': { input: 0.20, output: 0.50 },
};

export function getEstimatedCost(
    model: string,
    promptTokens: number,
    completionTokens: number
): number | null {
    // Find matching pricing (case-insensitive, partial match)
    const modelLower = model.toLowerCase();
    const pricingKey = Object.keys(MODEL_PRICING).find((key) =>
        modelLower.includes(key)
    );

    if (!pricingKey) return null;

    const pricing = MODEL_PRICING[pricingKey];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}
