import type { PageId } from '../../contexts/AppContext';
import { useAppContext } from '../../contexts/AppContext';
import { FloatingActions } from '../FloatingActions/FloatingActions';
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
                            {isSocrataOAuthAuthenticating ? 'Signing in...' : 'Sign in with data.wa.gov'}
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
                    <span className="layout-dataset-name">{fileName}</span>
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
                                {isPushingSocrata ? 'Pushing...' : 'Push to data.wa.gov'}
                            </button>
                        )}
                    </div>
                </div>
            )}
            <div className="content">
                <StatusMessage status={status} isProcessing={isProcessing} onStop={handleStop}/>
                <CurrentPage/>
            </div>
            <FloatingActions/>
        </div>
    );
}
