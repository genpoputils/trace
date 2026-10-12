/**
 * Rust Ecosystem Adapter: Cargo
 */

import {
  EcosystemAdapter,
  DiscoveredDependencyFile,
  AdapterParseContext,
  AdapterParseResult,
  NormalizedDependency,
  WorkspaceDescriptor,
  ManifestDiagnostic,
  DependencyEvidence,
  DependencyScope,
  SCOPE_PRECEDENCE,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename, parseSimpleToml } from '../utils';
import { buildDependencyProvenance } from '../provenance';

export class RustAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'rust' as const;
  public readonly packageManager = 'cargo' as const;
  public readonly displayName = 'Rust (Cargo)';

  public get capability() {
    return getEcosystemCapability('rust', 'cargo')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'Cargo.toml' || base === 'Cargo.lock';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'Cargo.toml') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'rust',
        packageManager: 'cargo',
        workspacePath,
      };
    }

    if (base === 'Cargo.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'rust',
        packageManager: 'cargo',
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
    const workspaces: WorkspaceDescriptor[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    let toml: Record<string, unknown>;
    try {
      toml = parseSimpleToml(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse Cargo.toml: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { dependencies: [], workspaces: [], diagnostics, isComplete: false };
    }

    // 1. Cargo Workspaces: [workspace] members = ["crates/*"]
    const ws = toml.workspace as Record<string, unknown> | undefined;
    const pkg = toml.package as Record<string, unknown> | undefined;
    if (ws && ws.members) {
      const members = Array.isArray(ws.members) ? (ws.members as string[]) : [];
      workspaces.push({
        id: `workspace:${manifestFile.path}`,
        name: (pkg?.name as string) || 'cargo-workspace',
        rootPath: dir,
        manifestPath: manifestFile.path,
        ecosystem: 'rust',
        packageManager: 'cargo',
        packages: members,
        isRootWorkspace: dir === '.',
      });
    }

    // 2. Locate Cargo.lock
    const lockPath = dir === '.' ? 'Cargo.lock' : `${dir}/Cargo.lock`;
    let lockFile = context.getFile(lockPath);
    if (!lockFile && dir !== '.') {
      // Check repository root
      lockFile = context.getFile('Cargo.lock');
    }

    const resolvedMap = new Map<
      string,
      {
        resolvedVersion: string;
        source?: string;
        checksum?: string;
        dependencies?: string[];
        parentPackages?: string[];
      }
    >();

    if (lockFile) {
      try {
        const lockToml = parseSimpleToml(lockFile.content);
        const packageParents = new Map<string, string[]>();

        if (Array.isArray(lockToml.package)) {
          for (const pkg of lockToml.package) {
            if (pkg && pkg.name && pkg.version) {
              const pkgName = String(pkg.name);
              const childDeps: string[] = [];
              if (Array.isArray(pkg.dependencies)) {
                for (const depItem of pkg.dependencies) {
                  const childName = String(depItem).split(' ')[0].trim();
                  if (childName) {
                    childDeps.push(childName);
                    const parents = packageParents.get(childName) || [];
                    if (!parents.includes(pkgName)) parents.push(pkgName);
                    packageParents.set(childName, parents);
                  }
                }
              }

              resolvedMap.set(pkgName, {
                resolvedVersion: String(pkg.version),
                source: pkg.source ? String(pkg.source) : undefined,
                checksum: pkg.checksum ? String(pkg.checksum) : undefined,
                dependencies: childDeps,
                parentPackages: packageParents.get(pkgName) || [],
              });
            }
          }

          // Backfill parent packages
          for (const [pkgName, parents] of packageParents.entries()) {
            const item = resolvedMap.get(pkgName);
            if (item) {
              item.parentPackages = parents;
            }
          }
        }
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse Cargo.lock: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No Cargo.lock found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    // 3. Extract direct declared dependencies
    const sections: Array<{ key: string; scope: DependencyScope }> = [
      { key: 'dependencies', scope: 'runtime' },
      { key: 'dev-dependencies', scope: 'dev' },
      { key: 'build-dependencies', scope: 'build' },
    ];

    const scopePrecedence = SCOPE_PRECEDENCE;

    const declaredNames = new Set<string>();
    const directDepMap = new Map<string, NormalizedDependency>();

    for (const { key, scope } of sections) {
      const depTable = toml[key];
      if (depTable && typeof depTable === 'object') {
        for (const [name, spec] of Object.entries(depTable as Record<string, unknown>)) {
          declaredNames.add(name);
          const specRec = typeof spec === 'object' && spec ? (spec as Record<string, unknown>) : null;
          const rawSpec =
            typeof spec === 'string'
              ? spec
              : specRec
              ? (specRec.version as string) || (specRec.path as string) || (specRec.git as string) || '*'
              : '*';

          // Support Cargo package rename / alias: my_serde = { package = "serde", version = "1.0" }
          let actualPackageName = name;
          let declaredAlias: string | undefined = undefined;

          if (specRec && typeof specRec.package === 'string') {
            actualPackageName = specRec.package;
            declaredAlias = name;
          }
          declaredNames.add(actualPackageName);

          const depKey = declaredAlias ? `${declaredAlias}:${actualPackageName}` : actualPackageName;
          const depId = `rust:cargo:${depKey}@${manifestFile.path}`;

          const resolved = resolvedMap.get(actualPackageName) || resolvedMap.get(name);

          const manifestEvidence: DependencyEvidence = {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: String(rawSpec),
          };

          const existing = directDepMap.get(depId);
          if (existing) {
            existing.evidence.push(manifestEvidence);
            if (scopePrecedence[scope] > scopePrecedence[existing.scope]) {
              existing.scope = scope;
              existing.versionDeclared = String(rawSpec);
            }
            if (!existing.notes) existing.notes = [];
            existing.notes.push(`Also declared in [${key}] with specifier '${rawSpec}'`);
            continue;
          }

          const evidence: DependencyEvidence[] = [manifestEvidence];

          if (resolved && lockFile) {
            evidence.push({
              sourceFilePath: lockFile.path,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              rawSpecifier: String(rawSpec),
              resolvedVersion: resolved.resolvedVersion,
              integrity: resolved.checksum,
              resolvedUrl: resolved.source,
            });
          }

          const provenance = buildDependencyProvenance({
            name: actualPackageName,
            ecosystem: 'rust',
            packageManager: 'cargo',
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            declaredSpecifier: String(rawSpec),
            resolvedVersion: resolved?.resolvedVersion,
            integrity: resolved?.checksum,
            resolvedUrl: resolved?.source,
            isDirect: true,
            alias: declaredAlias,
            getFile: context.getFile,
            findFile: context.findFile,
          });

          if (provenance.hasConflict) {
            for (const c of provenance.conflicts) {
              diagnostics.push({
                filePath: manifestFile.path,
                severity: c.severity,
                code: 'version_conflict',
                message: `[${actualPackageName}] ${c.message}`,
              });
            }
          }

          const dep: NormalizedDependency = {
            id: depId,
            ecosystem: 'rust',
            packageManager: 'cargo',
            name: actualPackageName,
            versionDeclared: String(rawSpec),
            versionResolved: resolved?.resolvedVersion,
            versionInstalled: provenance.installed.version,
            alias: declaredAlias,
            scope,
            isDirect: true,
            isTransitive: false,
            parentPackages: resolved?.parentPackages,
            dependencies: resolved?.dependencies,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            workspacePath,
            evidence,
            provenance,
          };

          directDepMap.set(depId, dep);
          dependencies.push(dep);
        }
      }
    }

    // 4. Transitive packages from lockfile
    if (lockFile && resolvedMap.size > 0) {
      const pkgObj = toml.package as Record<string, unknown> | undefined;
      const currentPkgName = pkgObj?.name as string | undefined;
      const seenTransitives = new Set<string>();
      for (const [name, resolved] of resolvedMap.entries()) {
        if (!declaredNames.has(name) && name !== currentPkgName && !seenTransitives.has(name)) {
          seenTransitives.add(name);
          const provenance = buildDependencyProvenance({
            name,
            ecosystem: 'rust',
            packageManager: 'cargo',
            manifestPath: manifestFile.path,
            lockfilePath: lockFile.path,
            declaredSpecifier: undefined,
            resolvedVersion: resolved.resolvedVersion,
            integrity: resolved.checksum,
            resolvedUrl: resolved.source,
            isDirect: false,
            getFile: context.getFile,
          });

          dependencies.push({
            id: `rust:cargo:${name}:transitive@${lockFile.path}`,
            ecosystem: 'rust',
            packageManager: 'cargo',
            name,
            versionDeclared: undefined,
            versionResolved: resolved.resolvedVersion,
            versionInstalled: provenance.installed.version,
            scope: 'runtime',
            isDirect: false,
            isTransitive: true,
            parentPackages: resolved.parentPackages,
            dependencies: resolved.dependencies,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile.path,
            workspacePath,
            evidence: [
              {
                sourceFilePath: lockFile.path,
                sourceKind: 'lockfile',
                evidenceKind: 'resolved_lockfile',
                resolvedVersion: resolved.resolvedVersion,
                integrity: resolved.checksum,
                resolvedUrl: resolved.source,
              },
            ],
            provenance,
          });
        }
      }
    }

    return {
      dependencies,
      workspaces,
      diagnostics,
      detectedLockfile: lockFile?.path,
      isComplete: true,
    };
  }
}
