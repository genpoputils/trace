'use client';

import React from 'react';
import {
  PackageDependencyNode,
  PackageDependencyGraph,
  PackageSourceUsage,
  NormalizedDependency,
} from '@/lib/dependencies/types';
import {
  Package,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  ExternalLink,
  Code2,
  X,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

export interface PackageInspectorProps {
  packageNode?: PackageDependencyNode | null;
  dependency?: NormalizedDependency | null;
  graph?: PackageDependencyGraph | null;
  sourceUsages?: PackageSourceUsage[];
  onSelectPackage?: (packageId: string) => void;
  onClose?: () => void;
  onOpenSourceLocation?: (location: { filePath: string; line: number }) => void;
}

export const PackageInspector: React.FC<PackageInspectorProps> = ({
  packageNode,
  dependency,
  graph,
  sourceUsages = [],
  onSelectPackage,
  onClose,
  onOpenSourceLocation,
}) => {
  // Derive effective node representation
  const node: PackageDependencyNode | null = React.useMemo(() => {
    if (packageNode) return packageNode;
    if (dependency) {
      return {
        id: dependency.id,
        name: dependency.name,
        ecosystem: dependency.ecosystem,
        packageManager: dependency.packageManager,
        versionDeclared: dependency.versionDeclared,
        versionResolved: dependency.versionResolved,
        versionInstalled: dependency.versionInstalled,
        alias: dependency.alias,
        scope: dependency.scope,
        isDirect: dependency.isDirect,
        isTransitive: dependency.isTransitive,
        manifestPath: dependency.manifestPath,
        lockfilePath: dependency.lockfilePath,
        workspacePath: dependency.workspacePath,
        provenance: dependency.provenance,
        dependenciesCount: 0,
        dependentsCount: 0,
        sourceUsagesCount: sourceUsages.length,
        health: {
          status: dependency.provenance?.hasConflict ? 'error' : dependency.versionResolved ? 'healthy' : 'warning',
          signals: [],
          hasConflict: !!dependency.provenance?.hasConflict,
          isUnreferenced: sourceUsages.length === 0 && dependency.isDirect,
          isUnlocked: !dependency.versionResolved,
          isDuplicate: false,
        },
      };
    }
    return null;
  }, [packageNode, dependency, sourceUsages]);

  // Outgoing dependencies and ingoing dependents from graph
  const outgoingDependencies = React.useMemo(() => {
    if (!node || !graph) return [];
    return graph.edges
      .filter((e) => e.source === node.id)
      .map((e) => ({
        edge: e,
        targetNode: graph.nodes[e.target],
      }))
      .filter((item) => item.targetNode);
  }, [node, graph]);

  const ingoingDependents = React.useMemo(() => {
    if (!node || !graph) return [];
    return graph.edges
      .filter((e) => e.target === node.id)
      .map((e) => ({
        edge: e,
        sourceNode: graph.nodes[e.source],
      }))
      .filter((item) => item.sourceNode);
  }, [node, graph]);

  if (!node) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Select a package or dependency node to inspect its provenance, relationships, and source usage.
      </div>
    );
  }

  const isManifestRoot = node.id.startsWith('manifest:');
  const health = node.health;
  const provenance = node.provenance;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
      }}
      role="region"
      aria-label={`Package Inspector for ${node.name}`}
    >
      {/* 1. Header with Identity & Actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--blue-selection-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-blue)',
            }}
          >
            {isManifestRoot ? <FileCode size={18} /> : <Package size={18} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {node.name}
              </h3>
              {node.alias && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-muted)',
                  }}
                  title={`Aliased from ${node.alias}`}
                >
                  alias: {node.alias}
                </span>
              )}
              <span className={`kind-badge ${node.isDirect ? 'route' : 'function'}`}>
                {node.ecosystem}
              </span>
              <span className="kind-badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                {node.packageManager}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  background:
                    node.scope === 'runtime'
                      ? 'rgba(59, 130, 246, 0.12)'
                      : node.scope === 'dev'
                      ? 'rgba(107, 114, 128, 0.12)'
                      : 'rgba(245, 158, 11, 0.12)',
                  color:
                    node.scope === 'runtime'
                      ? 'var(--primary-blue)'
                      : node.scope === 'dev'
                      ? 'var(--text-muted)'
                      : 'var(--warning-amber)',
                }}
              >
                {node.scope}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, wordBreak: 'break-all' }}>
              Stable ID: <code>{node.id}</code>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="tool-btn"
            style={{ padding: '4px 8px' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 2. Health Indicator Banner (GT-016) */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          background:
            health.status === 'healthy'
              ? 'rgba(16, 185, 129, 0.08)'
              : health.status === 'error'
              ? 'rgba(239, 68, 68, 0.08)'
              : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${
            health.status === 'healthy'
              ? 'rgba(16, 185, 129, 0.25)'
              : health.status === 'error'
              ? 'rgba(239, 68, 68, 0.25)'
              : 'rgba(245, 158, 11, 0.25)'
          }`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {health.status === 'healthy' ? (
            <ShieldCheck size={16} color="var(--success-teal)" />
          ) : health.status === 'error' ? (
            <ShieldAlert size={16} color="var(--danger-red, #ef4444)" />
          ) : (
            <AlertTriangle size={16} color="var(--warning-amber)" />
          )}
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            Health Status: {health.status.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {health.isUnlocked && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--warning-amber)',
                fontWeight: 600,
              }}
            >
              Unlocked (No Pin)
            </span>
          )}
          {health.hasConflict && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--danger-red, #ef4444)',
                fontWeight: 600,
              }}
            >
              Version Conflict
            </span>
          )}
          {health.isDuplicate && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#a855f7',
                fontWeight: 600,
              }}
            >
              Duplicate Version
            </span>
          )}
          {health.isUnreferenced && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--primary-blue)',
                fontWeight: 600,
              }}
            >
              Unreferenced in Source
            </span>
          )}
          {health.status === 'healthy' && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success-teal)',
                fontWeight: 600,
              }}
            >
              Verified Resolution
            </span>
          )}
        </div>
      </div>

      {/* Health Signals Details */}
      {health.signals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {health.signals.map((sig, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 11,
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>{sig.title}</strong>
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>{sig.message}</span>
              {sig.evidenceSnippet && (
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  Evidence: <code>{sig.evidenceSnippet}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3. Three Pillars of Version Provenance (GT-012) */}
      {!isManifestRoot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {/* Declared */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileCode size={12} color="var(--primary-blue)" /> Declared
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
              {node.versionDeclared || 'None (Transitive)'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {provenance?.declared.isExactPin ? 'Exact pin' : 'Range specification'}
            </div>
          </div>

          {/* Resolved */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} color="var(--success-teal)" /> Resolved Lockfile
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 4,
                color: node.versionResolved ? 'var(--success-teal)' : 'var(--warning-amber)',
              }}
            >
              {node.versionResolved || 'Unavailable'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {node.lockfilePath ? node.lockfilePath.split('/').pop() : 'No lockfile present'}
            </div>
          </div>

          {/* Installed */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <HardDrive size={12} color="var(--primary-blue)" /> Installed Disk
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 4,
                color: node.versionInstalled ? 'var(--primary-blue)' : 'var(--text-muted)',
              }}
            >
              {node.versionInstalled || 'Unavailable'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {node.versionInstalled ? 'Verified from disk metadata' : 'No disk environment'}
            </div>
          </div>
        </div>
      )}

      {/* 4. Dependencies & Dependents (GT-013 Graph Neighborhood) */}
      {!isManifestRoot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {/* Ingoing Dependents */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ArrowLeft size={12} /> Dependents ({ingoingDependents.length})
            </div>
            {ingoingDependents.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Root or unindexed parent
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                {ingoingDependents.map(({ edge, sourceNode }) => (
                  <button
                    key={edge.id}
                    onClick={() => onSelectPackage?.(sourceNode.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '3px 6px',
                      borderRadius: 4,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'var(--text-primary)',
                    }}
                    className="clickable-subitem"
                  >
                    <span style={{ fontWeight: 600 }}>{sourceNode.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{edge.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing Dependencies */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ArrowRight size={12} /> Direct Dependencies ({outgoingDependencies.length})
            </div>
            {outgoingDependencies.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Leaf node (no outgoing edges)
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                {outgoingDependencies.map(({ edge, targetNode }) => (
                  <button
                    key={edge.id}
                    onClick={() => onSelectPackage?.(targetNode.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '3px 6px',
                      borderRadius: 4,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'var(--text-primary)',
                    }}
                    className="clickable-subitem"
                  >
                    <span style={{ fontWeight: 600 }}>{targetNode.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{edge.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Mapped Source Code Usages (GT-014) */}
      {!isManifestRoot && (
        <div
          style={{
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            padding: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
              <Code2 size={14} color="var(--primary-blue)" /> Mapped Source Usages ({sourceUsages.length})
            </div>
            {sourceUsages.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'var(--blue-selection-bg)',
                  color: 'var(--primary-blue)',
                  fontWeight: 600,
                }}
              >
                Exact Locations Verified
              </span>
            )}
          </div>

          {sourceUsages.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                fontSize: 11,
                color: 'var(--warning-amber)',
              }}
            >
              <strong>Zero source-code imports detected</strong>
              <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                This package is declared in <code>{node.manifestPath}</code>, but no static imports or dynamic require
                calls were matched in analyzed source files. Note: dynamic invocation, global polyfills, or build-time
                scripts may still load it at runtime.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {sourceUsages.map((usage) => (
                <div
                  key={usage.id}
                  style={{
                    padding: 8,
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{usage.filePath}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        :L{usage.location.startLine}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 3,
                          fontWeight: 600,
                          background:
                            usage.confidence === 'dynamic_require'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                          color:
                            usage.confidence === 'dynamic_require'
                              ? 'var(--warning-amber)'
                              : 'var(--success-teal)',
                        }}
                      >
                        {usage.confidence}
                      </span>

                      {onOpenSourceLocation && (
                        <button
                          onClick={() =>
                            onOpenSourceLocation({
                              filePath: usage.filePath,
                              line: usage.location.startLine,
                            })
                          }
                          className="tool-btn"
                          style={{ padding: '2px 5px', fontSize: 10 }}
                          title="Jump to source code location"
                        >
                          <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  </div>

                  {usage.sourceSnippet && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: '4px 8px',
                        background: 'var(--bg-primary)',
                        borderRadius: 3,
                        fontFamily: 'monospace',
                        fontSize: 11,
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {usage.sourceSnippet}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, color: 'var(--text-muted)', fontSize: 10 }}>
                    {usage.importedSymbol && (
                      <span>
                        Symbol: <code>{usage.importedSymbol}</code>
                      </span>
                    )}
                    {usage.enclosingEntityName && (
                      <span>
                        Enclosing: <strong>{usage.enclosingEntityName}</strong>
                      </span>
                    )}
                  </div>

                  {usage.evidenceNote && (
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {usage.evidenceNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
