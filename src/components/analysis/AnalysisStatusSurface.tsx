'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  StopCircle,
} from 'lucide-react';
import {
  browserAnalysisService,
  AnalysisSessionState,
} from '@/lib/services/browser-analysis-service';

interface AnalysisStatusSurfaceProps {
  onDismiss?: () => void;
  onSelectProject?: (projectId: string) => void;
}

export const AnalysisStatusSurface: React.FC<AnalysisStatusSurfaceProps> = ({
  onDismiss,
  onSelectProject,
}) => {
  const [session, setSession] = useState<AnalysisSessionState>(() =>
    browserAnalysisService.getSessionState()
  );
  const [expandedDetails, setExpandedDetails] = useState<boolean>(false);
  const [runningElapsedSeconds, setRunningElapsedSeconds] = useState<number>(0);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = browserAnalysisService.subscribe((state) => {
      setSession(state);
      // Auto un-dismiss if a new analysis starts
      if (state.status === 'running') {
        setIsDismissed(false);
      }
    });
    return unsubscribe;
  }, []);

  // Live timer tick when analysis is running
  useEffect(() => {
    if (session.status !== 'running' || session.startTime === 0) {
      return;
    }

    const interval = setInterval(() => {
      const sec = Math.floor((performance.now() - session.startTime) / 1000);
      setRunningElapsedSeconds(sec);
    }, 500);

    return () => clearInterval(interval);
  }, [session.status, session.startTime]);

  if (isDismissed || session.status === 'idle') {
    return null;
  }

  const handleCancel = () => {
    browserAnalysisService.cancelActiveAnalysis('Analysis cancelled by user.');
  };

  const handleRetry = async () => {
    try {
      const result = await browserAnalysisService.retryLastAnalysis();
      if (result && onSelectProject) {
        onSelectProject(result.projectId);
      }
    } catch {
      // Error handled by session listeners
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  const getStatusBadge = () => {
    switch (session.status) {
      case 'running':
        return (
          <span className="analysis-status-pill running" aria-label="Analysis in progress">
            <RefreshCw size={12} className="animate-spin" />
            <span>Analyzing</span>
          </span>
        );
      case 'completed':
        return (
          <span className="analysis-status-pill completed" aria-label="Analysis completed successfully">
            <CheckCircle2 size={12} />
            <span>Complete</span>
          </span>
        );
      case 'partial':
        return (
          <span className="analysis-status-pill partial" aria-label="Analysis completed with limitations">
            <AlertTriangle size={12} />
            <span>Partial Results</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="analysis-status-pill cancelled" aria-label="Analysis was cancelled">
            <StopCircle size={12} />
            <span>Cancelled</span>
          </span>
        );
      case 'failed':
        return (
          <span className="analysis-status-pill failed" aria-label="Analysis failed">
            <XCircle size={12} />
            <span>Failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  const isIndeterminate =
    session.progress.total <= 0 ||
    session.progress.current < 0 ||
    (session.status === 'running' && session.progress.total === 100 && session.progress.current <= 15);

  const percent =
    !isIndeterminate && session.progress.total > 0
      ? Math.min(100, Math.round((session.progress.current / session.progress.total) * 100))
      : null;

  return (
    <div
      className={`analysis-status-surface state-${session.status}`}
      role="status"
      aria-live="polite"
      aria-label="Repository analysis status"
    >
      {/* 1. STATUS HEADER */}
      <div className="surface-header">
        <div className="surface-header-left">
          {getStatusBadge()}
          <span className="surface-title" title={session.projectName}>
            {session.projectName ? session.projectName : 'Repository Analysis'}
          </span>
          <span className="surface-divider" aria-hidden="true">•</span>
          <span className="surface-stage-description">
            {session.status === 'running' ? session.progress.message : (
              session.status === 'completed' ? 'All files and relationships indexed successfully' :
              session.status === 'partial' ? 'Analysis completed with limitations' :
              session.status === 'cancelled' ? 'Operation stopped by user' :
              (session.error?.title || 'Execution halted')
            )}
          </span>
        </div>

        <div className="surface-header-right">
          {/* Elapsed Timer */}
          {(session.status === 'running' || session.totalDurationMs) && (
            <span className="surface-timer" title="Elapsed analysis duration">
              <Clock size={11} />
              {session.totalDurationMs ? `${(session.totalDurationMs / 1000).toFixed(1)}s` : `${runningElapsedSeconds}s`}
            </span>
          )}

          {/* Action buttons */}
          {session.status === 'running' && session.canCancel && (
            <button
              onClick={handleCancel}
              className="surface-btn cancel-btn"
              title="Stop current analysis safely"
              aria-label="Cancel analysis"
            >
              <StopCircle size={12} /> Cancel
            </button>
          )}

          {session.status === 'failed' && (
            <button
              onClick={handleRetry}
              className="surface-btn retry-btn"
              title="Retry analysis with previous parameters"
              aria-label="Retry analysis"
            >
              <RotateCcw size={12} /> Retry
            </button>
          )}

          {/* Details toggle */}
          <button
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="surface-btn details-btn"
            title={expandedDetails ? 'Hide details' : 'Show stage and diagnostic details'}
            aria-expanded={expandedDetails}
            aria-label={expandedDetails ? 'Collapse details' : 'Expand details'}
          >
            {expandedDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>Details</span>
          </button>

          {/* Dismiss button when not actively running */}
          {session.status !== 'running' && (
            <button
              onClick={handleDismiss}
              className="surface-btn dismiss-btn"
              title="Dismiss status banner"
              aria-label="Dismiss banner"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. PROGRESS BAR (Visible while running or partial) */}
      {session.status === 'running' && (
        <div className="surface-progress-track">
          <div
            className={`surface-progress-fill ${isIndeterminate ? 'indeterminate' : ''}`}
            style={{ width: isIndeterminate ? '35%' : `${percent}%` }}
          />
        </div>
      )}

      {/* 3. WORK COMPLETED COUNTER */}
      {session.status === 'running' && !isIndeterminate && session.progress.total > 0 && (
        <div className="surface-work-counters">
          <span>Processed <strong>{session.progress.current}</strong> of <strong>{session.progress.total}</strong> items</span>
          <span>{percent}%</span>
        </div>
      )}

      {/* 4. PARTIAL LIMITATIONS NOTICE */}
      {session.status === 'partial' && (
        <div className="surface-notice warning">
          <AlertTriangle size={14} className="notice-icon" />
          <div className="notice-body">
            <strong>Analysis completed with limitations</strong>
            <p>
              {session.partialReason ||
                'Some files could not be analysed. Results may be incomplete in the affected areas.'}
            </p>
          </div>
        </div>
      )}

      {/* 5. FAILURE ERROR PANEL */}
      {session.status === 'failed' && session.error && (
        <div className="surface-notice error">
          <XCircle size={15} className="notice-icon" />
          <div className="notice-body">
            <strong>{session.error.title}</strong>
            <p className="error-message">{session.error.message}</p>
            {session.error.recoveryAction && (
              <p className="error-recovery">
                <span className="recovery-label">Suggested action:</span> {session.error.recoveryAction}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 6. EXPANDABLE STAGES & TECHNICAL DIAGNOSTICS */}
      {expandedDetails && (
        <div className="surface-expanded-details">
          {/* Pipeline stages */}
          {session.stages.length > 0 && (
            <div className="stages-flow-section">
              <span className="section-title">Analysis Pipeline Stages</span>
              <div className="stages-flow">
                {session.stages.map((stage, idx) => (
                  <div key={stage.id} className={`stage-step ${stage.status}`}>
                    <div className="stage-marker">
                      {stage.status === 'completed' ? (
                        <CheckCircle2 size={12} />
                      ) : stage.status === 'running' ? (
                        <RefreshCw size={11} className="animate-spin" />
                      ) : stage.status === 'failed' ? (
                        <XCircle size={12} />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className="stage-info">
                      <span className="stage-name">{stage.name}</span>
                      {stage.message && <span className="stage-sub">{stage.message}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Performance stage timings if available */}
          {session.performanceMetrics?.stageDurations && (
            <div className="performance-timings-section">
              <span className="section-title">Measured Stage Durations</span>
              <div className="timings-grid">
                {Object.entries(session.performanceMetrics.stageDurations)
                  .filter(([, ms]) => ms !== undefined && ms > 0)
                  .map(([stg, ms]) => (
                    <div key={stg} className="timing-chip">
                      <span className="chip-label">{stg}</span>
                      <span className="chip-val">{ms}ms</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Diagnostic stack trace if failure */}
          {session.status === 'failed' && session.error?.technicalDetails && (
            <div className="diagnostics-log-section">
              <span className="section-title">Technical Diagnostics</span>
              <pre className="diagnostics-code">{session.error.technicalDetails}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
