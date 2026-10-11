/**
 * Multi-Ecosystem Dependency Intelligence Foundation
 * Shared Data Models and Adapter Interfaces for GenPopUtils Trace
 */

export type EcosystemType =
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'jvm'
  | 'dotnet'
  | 'php'
  | 'ruby'
  | 'dart'
  | 'swift'
  | 'cpp'
  | 'elixir'
  | 'unknown';

export type PackageManagerType =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'pip'
  | 'poetry'
  | 'uv'
  | 'pipenv'
  | 'maven'
  | 'gradle'
  | 'sbt'
  | 'nuget'
  | 'gomod'
  | 'cargo'
  | 'composer'
  | 'bundler'
  | 'pub'
  | 'spm'
  | 'conan'
  | 'vcpkg'
  | 'cmake'
  | 'mix'
  | 'unknown';

export type DependencyScope =
  | 'runtime'
  | 'dev'
  | 'peer'
  | 'optional'
  | 'bundled'
  | 'build'
  | 'test'
  | 'unknown';

export type EvidenceKind =
  | 'declared_only'
  | 'resolved_lockfile'
  | 'installed_disk'
  | 'checksum_verified'
  | 'unresolved_missing';

export type DependencyFileKind =
  | 'manifest'
  | 'lockfile'
  | 'workspace_config'
  | 'checksum_file';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export type DiagnosticCode =
  | 'malformed_file'
  | 'unsupported_format'
  | 'missing_lockfile'
  | 'incomplete_scan'
  | 'conflicting_manifests'
  | 'unsupported_feature'
  | 'empty_manifest';

export interface DependencyEvidence {
  sourceFilePath: string;
  sourceKind: 'manifest' | 'lockfile' | 'installed' | 'workspace_config' | 'checksum_file';
  evidenceKind: EvidenceKind;
  rawSpecifier?: string;
  resolvedVersion?: string;
  integrity?: string;
  resolvedUrl?: string;
  line?: number;
  snippet?: string;
}

export interface NormalizedDependency {
  id: string; // unique stable identifier e.g. "javascript:npm:express@package.json"
  ecosystem: EcosystemType;
  packageManager: PackageManagerType;
  name: string;
  versionDeclared?: string;
  versionResolved?: string;
  scope: DependencyScope;
  isDirect: boolean;
  isTransitive: boolean;
  manifestPath: string;
  lockfilePath?: string;
  workspacePath?: string;
  evidence: DependencyEvidence[];
  notes?: string[];
  warnings?: string[];
}

export interface WorkspaceDescriptor {
  id: string;
  name?: string;
  rootPath: string; // e.g. "packages/ui" or "."
  manifestPath: string;
  ecosystem: EcosystemType;
  packageManager: PackageManagerType;
  packages: string[];
  isRootWorkspace: boolean;
}

export interface DiscoveredDependencyFile {
  path: string;
  kind: DependencyFileKind;
  ecosystem: EcosystemType;
  packageManager: PackageManagerType;
  workspacePath?: string;
  size?: number;
}

export interface ManifestDiagnostic {
  filePath: string;
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  details?: string;
  line?: number;
}

export interface EcosystemCapability {
  ecosystem: EcosystemType;
  packageManager: PackageManagerType;
  displayName: string;
  status: 'supported' | 'partial' | 'planned';
  manifestFiles: string[];
  lockfiles: string[];
  workspaceConfigFiles?: string[];
  capabilities: {
    manifestDetection: boolean;
    manifestParsing: boolean;
    lockfileDetection: boolean;
    lockfileParsing: boolean;
    transitiveResolution: boolean;
    workspaceDetection: boolean;
  };
  evidenceSupplied: string[];
  knownLimitations: string[];
}

export interface AdapterParseContext {
  getFile: (filePath: string) => { path: string; content: string } | undefined;
  discoveredFiles: DiscoveredDependencyFile[];
  workspaces: WorkspaceDescriptor[];
}

export interface AdapterParseResult {
  dependencies: NormalizedDependency[];
  workspaces: WorkspaceDescriptor[];
  diagnostics: ManifestDiagnostic[];
  detectedLockfile?: string;
  isComplete: boolean;
}

export interface EcosystemAdapter {
  readonly ecosystem: EcosystemType;
  readonly packageManager: PackageManagerType;
  readonly displayName: string;
  readonly capability: EcosystemCapability;

  matches(filePath: string): boolean;
  classifyFile(filePath: string): DiscoveredDependencyFile | null;
  parse(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): Promise<AdapterParseResult> | AdapterParseResult;
}

export interface DependencyScanResult {
  ecosystems: EcosystemType[];
  packageManagers: PackageManagerType[];
  discoveredFiles: DiscoveredDependencyFile[];
  workspaces: WorkspaceDescriptor[];
  dependencies: NormalizedDependency[];
  diagnostics: ManifestDiagnostic[];
  stats: {
    totalManifests: number;
    totalLockfiles: number;
    totalDependencies: number;
    directCount: number;
    transitiveCount: number;
    ecosystemCounts: Record<EcosystemType, number>;
  };
  capabilityMatrix: EcosystemCapability[];
}
