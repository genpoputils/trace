'use client';

import React, { useMemo, useState } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import { ECOSYSTEM_CAPABILITY_MATRIX } from '@/lib/dependencies/capability-matrix';
import {
  DiscoveredDependencyFile,
  NormalizedDependency,
  ManifestDiagnostic,
  EcosystemCapability,
} from '@/lib/dependencies/types';
import {
  Package,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

interface DependencyInventoryViewProps {
  analysis: ProjectAnalysis;
}

export const DependencyInventoryView: React.FC<DependencyInventoryViewProps> = ({
  analysis,
}) => {
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'supported' | 'partial' | 'planned'>('all');

  const depScan = analysis.dependencies;
  const discoveredFiles: DiscoveredDependencyFile[] = depScan?.discoveredFiles || [];
  const dependencies: NormalizedDependency[] = depScan?.dependencies || [];
  const diagnostics: ManifestDiagnostic[] = depScan?.diagnostics || [];

  const manifestFiles = discoveredFiles.filter((f) => f.kind === 'manifest');
  const lockfiles = discoveredFiles.filter((f) => f.kind === 'lockfile');

  // Compute capability breakdown directly from matrix
  const matrixStats = useMemo(() => {
    const totalFormats = ECOSYSTEM_CAPABILITY_MATRIX.length;
    const uniqueEcosystems = new Set(ECOSYSTEM_CAPABILITY_MATRIX.map((e) => e.ecosystem)).size;
    const uniqueWithParsing = new Set(
      ECOSYSTEM_CAPABILITY_MATRIX.filter((e) => e.capabilities.manifestParsing && e.status !== 'planned').map(
        (e) => e.ecosystem
      )
    ).size;
    const fullySupportedCount = ECOSYSTEM_CAPABILITY_MATRIX.filter((e) => e.status === 'supported').length;
    const partialCount = ECOSYSTEM_CAPABILITY_MATRIX.filter((e) => e.status === 'partial').length;
    const plannedCount = ECOSYSTEM_CAPABILITY_MATRIX.filter((e) => e.status === 'planned').length;

    return {
      totalFormats,
      uniqueEcosystems,
      uniqueWithParsing,
      fullySupportedCount,
      partialCount,
      plannedCount,
    };
  }, []);

  const filteredMatrix = useMemo(() => {
    if (statusFilter === 'all') return ECOSYSTEM_CAPABILITY_MATRIX;
    return ECOSYSTEM_CAPABILITY_MATRIX.filter((e) => e.status === statusFilter);
  }, [statusFilter]);

  // Determine if a discovered manifest has lockfile evidence
  const hasLockfileForEcosystem = (ecosystem: string) => {
    return lockfiles.some((l) => l.ecosystem === ecosystem);
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
      role="region"
      aria-label="Dependency inventory view"
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Banner */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderTop: '3px solid var(--primary-blue)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-blue)' }}>
              <Package size={14} /> Multi-Ecosystem Dependency Intelligence
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
              Dependency & Manifest Inventory
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Scan declared and resolved third-party package dependencies across polyglot workspaces.
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              className="kind-badge"
              style={{
                background: 'var(--blue-selection-bg)',
                color: 'var(--primary-blue)',
                fontSize: 12,
                padding: '4px 10px',
              }}
            >
              Foundation Active (Issue #6)
            </span>
          </div>
        </div>

        {/* Overview Stats Derived Dynamically from Data Model */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {/* Card 1: Discovered Manifests */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Project Manifest Files</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>
              {discoveredFiles.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {manifestFiles.length} manifest(s), {lockfiles.length} lockfile(s)
            </div>
          </div>

          {/* Card 2: Declared Dependencies */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Declared Dependencies</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--primary-blue)' }}>
              {dependencies.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Across {depScan?.workspaces?.length || 1} workspace package(s)
            </div>
          </div>

          {/* Card 3: Documented Ecosystems */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ecosystems Documented</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>
              {matrixStats.uniqueEcosystems}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {matrixStats.totalFormats} package manager formats cataloged
            </div>
          </div>

          {/* Card 4: Supported Ecosystem Parsing */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ecosystems with Supported Parsing</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--success-teal)' }}>
              {matrixStats.uniqueWithParsing}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {matrixStats.fullySupportedCount} supported, {matrixStats.partialCount} partial, {matrixStats.plannedCount} planned
            </div>
          </div>
        </div>

        {/* Discovered Manifests List in Analyzed Project */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileCode size={16} color="var(--primary-blue)" /> Discovered Manifest & Lock Files ({discoveredFiles.length})
          </div>

          {discoveredFiles.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No manifest or lockfiles detected in this repository.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discoveredFiles.map((file) => {
                const isLockfile = file.kind === 'lockfile';
                const hasLock = isLockfile || hasLockfileForEcosystem(file.ecosystem);

                return (
                  <div
                    key={file.path}
                    style={{
                      padding: 12,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="kind-badge route">{file.ecosystem}</span>
                      <strong style={{ fontSize: 13 }}>{file.path}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        via {file.packageManager} ({file.kind})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: hasLock ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          color: hasLock ? 'var(--success-teal)' : 'var(--warning-amber)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 500,
                        }}
                      >
                        {hasLock ? (
                          <>
                            <CheckCircle2 size={12} /> {isLockfile ? 'Exact Lockfile' : 'Resolved with lockfile'}
                          </>
                        ) : (
                          <>
                            <AlertCircle size={12} /> Declared only (no lockfile)
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Declared Package Inventory Table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={16} color="var(--primary-blue)" /> Normalized Dependency Inventory ({dependencies.length})
          </div>

          {dependencies.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No third-party packages declared in analyzed manifests.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {dependencies.map((pkg) => (
                <div
                  key={pkg.id}
                  style={{
                    padding: 10,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{pkg.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Version: <code>{pkg.versionDeclared || pkg.versionResolved || 'any'}</code> • Scope: {pkg.scope}
                    </div>
                  </div>
                  <span className={`kind-badge ${pkg.isDirect ? 'route' : 'function'}`}>
                    {pkg.ecosystem}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diagnostics & Warnings */}
        {diagnostics.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning-amber)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> Dependency Ingestion Diagnostics ({diagnostics.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {diagnostics.map((d, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--warning-bg)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    color: 'var(--warning-amber)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                  }}
                >
                  <strong>{d.filePath}:</strong> {d.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Ecosystem Capability Matrix Breakdown (Collapsible & Filterable) */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setMatrixExpanded(!matrixExpanded)}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={16} color="var(--primary-blue)" />
                Multi-Ecosystem Capability Matrix Breakdown ({matrixStats.totalFormats} Formats)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Documented coverage across {matrixStats.uniqueEcosystems} distinct ecosystems with parsing status for each format.
              </div>
            </div>
            <button
              className="tool-btn"
              style={{ padding: '4px 8px' }}
              aria-label={matrixExpanded ? 'Collapse capability matrix' : 'Expand capability matrix'}
            >
              {matrixExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          {matrixExpanded && (
            <div style={{ marginTop: 16 }}>
              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['all', 'supported', 'partial', 'planned'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`tool-btn ${statusFilter === st ? 'active' : ''}`}
                    style={{ fontSize: 11, textTransform: 'capitalize' }}
                  >
                    {st === 'all' ? `All Formats (${matrixStats.totalFormats})` : `${st} (${st === 'supported' ? matrixStats.fullySupportedCount : st === 'partial' ? matrixStats.partialCount : matrixStats.plannedCount})`}
                  </button>
                ))}
              </div>

              {/* Formats Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px' }}>Ecosystem & Package Manager</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Manifest Detection & Parsing</th>
                      <th style={{ padding: '8px 10px' }}>Lockfile Parsing</th>
                      <th style={{ padding: '8px 10px' }}>Transitive Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrix.map((item: EcosystemCapability) => {
                      const isSupported = item.status === 'supported';
                      const isPartial = item.status === 'partial';

                      return (
                        <tr
                          key={`${item.ecosystem}-${item.packageManager}`}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                          }}
                        >
                          <td style={{ padding: '8px 10px' }}>
                            <strong>{item.displayName}</strong>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Manifests: <code>{item.manifestFiles.join(', ')}</code>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              className="kind-badge"
                              style={{
                                background: isSupported
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : isPartial
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'var(--bg-tertiary)',
                                color: isSupported
                                  ? 'var(--success-teal)'
                                  : isPartial
                                  ? 'var(--warning-amber)'
                                  : 'var(--text-muted)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {item.capabilities.manifestParsing ? (
                              <span style={{ color: 'var(--success-teal)' }}>Supported</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Planned</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {item.capabilities.lockfileParsing ? (
                              <span style={{ color: 'var(--success-teal)' }}>Supported</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>None / Planned</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {item.capabilities.transitiveResolution ? (
                              <span style={{ color: 'var(--success-teal)' }}>Supported</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Planned</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
