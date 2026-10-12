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
  X,
  GitBranch,
} from 'lucide-react';
import { PackageDependencyGraphView } from '../graph/PackageDependencyGraphView';
import { PackageInspector } from '../inspector/PackageInspector';
import { getStablePackageId } from '@/lib/dependencies/graph';
import { evaluateDependencyHealth } from '@/lib/dependencies/health';

interface DependencyInventoryViewProps {
  analysis: ProjectAnalysis;
  selectedPackageId?: string | null;
  onSelectPackage?: (packageId: string) => void;
  onOpenSourceLocation?: (location: { filePath: string; line: number }) => void;
}

export const DependencyInventoryView: React.FC<DependencyInventoryViewProps> = ({
  analysis,
  selectedPackageId: externalSelectedId,
  onSelectPackage,
  onOpenSourceLocation,
}) => {
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'supported' | 'partial' | 'planned'>('all');

  // View Mode: Table vs Graph
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');

  // Provenance, health, & inventory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ecosystemFilter, setEcosystemFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<
    'all' | 'clean' | 'unlocked' | 'conflicts' | 'duplicates' | 'unreferenced' | 'installed'
  >('all');

  // Internal selected package ID
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const activeSelectedId = externalSelectedId !== undefined && externalSelectedId !== null
    ? externalSelectedId
    : internalSelectedId;

  const depScan = analysis.dependencies;
  const discoveredFiles: DiscoveredDependencyFile[] = useMemo(
    () => depScan?.discoveredFiles || [],
    [depScan]
  );
  const dependencies: NormalizedDependency[] = useMemo(() => {
    if (!depScan?.dependencies) return [];
    const seen = new Set<string>();
    const unique: NormalizedDependency[] = [];
    for (const d of depScan.dependencies) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        unique.push(d);
      }
    }
    return unique;
  }, [depScan]);
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

  // Comprehensive health & provenance statistics derived dynamically using shared evaluateDependencyHealth
  const healthStats = useMemo(() => {
    let cleanCount = 0;
    let unlockedCount = 0;
    let conflictsCount = 0;
    let duplicatesCount = 0;
    let unreferencedCount = 0;
    let installedCount = 0;

    for (const dep of dependencies) {
      const usages = depScan?.sourceUsages?.[dep.id] || [];
      const health = evaluateDependencyHealth(dep, usages, depScan?.coverage);

      if (health.hasConflict) conflictsCount++;
      if (health.isUnlocked) unlockedCount++;
      if (health.isDuplicate) duplicatesCount++;
      if (health.isClean) cleanCount++;
      if (health.isUnreferenced) unreferencedCount++;
      if (dep.versionInstalled) installedCount++;
    }

    return {
      cleanCount,
      unlockedCount,
      conflictsCount,
      duplicatesCount,
      unreferencedCount,
      installedCount,
      totalUsages: depScan?.stats?.totalSourceUsagesCount || 0,
    };
  }, [dependencies, depScan?.sourceUsages, depScan?.coverage, depScan?.stats?.totalSourceUsagesCount]);

  // Resolve selected node and dependency
  const selectedPackageNode = useMemo(() => {
    if (!activeSelectedId) return null;
    return depScan?.graph?.nodes?.[activeSelectedId] || null;
  }, [depScan?.graph, activeSelectedId]);

  const selectedDep = useMemo(() => {
    if (!activeSelectedId) return null;
    return (
      dependencies.find(
        (d) => d.id === activeSelectedId || getStablePackageId(d) === activeSelectedId
      ) || null
    );
  }, [dependencies, activeSelectedId]);

  const handleSelectPackage = (id: string | null) => {
    setInternalSelectedId(id);
    onSelectPackage?.(id || '');
  };

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

      // 3. Scope Filter
      if (scopeFilter !== 'all' && dep.scope !== scopeFilter) {
        return false;
      }

      // 4. Health & Provenance Status Filter using shared evaluator
      const usages = depScan?.sourceUsages?.[dep.id] || [];
      const health = evaluateDependencyHealth(dep, usages, depScan?.coverage);

      if (healthFilter === 'clean' && !health.isClean) return false;
      if (healthFilter === 'unlocked' && !health.isUnlocked) return false;
      if (healthFilter === 'conflicts' && !health.hasConflict) return false;
      if (healthFilter === 'duplicates' && !health.isDuplicate) return false;
      if (healthFilter === 'unreferenced' && !health.isUnreferenced) return false;
      if (healthFilter === 'installed' && !dep.versionInstalled) return false;

      return true;
    });
  }, [dependencies, searchQuery, ecosystemFilter, scopeFilter, healthFilter, depScan?.sourceUsages, depScan?.coverage]);

  const hasLockfileForEcosystem = (ecosystem: string) => {
    return lockfiles.some((l) => l.ecosystem === ecosystem);
  };

  return (
    <div
      style={{
        height: '100%',
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
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Verified Clean Lockfiles</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--success-teal)' }}>
              {healthStats.cleanCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Evidence-backed pinned versions
            </div>
          </div>

          {/* Card 4: Declared Only (Unlocked) */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unlocked (Declared Only)</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginTop: 6,
                color: healthStats.unlockedCount > 0 ? 'var(--warning-amber)' : 'var(--text-muted)',
              }}
            >
              {healthStats.unlockedCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {healthStats.unlockedCount > 0 ? 'Missing lockfile resolution' : 'All declared are locked'}
            </div>
          </div>

          {/* Card 5: Version Conflicts */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${healthStats.conflictsCount > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Version Conflicts</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginTop: 6,
                color: healthStats.conflictsCount > 0 ? 'var(--danger-red, #ef4444)' : 'var(--success-teal)',
              }}
            >
              {healthStats.conflictsCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {healthStats.conflictsCount > 0 ? 'Range mismatches detected' : 'Zero conflicts detected'}
            </div>
          </div>

          {/* Card 6: Mapped Source Usages (GT-014) */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Source Code Usages</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--primary-blue)' }}>
              {healthStats.totalUsages}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {healthStats.unreferencedCount > 0 ? `${healthStats.unreferencedCount} unreferenced direct package(s)` : 'All direct packages referenced'}
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

        {/* Normalized Dependency Inventory & Package Graph (GT-013, GT-014, GT-015, GT-016) */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} color="var(--primary-blue)" /> Dependency Intelligence Inventory ({filteredDependencies.length}/{dependencies.length})
              </div>

              {/* View Mode Toggle */}
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  padding: 2,
                  gap: 2,
                }}
                role="group"
                aria-label="View mode toggle"
              >
                <button
                  onClick={() => setViewMode('table')}
                  className={`tool-btn ${viewMode === 'table' ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  aria-pressed={viewMode === 'table'}
                >
                  <Layers size={12} /> Table View
                </button>
                <button
                  onClick={() => setViewMode('graph')}
                  className={`tool-btn ${viewMode === 'graph' ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  aria-pressed={viewMode === 'graph'}
                >
                  <GitBranch size={12} /> Graph View
                </button>
              </div>
            </div>

            {/* Controls: Search, Ecosystem & Scope Filters */}
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
                  placeholder="Search package or alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    width: 160,
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

              {/* Scope filter dropdown */}
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  outline: 'none',
                }}
                aria-label="Filter by scope"
              >
                <option value="all">All Scopes</option>
                <option value="runtime">runtime</option>
                <option value="dev">dev</option>
                <option value="peer">peer</option>
                <option value="optional">optional</option>
              </select>
            </div>
          </div>

          {/* Filter Tabs for Health & Provenance State (GT-016) */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => setHealthFilter('all')}
              className={`tool-btn ${healthFilter === 'all' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              All Packages ({dependencies.length})
            </button>
            <button
              onClick={() => setHealthFilter('clean')}
              className={`tool-btn ${healthFilter === 'clean' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Verified Clean ({healthStats.cleanCount})
            </button>
            <button
              onClick={() => setHealthFilter('unlocked')}
              className={`tool-btn ${healthFilter === 'unlocked' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Unlocked ({healthStats.unlockedCount})
            </button>
            {healthStats.conflictsCount > 0 && (
              <button
                onClick={() => setHealthFilter('conflicts')}
                className={`tool-btn ${healthFilter === 'conflicts' ? 'active' : ''}`}
                style={{ fontSize: 11, color: 'var(--danger-red, #ef4444)' }}
              >
                Conflicts ({healthStats.conflictsCount})
              </button>
            )}
            {healthStats.duplicatesCount > 0 && (
              <button
                onClick={() => setHealthFilter('duplicates')}
                className={`tool-btn ${healthFilter === 'duplicates' ? 'active' : ''}`}
                style={{ fontSize: 11, color: '#a855f7' }}
              >
                Duplicates ({healthStats.duplicatesCount})
              </button>
            )}
            <button
              onClick={() => setHealthFilter('unreferenced')}
              className={`tool-btn ${healthFilter === 'unreferenced' ? 'active' : ''}`}
              style={{ fontSize: 11 }}
            >
              Unreferenced in Source ({healthStats.unreferencedCount})
            </button>
            {healthStats.installedCount > 0 && (
              <button
                onClick={() => setHealthFilter('installed')}
                className={`tool-btn ${healthFilter === 'installed' ? 'active' : ''}`}
                style={{ fontSize: 11 }}
              >
                Installed Disk ({healthStats.installedCount})
              </button>
            )}
          </div>

          {/* Body: Graph View or Table View */}
          {viewMode === 'graph' ? (
            <div
              style={{
                height: 540,
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              {depScan?.graph ? (
                <PackageDependencyGraphView
                  graph={depScan.graph}
                  selectedPackageId={activeSelectedId}
                  onSelectPackage={handleSelectPackage}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Graph visualization unavailable for current scan result.
                </div>
              )}
            </div>
          ) : filteredDependencies.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No dependencies match the current filter criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px' }}>Package & Manifest</th>
                    <th style={{ padding: '8px 10px' }}>Health Status</th>
                    <th style={{ padding: '8px 10px' }}>Declared Version (Manifest)</th>
                    <th style={{ padding: '8px 10px' }}>Resolved Version (Lockfile)</th>
                    <th style={{ padding: '8px 10px' }}>Installed Version (Disk)</th>
                    <th style={{ padding: '8px 10px' }}>Source Usages</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDependencies.map((pkg) => {
                    const usages = depScan?.sourceUsages?.[pkg.id] || [];
                    const health = evaluateDependencyHealth(pkg, usages, depScan?.coverage);
                    const hasConflict = health.hasConflict;
                    const isSelected = activeSelectedId === pkg.id;

                    return (
                      <tr
                        key={pkg.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          background: isSelected
                            ? 'var(--blue-selection-bg)'
                            : hasConflict
                            ? 'rgba(239, 68, 68, 0.04)'
                            : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleSelectPackage(isSelected ? null : pkg.id)}
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

                        {/* Column 2: Health Status Indicator (GT-016) */}
                        <td style={{ padding: '10px 10px' }}>
                          {health.hasConflict ? (
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
                          ) : health.isUnlocked ? (
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
                              <AlertCircle size={12} /> Unlocked
                            </span>
                          ) : health.isDuplicate ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#a855f7',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 500,
                              }}
                            >
                              <Layers size={12} /> Duplicate
                            </span>
                          ) : health.isClean ? (
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
                              <CheckCircle2 size={12} /> Clean
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {pkg.isTransitive ? 'Transitive' : 'Unverified'}
                            </span>
                          )}
                        </td>

                        {/* Column 3: Declared Version */}
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

                        {/* Column 4: Resolved Version */}
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
                              Unavailable
                            </span>
                          )}
                        </td>

                        {/* Column 5: Installed Version */}
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

                        {/* Column 6: Source Usages (GT-014) */}
                        <td style={{ padding: '10px 10px' }}>
                          {usages.length > 0 ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--blue-selection-bg)',
                                color: 'var(--primary-blue)',
                                fontWeight: 600,
                              }}
                            >
                              {usages.length} usage{usages.length === 1 ? '' : 's'}
                            </span>
                          ) : pkg.isDirect ? (
                            health.isUnreferenced ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: 'var(--warning-amber)',
                                  fontWeight: 500,
                                }}
                                title="Declared in manifest, but zero imports detected in analyzed source files"
                              >
                                0 (unreferenced)
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-muted)',
                                  fontWeight: 500,
                                }}
                                title="Source analysis is unavailable or language is unsupported for negative claims"
                              >
                                Analysis unavailable
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>transitive</span>
                          )}
                        </td>

                        {/* Column 7: Action */}
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                          <button
                            className="tool-btn"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPackage(isSelected ? null : pkg.id);
                            }}
                            aria-label={`Inspect ${pkg.name}`}
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

        {/* Integrated Package Inspector (GT-015) */}
        {activeSelectedId && (
          <PackageInspector
            packageNode={selectedPackageNode}
            dependency={selectedDep}
            graph={depScan?.graph}
            sourceUsages={
              depScan?.sourceUsages?.[selectedDep?.id || ''] ||
              depScan?.sourceUsages?.[activeSelectedId] ||
              []
            }
            coverage={depScan?.coverage}
            onSelectPackage={handleSelectPackage}
            onClose={() => handleSelectPackage(null)}
            onOpenSourceLocation={onOpenSourceLocation}
          />
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
