import type { ReactNode } from 'react';

// Renders a safe subset of inline Markdown — `code`, **bold**, *italic* —
// as React nodes. AI-generated suggestion text arrives in Markdown because
// the suggestion prompts ask the model to "quote the problematic text."
// React elements are built directly (no dangerouslySetInnerHTML), so untrusted
// dataset content surfaced inside a suggestion cannot inject HTML.
//
// Code spans are matched first; bold (**) is matched before italic (*) so the
// double marker wins. Nested markers are not parsed — adequate for short,
// single-level suggestion sentences.
const TOKEN = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*)/g;

export function renderInlineMarkdown(text: string): ReactNode[] {
    if (!text) return [];
    return text.split(TOKEN).map((part, i) => {
        if (!part) return null;
        if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={i} className="md-code">
                    {part.slice(1, -1)}
                </code>
            );
        }
        if (part.length > 3 && part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.length > 1 && part.startsWith('*') && part.endsWith('*')) {
            return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return part;
    });
}
