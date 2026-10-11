/**
 * Dart / Flutter Ecosystem Adapter: pub (pubspec.yaml, pubspec.lock)
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
import { getDirname, getBasename, parseSimpleYaml } from '../utils';

export class DartAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'dart' as const;
  public readonly packageManager = 'pub' as const;
  public readonly displayName = 'Dart / Flutter (pub)';

  public get capability() {
    return getEcosystemCapability('dart', 'pub')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'pubspec.yaml' || base === 'pubspec.lock';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'pubspec.yaml') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'dart',
        packageManager: 'pub',
        workspacePath,
      };
    }
    if (base === 'pubspec.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'dart',
        packageManager: 'pub',
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

    let yaml: Record<string, unknown>;
    try {
      yaml = parseSimpleYaml(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse pubspec.yaml: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { dependencies: [], workspaces: [], diagnostics, isComplete: false };
    }

    const lockPath = dir === '.' ? 'pubspec.lock' : `${dir}/pubspec.lock`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('pubspec.lock') : undefined);
    const resolvedMap = new Map<string, { resolvedVersion: string; source?: string }>();

    if (lockFile) {
      try {
        const lockYaml = parseSimpleYaml(lockFile.content);
        if (lockYaml.packages && typeof lockYaml.packages === 'object') {
          for (const [name, info] of Object.entries(lockYaml.packages)) {
            if (info && typeof info === 'object') {
              const infoRec = info as Record<string, unknown>;
              const v = infoRec.version;
              if (v) {
                resolvedMap.set(name.toLowerCase(), {
                  resolvedVersion: String(v),
                  source: infoRec.source ? String(infoRec.source) : undefined,
                });
              }
            }
          }
        }
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse pubspec.lock: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No pubspec.lock found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    const sections: Array<{ key: string; scope: DependencyScope }> = [
      { key: 'dependencies', scope: 'runtime' },
      { key: 'dev_dependencies', scope: 'dev' },
    ];

    for (const { key, scope } of sections) {
      const depMap = yaml[key];
      if (depMap && typeof depMap === 'object') {
        for (const [name, spec] of Object.entries(depMap)) {
          if (name === 'flutter') continue; // Flutter SDK framework reference

          const specRec = typeof spec === 'object' && spec ? (spec as Record<string, unknown>) : null;
          const rawSpec =
            typeof spec === 'string'
              ? spec
              : specRec
              ? (specRec.version as string) || (specRec.sdk as string) || '*'
              : '*';

          const resolved = resolvedMap.get(name.toLowerCase());

          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: manifestFile.path,
              sourceKind: 'manifest',
              evidenceKind: 'declared_only',
              rawSpecifier: String(rawSpec),
            },
          ];

          if (resolved && lockFile) {
            evidence.push({
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              rawSpecifier: String(rawSpec),
              resolvedVersion: resolved.resolvedVersion,
              resolvedUrl: resolved.source,
            });
          }

          dependencies.push({
            id: `dart:pub:${name.toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'dart',
            packageManager: 'pub',
            name,
            versionDeclared: String(rawSpec),
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
