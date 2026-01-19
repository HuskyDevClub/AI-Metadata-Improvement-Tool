import { Request, Response, Router } from 'express';
import OpenAI from 'openai';

const router = Router();

interface ChatRequest {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    baseURL?: string;
    apiKey?: string;
}

// Get OpenAI client configuration
function getOpenAIConfig(req: ChatRequest) {
    return {
        baseURL: req.baseURL || process.env.AZURE_ENDPOINT!,
        apiKey: req.apiKey || process.env.AZURE_KEY!,
        model: req.model || process.env.AZURE_MODEL!,
    };
}

// Non-streaming chat completion
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const body = req.body as ChatRequest;
        const config = getOpenAIConfig(body);

        if (!config.apiKey) {
            res.status(400).json({error: 'API key is required'});
            return;
        }

        const client = new OpenAI({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
        });

        const systemPrompt = body.systemPrompt ||
            'You are a data analyst expert who creates clear, concise, and informative descriptions of datasets and their columns.';

        const response = await client.chat.completions.create({
            model: config.model,
            messages: [
                {role: 'system', content: systemPrompt},
                {role: 'user', content: body.prompt},
            ],
        });

        const content = response.choices[0].message.content;
        if (!content) {
            res.status(500).json({error: 'No response content from OpenAI'});
            return;
        }

        res.json({
            content,
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0,
            },
        });
    } catch (error) {
        console.error('OpenAI chat error:', error);
        const message = error instanceof Error ? error.message : 'OpenAI API error';
        res.status(500).json({error: message});
    }
});

// Streaming chat completion
router.post('/chat/stream', async (req: Request, res: Response) => {
    try {
        const body = req.body as ChatRequest;
        const config = getOpenAIConfig(body);

        if (!config.apiKey) {
            res.status(400).json({error: 'API key is required'});
            return;
        }

        const client = new OpenAI({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
        });

        const systemPrompt = body.systemPrompt ||
            'You are a data analyst expert who creates clear, concise, and informative descriptions of datasets and their columns.';

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const stream = await client.chat.completions.create({
            model: config.model,
            messages: [
                {role: 'system', content: systemPrompt},
                {role: 'user', content: body.prompt},
            ],
            stream: true,
            stream_options: {include_usage: true},
        });

        let usage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
        };

        // Handle client disconnect
        req.on('close', () => {
            stream.controller.abort();
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                res.write(`data: ${JSON.stringify({type: 'content', content})}\n\n`);
            }
            if (chunk.usage) {
                usage = {
                    promptTokens: chunk.usage.prompt_tokens ?? 0,
                    completionTokens: chunk.usage.completion_tokens ?? 0,
                    totalTokens: chunk.usage.total_tokens ?? 0,
                };
            }
        }

        // Send final usage data
        res.write(`data: ${JSON.stringify({type: 'usage', usage})}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('OpenAI stream error:', error);
        const message = error instanceof Error ? error.message : 'OpenAI API error';

        // If headers already sent, send the error as SSE
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({type: 'error', error: message})}\n\n`);
            res.end();
        } else {
            res.status(500).json({error: message});
        }
    }
});

export { router as openaiRouter };
