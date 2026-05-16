import { useState } from 'react';
import type { PageId } from '../../contexts/AppContext';
import { useAppContext } from '../../contexts/AppContext';
import { FloatingActions } from '../FloatingActions/FloatingActions';
import { ResetFieldButton } from '../ResetFieldButton/ResetFieldButton';
import { StatusMessage } from '../StatusMessage/StatusMessage';
import { ImportPage } from '../../pages/ImportPage';
import { DataOverviewPage } from '../../pages/DataOverviewPage';
import { FieldOverviewPage } from '../../pages/FieldOverviewPage';
import { SettingsPage } from '../../pages/SettingsPage';
import './Layout.css';

function NavTab({ page, label, disabled }: {page: PageId; label: string; disabled?: boolean}) {
    const { currentPage, navigate } = useAppContext();
    const isActive = currentPage === page;

    return (
        <button
            className={`layout-nav-link ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => {
                if (!disabled) navigate(page);
            }}
        >
            {label}
        </button>
    );
}

function DatasetTab({ id, fileName }: {id: string; fileName: string}) {
    const { activeDatasetId, currentPage, switchToDataset, closeTab } = useAppContext();
    const isActive = id === activeDatasetId && currentPage !== 'import' && currentPage !== 'settings';

    return (
        <button
            className={`layout-nav-link layout-dataset-tab ${isActive ? 'active' : ''}`}
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
            title={fileName}
        >
            <span className="layout-dataset-tab-name">{fileName}</span>
            <span
                className="layout-dataset-tab-close"
                onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Close this dataset?')) {
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
    } = useAppContext();

    const title = generatedResults.datasetTitle;
    const titleChanged = !!initialResults && generatedResults.datasetTitle !== initialResults.datasetTitle;
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(title);

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
    const showSubtitle = !isEditing && !!title && title !== subtitleText;

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
                        <button className="layout-dataset-title-btn save" onClick={save}>Save</button>
                        <button className="layout-dataset-title-btn cancel" onClick={cancel}>Cancel</button>
                    </div>
                ) : (
                    <>
                        <h2 className="layout-dataset-title" title={title || fileName}>
                            {generatingDatasetTitle ? (
                                <span className="layout-dataset-title-generating">
                                    {title || 'Generating title...'}
                                    <span className="ed-cursor">|</span>
                                </span>
                            ) : (
                                title || <span className="layout-dataset-title-fallback">{fileName}</span>
                            )}
                        </h2>
                        {!generatingDatasetTitle && (
                            <span className="layout-dataset-title-actions">
                                <button
                                    className="layout-dataset-title-btn edit"
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
                                    className="layout-dataset-title-btn generate"
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
                    {isSocrataImport ? (
                        <svg className="layout-dataset-subtitle-icon" width="12" height="12"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                             strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                    ) : (
                        <svg className="layout-dataset-subtitle-icon" width="12" height="12"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                             strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    )}
                    {isSocrataImport && (
                        <span className="layout-dataset-subtitle-label">Dataset ID</span>
                    )}
                    <span className="layout-dataset-subtitle-value">{subtitleText}</span>
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
        case 'settings':
            return <SettingsPage/>;
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
        navigate,
        socrataOAuthUser,
        isSocrataOAuthAuthenticating,
        handleSocrataOAuthLogin,
        handleSocrataOAuthLogout,
        isPushingSocrata,
        socrataDatasetId,
        handlePushToSocrata,
        datasetTabs,
        socrataDomain,
    } = useAppContext();

    return (
        <div className="container">
            <div className="layout-header">
                <div className="layout-header-title">
                    <h1>AI Metadata Improvement Tool</h1>
                    <span className="layout-header-subtitle">Generate & improve dataset metadata with AI</span>
                </div>
                <div className="layout-header-actions">
                    {socrataOAuthUser ? (
                        <span className="layout-oauth-status">
                            Signed in as <strong>{socrataOAuthUser.displayName}</strong>
                            <button type="button" className="layout-oauth-signout" onClick={handleSocrataOAuthLogout}>
                                Sign out
                            </button>
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="layout-oauth-btn"
                            onClick={handleSocrataOAuthLogin}
                            disabled={isSocrataOAuthAuthenticating}
                        >
                            {isSocrataOAuthAuthenticating
                                ? 'Signing in...'
                                : socrataDomain ? `Sign in with ${socrataDomain}` : 'Sign in'}
                        </button>
                    )}
                    <button
                        className={`layout-settings-btn ${currentPage === 'settings' ? 'active' : ''}`}
                        onClick={() => navigate('settings')}
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
                <nav className="layout-nav">
                    <NavTab page="import" label="Import"/>
                    {datasetTabs.map(tab => (
                        <DatasetTab key={tab.id} id={tab.id} fileName={tab.fileName}/>
                    ))}
                </nav>
            </div>
            {showResults && fileName && (currentPage === 'data' || currentPage === 'field') && (
                <div className="layout-dataset-bar">
                    <DatasetTitleBar/>
                    <div className="layout-dataset-bar-actions">
                        {socrataDatasetId && (
                            <button
                                className="layout-dataset-push-btn"
                                onClick={handlePushToSocrata}
                                disabled={isPushingSocrata}
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
        </div>
    );
}
