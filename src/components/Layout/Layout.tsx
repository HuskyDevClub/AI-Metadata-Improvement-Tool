import type { PageId } from '../../contexts/AppContext';
import { useAppContext } from '../../contexts/AppContext';
import { StatusMessage } from '../StatusMessage/StatusMessage';
import { ImportPage } from '../../pages/ImportPage';
import { DataOverviewPage } from '../../pages/DataOverviewPage';
import { FieldOverviewPage } from '../../pages/FieldOverviewPage';
import { ComparePage } from '../../pages/ComparePage';
import { SettingsPage } from '../../pages/SettingsPage';
import './Layout.css';

function NavTab({ page, label, disabled }: { page: PageId; label: string; disabled?: boolean }) {
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

function CurrentPage() {
    const { currentPage } = useAppContext();
    switch (currentPage) {
        case 'import':
            return <ImportPage/>;
        case 'data':
            return <DataOverviewPage/>;
        case 'field':
            return <FieldOverviewPage/>;
        case 'compare':
            return <ComparePage/>;
        case 'settings':
            return <SettingsPage/>;
    }
}

export function Layout() {
    const { status, isProcessing, showResults, handleStop } = useAppContext();

    return (
        <div className="container">
            <div className="layout-header">
                <div className="layout-header-title">
                    <h1>AI Metadata Improvement Tool</h1>
                    <span className="layout-header-subtitle">Generate & improve dataset metadata with AI</span>
                </div>
                <nav className="layout-nav">
                    <NavTab page="import" label="Import"/>
                    <NavTab page="data" label="Data Overview" disabled={!showResults}/>
                    <NavTab page="compare" label="Compare" disabled={!showResults}/>
                    <NavTab page="settings" label="Settings"/>
                </nav>
            </div>
            <div className="content">
                <StatusMessage status={status} isProcessing={isProcessing} onStop={handleStop}/>
                <CurrentPage/>
            </div>
        </div>
    );
}
