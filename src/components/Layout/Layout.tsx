import { useEffect, useRef, useState } from 'react';
import type { PageId } from '@/contexts/AppContext';
import { useAppContext } from '@/contexts/AppContext';
import { FloatingActions } from '@/components/FloatingActions/FloatingActions';
import { ResetFieldButton } from '@/components/ResetFieldButton/ResetFieldButton';
import { StatusMessage } from '@/components/StatusMessage/StatusMessage';
import { InfoTooltip } from '@/components/InfoTooltip/InfoTooltip';
import { ImportPage } from '@/pages/ImportPage';
import { DataOverviewPage } from '@/pages/DataOverviewPage';
import { FieldOverviewPage } from '@/pages/FieldOverviewPage';
import { DiffView } from '@/components/shared/DiffView';
import { SettingsPage } from '@/pages/SettingsPage';
import { DatasetFieldHistory } from '@/components/FieldHistoryButton/ConnectedFieldHistory';
import '@/components/Layout/Layout.css';

function NavTab({ page, label, disabled }: {page: PageId; label: string; disabled?: boolean}) {
    const { currentPage, navigate } = useAppContext();
    const isActive = currentPage === page;
    const isImport = page === 'import';

    return (
        <button
            className={`layout-nav-link ${isImport ? 'layout-import-tab' : ''} ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => {
                if (!disabled) navigate(page);
            }}
        >
            {isImport && (
                <span className="layout-import-tab-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                         strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                </span>
            )}
            {label}
        </button>
    );
}

type DropSide = 'before' | 'after';
type DragOverState = {id: string; side: DropSide} | null;

interface DatasetTabProps {
    id: string;
    label: string;
    isDragging: boolean;
    dropSide: DropSide | null;
    onDragStartTab: (id: string) => void;
    onDragOverTab: (id: string, side: DropSide) => void;
    onDropTab: (targetId: string, side: DropSide) => void;
    onDragEndTab: () => void;
}

function DatasetTab({
                        id, label, isDragging, dropSide,
                        onDragStartTab, onDragOverTab, onDropTab, onDragEndTab,
                    }: DatasetTabProps) {
    const { activeDatasetId, currentPage, switchToDataset, closeTab } = useAppContext();
    const isActive = id === activeDatasetId && currentPage !== 'import';

    const computeSide = (e: React.DragEvent<HTMLButtonElement>): DropSide => {
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    };

    const classes = [
        'layout-nav-link',
        'layout-dataset-tab',
        isActive ? 'active' : '',
        isDragging ? 'is-dragging' : '',
        dropSide === 'before' ? 'drop-before' : '',
        dropSide === 'after' ? 'drop-after' : '',
    ].filter(Boolean).join(' ');

    return (
        <button
            className={classes}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                onDragStartTab(id);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                onDragOverTab(id, computeSide(e));
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDropTab(id, computeSide(e));
            }}
            onDragEnd={onDragEndTab}
            onClick={() => switchToDataset(id)}
            onAuxClick={(e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    closeTab(id);
                }
            }}
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}
            title={label}
        >
            <span className="layout-dataset-tab-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                     strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                </svg>
            </span>
            <span className="layout-dataset-tab-name">{label}</span>
            <span
                className="layout-dataset-tab-close"
                onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Close dataset "${label}"?`)) {
                        closeTab(id);
                    }
                }}
                title="Close dataset"
            >
                &times;
            </span>
        </button>
    );
}

function DatasetTitleBar() {
    const {
        fileName,
        generatedResults,
        initialResults,
        handleEditDatasetTitle,
        handleGenerateDatasetTitle,
        handleResetField,
        generatingDatasetTitle,
        socrataDatasetId,
        socrataDomain,
        pendingDatasetTitle,
        handleAcceptPendingDatasetTitle,
        handleDiscardPendingDatasetTitle,
    } = useAppContext();

    const title = generatedResults.datasetTitle;
    const titleChanged = !!initialResults && generatedResults.datasetTitle !== initialResults.datasetTitle;
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(title);
    const hasPending = pendingDatasetTitle !== null;

    useEffect(() => {
        if (!isEditing) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditValue(title);
        }
    }, [title, isEditing]);

    const save = () => {
        handleEditDatasetTitle(editValue.trim());
        setIsEditing(false);
    };
    const cancel = () => {
        setEditValue(title);
        setIsEditing(false);
    };

    const isSocrataImport = !!socrataDatasetId;
    const subtitleText = isSocrataImport ? socrataDatasetId : fileName;
    const showSubtitle = !isEditing && !hasPending && !!title && title !== subtitleText;

    if (hasPending) {
        return (
            <div className="layout-dataset-title-group">
                <DiffView
                    currentLabel="Current title"
                    currentValue={title}
                    currentEmptyState={<em className="diff-view-empty">No title</em>}
                    newLabel="New title"
                    newValue={pendingDatasetTitle}
                    isGenerating={generatingDatasetTitle}
                    onAccept={handleAcceptPendingDatasetTitle}
                    onDiscard={handleDiscardPendingDatasetTitle}
                    className="layout-dataset-title-pending"
                    acceptTooltip="Replace the current title with the new one"
                    discardTooltip="Discard the new title and keep the current one"
                />
            </div>
        );
    }

    return (
        <div className="layout-dataset-title-group">
            <div className="layout-dataset-title-row">
                {isEditing ? (
                    <div className="layout-dataset-title-edit">
                        <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="layout-dataset-title-input"
                            placeholder="e.g. Washington State Vehicle Registrations"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') save();
                                if (e.key === 'Escape') cancel();
                            }}
                        />
                        <button className="btn btn-primary btn-md" onClick={save}>Save</button>
                        <button className="btn btn-ghost btn-md" onClick={cancel}>Cancel</button>
                    </div>
                ) : (
                    <>
                        <h2 className="layout-dataset-title">
                            {generatingDatasetTitle ? (
                                <span className="layout-dataset-title-generating">
                                    {title || 'Generating title...'}
                                    <span className="ed-cursor">|</span>
                                </span>
                            ) : (
                                title || <span className="layout-dataset-title-fallback">{fileName}</span>
                            )}
                        </h2>
                        <InfoTooltip
                            text="If someone sees just this title in search results, will they understand what the data includes? Don't use the word data, your agency name or years covered. Put location at the end in parentheses, (e.g., Library Branch Locations (Washington State))."
                            width="400px"/>
                        <DatasetFieldHistory field="datasetTitle" title="Title"/>
                        {!generatingDatasetTitle && (
                            <span className="layout-dataset-title-actions">
                                <button
                                    className="btn btn-ghost btn-md"
                                    onClick={() => {
                                        setEditValue(title);
                                        setIsEditing(true);
                                    }}
                                    title="Edit title"
                                    aria-label="Edit title"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <path d="M12 20h9"/>
                                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                    </svg>
                                </button>
                                <button
                                    className="btn btn-primary btn-md"
                                    onClick={handleGenerateDatasetTitle}
                                    title="Generate title with AI"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z"/>
                                    </svg>
                                    {title ? 'Regenerate' : 'Generate'}
                                </button>
                                <ResetFieldButton
                                    show={titleChanged}
                                    onReset={() => handleResetField('datasetTitle')}
                                    title="Reset title to the value loaded from the dataset"
                                />
                            </span>
                        )}
                    </>
                )}
            </div>
            {showSubtitle && (
                <div className="layout-dataset-subtitle" title={subtitleText}>
                    {isSocrataImport && (
                        <span className="layout-dataset-subtitle-label">Dataset ID</span>
                    )}
                    {isSocrataImport && socrataDomain ? (
                        <a
                            className="layout-dataset-subtitle-value"
                            href={`https://${socrataDomain}/d/${socrataDatasetId}/about_data`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open About page on ${socrataDomain}`}
                        >
                            {subtitleText}
                            <svg
                                className="layout-dataset-subtitle-external"
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                        </a>
                    ) : (
                        <span className="layout-dataset-subtitle-value">{subtitleText}</span>
                    )}
                </div>
            )}
        </div>
    );
}

function CurrentPage() {
    const { currentPage } = useAppContext();
    switch (currentPage) {
        case 'import':
            return <ImportPage/>;
        case 'data':
            return <DataOverviewPage/>;
        case 'field':
            return <FieldOverviewPage/>;
    }
}

export function Layout() {
    const {
        status,
        isProcessing,
        showResults,
        fileName,
        currentPage,
        handleStop,
        socrataOAuthUser,
        isSocrataOAuthAuthenticating,
        handleSocrataOAuthLogin,
        handleSocrataOAuthLogout,
        isPushingSocrata,
        socrataDatasetId,
        socrataCanEdit,
        socrataApiKeyId,
        handlePushToSocrata,
        handleExportMetadata,
        handleImportMetadata,
        datasetTabs,
        socrataDomain,
        enableSocrataOAuth,
        reorderTabs,
    } = useAppContext();

    const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<DragOverState>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const importMetadataRef = useRef<HTMLInputElement>(null);

    const navRef = useRef<HTMLElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const updateScrollState = () => {
            const { scrollLeft, scrollWidth, clientWidth } = nav;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
        };

        updateScrollState();
        nav.addEventListener('scroll', updateScrollState, { passive: true });
        const resizeObserver = new ResizeObserver(updateScrollState);
        resizeObserver.observe(nav);
        for (const child of Array.from(nav.children)) {
            resizeObserver.observe(child);
        }

        // Translate vertical mouse-wheel input into horizontal tab scroll.
        // Trackpads emit deltaX directly, so we only intercept the pure-deltaY
        // case (mouse wheels). We always preventDefault here so single-tab navs
        // don't jiggle 1px vertically from the implicit overflow-y: auto that
        // overflow-x: auto forces.
        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY === 0 || e.deltaX !== 0) return;
            e.preventDefault();
            if (nav.scrollWidth > nav.clientWidth) {
                nav.scrollLeft += e.deltaY;
            }
        };
        nav.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            nav.removeEventListener('scroll', updateScrollState);
            nav.removeEventListener('wheel', handleWheel);
            resizeObserver.disconnect();
        };
    }, [datasetTabs.length]);

    const scrollTabs = (direction: 'left' | 'right') => {
        const nav = navRef.current;
        if (!nav) return;
        const amount = nav.clientWidth * 0.7 * (direction === 'left' ? -1 : 1);
        nav.scrollBy({ left: amount, behavior: 'smooth' });
    };

    const handleDragStartTab = (id: string) => setDraggingTabId(id);
    const handleDragOverTab = (id: string, side: DropSide) => {
        if (!draggingTabId || draggingTabId === id) {
            // Don't show an indicator on the tab being dragged itself.
            if (dragOver) setDragOver(null);
            return;
        }
        if (!dragOver || dragOver.id !== id || dragOver.side !== side) {
            setDragOver({ id, side });
        }
    };
    const handleDropTab = (targetId: string, side: DropSide) => {
        if (draggingTabId && draggingTabId !== targetId) {
            reorderTabs(draggingTabId, targetId, side);
        }
        setDraggingTabId(null);
        setDragOver(null);
    };
    const handleDragEndTab = () => {
        setDraggingTabId(null);
        setDragOver(null);
    };

    // Pushing metadata requires Socrata credentials — an OAuth sign-in and/or
    // saved API keys (independent identities; either may carry write access).
    const hasSocrataAuth = !!socrataOAuthUser || !!socrataApiKeyId;

    // For a Socrata-imported dataset the Push button is always shown, but
    // disabled with an explanation when the push cannot succeed: no
    // credentials at all, or credentials that lack write access here.
    const credentialsHint = enableSocrataOAuth
        ? `Sign in${socrataDomain ? ` to ${socrataDomain}` : ''} or add API credentials in Settings`
        : 'Add API credentials in Settings';
    const noWriteAccessHint = enableSocrataOAuth
        ? `Your Socrata sign-in and API credentials don't have write access`
        : `Your API credentials don't have write access`;
    const pushDisabledReason = !hasSocrataAuth
        ? `${credentialsHint} to push metadata`
        : !socrataCanEdit
            ? `${noWriteAccessHint} to this dataset${socrataDomain ? ` on ${socrataDomain}` : ''}`
            : null;

    return (
        <div className="container">
            <div className="layout-header">
                <div className="layout-header-title">
                    <h1>AI Metadata Improvement Tool</h1>
                    <span className="layout-header-subtitle">Generate & improve dataset metadata with AI</span>
                </div>
                <div className="layout-header-actions">
                    {enableSocrataOAuth && (
                        socrataOAuthUser ? (
                            <span className="layout-oauth-status">
                                Signed in as <strong>{socrataOAuthUser.displayName}</strong>
                                <button type="button" className="btn btn-secondary btn-md"
                                        onClick={handleSocrataOAuthLogout}>
                                    Sign out
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary btn-md"
                                onClick={handleSocrataOAuthLogin}
                                disabled={isSocrataOAuthAuthenticating}
                            >
                                {isSocrataOAuthAuthenticating
                                    ? 'Signing in...'
                                    : socrataDomain ? `Sign in with ${socrataDomain}` : 'Sign in'}
                            </button>
                        )
                    )}
                    <button
                        className={`layout-settings-btn ${settingsOpen ? 'active' : ''}`}
                        onClick={() => setSettingsOpen(true)}
                        title="Settings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path
                                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
                <div className="layout-nav-container">
                    <nav className="layout-nav" ref={navRef}>
                        <NavTab page="import" label="Import"/>
                        {datasetTabs.length > 0 && <span className="layout-nav-divider"/>}
                        {datasetTabs.map(tab => (
                            <DatasetTab
                                key={tab.id}
                                id={tab.id}
                                label={tab.label}
                                isDragging={draggingTabId === tab.id}
                                dropSide={dragOver?.id === tab.id ? dragOver.side : null}
                                onDragStartTab={handleDragStartTab}
                                onDragOverTab={handleDragOverTab}
                                onDropTab={handleDropTab}
                                onDragEndTab={handleDragEndTab}
                            />
                        ))}
                    </nav>
                    {canScrollLeft && (
                        <button
                            type="button"
                            className="layout-nav-scroll layout-nav-scroll-left"
                            onClick={() => scrollTabs('left')}
                            aria-label="Scroll tabs left"
                            title="Scroll tabs left"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                        </button>
                    )}
                    {canScrollRight && (
                        <button
                            type="button"
                            className="layout-nav-scroll layout-nav-scroll-right"
                            onClick={() => scrollTabs('right')}
                            aria-label="Scroll tabs right"
                            title="Scroll tabs right"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            {showResults && fileName && (currentPage === 'data' || currentPage === 'field') && (
                <div className="layout-dataset-bar">
                    <DatasetTitleBar/>
                    <div className="layout-dataset-bar-actions">
                        <input
                            ref={importMetadataRef}
                            type="file"
                            accept="application/json,.json"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleImportMetadata(file);
                                e.target.value = '';
                            }}
                        />
                        <button
                            className="btn btn-secondary btn-md layout-dataset-push-btn"
                            onClick={() => importMetadataRef.current?.click()}
                            title="Import metadata from a previously exported JSON file and apply it to this dataset"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Import
                        </button>
                        <button
                            className="btn btn-secondary btn-md layout-dataset-push-btn"
                            onClick={handleExportMetadata}
                            title="Export this dataset's metadata as a JSON file"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 5 17 10"/>
                                <line x1="12" y1="5" x2="12" y2="15"/>
                            </svg>
                            Export
                        </button>
                        {socrataDatasetId && (
                            <button
                                className="btn btn-primary btn-md layout-dataset-push-btn"
                                onClick={handlePushToSocrata}
                                disabled={isPushingSocrata || !!pushDisabledReason}
                                title={pushDisabledReason ?? undefined}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                {isPushingSocrata
                                    ? 'Pushing...'
                                    : socrataDomain ? `Push to ${socrataDomain}` : 'Push'}
                            </button>
                        )}
                    </div>
                </div>
            )}
            <div className="content">
                <StatusMessage key={status ? `${status.type}-${status.message}` : 'none'} status={status}
                               isProcessing={isProcessing} onStop={handleStop}/>
                <CurrentPage/>
            </div>
            <FloatingActions/>
            {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)}/>}
        </div>
    );
}
