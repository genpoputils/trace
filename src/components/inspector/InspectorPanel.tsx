'use client';

import React, { useState } from 'react';
import { ProjectAnalysis, TraceEntity } from '@/lib/types/trace';
import {
  X,
  Sparkles,
  Zap,
  ShieldAlert,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { PackageInspector } from './PackageInspector';
import { PackageDependencyNode, NormalizedDependency } from '@/lib/dependencies/types';

interface InspectorPanelProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  onClose: () => void;
  onOpenAiInvestigator?: () => void;
  onOpenExecutionPath?: () => void;
  onOpenImpactView?: () => void;
  isDrawer?: boolean;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
  onClose,
  onOpenAiInvestigator,
  onOpenExecutionPath,
  onOpenImpactView,
  isDrawer = false,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'relationships'>('details');

  const entity: TraceEntity | undefined = selectedEntityId
    ? analysis.entities[selectedEntityId]
    : undefined;

  // Inbound & Outbound relationships
  const inbound = React.useMemo(() => {
    if (!selectedEntityId) return [];
    return analysis.relationships.filter(
      (r) =>
        r.targetId === selectedEntityId &&
        (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'imports')
    );
  }, [analysis, selectedEntityId]);

  const outbound = React.useMemo(() => {
    if (!selectedEntityId) return [];
    return analysis.relationships.filter(
      (r) =>
        r.sourceId === selectedEntityId &&
        (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'reads_from')
    );
  }, [analysis, selectedEntityId]);

  // Check if selectedEntityId is a Package Dependency Node or Dependency
  const packageNode: PackageDependencyNode | null = React.useMemo(() => {
    if (!selectedEntityId) return null;
    const graphNodes = analysis.dependencies?.graph?.nodes;
    if (graphNodes && graphNodes[selectedEntityId]) {
      return graphNodes[selectedEntityId];
    }
    return null;
  }, [analysis.dependencies, selectedEntityId]);

  const dependency: NormalizedDependency | null = React.useMemo(() => {
    if (!selectedEntityId || packageNode) return null;
    return analysis.dependencies?.dependencies?.find((d) => d.id === selectedEntityId) || null;
  }, [analysis.dependencies, selectedEntityId, packageNode]);

  if (!entity) {
    if (packageNode || dependency) {
      const activeId = packageNode ? packageNode.id : dependency!.id;
      return (
        <aside
          className={`right-panel ${isDrawer ? 'as-drawer' : ''}`}
          aria-label="Package Inspector Panel"
          style={{ overflowY: 'auto' }}
        >
          <PackageInspector
            packageNode={packageNode}
            dependency={dependency}
            graph={analysis.dependencies?.graph}
            sourceUsages={analysis.dependencies?.sourceUsages?.[activeId] || []}
            onSelectPackage={onSelectEntity}
            onClose={onClose}
          />
        </aside>
      );
    }

    return (
      <aside
        className={`right-panel ${isDrawer ? 'as-drawer' : ''}`}
        aria-label="Entity Inspector Panel"
      >
        <div className="panel-header">
          <span className="panel-title">
            <Layers size={14} color="var(--primary-blue)" /> Entity Inspector
          </span>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Select any function, route, class, or package in the graph, file explorer, or trace view to inspect its identity, parameters, and relationships.
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`right-panel ${isDrawer ? 'as-drawer' : ''}`}
      aria-label={`Entity Inspector for ${entity.name}`}
    >
      {/* Header */}
      <div className="panel-header">
        <div
          className="panel-title"
          style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          <span className={`kind-badge ${entity.kind}`}>{entity.kind}</span>
          <strong title={entity.name}>{entity.name}</strong>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
          aria-label="Entity details tab"
        >
          Details & Scope
        </button>
        <button
          className={`panel-tab ${activeTab === 'relationships' ? 'active' : ''}`}
          onClick={() => setActiveTab('relationships')}
          aria-label="Relationships tab"
        >
          Connections ({inbound.length + outbound.length})
        </button>
      </div>

      {/* Body */}
      <div className="panel-body">
        {/* TAB 1: DETAILS */}
        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* File Location */}
            <div
              style={{
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                fontSize: 12,
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>
                LOCATION:
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                }}
              >
                {entity.filePath}:{entity.location.startLine}–{entity.location.endLine}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {entity.isExported && (
                  <span
                    className="kind-badge"
                    style={{ background: 'var(--success-bg)', color: 'var(--success-teal)' }}
                  >
                    Exported
                  </span>
                )}
                {entity.isAsync && (
                  <span
                    className="kind-badge"
                    style={{ background: 'var(--blue-selection-bg)', color: 'var(--primary-blue)' }}
                  >
                    Async
                  </span>
                )}
              </div>
            </div>

            {/* JSDoc / Docstring */}
            {entity.docstring && (
              <div
                style={{
                  padding: 10,
                  background: 'var(--blue-selection-bg)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--primary-blue)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
                  Documentation:
                </strong>
                {entity.docstring}
              </div>
            )}

            {/* Parameters */}
            {entity.parameters && entity.parameters.length > 0 && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Parameters ({entity.parameters.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {entity.parameters.map((p) => (
                    <div key={p.name} style={{ fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--warning-amber)' }}>{p.name}</span>
                      {p.type && (
                        <span style={{ color: 'var(--primary-blue)' }}>: {p.type}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Context Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Investigate Entity:
              </div>

              {onOpenAiInvestigator && (
                <button
                  onClick={onOpenAiInvestigator}
                  className="tool-btn"
                  style={{ justifyContent: 'space-between', padding: '8px 10px', fontSize: 12 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} color="var(--primary-blue)" /> Ask AI Investigator
                  </span>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </button>
              )}

              {onOpenExecutionPath && (
                <button
                  onClick={onOpenExecutionPath}
                  className="tool-btn"
                  style={{ justifyContent: 'space-between', padding: '8px 10px', fontSize: 12 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={14} color="var(--success-teal)" /> Inferred Execution Path
                  </span>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </button>
              )}

              {onOpenImpactView && (
                <button
                  onClick={onOpenImpactView}
                  className="tool-btn"
                  style={{ justifyContent: 'space-between', padding: '8px 10px', fontSize: 12 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={14} color="var(--error-red)" /> Calculate Blast Radius
                  </span>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: RELATIONSHIPS */}
        {activeTab === 'relationships' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Inbound Callers */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Inbound Callers & References ({inbound.length})
              </div>
              {inbound.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                  No inbound callers discovered in static analysis.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inbound.map((rel, idx) => {
                    const caller = analysis.entities[rel.sourceId];
                    if (!caller) return null;
                    return (
                      <div
                        key={`${rel.id}-${idx}`}
                        onClick={() => onSelectEntity(caller.id)}
                        style={{
                          padding: 8,
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className={`kind-badge ${caller.kind}`}>{caller.kind}</span>
                          <strong title={caller.name}>{caller.name}</strong>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          L{rel.location?.startLine || caller.location.startLine}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outbound Callees */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Outbound Calls ({outbound.length})
              </div>
              {outbound.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                  No outbound calls invoked.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {outbound.map((rel, idx) => {
                    const callee = analysis.entities[rel.targetId];
                    return (
                      <div
                        key={`${rel.id}-${idx}`}
                        onClick={() => callee && onSelectEntity(callee.id)}
                        style={{
                          padding: 8,
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: callee ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="kind-badge function">{rel.kind}</span>
                          <strong title={callee ? callee.name : rel.targetId}>
                            {callee ? callee.name : rel.targetId.split(':').pop()}
                          </strong>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          L{rel.location?.startLine || 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
