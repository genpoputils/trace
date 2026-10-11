/**
 * JavaScript / TypeScript Ecosystem Adapters: npm, pnpm, Yarn, Bun
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
  PackageManagerType,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename, parseSimpleYaml } from '../utils';

export class JavaScriptAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'javascript' as const;
  public readonly packageManager: PackageManagerType;
  public readonly displayName: string;

  constructor(packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' = 'npm') {
    this.packageManager = packageManager;
    this.displayName = `JavaScript / TypeScript (${packageManager})`;
  }

  public get capability() {
    return getEcosystemCapability('javascript', this.packageManager)!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    if (this.packageManager === 'npm') {
      return (
        base === 'package.json' ||
        base === 'package-lock.json' ||
        base === 'npm-shrinkwrap.json'
      );
    }
    if (this.packageManager === 'pnpm') {
      return (
        base === 'pnpm-lock.yaml' ||
        base === 'pnpm-workspace.yaml' ||
        base === 'package.json'
      );
    }
    if (this.packageManager === 'yarn') {
      return base === 'yarn.lock' || base === 'package.json';
    }
    if (this.packageManager === 'bun') {
      return base === 'bun.lock' || base === 'bun.lockb' || base === 'package.json';
    }
    return false;
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'package.json') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'javascript',
        packageManager: this.packageManager,
        workspacePath,
      };
    }

    if (
      base === 'package-lock.json' ||
      base === 'npm-shrinkwrap.json' ||
      base === 'pnpm-lock.yaml' ||
      base === 'yarn.lock' ||
      base === 'bun.lock' ||
      base === 'bun.lockb'
    ) {
      let pm: PackageManagerType = 'npm';
      if (base === 'pnpm-lock.yaml') pm = 'pnpm';
      else if (base === 'yarn.lock') pm = 'yarn';
      else if (base.startsWith('bun.lock')) pm = 'bun';

      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'javascript',
        packageManager: pm,
        workspacePath,
      };
    }

    if (base === 'pnpm-workspace.yaml') {
      return {
        path: filePath,
        kind: 'workspace_config',
        ecosystem: 'javascript',
        packageManager: 'pnpm',
        workspacePath,
      };
    }

    return null;
  }

  public parse(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const diagnostics: ManifestDiagnostic[] = [];
    const dependencies: NormalizedDependency[] = [];
    const workspaces: WorkspaceDescriptor[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
      });
      return {
        dependencies: [],
        workspaces: [],
        diagnostics,
        isComplete: false,
      };
    }

    // 1. Detect workspaces in package.json
    if (pkgJson.workspaces) {
      const workspacesObj = pkgJson.workspaces as Record<string, unknown>;
      const workspacePatterns = Array.isArray(pkgJson.workspaces)
        ? (pkgJson.workspaces as string[])
        : Array.isArray(workspacesObj?.packages)
        ? (workspacesObj.packages as string[])
        : [];

      workspaces.push({
        id: `workspace:${manifestFile.path}`,
        name: (pkgJson.name as string) || 'root-workspace',
        rootPath: dir,
        manifestPath: manifestFile.path,
        ecosystem: 'javascript',
        packageManager: this.packageManager,
        packages: workspacePatterns,
        isRootWorkspace: dir === '.',
      });
    }

    // Also check pnpm-workspace.yaml if pnpm
    if (this.packageManager === 'pnpm') {
      const pnpmWsFile = context.getFile(dir === '.' ? 'pnpm-workspace.yaml' : `${dir}/pnpm-workspace.yaml`);
      if (pnpmWsFile) {
        try {
          const yaml = parseSimpleYaml(pnpmWsFile.content);
          if (Array.isArray(yaml.packages)) {
            workspaces.push({
              id: `workspace:${pnpmWsFile.path}`,
              name: (pkgJson.name as string) || 'pnpm-workspace',
              rootPath: dir,
              manifestPath: manifestFile.path,
              ecosystem: 'javascript',
              packageManager: 'pnpm',
              packages: yaml.packages as string[],
              isRootWorkspace: dir === '.',
            });
          }
        } catch {
          // ignore yaml parse failure
        }
      }
    }

    // 2. Locate lockfile
    let lockfileContent: string | undefined;
    let lockfilePath: string | undefined;
    let effectivePm = this.packageManager;

    const potentialLockfiles = [
      // local dir first, then repo root
      { path: dir === '.' ? 'package-lock.json' : `${dir}/package-lock.json`, pm: 'npm' as const },
      { path: 'package-lock.json', pm: 'npm' as const },
      { path: dir === '.' ? 'pnpm-lock.yaml' : `${dir}/pnpm-lock.yaml`, pm: 'pnpm' as const },
      { path: 'pnpm-lock.yaml', pm: 'pnpm' as const },
      { path: dir === '.' ? 'yarn.lock' : `${dir}/yarn.lock`, pm: 'yarn' as const },
      { path: 'yarn.lock', pm: 'yarn' as const },
      { path: dir === '.' ? 'bun.lock' : `${dir}/bun.lock`, pm: 'bun' as const },
      { path: 'bun.lock', pm: 'bun' as const },
      { path: dir === '.' ? 'bun.lockb' : `${dir}/bun.lockb`, pm: 'bun' as const },
      { path: 'bun.lockb', pm: 'bun' as const },
    ];

    for (const cand of potentialLockfiles) {
      const f = context.getFile(cand.path);
      if (f) {
        lockfileContent = f.content;
        lockfilePath = f.path;
        effectivePm = cand.pm;
        break;
      }
    }

    if (!lockfilePath) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock) found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    // 3. Extract declared direct dependencies
    const depScopes: Array<{ key: string; scope: DependencyScope }> = [
      { key: 'dependencies', scope: 'runtime' },
      { key: 'devDependencies', scope: 'dev' },
      { key: 'peerDependencies', scope: 'peer' },
      { key: 'optionalDependencies', scope: 'optional' },
    ];

    const declaredMap = new Map<
      string,
      { rawSpecifier: string; scope: DependencyScope }
    >();

    for (const { key, scope } of depScopes) {
      const section = pkgJson[key];
      if (section && typeof section === 'object') {
        for (const [depName, rawSpec] of Object.entries(section)) {
          if (typeof rawSpec === 'string') {
            declaredMap.set(depName, { rawSpecifier: rawSpec, scope });
          }
        }
      }
    }

    // 4. Parse lockfile if available
    const resolvedMap = new Map<
      string,
      {
        resolvedVersion: string;
        integrity?: string;
        resolvedUrl?: string;
        isDirect?: boolean;
      }
    >();

    if (lockfilePath && lockfileContent) {
      if (lockfilePath.endsWith('bun.lockb')) {
        diagnostics.push({
          filePath: lockfilePath,
          severity: 'warning',
          code: 'unsupported_format',
          message:
            'bun.lockb is a binary lockfile format. Pinned dependency resolution requires bun.lock text format or Bun CLI export.',
        });
      } else if (lockfilePath.endsWith('package-lock.json')) {
        this.parsePackageLock(lockfileContent, resolvedMap, diagnostics, lockfilePath);
      } else if (lockfilePath.endsWith('pnpm-lock.yaml')) {
        this.parsePnpmLock(lockfileContent, resolvedMap, diagnostics, lockfilePath);
      } else if (lockfilePath.endsWith('yarn.lock')) {
        this.parseYarnLock(lockfileContent, resolvedMap, diagnostics, lockfilePath);
      } else if (lockfilePath.endsWith('bun.lock')) {
        this.parseBunLock(lockfileContent, resolvedMap, diagnostics, lockfilePath);
      }
    }

    // 5. Assemble normalized direct dependencies
    for (const [depName, { rawSpecifier, scope }] of declaredMap.entries()) {
      const resolved = resolvedMap.get(depName);
      const evidence: DependencyEvidence[] = [
        {
          sourceFilePath: manifestFile.path,
          sourceKind: 'manifest',
          evidenceKind: 'declared_only',
          rawSpecifier,
        },
      ];

      if (resolved && lockfilePath) {
        evidence.push({
          sourceFilePath: lockfilePath,
          sourceKind: 'lockfile',
          evidenceKind: 'resolved_lockfile',
          rawSpecifier,
          resolvedVersion: resolved.resolvedVersion,
          integrity: resolved.integrity,
          resolvedUrl: resolved.resolvedUrl,
        });
      }

      const depId = `javascript:${effectivePm}:${depName}@${manifestFile.path}`;
      dependencies.push({
        id: depId,
        ecosystem: 'javascript',
        packageManager: effectivePm,
        name: depName,
        versionDeclared: rawSpecifier,
        versionResolved: resolved?.resolvedVersion,
        scope,
        isDirect: true,
        isTransitive: false,
        manifestPath: manifestFile.path,
        lockfilePath,
        workspacePath,
        evidence,
      });
    }

    // 6. Transitive dependencies (resolved in lockfile but not in manifest)
    if (lockfilePath && resolvedMap.size > 0) {
      for (const [depName, resolved] of resolvedMap.entries()) {
        if (!declaredMap.has(depName)) {
          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: lockfilePath,
              sourceKind: 'lockfile',
              evidenceKind: 'resolved_lockfile',
              resolvedVersion: resolved.resolvedVersion,
              integrity: resolved.integrity,
              resolvedUrl: resolved.resolvedUrl,
            },
          ];

          dependencies.push({
            id: `javascript:${effectivePm}:${depName}:transitive@${lockfilePath}`,
            ecosystem: 'javascript',
            packageManager: effectivePm,
            name: depName,
            versionDeclared: undefined,
            versionResolved: resolved.resolvedVersion,
            scope: 'runtime',
            isDirect: false,
            isTransitive: true,
            manifestPath: manifestFile.path,
            lockfilePath,
            workspacePath,
            evidence,
          });
        }
      }
    }

    return {
      dependencies,
      workspaces,
      diagnostics,
      detectedLockfile: lockfilePath,
      isComplete: !diagnostics.some((d) => d.severity === 'error'),
    };
  }

  private parsePackageLock(
    content: string,
    resolvedMap: Map<string, { resolvedVersion: string; integrity?: string; resolvedUrl?: string }>,
    diagnostics: ManifestDiagnostic[],
    lockfilePath: string
  ): void {
    try {
      const lockObj = JSON.parse(content);
      // v2 / v3 format: "packages"
      if (lockObj.packages && typeof lockObj.packages === 'object') {
        for (const [pkgPath, pkgInfo] of Object.entries(lockObj.packages)) {
          if (!pkgPath || pkgPath === '') continue; // root
          if (typeof pkgInfo !== 'object' || !pkgInfo) continue;

          // e.g. "node_modules/lodash" or "node_modules/@scope/pkg" or "apps/web/node_modules/foo"
          const lastNm = pkgPath.lastIndexOf('node_modules/');
          if (lastNm === -1) continue;
          const pkgName = pkgPath.substring(lastNm + 'node_modules/'.length);

          const pkgInfoRec = pkgInfo as Record<string, unknown>;
          const version = pkgInfoRec.version;
          if (version && typeof version === 'string') {
            resolvedMap.set(pkgName, {
              resolvedVersion: version,
              integrity: pkgInfoRec.integrity ? String(pkgInfoRec.integrity) : undefined,
              resolvedUrl: pkgInfoRec.resolved ? String(pkgInfoRec.resolved) : undefined,
            });
          }
        }
      } else if (lockObj.dependencies && typeof lockObj.dependencies === 'object') {
        // v1 format: "dependencies"
        const traverseV1 = (deps: Record<string, unknown>) => {
          for (const [name, info] of Object.entries(deps)) {
            if (info && typeof info === 'object') {
              const infoRec = info as Record<string, unknown>;
              if (typeof infoRec.version === 'string') {
                if (!resolvedMap.has(name)) {
                  resolvedMap.set(name, {
                    resolvedVersion: infoRec.version,
                    integrity: infoRec.integrity ? String(infoRec.integrity) : undefined,
                    resolvedUrl: infoRec.resolved ? String(infoRec.resolved) : undefined,
                  });
                }
                if (infoRec.dependencies && typeof infoRec.dependencies === 'object') {
                  traverseV1(infoRec.dependencies as Record<string, unknown>);
                }
              }
            }
          }
        };
        traverseV1(lockObj.dependencies as Record<string, unknown>);
      }
    } catch (err) {
      diagnostics.push({
        filePath: lockfilePath,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse package-lock.json: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private parsePnpmLock(
    content: string,
    resolvedMap: Map<string, { resolvedVersion: string; integrity?: string; resolvedUrl?: string }>,
    diagnostics: ManifestDiagnostic[],
    lockfilePath: string
  ): void {
    try {
      const lines = content.split('\n');
      let inPackages = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('packages:') || line.startsWith('snapshots:')) {
          inPackages = true;
          continue;
        }
        if (inPackages && line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          inPackages = false;
        }

        if (inPackages) {
          // pnpm-lock v5/v6 format: "  /lodash@4.17.21:" or "  /@scope/pkg@1.2.3:"
          // or v6/v9: "  'lodash@4.17.21':" or "  lodash@4.17.21:"
          const trimmed = line.trim();
          const pkgMatch = trimmed.match(/^['"]?(?:\/)?(@?[^@:/]+(?:@[^@:/]+)?|[a-zA-Z0-9_.-]+)@([0-9a-zA-Z_.-]+(?:\([^)]+\))?)['"]?:/);
          if (pkgMatch) {
            let pkgName = pkgMatch[1];
            let version = pkgMatch[2];
            // clean potential wrapping
            if (pkgName.startsWith('/')) pkgName = pkgName.substring(1);
            if (version.includes('(')) version = version.split('(')[0];

            if (!resolvedMap.has(pkgName)) {
              resolvedMap.set(pkgName, { resolvedVersion: version });
            }
          }
        }
      }
    } catch (err) {
      diagnostics.push({
        filePath: lockfilePath,
        severity: 'warning',
        code: 'malformed_file',
        message: `Failed to parse pnpm-lock.yaml: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private parseYarnLock(
    content: string,
    resolvedMap: Map<string, { resolvedVersion: string; integrity?: string; resolvedUrl?: string }>,
    diagnostics: ManifestDiagnostic[],
    lockfilePath: string
  ): void {
    try {
      const lines = content.split('\n');
      let currentPackages: string[] = [];
      let currentVersion: string | undefined;
      let currentIntegrity: string | undefined;
      let currentResolved: string | undefined;

      const commitBlock = () => {
        if (currentVersion && currentPackages.length > 0) {
          for (const pkg of currentPackages) {
            if (!resolvedMap.has(pkg)) {
              resolvedMap.set(pkg, {
                resolvedVersion: currentVersion,
                integrity: currentIntegrity,
                resolvedUrl: currentResolved,
              });
            }
          }
        }
        currentPackages = [];
        currentVersion = undefined;
        currentIntegrity = undefined;
        currentResolved = undefined;
      };

      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;

        // Block start: e.g. "lodash@^4.17.21, lodash@~4.17.15:" or '"@babel/core@^7.0.0":'
        if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
          commitBlock();
          const header = line.slice(0, line.lastIndexOf(':')).trim();
          const descriptors = header.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          for (const desc of descriptors) {
            const lastAt = desc.lastIndexOf('@');
            if (lastAt > 0) {
              const name = desc.substring(0, lastAt);
              currentPackages.push(name);
            }
          }
          continue;
        }

        // Inside block
        const trimmed = line.trim();
        if (trimmed.startsWith('version')) {
          const match = trimmed.match(/version\s*[:=]?\s*["']?([^"'\s]+)["']?/);
          if (match) currentVersion = match[1];
        } else if (trimmed.startsWith('integrity') || trimmed.startsWith('checksum')) {
          const match = trimmed.match(/(?:integrity|checksum)\s*[:=]?\s*["']?([^"'\s]+)["']?/);
          if (match) currentIntegrity = match[1];
        } else if (trimmed.startsWith('resolved')) {
          const match = trimmed.match(/resolved\s*[:=]?\s*["']?([^"'\s]+)["']?/);
          if (match) currentResolved = match[1];
        }
      }
      commitBlock();
    } catch (err) {
      diagnostics.push({
        filePath: lockfilePath,
        severity: 'warning',
        code: 'malformed_file',
        message: `Failed to parse yarn.lock: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private parseBunLock(
    content: string,
    resolvedMap: Map<string, { resolvedVersion: string; integrity?: string; resolvedUrl?: string }>,
    diagnostics: ManifestDiagnostic[],
    lockfilePath: string
  ): void {
    try {
      // bun.lock text format (JSON-based or key-value)
      const data = JSON.parse(content);
      if (data.packages && typeof data.packages === 'object') {
        for (const [name, info] of Object.entries(data.packages)) {
          if (typeof info === 'string') {
            resolvedMap.set(name, { resolvedVersion: info });
          } else if (info && typeof info === 'object') {
            const infoRec = info as Record<string, unknown>;
            const v = infoRec.version;
            if (v) resolvedMap.set(name, { resolvedVersion: String(v) });
          }
        }
      }
    } catch {
      // If not JSON, try simple key-value extraction
      try {
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([a-zA-Z0-9_@/-]+)\s*=\s*["']?([^"'\s]+)["']?/);
          if (match) {
            resolvedMap.set(match[1], { resolvedVersion: match[2] });
          }
        }
      } catch (err) {
        diagnostics.push({
          filePath: lockfilePath,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse bun.lock: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
}
