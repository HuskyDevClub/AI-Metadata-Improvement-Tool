import { useState } from 'react';
import '@/components/shared/configPanel.css';

interface SocrataDomainConfigProps {
    /** Portal currently in effect (null until /api/socrata/config resolves). */
    domain: string | null;
    /** Server default portal enables the "reset to default" action. */
    defaultDomain: string | null;
    /** Persist a new portal; pass '' to clear the override. */
    onSave: (domain: string) => Promise<void>;
}

/** Strip scheme/path so a pasted dataset URL still saves as a bare host. */
function normalizeDomainInput(raw: string): string {
    const value = raw
        .trim()
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .split('?')[0]
        .split('#')[0];
    return value.trim().replace(/\/+$/, '').toLowerCase();
}

export function SocrataDomainConfig({
                                        domain,
                                        defaultDomain,
                                        onSave,
                                    }: SocrataDomainConfigProps) {
    const [input, setInput] = useState(domain ?? '');
    const [isSaving, setIsSaving] = useState(false);

    const normalized = normalizeDomainInput(input);
    const current = (domain ?? '').toLowerCase();
    const dirty = normalized !== current;
    const canSave = !isSaving && dirty && normalized !== '';
    const isOverridden =
        !!domain && !!defaultDomain && domain !== defaultDomain;

    const handleSave = async () => {
        if (!canSave) return;
        setIsSaving(true);
        try {
            await onSave(normalized);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            await onSave(''); // empty clears the override
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="config-section">
            <div className="section-header">
                <div className="section-title">Socrata Portal</div>
                { isOverridden && (
                    <span className="config-status-badge config-status-badge--accent">Custom</span>
                ) }
            </div>
            <div className="config-row">
                <input
                    type="text"
                    placeholder={ defaultDomain ?? 'Enter a Socrata domain' }
                    value={ input }
                    onChange={ (e) => setInput(e.target.value) }
                    onKeyDown={ (e) => {
                        if (e.key === 'Enter') handleSave().then();
                    } }
                    spellCheck={ false }
                    autoCapitalize="off"
                    autoCorrect="off"
                />
                <button
                    type="button"
                    className="btn btn-primary btn-md"
                    onClick={ handleSave }
                    disabled={ !canSave }
                >
                    { isSaving ? 'Saving...' : 'Save' }
                </button>
                { isOverridden && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-md"
                        onClick={ handleReset }
                        disabled={ isSaving }
                    >
                        Reset to default
                    </button>
                ) }
            </div>
            { dirty && !isSaving && (
                <span className="config-dirty-hint config-dirty-hint--block">
                    Unsaved changes
                </span>
            ) }
            <span className="config-help-text config-help-text--block">
                The open data portal this tool reads from and writes to. Any
                Socrata-platform domain works (e.g. data.wa.gov).
                { defaultDomain && (
                    <>
                        { ' ' }Server default: <code>{ defaultDomain }</code>.
                    </>
                ) }{ ' ' }
                Switching portals may require new API credentials or a fresh
                sign-in.
            </span>
        </div>
    );
}
