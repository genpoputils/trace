/**
 * Ecosystem Adapter Registry
 * Discovers manifest/lockfile formats, coordinates parsing, and normalizes multi-ecosystem dependency inventories.
 */

import {
  EcosystemAdapter,
  EcosystemType,
  PackageManagerType,
  DiscoveredDependencyFile,
  DependencyScanResult,
  NormalizedDependency,
  WorkspaceDescriptor,
  ManifestDiagnostic,
  AdapterParseContext,
  AdapterParseResult,
} from './types';
import { ECOSYSTEM_CAPABILITY_MATRIX } from './capability-matrix';
import {
  JavaScriptAdapter,
  PythonAdapter,
  RustAdapter,
  GoAdapter,
  PhpAdapter,
  RubyAdapter,
  DartAdapter,
  JvmAdapter,
  DotnetAdapter,
  SwiftAdapter,
  CppAdapter,
  ElixirAdapter,
} from './adapters';
import { getDirname } from './utils';
import { buildDependencyProvenance, reconcileWorkspaceProvenance } from './provenance';
import { mapPackagesToSourceUsage } from './source-usage';
import { buildPackageDependencyGraph } from './graph';
import { TraceEntity } from '../types/trace';

export class EcosystemRegistry {
  private adapters: EcosystemAdapter[] = [];
  private static instance: EcosystemRegistry | null = null;

  constructor() {
    this.registerDefaults();
  }

  public static getInstance(): EcosystemRegistry {
    if (!EcosystemRegistry.instance) {
      EcosystemRegistry.instance = new EcosystemRegistry();
    }
    return EcosystemRegistry.instance;
  }

  public static createDefault(): EcosystemRegistry {
    return new EcosystemRegistry();
  }

  private registerDefaults(): void {
    // JavaScript / TypeScript
    this.registerAdapter(new JavaScriptAdapter('npm'));
    this.registerAdapter(new JavaScriptAdapter('pnpm'));
    this.registerAdapter(new JavaScriptAdapter('yarn'));
    this.registerAdapter(new JavaScriptAdapter('bun'));

    // Python
    this.registerAdapter(new PythonAdapter('pip'));
    this.registerAdapter(new PythonAdapter('poetry'));
    this.registerAdapter(new PythonAdapter('uv'));
    this.registerAdapter(new PythonAdapter('pipenv'));

    // Rust
    this.registerAdapter(new RustAdapter());

    // Go
    this.registerAdapter(new GoAdapter());

    // PHP
    this.registerAdapter(new PhpAdapter());

    // Ruby
    this.registerAdapter(new RubyAdapter());

    // Dart
    this.registerAdapter(new DartAdapter());

    // JVM
    this.registerAdapter(new JvmAdapter('maven'));
    this.registerAdapter(new JvmAdapter('gradle'));
    this.registerAdapter(new JvmAdapter('sbt'));

    // .NET
    this.registerAdapter(new DotnetAdapter());

    // Swift
    this.registerAdapter(new SwiftAdapter());

    // C/C++
    this.registerAdapter(new CppAdapter('conan'));
    this.registerAdapter(new CppAdapter('vcpkg'));
    this.registerAdapter(new CppAdapter('cmake'));

    // Elixir
    this.registerAdapter(new ElixirAdapter());
  }

  public registerAdapter(adapter: EcosystemAdapter): void {
    // Replace if exact match already registered
    const idx = this.adapters.findIndex(
      (a) => a.ecosystem === adapter.ecosystem && a.packageManager === adapter.packageManager
    );
    if (idx !== -1) {
      this.adapters[idx] = adapter;
    } else {
      this.adapters.push(adapter);
    }
  }

  public getAllAdapters(): EcosystemAdapter[] {
    return [...this.adapters];
  }

  public getAdapter(
    ecosystem: EcosystemType,
    packageManager?: PackageManagerType
  ): EcosystemAdapter | undefined {
    if (packageManager && packageManager !== 'unknown') {
      return this.adapters.find(
        (a) => a.ecosystem === ecosystem && a.packageManager === packageManager
      );
    }
    return this.adapters.find((a) => a.ecosystem === ecosystem);
  }

  /**
   * Fast file classification: inspects a list of repository file paths and classifies
   * discovered dependency manifests, lockfiles, workspace configs, and checksum files.
   */
  public detectFiles(paths: string[]): DiscoveredDependencyFile[] {
    const discovered: DiscoveredDependencyFile[] = [];
    const seenPaths = new Set<string>();

    for (const rawPath of paths) {
      const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (seenPaths.has(normalizedPath)) continue;

      for (const adapter of this.adapters) {
        if (adapter.matches(normalizedPath)) {
          const classified = adapter.classifyFile(normalizedPath);
          if (classified) {
            seenPaths.add(normalizedPath);
            discovered.push(classified);
            break;
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Finds matching lockfiles for a given manifest file.
   */
  public findMatchingLockfiles(
    manifestPath: string,
    discoveredFiles: DiscoveredDependencyFile[]
  ): DiscoveredDependencyFile[] {
    const manifestDir = getDirname(manifestPath);
    return discoveredFiles.filter((df) => {
      if (df.kind !== 'lockfile' && df.kind !== 'checksum_file') return false;
      const fileDir = getDirname(df.path);
      // Matching same directory or root repository directory
      return fileDir === manifestDir || fileDir === '.';
    });
  }

  /**
   * Executes synchronous multi-ecosystem dependency intelligence scan on a repository files map.
   */
  public scanRepositorySync(
    files: Record<string, { path?: string; content: string }>,
    entities?: Record<string, TraceEntity>
  ): DependencyScanResult {
    const filePaths = Object.keys(files);
    const discoveredFiles = this.detectFiles(filePaths);

    const getFile = (p: string) => {
      const clean = p.replace(/\\/g, '/').replace(/^\/+/, '');
      const record = files[clean] || files[p];
      if (record) {
        return { path: clean, content: record.content };
      }
      return undefined;
    };

    const allDependencies: NormalizedDependency[] = [];
    const allWorkspaces: WorkspaceDescriptor[] = [];
    const allDiagnostics: ManifestDiagnostic[] = [];

    // Filter manifests to parse
    const manifestFiles = discoveredFiles.filter((df) => df.kind === 'manifest');

    const findFile = (predicate: (path: string) => boolean) => {
      const foundPath = filePaths.find((p) => predicate(p.replace(/\\/g, '/').replace(/^\/+/, '')));
      return foundPath ? getFile(foundPath) : undefined;
    };

    // Context for adapters
    const context: AdapterParseContext = {
      getFile,
      findFile,
      discoveredFiles,
      workspaces: allWorkspaces,
    };


    // If multiple manifests for different ecosystems are present, scan each
    for (const manifestInfo of manifestFiles) {
      const fileRecord = getFile(manifestInfo.path);
      if (!fileRecord) continue;

      const adapter = this.getAdapter(manifestInfo.ecosystem, manifestInfo.packageManager);
      if (!adapter) {
        allDiagnostics.push({
          filePath: manifestInfo.path,
          severity: 'warning',
          code: 'unsupported_format',
          message: `No adapter registered for ecosystem '${manifestInfo.ecosystem}' (${manifestInfo.packageManager}).`,
        });
        continue;
      }

      try {
        const result = adapter.parse(fileRecord, context);
        // Handle if adapter returns sync AdapterParseResult
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          // Promise returned unexpectedly from sync adapter
        } else {
          const syncResult = result as AdapterParseResult;
          for (const dep of syncResult.dependencies) {
            // Ensure provenance is attached even if a custom adapter omitted it
            if (!dep.provenance) {
              dep.provenance = buildDependencyProvenance({
                name: dep.name,
                ecosystem: dep.ecosystem,
                packageManager: dep.packageManager,
                manifestPath: dep.manifestPath,
                lockfilePath: dep.lockfilePath,
                declaredSpecifier: dep.versionDeclared,
                resolvedVersion: dep.versionResolved,
                isDirect: dep.isDirect,
                alias: dep.alias,
                getFile,
              });
            }
            if (dep.provenance.installed.version && !dep.versionInstalled) {
              dep.versionInstalled = dep.provenance.installed.version;
            }
            allDependencies.push(dep);
          }
          for (const ws of syncResult.workspaces) {
            allWorkspaces.push(ws);
          }
          for (const diag of syncResult.diagnostics) {
            allDiagnostics.push(diag);
          }
        }
      } catch (err) {
        allDiagnostics.push({
          filePath: manifestInfo.path,
          severity: 'error',
          code: 'malformed_file',
          message: `Unhandled exception during adapter parse: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Cross-manifest and workspace provenance reconciliation
    const { diagnostics: reconDiags } = reconcileWorkspaceProvenance(allDependencies);
    for (const d of reconDiags) {
      allDiagnostics.push(d);
    }

    // Compute statistics
    const ecosystemsSet = new Set<EcosystemType>();
    const packageManagersSet = new Set<PackageManagerType>();
    const ecosystemCounts: Record<EcosystemType, number> = {
      javascript: 0,
      python: 0,
      rust: 0,
      go: 0,
      jvm: 0,
      dotnet: 0,
      php: 0,
      ruby: 0,
      dart: 0,
      swift: 0,
      cpp: 0,
      elixir: 0,
      unknown: 0,
    };

    let directCount = 0;
    let transitiveCount = 0;
    let withResolvedVersionCount = 0;
    let declaredOnlyCount = 0;
    let withInstalledVersionCount = 0;
    let conflictsCount = 0;

    for (const dep of allDependencies) {
      ecosystemsSet.add(dep.ecosystem);
      packageManagersSet.add(dep.packageManager);
      ecosystemCounts[dep.ecosystem] = (ecosystemCounts[dep.ecosystem] || 0) + 1;
      if (dep.isDirect) directCount++;
      if (dep.isTransitive) transitiveCount++;

      if (dep.versionResolved) {
        withResolvedVersionCount++;
      } else if (dep.isDirect) {
        declaredOnlyCount++;
      }

      if (dep.versionInstalled) {
        withInstalledVersionCount++;
      }

      if (dep.provenance?.hasConflict) {
        conflictsCount++;
      }
    }

    for (const df of discoveredFiles) {
      ecosystemsSet.add(df.ecosystem);
      packageManagersSet.add(df.packageManager);
    }

    const lockfileCount = discoveredFiles.filter(
      (df) => df.kind === 'lockfile' || df.kind === 'checksum_file'
    ).length;

    // Phase 6: Map dependencies to source-code usage and construct typed package dependency graph
    const sourceUsageResult = mapPackagesToSourceUsage(allDependencies, files, entities);
    const graph = buildPackageDependencyGraph({
      dependencies: allDependencies,
      sourceUsages: sourceUsageResult.usagesByPackageId,
      workspaces: allWorkspaces,
    });

    return {
      ecosystems: Array.from(ecosystemsSet),
      packageManagers: Array.from(packageManagersSet),
      discoveredFiles,
      workspaces: allWorkspaces,
      dependencies: allDependencies,
      diagnostics: allDiagnostics,
      graph,
      sourceUsages: sourceUsageResult.usagesByPackageId,
      stats: {
        totalManifests: manifestFiles.length,
        totalLockfiles: lockfileCount,
        totalDependencies: allDependencies.length,
        directCount,
        transitiveCount,
        ecosystemCounts,
        withResolvedVersionCount,
        declaredOnlyCount,
        withInstalledVersionCount,
        conflictsCount,
        totalSourceUsagesCount: sourceUsageResult.totalUsagesCount,
      },
      capabilityMatrix: ECOSYSTEM_CAPABILITY_MATRIX,
    };
  }

  /**
   * Asynchronous wrapper for multi-ecosystem repository scanning.
   */
  public async scanRepository(
    files: Record<string, { path?: string; content: string }>,
    entities?: Record<string, TraceEntity>
  ): Promise<DependencyScanResult> {
    return this.scanRepositorySync(files, entities);
  }

  /**
   * Alias for scanRepository.
   */
  public async scanCodebase(
    files: Record<string, { path?: string; content: string }>,
    entities?: Record<string, TraceEntity>
  ): Promise<DependencyScanResult> {
    return this.scanRepository(files, entities);
  }
}

