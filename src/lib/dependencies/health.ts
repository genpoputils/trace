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
  SourceScanCoverage,
} from './types';
import { canMakeNegativeUsageClaim } from './source-usage';
import { buildDependencyProvenance } from './provenance';

/**
 * Evaluates health signals and diagnostics for a normalized package dependency.
 * Fully coverage-aware and resilient to inconsistent provenance flags.
 */
export function evaluateDependencyHealth(
  dep: NormalizedDependency,
  sourceUsages: PackageSourceUsage[] = [],
  coverage?: SourceScanCoverage
): DependencyHealthIndicator {
  const signals: DependencyHealthSignal[] = [];

  const prov =
    dep.provenance ||
    (dep.versionDeclared || dep.versionResolved
      ? buildDependencyProvenance({
          name: dep.name,
          ecosystem: dep.ecosystem,
          packageManager: dep.packageManager,
          manifestPath: dep.manifestPath,
          lockfilePath: dep.lockfilePath,
          declaredSpecifier: dep.versionDeclared,
          resolvedVersion: dep.versionResolved,
          isDirect: dep.isDirect,
        })
      : undefined);
  const conflicts = prov?.conflicts || [];
  let hasConflict = prov?.hasConflict || prov?.status === 'conflicting' || false;
  let isUnlocked = false;
  let isDuplicate = false;

  // 1. Check Version Conflicts, Duplicates, and Skew from provenance conflicts array directly
  if (conflicts.length > 0) {
    for (const c of conflicts) {
      if (c.kind === 'range_mismatch') {
        hasConflict = true;
        signals.push({
          kind: 'conflict',
          severity: 'error',
          title: 'Version Range Mismatch',
          message: c.message,
          evidencePath: dep.lockfilePath || dep.manifestPath,
        });
      } else if (c.kind === 'workspace_version_conflict') {
        hasConflict = true;
        signals.push({
          kind: 'conflict',
          severity: 'error',
          title: 'Workspace Version Skew',
          message: c.message,
          evidencePath: dep.manifestPath,
        });
      } else if (c.kind === 'missing_lockfile_resolution') {
        isUnlocked = true;
        signals.push({
          kind: 'unlocked',
          severity: 'warning',
          title: 'Missing in Lockfile',
          message: c.message,
          evidencePath: dep.lockfilePath || dep.manifestPath,
        });
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
        hasConflict = true;
        signals.push({
          kind: 'stale_disk',
          severity: 'warning',
          title: 'Stale Local Environment',
          message: c.message,
          evidencePath: prov?.installed.sourceFilePath || dep.manifestPath,
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

  // 3. Source-Usage Analysis with explicit Coverage Guard
  const canCheckUsage = canMakeNegativeUsageClaim(dep.ecosystem, coverage);
  let isUnreferenced = false;
  let coverageStatus: DependencyHealthIndicator['coverageStatus'] = 'covered';

  if (!canCheckUsage) {
    const isSupported =
      (dep.ecosystem === 'javascript' ||
        dep.ecosystem === 'python' ||
        dep.ecosystem === 'rust' ||
        dep.ecosystem === 'go') &&
      coverage?.languages[dep.ecosystem]?.isSupported !== false;

    coverageStatus = !isSupported ? 'unsupported' : 'unscanned';

    if (dep.isDirect && sourceUsages.length === 0) {
      signals.push({
        kind: 'analysis_unavailable',
        severity: 'info',
        title: 'Source Usage Analysis Unavailable',
        message: coverageStatus === 'unsupported'
          ? `Source parser for ecosystem '${dep.ecosystem}' is not implemented; static usage cannot be verified.`
          : `No source files for ecosystem '${dep.ecosystem}' were detected in repository input; usage is unverified.`,
        evidencePath: dep.manifestPath,
      });
    }
  } else if (dep.isDirect && sourceUsages.length === 0) {
    isUnreferenced = true;
    signals.push({
      kind: 'unreferenced',
      severity: 'warning',
      title: 'No Source Imports Found',
      message: `Declared as a direct dependency in '${dep.manifestPath}', but zero source-code imports or requires were detected across repository files.`,
      evidencePath: dep.manifestPath,
    });
  }

  // 4. Clean Evidence Verification:
  // Requires locked resolution, range satisfaction, absence of conflicts/duplicates, and established status
  const isClean =
    !hasConflict &&
    !isUnlocked &&
    !isDuplicate &&
    dep.lockfilePath !== undefined &&
    dep.versionResolved !== undefined &&
    prov?.status === 'established' &&
    (prov.satisfiesRange === true || (!dep.versionDeclared && !dep.isDirect)) &&
    !signals.some((s) => s.severity === 'error' || s.severity === 'warning');

  if (isClean) {
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
  } else if (isClean) {
    status = 'healthy';
  } else {
    status = 'unknown';
  }

  return {
    status,
    signals,
    isClean,
    hasConflict,
    isUnreferenced,
    isUnlocked,
    isDuplicate,
    coverageStatus,
  };
}
