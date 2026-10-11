'use client';

import React, { useState, useEffect } from 'react';
import { ProjectAnalysis, DataFlowTrace, TraceEntity } from '@/lib/types/trace';
import {
  Waves,
  ArrowDown,
  Database,
  Code2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileInput,
} from 'lucide-react';

interface DataFlowViewProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

export const DataFlowView: React.FC<DataFlowViewProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
}) => {
  const candidateSymbols = React.useMemo(() => {
    return Object.values(analysis.entities).filter(
      (e) => e.kind === 'function' || e.kind === 'method' || e.kind === 'route'
    );
  }, [analysis]);

  const [currentSymbolId, setCurrentSymbolId] = useState<string>(
    selectedEntityId && analysis.entities[selectedEntityId]
      ? selectedEntityId
      : candidateSymbols[0]?.id || ''
  );

  const [flowData, setFlowData] = useState<DataFlowTrace | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (selectedEntityId && analysis.entities[selectedEntityId]) {
      setCurrentSymbolId(selectedEntityId);
    }
  }, [selectedEntityId, analysis]);

  useEffect(() => {
    if (!currentSymbolId) return;

    let isMounted = true;
    setLoading(true);

    fetch('/api/dataflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: analysis.projectId,
        symbolOrEntityId: currentSymbolId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setFlowData(data.dataFlow || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load data flow:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [analysis.projectId, currentSymbolId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Bar */}
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
            Investigate Symbol Origin & Flow:
          </span>
          <select
            value={currentSymbolId}
            onChange={(e) => setCurrentSymbolId(e.target.value)}
            style={{
              flex: 1,
              maxWidth: 400,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {candidateSymbols.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.filePath})
              </option>
            ))}
          </select>
        </div>
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--primary-blue)' }}>
            <RefreshCw size={13} className="animate-spin" /> Tracing value flow...
          </span>
        )}
      </div>

      {/* Main Flow Pipeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!flowData || flowData.steps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No value propagation chain detected for this symbol.
          </div>
        ) : (
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Origin Card */}
            <div
              style={{
                background: 'var(--blue-selection-bg)',
                border: '1px solid var(--primary-blue)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-blue)', fontWeight: 600, fontSize: 14 }}>
                <FileInput size={16} /> Origin Symbol: <code>{flowData.rootSymbol}</code>
              </div>
              <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                Value enters as parameter or local declaration at <code>{flowData.originEntityId}</code>.
              </p>
            </div>

            {/* Propagation Steps */}
            {flowData.steps.map((step, idx) => (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0' }}>
                    <ArrowDown size={18} color="var(--primary-blue)" />
                  </div>
                )}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="kind-badge" style={{ background: 'var(--blue-selection-bg)', color: 'var(--primary-blue)' }}>
                        {step.flowType.toUpperCase()}
                      </span>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{step.symbolName}</strong>
                    </div>
                    <span style={{ fontSize: 11, color: step.confidence === 'statically_resolved' ? 'var(--success-teal)' : 'var(--warning-amber)' }}>
                      {step.confidence === 'statically_resolved' ? '✓ Statically Established' : '⚠️ Inferred Flow'}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {step.notes}
                  </div>

                  {step.evidenceSnippet && (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderLeft: '3px solid var(--primary-blue)',
                      }}
                    >
                      {step.evidenceSnippet}
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}

            {/* Sink Card */}
            {flowData.sinkEntityIds.length > 0 && (
              <div
                style={{
                  background: 'var(--success-bg)',
                  border: '1px solid var(--success-teal)',
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success-teal)', fontWeight: 600, fontSize: 14 }}>
                  <Database size={16} /> Data Terminal Sinks ({flowData.sinkEntityIds.length})
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {flowData.sinkEntityIds.map((sinkId) => (
                    <div key={sinkId} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      • <code>{analysis.entities[sinkId]?.name || sinkId}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explicit Limitations */}
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
              <strong style={{ color: 'var(--text-secondary)' }}>Analysis Limitations:</strong>
              <ul style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {flowData.limitations.map((lim, idx) => (
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
