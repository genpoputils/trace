/**
 * Swift Ecosystem Adapter: Swift Package Manager (Package.swift, Package.resolved)
 */

import {
  EcosystemAdapter,
  DiscoveredDependencyFile,
  AdapterParseContext,
  AdapterParseResult,
  NormalizedDependency,
  ManifestDiagnostic,
  DependencyEvidence,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename } from '../utils';

export class SwiftAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'swift' as const;
  public readonly packageManager = 'spm' as const;
  public readonly displayName = 'Swift (Swift Package Manager)';

  public get capability() {
    return getEcosystemCapability('swift', 'spm')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'Package.swift' || base === 'Package.resolved';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'Package.swift') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'swift',
        packageManager: 'spm',
        workspacePath,
      };
    }
    if (base === 'Package.resolved') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'swift',
        packageManager: 'spm',
        workspacePath,
      };
    }
    return null;
  }

  public parse(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    const lockPath = dir === '.' ? 'Package.resolved' : `${dir}/Package.resolved`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('Package.resolved') : undefined);

    if (lockFile) {
      try {
        const resolvedJson = JSON.parse(lockFile.content);
        const pins: unknown[] = Array.isArray(resolvedJson.pins)
          ? resolvedJson.pins
          : Array.isArray(resolvedJson.object?.pins)
          ? resolvedJson.object.pins
          : [];

        for (const pinItem of pins) {
          if (!pinItem || typeof pinItem !== 'object') continue;
          const pin = pinItem as Record<string, unknown>;
          const state = pin.state as Record<string, unknown> | undefined;
          const name = (pin.identity as string) || (pin.package as string);
          if (!name) continue;

          const version = state?.version as string | undefined;
          const revision = state?.revision as string | undefined;
          const location = (pin.location as string) || (pin.repositoryURL as string);

          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              resolvedVersion: version,
              integrity: revision,
              resolvedUrl: location,
            },
          ];

          dependencies.push({
            id: `swift:spm:${String(name).toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'swift',
            packageManager: 'spm',
            name: String(name),
            versionDeclared: version,
            versionResolved: version,
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile.path,
            workspacePath,
            evidence,
            notes: revision ? [`Git commit: ${revision}`] : undefined,
          });
        }
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse Package.resolved: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'info',
        code: 'missing_lockfile',
        message: 'No Package.resolved found. Package.swift requires Swift compiler evaluation; resolved dependencies unavailable without lockfile.',
      });
    }

    return {
      dependencies,
      workspaces: [],
      diagnostics,
      detectedLockfile: lockFile?.path,
      isComplete: true,
    };
  }
}
