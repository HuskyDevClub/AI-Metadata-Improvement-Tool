import { useEffect, useRef } from 'react';
import { HowItWorks } from '../components/HowItWorks/HowItWorks';
import { CsvInput } from '../components/CsvInput/CsvInput';
import { ImportSection } from '../components/ImportSection/ImportSection';
import { useAppContext } from '../contexts/AppContext';
import './ImportPage.css';

export function ImportPage() {
    const {
        handleAnalyze,
        handleSocrataImport,
        handleImport,
        isProcessing,
        showResults,
        navigate,
        socrataOAuthUser,
        isSocrataOAuthAuthenticating,
        handleSocrataOAuthLogin,
        handleSocrataOAuthLogout,
    } = useAppContext();

    const prevShowResults = useRef(showResults);

    // Auto-navigate to data overview when import completes
    useEffect(() => {
        if (showResults && !prevShowResults.current) {
            navigate('data');
        }
        prevShowResults.current = showResults;
    }, [showResults, navigate]);

    return (
        <div className="import-page">
            <HowItWorks/>

            <div className="import-page-section">
                <CsvInput
                    onAnalyze={handleAnalyze}
                    onSocrataImport={handleSocrataImport}
                    isProcessing={isProcessing}
                    oauthUser={socrataOAuthUser}
                    isOAuthAuthenticating={isSocrataOAuthAuthenticating}
                    onOAuthLogin={handleSocrataOAuthLogin}
                    onOAuthLogout={handleSocrataOAuthLogout}
                />
            </div>

            <div className="import-page-section">
                <ImportSection
                    onImport={handleImport}
                    disabled={isProcessing}
                />
            </div>

            {showResults && (
                <div className="import-page-loaded">
                    <span>Data is loaded.</span>
                    <button
                        className="import-page-goto-btn"
                        onClick={() => navigate('data')}
                    >
                        Go to Data Overview
                    </button>
                </div>
            )}
        </div>
    );
}
