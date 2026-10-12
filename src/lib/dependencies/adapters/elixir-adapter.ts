/**
 * Elixir Ecosystem Adapter: Mix (mix.exs, mix.lock)
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

export class ElixirAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'elixir' as const;
  public readonly packageManager = 'mix' as const;
  public readonly displayName = 'Elixir (Mix)';

  public get capability() {
    return getEcosystemCapability('elixir', 'mix')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'mix.exs' || base === 'mix.lock';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'mix.exs') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'elixir',
        packageManager: 'mix',
        workspacePath,
      };
    }
    if (base === 'mix.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'elixir',
        packageManager: 'mix',
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
    const directDepMap = new Map<string, NormalizedDependency>();
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    const lockFile = context.getFile(dir === '.' ? 'mix.lock' : `${dir}/mix.lock`);

    if (lockFile) {
      // Parse mix.lock elixir terms: %{"phoenix": {:hex, :phoenix, "1.7.2", ...}}
      const lines = lockFile.content.split('\n');
      for (const line of lines) {
        // Match: "pkg_name": {:hex, :pkg_name, "1.7.2"
        const hexMatch = line.match(/"([^"]+)":\s*\{:hex,\s*:[^,]+,\s*"([^"]+)"/);
        if (hexMatch) {
          const name = hexMatch[1];
          const version = hexMatch[2];

          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              resolvedVersion: version,
            },
          ];

          const depId = `elixir:mix:${name.toLowerCase()}@${manifestFile.path}`;
          const existing = directDepMap.get(depId);
          if (existing) {
            existing.evidence.push(...evidence);
            continue;
          }

          const dep: NormalizedDependency = {
            id: depId,
            ecosystem: 'elixir',
            packageManager: 'mix',
            name,
            versionDeclared: version,
            versionResolved: version,
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile.path,
            workspacePath,
            evidence,
          };

          directDepMap.set(depId, dep);
          dependencies.push(dep);
          continue;
        }

        // Match: "pkg_name": {:git, "url", "commit"
        const gitMatch = line.match(/"([^"]+)":\s*\{:git,\s*"([^"]+)",\s*"([^"]+)"/);
        if (gitMatch) {
          const name = gitMatch[1];
          const url = gitMatch[2];
          const commit = gitMatch[3];

          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              resolvedVersion: commit,
              resolvedUrl: url,
            },
          ];

          const depId = `elixir:mix:${name.toLowerCase()}@${manifestFile.path}`;
          const existing = directDepMap.get(depId);
          if (existing) {
            existing.evidence.push(...evidence);
            continue;
          }

          const dep: NormalizedDependency = {
            id: depId,
            ecosystem: 'elixir',
            packageManager: 'mix',
            name,
            versionDeclared: commit.substring(0, 7),
            versionResolved: commit,
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile.path,
            workspacePath,
            evidence,
          };

          directDepMap.set(depId, dep);
          dependencies.push(dep);
        }
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'info',
        code: 'missing_lockfile',
        message: 'No mix.lock found. mix.exs requires Elixir VM execution; resolved versions unavailable without lockfile.',
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
