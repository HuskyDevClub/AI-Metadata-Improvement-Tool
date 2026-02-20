export interface ModelColor {
    primary: string;
    light: string;
    lighter: string;
    border: string;
    text: string;
    gradientFrom: string;
    gradientTo: string;
    barGradientFrom: string;
    barGradientTo: string;
    focusShadow: string;
}

export const MODEL_COLORS: ModelColor[] = [
    {
        // Blue (Model 1)
        primary: '#3b82f6',
        light: '#dbeafe',
        lighter: '#eff6ff',
        border: '#93c5fd',
        text: '#1d4ed8',
        gradientFrom: '#eff6ff',
        gradientTo: '#dbeafe',
        barGradientFrom: '#3b82f6',
        barGradientTo: '#60a5fa',
        focusShadow: 'rgba(59, 130, 246, 0.1)',
    },
    {
        // Green (Model 2)
        primary: '#22c55e',
        light: '#dcfce7',
        lighter: '#f0fdf4',
        border: '#86efac',
        text: '#15803d',
        gradientFrom: '#f0fdf4',
        gradientTo: '#dcfce7',
        barGradientFrom: '#34d399',
        barGradientTo: '#22c55e',
        focusShadow: 'rgba(34, 197, 94, 0.1)',
    },
    {
        // Amber (Model 3)
        primary: '#f59e0b',
        light: '#fef3c7',
        lighter: '#fffbeb',
        border: '#fcd34d',
        text: '#b45309',
        gradientFrom: '#fffbeb',
        gradientTo: '#fef3c7',
        barGradientFrom: '#f59e0b',
        barGradientTo: '#fbbf24',
        focusShadow: 'rgba(245, 158, 11, 0.1)',
    },
    {
        // Red (Model 4)
        primary: '#ef4444',
        light: '#fee2e2',
        lighter: '#fef2f2',
        border: '#fca5a5',
        text: '#b91c1c',
        gradientFrom: '#fef2f2',
        gradientTo: '#fee2e2',
        barGradientFrom: '#ef4444',
        barGradientTo: '#f87171',
        focusShadow: 'rgba(239, 68, 68, 0.1)',
    },
    {
        // Purple (Model 5)
        primary: '#8b5cf6',
        light: '#ede9fe',
        lighter: '#f5f3ff',
        border: '#c4b5fd',
        text: '#6d28d9',
        gradientFrom: '#f5f3ff',
        gradientTo: '#ede9fe',
        barGradientFrom: '#8b5cf6',
        barGradientTo: '#a78bfa',
        focusShadow: 'rgba(139, 92, 246, 0.1)',
    },
];

export function getModelColor(index: number): ModelColor {
    return MODEL_COLORS[index % MODEL_COLORS.length];
}

export function getModelLabel(index: number, modelName?: string): string {
    const num = index + 1;
    if (modelName) {
        return `Model ${num} (${modelName})`;
    }
    return `Model ${num}`;
}

export function getVariantLabel(index: number, label?: string): string {
    const num = index + 1;
    const defaultLabel = `Prompt ${num}`;
    if (label && label !== defaultLabel) {
        return `Prompt ${num} (${label})`;
    }
    return defaultLabel;
}
