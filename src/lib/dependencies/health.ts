/**
 * Evidence-Backed Dependency Health & Diagnostics Engine (GT-016)
 *
 * Computes factual health indicators, version conflict diagnostics, and
 * unreferenced package warnings strictly grounded in repository evidence.
 * Zero ungrounded vulnerability, outdated, or runtime usage assumptions.
 */

import {
  NormalizedDependency,
  DependencyHealthIndicator,
  DependencyHealthSignal,
  PackageSourceUsage,
} from './types';

/**
 * Evaluates health signals and diagnostics for a normalized package dependency.
 */
export function evaluateDependencyHealth(
  dep: NormalizedDependency,
  sourceUsages: PackageSourceUsage[] = []
): DependencyHealthIndicator {
  const signals: DependencyHealthSignal[] = [];

  const prov = dep.provenance;
  let hasConflict = false;
  let isUnlocked = false;
  let isDuplicate = false;
  const isUnreferenced = dep.isDirect && sourceUsages.length === 0;

  // 1. Check Version Conflicts & Range Mismatches
  if (prov?.hasConflict) {
    hasConflict = true;
    for (const c of prov.conflicts) {
      if (c.kind === 'range_mismatch') {
        signals.push({
          kind: 'conflict',
          severity: 'error',
          title: 'Version Range Mismatch',
          message: c.message,
          evidencePath: dep.lockfilePath || dep.manifestPath,
        });
      } else if (c.kind === 'workspace_version_conflict') {
        signals.push({
          kind: 'conflict',
          severity: 'error',
          title: 'Workspace Version Skew',
          message: c.message,
          evidencePath: dep.manifestPath,
        });
      } else if (c.kind === 'missing_lockfile_resolution') {
        signals.push({
          kind: 'unlocked',
          severity: 'warning',
          title: 'Missing in Lockfile',
          message: c.message,
          evidencePath: dep.lockfilePath || dep.manifestPath,
        });
        isUnlocked = true;
      } else if (c.kind === 'duplicate_version_in_workspace') {
        isDuplicate = true;
        signals.push({
          kind: 'duplicate',
          severity: 'warning',
          title: 'Multiple Workspace Versions',
          message: c.message,
          evidencePath: dep.manifestPath,
        });
      } else if (c.kind === 'stale_installed_disk') {
        signals.push({
          kind: 'stale_disk',
          severity: 'warning',
          title: 'Stale Local Environment',
          message: c.message,
          evidencePath: prov.installed.sourceFilePath || dep.manifestPath,
        });
      }
    }
  }

  // 2. Missing Lockfile Flag (for direct dependencies)
  if (!dep.lockfilePath && dep.isDirect && !isUnlocked) {
    isUnlocked = true;
    signals.push({
      kind: 'unlocked',
      severity: 'warning',
      title: 'Unverified Without Lockfile',
      message: `Package '${dep.name}' is declared in '${dep.manifestPath}' without a lockfile. Concrete pinned resolution cannot be verified.`,
      evidencePath: dep.manifestPath,
    });
  }

  // 3. Unreferenced Direct Dependency Flag
  if (isUnreferenced) {
    signals.push({
      kind: 'unreferenced',
      severity: 'warning',
      title: 'No Source Imports Found',
      message: `Declared as a direct dependency in '${dep.manifestPath}', but zero source-code imports or requires were detected across repository files.`,
      evidencePath: dep.manifestPath,
    });
  }

  // 4. Clean Evidence Verification
  if (signals.length === 0 && dep.versionResolved && dep.lockfilePath) {
    signals.push({
      kind: 'clean',
      severity: 'healthy',
      title: 'Resolution Verified',
      message: `Resolved version '${dep.versionResolved}' is locked in '${dep.lockfilePath}' and satisfies declared specification '${dep.versionDeclared || '*'}' with ${sourceUsages.length} source usage(s).`,
      evidencePath: dep.lockfilePath,
    });
  }

  // Determine overall health status
  let status: 'healthy' | 'warning' | 'error' | 'unknown' = 'healthy';
  if (signals.some((s) => s.severity === 'error')) {
    status = 'error';
  } else if (signals.some((s) => s.severity === 'warning')) {
    status = 'warning';
  } else if (signals.length === 0 || (!dep.versionDeclared && !dep.versionResolved)) {
    status = 'unknown';
  }

  return {
    status,
    signals,
    hasConflict,
    isUnreferenced,
    isUnlocked,
    isDuplicate,
  };
}
