/**
 * .NET Ecosystem Adapter: NuGet (*.csproj, packages.config, packages.lock.json)
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
import { getDirname, getBasename, extractXmlTags } from '../utils';

export class DotnetAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'dotnet' as const;
  public readonly packageManager = 'nuget' as const;
  public readonly displayName = '.NET / C# (NuGet)';

  public get capability() {
    return getEcosystemCapability('dotnet', 'nuget')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath).toLowerCase();
    return (
      base.endsWith('.csproj') ||
      base.endsWith('.fsproj') ||
      base.endsWith('.vbproj') ||
      base === 'packages.config' ||
      base === 'packages.lock.json'
    );
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath).toLowerCase();
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (
      base.endsWith('.csproj') ||
      base.endsWith('.fsproj') ||
      base.endsWith('.vbproj') ||
      base === 'packages.config'
    ) {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'dotnet',
        packageManager: 'nuget',
        workspacePath,
      };
    }

    if (base === 'packages.lock.json') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'dotnet',
        packageManager: 'nuget',
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

    // Check packages.lock.json
    const lockPath = dir === '.' ? 'packages.lock.json' : `${dir}/packages.lock.json`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('packages.lock.json') : undefined);
    const resolvedMap = new Map<string, { resolvedVersion: string; hash?: string }>();

    if (lockFile) {
      try {
        const lockObj = JSON.parse(lockFile.content);
        if (lockObj.dependencies && typeof lockObj.dependencies === 'object') {
          for (const frameworkDeps of Object.values(lockObj.dependencies as Record<string, unknown>)) {
            if (frameworkDeps && typeof frameworkDeps === 'object') {
              for (const [pkgId, details] of Object.entries(frameworkDeps as Record<string, unknown>)) {
                if (details && typeof details === 'object') {
                  const detailsRec = details as Record<string, unknown>;
                  const resolved = detailsRec.resolved;
                  if (resolved) {
                    resolvedMap.set(pkgId.toLowerCase(), {
                      resolvedVersion: String(resolved),
                      hash: detailsRec.contentHash ? String(detailsRec.contentHash) : undefined,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse packages.lock.json: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'info',
        code: 'missing_lockfile',
        message: 'No packages.lock.json found. Pinned versions evaluated from project file or global package cache.',
      });
    }

    const base = getBasename(manifestFile.path).toLowerCase();

    if (base === 'packages.config') {
      // Legacy packages.config format: <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
      const pkgTags = extractXmlTags(manifestFile.content, 'package');
      for (const tag of pkgTags) {
        const id = tag.attributes.id;
        const version = tag.attributes.version;
        if (!id) continue;

        dependencies.push({
          id: `dotnet:nuget:${id.toLowerCase()}@${manifestFile.path}`,
          ecosystem: 'dotnet',
          packageManager: 'nuget',
          name: id,
          versionDeclared: version,
          versionResolved: version,
          scope: 'runtime',
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          workspacePath,
          evidence: [
            {
              sourceFilePath: manifestFile.path,
              sourceKind: 'manifest',
              evidenceKind: 'declared_only',
              rawSpecifier: version,
              resolvedVersion: version,
            },
          ],
        });
      }
    } else {
      // SDK-style csproj / fsproj / vbproj: <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
      const pkgRefTags = extractXmlTags(manifestFile.content, 'PackageReference');
      for (const tag of pkgRefTags) {
        const id = tag.attributes.Include || tag.attributes.include;
        const version = tag.attributes.Version || tag.attributes.version;
        if (!id) continue;

        const resolved = resolvedMap.get(id.toLowerCase());

        const evidence: DependencyEvidence[] = [
          {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: version,
          },
        ];

        if (resolved && lockFile) {
          evidence.push({
            sourceFilePath: lockFile.path,
            sourceKind: 'lockfile',
            evidenceKind: 'resolved_lockfile',
            rawSpecifier: version,
            resolvedVersion: resolved.resolvedVersion,
            integrity: resolved.hash,
          });
        }

        dependencies.push({
          id: `dotnet:nuget:${id.toLowerCase()}@${manifestFile.path}`,
          ecosystem: 'dotnet',
          packageManager: 'nuget',
          name: id,
          versionDeclared: version,
          versionResolved: resolved?.resolvedVersion || version,
          scope: 'runtime',
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          lockfilePath: lockFile?.path,
          workspacePath,
          evidence,
        });
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
