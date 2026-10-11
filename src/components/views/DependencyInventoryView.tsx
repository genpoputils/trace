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
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Search,
  HardDrive,
  X,
} from 'lucide-react';

interface DependencyInventoryViewProps {
  analysis: ProjectAnalysis;
}

export const DependencyInventoryView: React.FC<DependencyInventoryViewProps> = ({
  analysis,
}) => {
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'supported' | 'partial' | 'planned'>('all');

  // Provenance & inventory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ecosystemFilter, setEcosystemFilter] = useState<string>('all');
  const [provenanceFilter, setProvenanceFilter] = useState<
    'all' | 'resolved' | 'declared_only' | 'conflicts' | 'installed'
  >('all');
  const [selectedDep, setSelectedDep] = useState<NormalizedDependency | null>(null);

  const depScan = analysis.dependencies;
  const discoveredFiles: DiscoveredDependencyFile[] = useMemo(
    () => depScan?.discoveredFiles || [],
    [depScan]
  );
  const dependencies: NormalizedDependency[] = useMemo(
    () => depScan?.dependencies || [],
    [depScan]
  );
  const diagnostics: ManifestDiagnostic[] = useMemo(
    () => depScan?.diagnostics || [],
    [depScan]
  );


  const manifestFiles = discoveredFiles.filter((f) => f.kind === 'manifest');
  const lockfiles = discoveredFiles.filter((f) => f.kind === 'lockfile' || f.kind === 'checksum_file');

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

  // Provenance-specific statistics derived dynamically from data model
  const provenanceStats = useMemo(() => {
    let resolvedCount = 0;
    let declaredOnlyCount = 0;
    let installedCount = 0;
    let conflictsCount = 0;

    for (const dep of dependencies) {
      if (dep.versionResolved) resolvedCount++;
      if (dep.isDirect && !dep.versionResolved) declaredOnlyCount++;
      if (dep.versionInstalled) installedCount++;
      if (dep.provenance?.hasConflict) conflictsCount++;
    }

    return {
      resolvedCount,
      declaredOnlyCount,
      installedCount,
      conflictsCount,
    };
  }, [dependencies]);

  // Distinct ecosystems present in analyzed project
  const availableEcosystems = useMemo(() => {
    const set = new Set<string>();
    dependencies.forEach((d) => set.add(d.ecosystem));
    return Array.from(set);
  }, [dependencies]);

  // Filtered dependencies list
  const filteredDependencies = useMemo(() => {
    return dependencies.filter((dep) => {
      // 1. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = dep.name.toLowerCase().includes(q);
        const matchesAlias = dep.alias?.toLowerCase().includes(q);
        const matchesPath = dep.manifestPath.toLowerCase().includes(q);
        if (!matchesName && !matchesAlias && !matchesPath) return false;
      }

      // 2. Ecosystem Filter
      if (ecosystemFilter !== 'all' && dep.ecosystem !== ecosystemFilter) {
        return false;
      }

      // 3. Provenance Status Filter
      if (provenanceFilter === 'resolved' && !dep.versionResolved) return false;
      if (provenanceFilter === 'declared_only' && (dep.versionResolved || !dep.isDirect)) return false;
      if (provenanceFilter === 'installed' && !dep.versionInstalled) return false;
      if (provenanceFilter === 'conflicts' && !dep.provenance?.hasConflict) return false;

      return true;
    });
  }, [dependencies, searchQuery, ecosystemFilter, provenanceFilter]);

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
      aria-label="Dependency inventory and version provenance view"
    >
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--primary-blue)',
              }}
            >
              <Package size={14} /> Multi-Ecosystem Version Provenance
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
              Dependency & Version Provenance
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Accurately distinguishes manifest-declared ranges, lockfile-resolved pins, and installed disk environments
              without guesswork.
            </p>
          </div>

          <div style={{ textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              className="kind-badge"
              style={{
                background: 'var(--blue-selection-bg)',
                color: 'var(--primary-blue)',
                fontSize: 12,
                padding: '4px 10px',
              }}
            >
              Provenance Active (GT-012)
            </span>
          </div>
        </div>

        {/* Overview Stats Cards Derived Dynamically */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {/* Card 1: Manifests & Lockfiles */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Project Files</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>
              {discoveredFiles.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {manifestFiles.length} manifest(s), {lockfiles.length} lockfile(s)
            </div>
          </div>

          {/* Card 2: Total Dependencies */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Packages</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--primary-blue)' }}>
              {dependencies.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {dependencies.filter((d) => d.isDirect).length} direct, {dependencies.filter((d) => d.isTransitive).length} transitive
            </div>
          </div>

          {/* Card 3: Resolved with Lockfile */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Resolved with Lockfile</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--success-teal)' }}>
              {provenanceStats.resolvedCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Evidence-backed pinned versions
            </div>
          </div>

          {/* Card 4: Declared Only (Unresolved) */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Declared Only (Unresolved)</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginTop: 6,
                color: provenanceStats.declaredOnlyCount > 0 ? 'var(--warning-amber)' : 'var(--text-muted)',
              }}
            >
              {provenanceStats.declaredOnlyCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {provenanceStats.declaredOnlyCount > 0 ? 'Missing lockfile evidence' : 'All declared are resolved'}
            </div>
          </div>

          {/* Card 5: Version Conflicts */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${provenanceStats.conflictsCount > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Provenance Conflicts</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginTop: 6,
                color: provenanceStats.conflictsCount > 0 ? 'var(--danger-red, #ef4444)' : 'var(--success-teal)',
              }}
            >
              {provenanceStats.conflictsCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {provenanceStats.conflictsCount > 0 ? 'Range mismatches or conflicts' : 'Zero discrepancies detected'}
            </div>
          </div>
        </div>

        {/* Discovered Manifests List in Analyzed Project */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileCode size={16} color="var(--primary-blue)" /> Discovered Manifest & Lock Files ({discoveredFiles.length})
          </div>

          {discoveredFiles.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No manifest or lockfiles detected in this repository.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discoveredFiles.map((file) => {
                const isLockfile = file.kind === 'lockfile' || file.kind === 'checksum_file';
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
                            <CheckCircle2 size={12} /> {isLockfile ? 'Resolution Lockfile' : 'Resolved with Lockfile'}
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

        {/* Normalized Dependency Inventory Table with Distinct Declared & Resolved Versions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="var(--primary-blue)" /> Normalized Dependency Inventory ({filteredDependencies.length}/{dependencies.length})
            </div>

            {/* Controls: Search and Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                }}
              >
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search package name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    width: 150,
                  }}
                  aria-label="Search package name"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Ecosystem filter dropdown if polyglot */}
              {availableEcosystems.length > 1 && (
                <select
                  value={ecosystemFilter}
                  onChange={(e) => setEcosystemFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                  aria-label="Filter by ecosystem"
                >
                  <option value="all">All Ecosystems</option>
                  {availableEcosystems.map((eco) => (
                    <option key={eco} value={eco}>
                      {eco}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Filter Tabs for Provenance State */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => setProvenanceFilter('all')}
              className={`tool-btn ${provenanceFilter === 'all' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              All Packages ({dependencies.length})
            </button>
            <button
              onClick={() => setProvenanceFilter('resolved')}
              className={`tool-btn ${provenanceFilter === 'resolved' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Resolved ({provenanceStats.resolvedCount})
            </button>
            <button
              onClick={() => setProvenanceFilter('declared_only')}
              className={`tool-btn ${provenanceFilter === 'declared_only' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Declared Only ({provenanceStats.declaredOnlyCount})
            </button>
            <button
              onClick={() => setProvenanceFilter('installed')}
              className={`tool-btn ${provenanceFilter === 'installed' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Installed Disk ({provenanceStats.installedCount})
            </button>
            {provenanceStats.conflictsCount > 0 && (
              <button
                onClick={() => setProvenanceFilter('conflicts')}
                className={`tool-btn ${provenanceFilter === 'conflicts' ? 'active' : ''}`}
                style={{ fontSize: 11, color: 'var(--danger-red, #ef4444)' }}
              >
                Conflicts ({provenanceStats.conflictsCount})
              </button>
            )}
          </div>

          {filteredDependencies.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No dependencies match the current filter criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px' }}>Package & Manifest</th>
                    <th style={{ padding: '8px 10px' }}>Declared Version (Manifest)</th>
                    <th style={{ padding: '8px 10px' }}>Resolved Version (Lockfile)</th>
                    <th style={{ padding: '8px 10px' }}>Installed Version (Disk)</th>
                    <th style={{ padding: '8px 10px' }}>Provenance Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDependencies.map((pkg) => {
                    const hasConflict = pkg.provenance?.hasConflict;
                    const isSelected = selectedDep?.id === pkg.id;

                    return (
                      <tr
                        key={pkg.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          background: isSelected ? 'var(--blue-selection-bg)' : hasConflict ? 'rgba(239, 68, 68, 0.04)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedDep(isSelected ? null : pkg)}
                      >
                        {/* Column 1: Package Name & Source */}
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{pkg.name}</strong>
                            {pkg.alias && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-muted)',
                                }}
                                title={`Aliased from ${pkg.alias}`}
                              >
                                alias: {pkg.alias}
                              </span>
                            )}
                            <span className={`kind-badge ${pkg.isDirect ? 'route' : 'function'}`}>
                              {pkg.ecosystem}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {pkg.manifestPath} • scope: <code>{pkg.scope}</code>
                          </div>
                        </td>

                        {/* Column 2: Declared Version */}
                        <td style={{ padding: '10px 10px' }}>
                          {pkg.versionDeclared ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <code
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-primary)',
                                  fontWeight: 600,
                                }}
                              >
                                {pkg.versionDeclared}
                              </code>
                              {pkg.provenance?.declared.isExactPin ? (
                                <span style={{ fontSize: 10, color: 'var(--success-teal)' }} title="Exact version pin">
                                  [pin]
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Version range specification">
                                  [range]
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>None (transitive)</span>
                          )}
                        </td>

                        {/* Column 3: Resolved Version */}
                        <td style={{ padding: '10px 10px' }}>
                          {pkg.versionResolved ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <code
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: hasConflict ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                                  color: hasConflict ? 'var(--danger-red, #ef4444)' : 'var(--success-teal)',
                                  fontWeight: 600,
                                }}
                              >
                                {pkg.versionResolved}
                              </code>
                              {pkg.lockfilePath && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title={`Resolved in ${pkg.lockfilePath}`}>
                                  ({pkg.lockfilePath.split('/').pop()})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: 'var(--warning-amber)',
                              }}
                            >
                              Unavailable (no lockfile)
                            </span>
                          )}
                        </td>

                        {/* Column 4: Installed Version */}
                        <td style={{ padding: '10px 10px' }}>
                          {pkg.versionInstalled ? (
                            <code
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(59, 130, 246, 0.12)',
                                color: 'var(--primary-blue)',
                                fontWeight: 600,
                              }}
                            >
                              {pkg.versionInstalled}
                            </code>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unavailable</span>
                          )}
                        </td>

                        {/* Column 5: Provenance Status */}
                        <td style={{ padding: '10px 10px' }}>
                          {hasConflict ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: 'var(--danger-red, #ef4444)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 600,
                              }}
                            >
                              <AlertTriangle size={12} /> Conflict
                            </span>
                          ) : pkg.versionResolved ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: 'var(--success-teal)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 500,
                              }}
                            >
                              <CheckCircle2 size={12} /> {pkg.isDirect ? 'Resolved' : 'Transitive'}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: 'var(--warning-amber)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 500,
                              }}
                            >
                              <AlertCircle size={12} /> Declared Only
                            </span>
                          )}
                        </td>

                        {/* Column 6: Action */}
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                          <button
                            className="tool-btn"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDep(isSelected ? null : pkg);
                            }}
                            aria-label={`Inspect provenance for ${pkg.name}`}
                          >
                            {isSelected ? 'Close' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inspectable Package Provenance Drawer / Modal */}
        {selectedDep && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--primary-blue)',
              borderRadius: 'var(--radius-md)',
              padding: 20,
              boxShadow: 'var(--shadow-md)',
              position: 'relative',
            }}
            role="region"
            aria-label={`Provenance details for ${selectedDep.name}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={18} color="var(--primary-blue)" />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  Provenance Inspector: {selectedDep.name}
                </h3>
                <span className="kind-badge route">{selectedDep.ecosystem}</span>
                <span className="kind-badge function">{selectedDep.packageManager}</span>
              </div>
              <button
                className="tool-btn"
                style={{ padding: '4px 8px' }}
                onClick={() => setSelectedDep(null)}
                aria-label="Close inspector"
              >
                <X size={16} />
              </button>
            </div>

            {/* Conflict Alert Banner if any */}
            {selectedDep.provenance?.hasConflict && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  marginBottom: 16,
                  color: 'var(--danger-red, #ef4444)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
                  <AlertTriangle size={16} /> Provenance Conflict Detected
                </div>
                {selectedDep.provenance.conflicts.map((conf, idx) => (
                  <div key={idx} style={{ fontSize: 12, marginTop: 4 }}>
                    • {conf.message}
                  </div>
                ))}
              </div>
            )}

            {/* 3 Pillars of Version Provenance */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {/* 1. Declared Version Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  <FileCode size={14} color="var(--primary-blue)" /> Manifest Declared
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
                  {selectedDep.versionDeclared || 'None (Transitive)'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Source: <code>{selectedDep.manifestPath}</code>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Specification Kind:{' '}
                  <strong>{selectedDep.provenance?.declared.isExactPin ? 'Exact Pin' : 'Version Range'}</strong>
                </div>
              </div>

              {/* 2. Resolved Version Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={14} color="var(--success-teal)" /> Lockfile Resolved
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    marginTop: 8,
                    color: selectedDep.versionResolved ? 'var(--success-teal)' : 'var(--warning-amber)',
                  }}
                >
                  {selectedDep.versionResolved || 'Unavailable'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Source:{' '}
                  {selectedDep.lockfilePath ? (
                    <code>{selectedDep.lockfilePath}</code>
                  ) : (
                    <span style={{ color: 'var(--warning-amber)' }}>No lockfile found</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Status: <strong>{selectedDep.provenance?.resolved.status || 'unavailable'}</strong>
                </div>
              </div>

              {/* 3. Installed Version Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  <HardDrive size={14} color="var(--primary-blue)" /> Installed Disk
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    marginTop: 8,
                    color: selectedDep.versionInstalled ? 'var(--primary-blue)' : 'var(--text-muted)',
                  }}
                >
                  {selectedDep.versionInstalled || 'Unavailable'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Source:{' '}
                  {selectedDep.provenance?.installed.sourceFilePath ? (
                    <code>{selectedDep.provenance.installed.sourceFilePath}</code>
                  ) : (
                    <span>No installed environment detected in input</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Status: <strong>{selectedDep.provenance?.installed.status || 'unavailable'}</strong>
                </div>
              </div>
            </div>

            {/* Evidence Audit Trail */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                Evidence Audit Trail ({selectedDep.evidence.length} items)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedDep.evidence.map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{ev.sourceFilePath}</strong>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                        ({ev.sourceKind} • {ev.evidenceKind})
                      </span>
                      {ev.rawSpecifier && (
                        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                          Specifier: <code>{ev.rawSpecifier}</code>
                        </div>
                      )}
                    </div>
                    {ev.integrity && (
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>
                        Integrity: {ev.integrity.slice(0, 32)}...
                      </span>
                    )}
                  </div>
                ))}
              </div>
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
                    background: d.severity === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'var(--warning-bg)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    color: d.severity === 'error' ? 'var(--danger-red, #ef4444)' : 'var(--warning-amber)',
                    border: `1px solid ${d.severity === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                  }}
                >
                  <strong>{d.filePath} [{d.code}]:</strong> {d.message}
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
                    {st === 'all'
                      ? `All Formats (${matrixStats.totalFormats})`
                      : `${st} (${st === 'supported' ? matrixStats.fullySupportedCount : st === 'partial' ? matrixStats.partialCount : matrixStats.plannedCount})`}
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
