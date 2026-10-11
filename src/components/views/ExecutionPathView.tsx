'use client';

import React, { useState, useEffect } from 'react';
import { ProjectAnalysis, ExecutionPath } from '@/lib/types/trace';
import {
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Code2,
  CheckCircle2,
  RefreshCw,
  GitBranch,
} from 'lucide-react';

interface ExecutionPathViewProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

export const ExecutionPathView: React.FC<ExecutionPathViewProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
}) => {
  // Candidate entry points (routes + exported functions, bounded for responsive rendering)
  const entryPoints = React.useMemo(() => {
    const all = Object.values(analysis.entities).filter(
      (e) => e.kind === 'route' || (e.isExported && (e.kind === 'function' || e.kind === 'method'))
    );
    // Prioritize routes, then functions, capped to 150 items for snappy select box rendering
    all.sort((a, b) => {
      if (a.kind === 'route' && b.kind !== 'route') return -1;
      if (b.kind === 'route' && a.kind !== 'route') return 1;
      return 0;
    });
    return all.slice(0, 150);
  }, [analysis]);

  const [userSelectedEntryId, setUserSelectedEntryId] = useState<string | null>(null);
  const [prevPropEntityId, setPrevPropEntityId] = useState<string | null>(selectedEntityId);

  // Synchronize when selectedEntityId prop changes from parent
  if (prevPropEntityId !== selectedEntityId) {
    setPrevPropEntityId(selectedEntityId);
    setUserSelectedEntryId(null);
  }

  const currentEntryId = (userSelectedEntryId && analysis.entities[userSelectedEntryId])
    ? userSelectedEntryId
    : (selectedEntityId && analysis.entities[selectedEntityId])
      ? selectedEntityId
      : entryPoints[0]?.id || '';

  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [traceData, setTraceData] = useState<ExecutionPath | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // In-memory cache across tab switches and entity visits
  const traceCacheRef = React.useRef<Map<string, ExecutionPath>>(new Map());
  const activeReqIdRef = React.useRef<number>(0);

  // Ensure current selected entity is present in options list
  const visibleEntryPoints = React.useMemo(() => {
    if (currentEntryId && !entryPoints.some((ep) => ep.id === currentEntryId)) {
      const current = analysis.entities[currentEntryId];
      if (current) return [current, ...entryPoints];
    }
    return entryPoints;
  }, [currentEntryId, entryPoints, analysis.entities]);

  // Fetch execution trace with caching and stale response prevention
  useEffect(() => {
    if (!currentEntryId) return;

    const cacheKey = `${analysis.projectId}:${currentEntryId}:${direction}`;
    if (traceCacheRef.current.has(cacheKey)) {
      setTraceData(traceCacheRef.current.get(cacheKey)!);
      setLoading(false);
      return;
    }

    const reqId = ++activeReqIdRef.current;
    setLoading(true);

    fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: analysis.projectId,
        entityId: currentEntryId,
        direction,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (reqId === activeReqIdRef.current) {
          const resTrace = data.trace || null;
          if (resTrace) {
            traceCacheRef.current.set(cacheKey, resTrace);
          }
          setTraceData(resTrace);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load trace:', err);
        if (reqId === activeReqIdRef.current) setLoading(false);
      });
  }, [analysis.projectId, currentEntryId, direction]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Controls */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 300 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Target Entry Point:
          </span>
          <select
            value={currentEntryId}
            onChange={(e) => setUserSelectedEntryId(e.target.value)}
            style={{
              flex: 1,
              maxWidth: 420,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {visibleEntryPoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                [{ep.kind.toUpperCase()}] {ep.name} ({ep.filePath})
              </option>
            ))}
          </select>
        </div>

        {/* Direction Switch */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-primary)', padding: 3, borderRadius: 'var(--radius-sm)' }}>
          <button
            className={`tool-btn ${direction === 'forward' ? 'active' : ''}`}
            onClick={() => setDirection('forward')}
            title="Forward: What could this function call?"
          >
            <ArrowRight size={14} /> Forward Call Path
          </button>
          <button
            className={`tool-btn ${direction === 'backward' ? 'active' : ''}`}
            onClick={() => setDirection('backward')}
            title="Backward: What could lead to this function?"
          >
            <ArrowLeft size={14} /> Backward Trigger Path
          </button>
        </div>
      </div>

      {/* Path Metadata Banner */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--blue-selection-bg)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>
            🔬 Mode: <strong style={{ color: 'var(--primary-blue)' }}>Statically Inferred Execution Path</strong>
          </span>
          {traceData && (
            <>
              <span>
                Total Steps: <strong>{traceData.totalSteps}</strong>
              </span>
              <span>
                Max Depth: <strong>{traceData.maxDepth}</strong>
              </span>
              {traceData.unresolvedCount > 0 && (
                <span style={{ color: 'var(--warning-amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={13} /> {traceData.unresolvedCount} Unresolved / Dynamic Call(s)
                </span>
              )}
            </>
          )}
        </div>
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary-blue)' }}>
            <RefreshCw size={13} className="animate-spin" /> Tracing call tree...
          </span>
        )}
      </div>

      {/* Steps List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!traceData || traceData.steps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No execution paths could be inferred from this entry point.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900, margin: '0 auto' }}>
            {traceData.steps.map((step) => {
              const isSelected = step.entityId === selectedEntityId;
              const isResolved = step.confidence === 'statically_resolved';

              return (
                <div
                  key={`${step.order}-${step.entityId}`}
                  onClick={() => onSelectEntity(step.entityId)}
                  style={{
                    marginLeft: `${step.depth * 28}px`,
                    background: isSelected ? 'var(--blue-selection-bg)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--primary-blue)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--primary-blue)',
                        }}
                      >
                        {step.order}
                      </span>
                      <span className={`kind-badge ${step.kind}`}>{step.kind}</span>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                        {step.entityName}
                      </strong>
                      {step.isBranch && (
                        <span
                          style={{
                            fontSize: 11,
                            background: 'var(--warning-bg)',
                            color: 'var(--warning-amber)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <GitBranch size={11} /> {step.branchCondition || 'Branch'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: isResolved ? 'var(--success-teal)' : 'var(--warning-amber)' }}>
                      {isResolved ? (
                        <>
                          <CheckCircle2 size={13} /> Statically Resolved
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={13} /> Unresolved / Inferred
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Code2 size={12} />
                    <span>{step.filePath}:{step.location.startLine}</span>
                  </div>

                  {step.callEvidence && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderLeft: '3px solid var(--primary-blue)',
                      }}
                    >
                      {step.callEvidence}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Stated Analysis Limitations */}
            <div
              style={{
                marginTop: 20,
                padding: 14,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <strong style={{ color: 'var(--text-secondary)' }}>Analysis Scope & Limitations:</strong>
              <ul style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {traceData.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
