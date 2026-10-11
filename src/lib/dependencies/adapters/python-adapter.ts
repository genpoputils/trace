/**
 * Python Ecosystem Adapters: pip, Poetry, uv, Pipenv
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
import { getDirname, getBasename, parseSimpleToml } from '../utils';

export class PythonAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'python' as const;
  public readonly packageManager: PackageManagerType;
  public readonly displayName: string;

  constructor(packageManager: 'pip' | 'poetry' | 'uv' | 'pipenv' = 'pip') {
    this.packageManager = packageManager;
    this.displayName = `Python (${packageManager})`;
  }

  public get capability() {
    return getEcosystemCapability('python', this.packageManager)!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    if (this.packageManager === 'pip') {
      return (
        base === 'requirements.txt' ||
        base === 'requirements-dev.txt' ||
        base === 'requirements.in' ||
        base.startsWith('requirements') && base.endsWith('.txt')
      );
    }
    if (this.packageManager === 'poetry') {
      return base === 'pyproject.toml' || base === 'poetry.lock';
    }
    if (this.packageManager === 'uv') {
      return base === 'uv.lock' || base === 'pyproject.toml';
    }
    if (this.packageManager === 'pipenv') {
      return base === 'Pipfile' || base === 'Pipfile.lock';
    }
    return false;
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (
      base === 'requirements.txt' ||
      base === 'requirements-dev.txt' ||
      base === 'requirements.in' ||
      (base.startsWith('requirements') && base.endsWith('.txt'))
    ) {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'python',
        packageManager: 'pip',
        workspacePath,
      };
    }

    if (base === 'pyproject.toml') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'python',
        packageManager: this.packageManager === 'uv' ? 'uv' : 'poetry',
        workspacePath,
      };
    }

    if (base === 'Pipfile') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'python',
        packageManager: 'pipenv',
        workspacePath,
      };
    }

    if (base === 'poetry.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'python',
        packageManager: 'poetry',
        workspacePath,
      };
    }

    if (base === 'uv.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'python',
        packageManager: 'uv',
        workspacePath,
      };
    }

    if (base === 'Pipfile.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'python',
        packageManager: 'pipenv',
        workspacePath,
      };
    }

    return null;
  }

  public parse(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const base = getBasename(manifestFile.path);

    if (base.startsWith('requirements')) {
      return this.parseRequirements(manifestFile);
    }
    if (base === 'pyproject.toml') {
      return this.parsePyproject(manifestFile, context);
    }
    if (base === 'Pipfile') {
      return this.parsePipfile(manifestFile, context);
    }

    return {
      dependencies: [],
      workspaces: [],
      diagnostics: [
        {
          filePath: manifestFile.path,
          severity: 'warning',
          code: 'unsupported_format',
          message: `Unknown Python manifest format: ${manifestFile.path}`,
        },
      ],
      isComplete: false,
    };
  }

  private parseRequirements(
    manifestFile: { path: string; content: string }
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);
    const isDev = manifestFile.path.includes('dev') || manifestFile.path.includes('test');
    const scope: DependencyScope = isDev ? 'dev' : 'runtime';

    const lines = manifestFile.content.split('\n');
    let hasPinnedExact = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const commentIdx = rawLine.indexOf('#');
      const line = (commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine).trim();

      if (!line) continue;

      // Handle flag lines like -r other.txt, -i https://...
      if (line.startsWith('-r ') || line.startsWith('--requirement ')) {
        continue;
      }
      if (line.startsWith('-') || line.startsWith('--')) {
        continue;
      }

      // Format: package_name[extras]>=1.0.0,<=2.0.0; python_version >= '3.8'
      // or package_name==1.2.3
      const markerIdx = line.indexOf(';');
      const specPart = markerIdx !== -1 ? line.substring(0, markerIdx).trim() : line;
      const markerPart = markerIdx !== -1 ? line.substring(markerIdx + 1).trim() : undefined;

      const specMatch = specPart.match(/^([a-zA-Z0-9_.-]+(?:\[[^\]]+\])?)\s*([=><~^!].*)?$/);
      if (!specMatch) {
        continue;
      }

      let rawName = specMatch[1];
      // strip extras if present: requests[security] -> requests
      const extrasIdx = rawName.indexOf('[');
      if (extrasIdx !== -1) {
        rawName = rawName.substring(0, extrasIdx);
      }
      const rawSpecifier = specMatch[2]?.trim() || '*';

      let resolvedVersion: string | undefined;
      let evidenceKind: DependencyEvidence['evidenceKind'] = 'declared_only';

      // Check if pinned exactly: ==1.2.3 or ===1.2.3
      const exactMatch = rawSpecifier.match(/^={2,3}\s*([0-9a-zA-Z_.-]+)$/);
      if (exactMatch) {
        resolvedVersion = exactMatch[1];
        evidenceKind = 'resolved_lockfile';
        hasPinnedExact = true;
      }

      const evidence: DependencyEvidence[] = [
        {
          sourceFilePath: manifestFile.path,
          sourceKind: 'manifest',
          evidenceKind,
          rawSpecifier,
          resolvedVersion,
          line: lineNum,
          snippet: rawLine.trim(),
        },
      ];

      const depId = `python:pip:${rawName.toLowerCase()}@${manifestFile.path}`;
      const notes = markerPart ? [`Environment marker: ${markerPart}`] : undefined;

      dependencies.push({
        id: depId,
        ecosystem: 'python',
        packageManager: 'pip',
        name: rawName,
        versionDeclared: rawSpecifier,
        versionResolved: resolvedVersion,
        scope,
        isDirect: true,
        isTransitive: false,
        manifestPath: manifestFile.path,
        workspacePath: dir === '.' ? undefined : dir,
        evidence,
        notes,
      });
    }

    if (!hasPinnedExact) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'info',
        code: 'missing_lockfile',
        message: `Requirements file ${manifestFile.path} does not use strict pinned equality (==). Pinned resolved versions cannot be verified without pip-compile or pip freeze.`,
      });
    }

    return {
      dependencies,
      workspaces: [],
      diagnostics,
      isComplete: true,
    };
  }

  private parsePyproject(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const workspaces: WorkspaceDescriptor[] = [];
    const dir = getDirname(manifestFile.path);

    let toml: Record<string, unknown>;
    try {
      toml = parseSimpleToml(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse pyproject.toml: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { dependencies: [], workspaces: [], diagnostics, isComplete: false };
    }

    // Check lockfile: poetry.lock or uv.lock
    const poetryLockPath = dir === '.' ? 'poetry.lock' : `${dir}/poetry.lock`;
    const uvLockPath = dir === '.' ? 'uv.lock' : `${dir}/uv.lock`;

    let lockFile = context.getFile(poetryLockPath);
    let effectivePm: PackageManagerType = 'poetry';

    if (!lockFile) {
      lockFile = context.getFile(uvLockPath);
      if (lockFile) effectivePm = 'uv';
    }

    const resolvedMap = new Map<string, { resolvedVersion: string; hashes?: string[] }>();
    if (lockFile) {
      try {
        const lockToml = parseSimpleToml(lockFile.content);
        if (Array.isArray(lockToml.package)) {
          for (const pkg of lockToml.package) {
            if (pkg && typeof pkg === 'object') {
              const p = pkg as Record<string, unknown>;
              if (p.name && p.version) {
                resolvedMap.set(String(p.name).toLowerCase(), {
                  resolvedVersion: String(p.version),
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
          message: `Failed to parse ${lockFile.path}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No poetry.lock or uv.lock found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    // 1. Poetry dependencies: [tool.poetry.dependencies]
    const tool = toml.tool as Record<string, unknown> | undefined;
    const poetry = tool?.poetry as Record<string, unknown> | undefined;
    const poetryDeps = poetry?.dependencies as Record<string, unknown> | undefined;
    if (poetryDeps && typeof poetryDeps === 'object') {
      for (const [name, spec] of Object.entries(poetryDeps)) {
        if (name.toLowerCase() === 'python') continue; // Skip python runtime spec
        const specObj = typeof spec === 'object' && spec ? (spec as Record<string, unknown>) : null;
        const rawSpec = typeof spec === 'string' ? spec : specObj ? (specObj.version as string) || '*' : '*';
        const resolved = resolvedMap.get(name.toLowerCase());

        const evidence: DependencyEvidence[] = [
          {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: rawSpec,
          },
        ];

        if (resolved && lockFile) {
          evidence.push({
            sourceFilePath: lockFile.path,
            sourceKind: 'lockfile',
            evidenceKind: 'resolved_lockfile',
            rawSpecifier: rawSpec,
            resolvedVersion: resolved.resolvedVersion,
          });
        }

        dependencies.push({
          id: `python:${effectivePm}:${name.toLowerCase()}@${manifestFile.path}`,
          ecosystem: 'python',
          packageManager: effectivePm,
          name,
          versionDeclared: rawSpec,
          versionResolved: resolved?.resolvedVersion,
          scope: 'runtime',
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          lockfilePath: lockFile?.path,
          workspacePath: dir === '.' ? undefined : dir,
          evidence,
        });
      }
    }

    // Dev dependencies: [tool.poetry.group.dev.dependencies] or [tool.poetry.dev-dependencies]
    const group = poetry?.group as Record<string, unknown> | undefined;
    const devGroup = group?.dev as Record<string, unknown> | undefined;
    const devDeps = (devGroup?.dependencies || poetry?.['dev-dependencies']) as Record<string, unknown> | undefined;
    if (devDeps && typeof devDeps === 'object') {
      for (const [name, spec] of Object.entries(devDeps)) {
        const specObj = typeof spec === 'object' && spec ? (spec as Record<string, unknown>) : null;
        const rawSpec = typeof spec === 'string' ? spec : specObj ? (specObj.version as string) || '*' : '*';
        const resolved = resolvedMap.get(name.toLowerCase());

        const evidence: DependencyEvidence[] = [
          {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: rawSpec,
          },
        ];

        if (resolved && lockFile) {
          evidence.push({
            sourceFilePath: lockFile.path,
            sourceKind: 'lockfile',
            evidenceKind: 'resolved_lockfile',
            rawSpecifier: rawSpec,
            resolvedVersion: resolved.resolvedVersion,
          });
        }

        dependencies.push({
          id: `python:${effectivePm}:${name.toLowerCase()}:dev@${manifestFile.path}`,
          ecosystem: 'python',
          packageManager: effectivePm,
          name,
          versionDeclared: rawSpec,
          versionResolved: resolved?.resolvedVersion,
          scope: 'dev',
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          lockfilePath: lockFile?.path,
          workspacePath: dir === '.' ? undefined : dir,
          evidence,
        });
      }
    }

    // Standard PEP 621 dependencies: [project.dependencies]
    const project = toml.project as Record<string, unknown> | undefined;
    const projectDeps = project?.dependencies;
    if (Array.isArray(projectDeps)) {
      for (const reqStr of projectDeps) {
        if (typeof reqStr !== 'string') continue;
        const match = reqStr.match(/^([a-zA-Z0-9_.-]+)\s*([=><~^!].*)?$/);
        if (match) {
          const name = match[1];
          const rawSpec = match[2]?.trim() || '*';
          const resolved = resolvedMap.get(name.toLowerCase());

          dependencies.push({
            id: `python:${effectivePm}:${name.toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'python',
            packageManager: effectivePm,
            name,
            versionDeclared: rawSpec,
            versionResolved: resolved?.resolvedVersion,
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            workspacePath: dir === '.' ? undefined : dir,
            evidence: [
              {
                sourceFilePath: manifestFile.path,
                sourceKind: 'manifest',
                evidenceKind: 'declared_only',
                rawSpecifier: rawSpec,
              },
            ],
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

  private parsePipfile(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);

    let toml: Record<string, unknown>;
    try {
      toml = parseSimpleToml(manifestFile.content);
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse Pipfile: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { dependencies: [], workspaces: [], diagnostics, isComplete: false };
    }

    const pipfileLockPath = dir === '.' ? 'Pipfile.lock' : `${dir}/Pipfile.lock`;
    const lockFile = context.getFile(pipfileLockPath);
    const resolvedMap = new Map<string, { resolvedVersion: string }>();

    if (lockFile) {
      try {
        const lockJson = JSON.parse(lockFile.content);
        const addEntries = (section: unknown) => {
          if (section && typeof section === 'object') {
            for (const [name, info] of Object.entries(section as Record<string, unknown>)) {
              if (info && typeof info === 'object') {
                const infoRec = info as Record<string, unknown>;
                if (infoRec.version) {
                  const v = String(infoRec.version).replace(/^==/, '');
                  resolvedMap.set(name.toLowerCase(), { resolvedVersion: v });
                }
              }
            }
          }
        };
        addEntries(lockJson.default);
        addEntries(lockJson.develop);
      } catch (err) {
        diagnostics.push({
          filePath: lockFile.path,
          severity: 'warning',
          code: 'malformed_file',
          message: `Failed to parse Pipfile.lock: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const sections: Array<{ key: string; scope: DependencyScope }> = [
      { key: 'packages', scope: 'runtime' },
      { key: 'dev-packages', scope: 'dev' },
    ];

    for (const { key, scope } of sections) {
      const section = toml[key];
      if (section && typeof section === 'object') {
        for (const [name, spec] of Object.entries(section)) {
          const rawSpec = typeof spec === 'string' ? spec : '*';
          const resolved = resolvedMap.get(name.toLowerCase());

          dependencies.push({
            id: `python:pipenv:${name.toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'python',
            packageManager: 'pipenv',
            name,
            versionDeclared: rawSpec,
            versionResolved: resolved?.resolvedVersion,
            scope,
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            workspacePath: dir === '.' ? undefined : dir,
            evidence: [
              {
                sourceFilePath: manifestFile.path,
                sourceKind: 'manifest',
                evidenceKind: 'declared_only',
                rawSpecifier: rawSpec,
              },
            ],
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
