'use client';

import React from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import { ECOSYSTEM_CAPABILITY_MATRIX } from '@/lib/dependencies/capability-matrix';
import {
  DiscoveredDependencyFile,
  NormalizedDependency,
  ManifestDiagnostic,
} from '@/lib/dependencies/types';
import {
  Package,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface DependencyInventoryViewProps {
  analysis: ProjectAnalysis;
}

export const DependencyInventoryView: React.FC<DependencyInventoryViewProps> = ({
  analysis,
}) => {
  const depScan = analysis.dependencies;
  const discoveredFiles: DiscoveredDependencyFile[] = depScan?.discoveredFiles || [];
  const dependencies: NormalizedDependency[] = depScan?.dependencies || [];
  const diagnostics: ManifestDiagnostic[] = depScan?.diagnostics || [];

  const manifestFiles = discoveredFiles.filter((f) => f.kind === 'manifest');
  const lockfiles = discoveredFiles.filter((f) => f.kind === 'lockfile');

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
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
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

        {/* Overview Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Manifest & Lock Files</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>
              {discoveredFiles.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {manifestFiles.length} manifest(s), {lockfiles.length} lockfile(s)
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Declared Dependencies</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--primary-blue)' }}>
              {dependencies.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Across {depScan?.workspaces?.length || 1} workspace package(s)
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supported Ecosystems</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--success-teal)' }}>
              {ECOSYSTEM_CAPABILITY_MATRIX.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              npm, pip, cargo, go, maven, nuget +
            </div>
          </div>
        </div>

        {/* Discovered Manifests List */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileCode size={16} color="var(--primary-blue)" /> Discovered Manifest & Lock Files ({discoveredFiles.length})
          </div>

          {discoveredFiles.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No manifest or lockfile found in this repository.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discoveredFiles.map((file) => (
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
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="kind-badge route">{file.ecosystem}</span>
                    <strong style={{ fontSize: 13 }}>{file.path}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      via {file.packageManager} ({file.kind})
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--success-teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={13} /> Indexed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Declared Package Inventory Table */}
        {dependencies.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="var(--primary-blue)" /> Normalized Dependency Inventory ({dependencies.length})
            </div>
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
          </div>
        )}

        {/* Diagnostics & Ingestion Warnings */}
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
      </div>
    </div>
  );
};
