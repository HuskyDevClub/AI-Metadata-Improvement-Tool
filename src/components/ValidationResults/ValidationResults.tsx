import React from 'react';
import './ValidationResults.css';

export interface ValidationIssue {
  rule_id: string;
  category: string;
  severity: string;
  field?: string;
  message: string;
  suggestion?: string;
  line_number?: number;
}

export interface ValidationResult {
  is_valid: boolean;
  score: number;
  issues: ValidationIssue[];
  total_issues: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

interface ValidationResultsProps {
  result: ValidationResult | null;
  compact?: boolean;
  onApplyFix?: (issue: ValidationIssue) => void;
}

const ValidationResults: React.FC<ValidationResultsProps> = ({ result, compact = false, onApplyFix }) => {
  if (!result) {
    return (
      <div className={`validation-results ${compact ? 'compact' : ''}`}>
        <div className="validation-header">
          <h3>Validation Results</h3>
          <p>Run validation to check compliance with WA standards</p>
        </div>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'warning': return '#ffc107';
      case 'info': return '#17a2b8';
      default: return '#6c757d';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#28a745';
    if (score >= 60) return '#ffc107';
    return '#dc3545';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  };

  return (
    <div className={`validation-results ${compact ? 'compact' : ''}`}>
      <div className="validation-header">
        <div className="validation-score">
          <div
            className="score-circle"
            style={{ backgroundColor: getScoreColor(result.score) }}
          >
            <span className="score-number">{Math.round(result.score)}</span>
            <span className="score-label">{getScoreLabel(result.score)}</span>
          </div>
          <div className="score-text">
            <h3>Validation Score</h3>
            <p>{result.is_valid ? 'Passes' : 'Fails'} WA standards</p>
          </div>
        </div>
      </div>

      <div className="validation-summary">
        <div className="summary-item">
          <span className="summary-count critical">{result.critical_count}</span>
          <span className="summary-label">Critical</span>
        </div>
        <div className="summary-item">
          <span className="summary-count warning">{result.warning_count}</span>
          <span className="summary-label">Warnings</span>
        </div>
        <div className="summary-item">
          <span className="summary-count info">{result.info_count}</span>
          <span className="summary-label">Info</span>
        </div>
      </div>

      {result.issues.length > 0 && (
        <div className="validation-issues">
          <h4>Issues Found ({result.total_issues})</h4>
          <div className="issues-list">
            {result.issues.map((issue, index) => (
              <div key={index} className={`issue-item severity-${issue.severity}`}>
                <div className="issue-header">
                  <div
                    className="severity-indicator"
                    style={{ backgroundColor: getSeverityColor(issue.severity) }}
                  />
                  <div className="issue-meta">
                    <span className="issue-category">{issue.category.replace('_', ' ')}</span>
                    {issue.field && (
                      <span className="issue-field">• {issue.field}</span>
                    )}
                  </div>
                </div>
                <div className="issue-content">
                  <p className="issue-message">{issue.message}</p>
                  {issue.suggestion && (
                    <div className="issue-suggestion">
                      <strong>Suggestion:</strong> {issue.suggestion}
                      {onApplyFix && (
                        <button
                          className="apply-fix-btn"
                          onClick={() => onApplyFix(issue)}
                        >
                          Apply Fix
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.issues.length === 0 && (
        <div className="validation-success">
          <div className="success-icon">✓</div>
          <h4>All checks passed!</h4>
          <p>Your metadata meets Washington State standards.</p>
        </div>
      )}
    </div>
  );
};

export default ValidationResults;