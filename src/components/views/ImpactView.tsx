'use client';

import React, { useState, useEffect } from 'react';
import { ProjectAnalysis, ImpactReport } from '@/lib/types/trace';
import {
  AlertOctagon,
  Route,
  FileCheck,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface ImpactViewProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

export const ImpactView: React.FC<ImpactViewProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
}) => {
  const candidateSymbols = React.useMemo(() => {
    const all = Object.values(analysis.entities).filter(
      (e) => e.kind === 'function' || e.kind === 'method' || e.kind === 'class'
    );
    return all.slice(0, 150);
  }, [analysis]);

  const [userSelectedEntityId, setUserSelectedEntityId] = useState<string | null>(null);
  const [prevPropEntityId, setPrevPropEntityId] = useState<string | null>(selectedEntityId);

  if (prevPropEntityId !== selectedEntityId) {
    setPrevPropEntityId(selectedEntityId);
    setUserSelectedEntityId(null);
  }

  const currentEntityId = (userSelectedEntityId && analysis.entities[userSelectedEntityId])
    ? userSelectedEntityId
    : (selectedEntityId && analysis.entities[selectedEntityId])
      ? selectedEntityId
      : candidateSymbols[0]?.id || '';

  const [impactReport, setImpactReport] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // In-memory cache across tab switches and entity selections
  const impactCacheRef = React.useRef<Map<string, ImpactReport>>(new Map());
  const activeReqIdRef = React.useRef<number>(0);

  // Ensure current entity is in the dropdown options
  const visibleCandidates = React.useMemo(() => {
    if (currentEntityId && !candidateSymbols.some((s) => s.id === currentEntityId)) {
      const current = analysis.entities[currentEntityId];
      if (current) return [current, ...candidateSymbols];
    }
    return candidateSymbols;
  }, [currentEntityId, candidateSymbols, analysis.entities]);

  useEffect(() => {
    if (!currentEntityId) return;

    const cacheKey = `${analysis.projectId}:${currentEntityId}`;
    if (impactCacheRef.current.has(cacheKey)) {
      setImpactReport(impactCacheRef.current.get(cacheKey)!);
      setLoading(false);
      return;
    }

    const reqId = ++activeReqIdRef.current;
    setLoading(true);

    fetch('/api/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: analysis.projectId,
        entityId: currentEntityId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (reqId === activeReqIdRef.current) {
          const resImpact = data.impact || null;
          if (resImpact) {
            impactCacheRef.current.set(cacheKey, resImpact);
          }
          setImpactReport(resImpact);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load impact report:', err);
        if (reqId === activeReqIdRef.current) setLoading(false);
      });
  }, [analysis.projectId, currentEntityId]);

  const togglePath = (id: string) => {
    setExpandedPaths((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical':
        return '#DC2626';
      case 'high':
      case 'medium':
        return '#F59E0B';
      default:
        return '#0D9488';
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Selector */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Analyze Change Impact On:
          </span>
          <select
            value={currentEntityId}
            onChange={(e) => setUserSelectedEntityId(e.target.value)}
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
            {visibleCandidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.filePath})
              </option>
            ))}
          </select>
        </div>
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--error-red)' }}>
            <RefreshCw size={13} className="animate-spin" /> Calculating blast radius...
          </span>
        )}
      </div>

      {/* Main Impact Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!impactReport ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Select a symbol to calculate its potential blast radius.
          </div>
        ) : (
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Score HUD Card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Potential Change Blast Radius
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                  {impactReport.targetName}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 500 }}>
                  {impactReport.summary}
                </p>
              </div>

              {/* Severity Gauge */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-tertiary)',
                  border: `2px solid ${getSeverityColor(impactReport.overallSeverity)}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 24px',
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: getSeverityColor(impactReport.overallSeverity),
                  }}
                >
                  {impactReport.blastRadiusScore}
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/100</span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: getSeverityColor(impactReport.overallSeverity),
                    letterSpacing: '0.05em',
                  }}
                >
                  {impactReport.overallSeverity} Risk
                </span>
              </div>
            </div>

            {/* Affected Routes Card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--primary-blue)', marginBottom: 12 }}>
                <Route size={16} /> Potentially Affected API Routes ({impactReport.affectedRoutes.length})
              </div>
              {impactReport.affectedRoutes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  No public HTTP routes directly depend on this function.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {impactReport.affectedRoutes.map((route) => (
                    <div
                      key={route.entityId}
                      onClick={() => onSelectEntity(route.entityId)}
                      style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <strong>{route.name}</strong> <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({route.filePath})</span>
                      </div>
                      <span className="kind-badge route">Route Affected</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Affected Tests Card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--success-teal)', marginBottom: 12 }}>
                <FileCheck size={16} /> Associated Test Suites ({impactReport.affectedTests.length})
              </div>
              {impactReport.affectedTests.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  No matching test files directly import this function. Consider adding unit tests before refactoring.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {impactReport.affectedTests.map((t) => (
                    <div
                      key={t.entityId}
                      onClick={() => onSelectEntity(t.entityId)}
                      style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <strong>{t.name}</strong> <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({t.filePath})</span>
                      </div>
                      <span className="kind-badge function">Run Suite</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Direct & Transitive Callers Chain */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--warning-amber)', marginBottom: 12 }}>
                <AlertOctagon size={16} /> Direct & Indirect Dependent Callers ({impactReport.directImpacts.length + impactReport.transitiveImpacts.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...impactReport.directImpacts, ...impactReport.transitiveImpacts].map((dep) => {
                  const isExpanded = expandedPaths[dep.entityId];
                  return (
                    <div
                      key={`${dep.entityId}-${dep.distance}`}
                      style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div
                          onClick={() => onSelectEntity(dep.entityId)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span className={`kind-badge ${dep.kind}`}>{dep.kind}</span>
                          <strong>{dep.name}</strong>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({dep.filePath})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Distance: {dep.distance} hop(s)</span>
                          {dep.pathEvidence.length > 0 && (
                            <button
                              onClick={() => togglePath(dep.entityId)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--primary-blue)' }}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Evidence
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && dep.pathEvidence.length > 0 && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '8px 12px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            borderLeft: '3px solid var(--primary-blue)',
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Dependency Path Evidence:</div>
                          {dep.pathEvidence.map((p, pIdx) => (
                            <div key={pIdx}>↳ {p}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
