/**
 * PHP Ecosystem Adapter: Composer (composer.json, composer.lock)
 */

import {
  EcosystemAdapter,
  DiscoveredDependencyFile,
  AdapterParseContext,
  AdapterParseResult,
  NormalizedDependency,
  ManifestDiagnostic,
  DependencyEvidence,
  DependencyScope,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename } from '../utils';

export class PhpAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'php' as const;
  public readonly packageManager = 'composer' as const;
  public readonly displayName = 'PHP (Composer)';

  public get capability() {
    return getEcosystemCapability('php', 'composer')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'composer.json' || base === 'composer.lock';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'composer.json') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'php',
        packageManager: 'composer',
        workspacePath,
      };
    }
    if (base === 'composer.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'php',
        packageManager: 'composer',
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

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse composer.json: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { dependencies: [], workspaces: [], diagnostics, isComplete: false };
    }

    const lockPath = dir === '.' ? 'composer.lock' : `${dir}/composer.lock`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('composer.lock') : undefined);
    const resolvedMap = new Map<string, { resolvedVersion: string; distRef?: string }>();

    if (lockFile) {
      try {
        const lockJson = JSON.parse(lockFile.content);
        const addPackages = (list: unknown[]) => {
          if (Array.isArray(list)) {
            for (const pkg of list) {
              if (pkg && typeof pkg === 'object') {
                const p = pkg as Record<string, unknown>;
                if (p.name && p.version) {
                  const dist = p.dist as Record<string, unknown> | undefined;
                  const source = p.source as Record<string, unknown> | undefined;
                  resolvedMap.set(String(p.name).toLowerCase(), {
                    resolvedVersion: String(p.version),
                    distRef: (dist?.reference as string) || (source?.reference as string),
                  });
                }
              }
            }
          }
        };
        addPackages(lockJson.packages);
        addPackages(lockJson['packages-dev']);
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse composer.lock: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No composer.lock found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    const sections: Array<{ key: string; scope: DependencyScope }> = [
      { key: 'require', scope: 'runtime' },
      { key: 'require-dev', scope: 'dev' },
    ];

    for (const { key, scope } of sections) {
      const section = json[key];
      if (section && typeof section === 'object') {
        for (const [name, rawSpec] of Object.entries(section)) {
          if (name.toLowerCase() === 'php' || name.toLowerCase().startsWith('ext-')) {
            // platform / extension dependency
            continue;
          }
          const specStr = String(rawSpec);
          const resolved = resolvedMap.get(name.toLowerCase());

          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: manifestFile.path,
              sourceKind: 'manifest',
              evidenceKind: 'declared_only',
              rawSpecifier: specStr,
            },
          ];

          if (resolved && lockFile) {
            evidence.push({
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              rawSpecifier: specStr,
              resolvedVersion: resolved.resolvedVersion,
              integrity: resolved.distRef,
            });
          }

          dependencies.push({
            id: `php:composer:${name.toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'php',
            packageManager: 'composer',
            name,
            versionDeclared: specStr,
            versionResolved: resolved?.resolvedVersion,
            scope,
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            workspacePath,
            evidence,
          });
        }
      }
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
