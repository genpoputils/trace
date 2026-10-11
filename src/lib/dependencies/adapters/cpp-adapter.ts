/**
 * C / C++ Ecosystem Adapters: Conan, vcpkg, CMake
 */

import {
  EcosystemAdapter,
  DiscoveredDependencyFile,
  AdapterParseContext,
  AdapterParseResult,
  NormalizedDependency,
  ManifestDiagnostic,
  PackageManagerType,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename } from '../utils';

export class CppAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'cpp' as const;
  public readonly packageManager: PackageManagerType;
  public readonly displayName: string;

  constructor(packageManager: 'conan' | 'vcpkg' | 'cmake' = 'conan') {
    this.packageManager = packageManager;
    this.displayName = `C / C++ (${packageManager})`;
  }

  public get capability() {
    return getEcosystemCapability('cpp', this.packageManager)!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    if (this.packageManager === 'conan') {
      return base === 'conanfile.txt' || base === 'conanfile.py' || base === 'conan.lock';
    }
    if (this.packageManager === 'vcpkg') {
      return base === 'vcpkg.json';
    }
    if (this.packageManager === 'cmake') {
      return base === 'CMakeLists.txt';
    }
    return false;
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'conanfile.txt' || base === 'conanfile.py') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'cpp',
        packageManager: 'conan',
        workspacePath,
      };
    }
    if (base === 'conan.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'cpp',
        packageManager: 'conan',
        workspacePath,
      };
    }
    if (base === 'vcpkg.json') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'cpp',
        packageManager: 'vcpkg',
        workspacePath,
      };
    }
    if (base === 'CMakeLists.txt') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'cpp',
        packageManager: 'cmake',
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

    if (base.startsWith('conanfile')) {
      return this.parseConan(manifestFile, context);
    }
    if (base === 'vcpkg.json') {
      return this.parseVcpkg(manifestFile);
    }
    if (base === 'CMakeLists.txt') {
      return this.parseCMake(manifestFile);
    }

    return { dependencies: [], workspaces: [], diagnostics: [], isComplete: false };
  }

  private parseConan(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);

    const lockFile = context.getFile(dir === '.' ? 'conan.lock' : `${dir}/conan.lock`);
    const resolvedMap = new Map<string, string>();

    if (lockFile) {
      try {
        const lockObj = JSON.parse(lockFile.content);
        const graphLock = lockObj.graph_lock?.nodes || lockObj.nodes || {};
        for (const node of Object.values(graphLock)) {
          const ref = (node as Record<string, unknown>)?.ref;
          if (ref && typeof ref === 'string') {
            const parts = ref.split('/');
            const name = parts[0];
            const ver = parts[1]?.split('@')[0];
            if (name && ver) {
              resolvedMap.set(name.toLowerCase(), ver);
            }
          }
        }
      } catch {
        // ignore conan lock parse error
      }
    }

    const lines = manifestFile.content.split('\n');
    let inRequires = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === '[requires]') {
        inRequires = true;
        continue;
      }
      if (inRequires && line.startsWith('[') && line.endsWith(']')) {
        inRequires = false;
        continue;
      }
      if (inRequires && line && !line.startsWith('#')) {
        // e.g. zlib/1.2.11 or fmt/9.1.0@...
        const parts = line.split('/');
        const name = parts[0];
        const ver = parts[1]?.split('@')[0];
        if (name) {
          const resolved = resolvedMap.get(name.toLowerCase()) || ver;
          dependencies.push({
            id: `cpp:conan:${name.toLowerCase()}@${manifestFile.path}`,
            ecosystem: 'cpp',
            packageManager: 'conan',
            name,
            versionDeclared: ver,
            versionResolved: resolved,
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: manifestFile.path,
            lockfilePath: lockFile?.path,
            evidence: [
              {
                sourceFilePath: manifestFile.path,
                sourceKind: 'manifest',
                evidenceKind: 'declared_only',
                rawSpecifier: ver,
                resolvedVersion: resolved,
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

  private parseVcpkg(manifestFile: { path: string; content: string }): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];

    try {
      const json = JSON.parse(manifestFile.content);
      if (Array.isArray(json.dependencies)) {
        for (const dep of json.dependencies) {
          let name = '';
          let version: string | undefined;

          if (typeof dep === 'string') {
            name = dep;
          } else if (dep && typeof dep === 'object') {
            name = dep.name || '';
            version = dep['version>='] || dep.version;
          }

          if (name) {
            dependencies.push({
              id: `cpp:vcpkg:${name.toLowerCase()}@${manifestFile.path}`,
              ecosystem: 'cpp',
              packageManager: 'vcpkg',
              name,
              versionDeclared: version,
              versionResolved: version,
              scope: 'runtime',
              isDirect: true,
              isTransitive: false,
              manifestPath: manifestFile.path,
              evidence: [
                {
                  sourceFilePath: manifestFile.path,
                  sourceKind: 'manifest',
                  evidenceKind: 'declared_only',
                  rawSpecifier: version,
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'error',
        code: 'malformed_file',
        message: `Failed to parse vcpkg.json: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    return { dependencies, workspaces: [], diagnostics, isComplete: true };
  }

  private parseCMake(manifestFile: { path: string; content: string }): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];

    const lines = manifestFile.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // find_package(Boost 1.70 REQUIRED)
      const fpMatch = line.match(/\bfind_package\s*\(\s*([a-zA-Z0-9_]+)(?:\s+([0-9.]+))?/i);
      if (fpMatch) {
        const pkgName = fpMatch[1];
        const ver = fpMatch[2];
        dependencies.push({
          id: `cpp:cmake:${pkgName.toLowerCase()}@${manifestFile.path}`,
          ecosystem: 'cpp',
          packageManager: 'cmake',
          name: pkgName,
          versionDeclared: ver,
          versionResolved: undefined,
          scope: 'build',
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          evidence: [
            {
              sourceFilePath: manifestFile.path,
              sourceKind: 'manifest',
              evidenceKind: 'declared_only',
              rawSpecifier: ver,
              line: i + 1,
              snippet: line,
            },
          ],
        });
      }
    }

    return { dependencies, workspaces: [], diagnostics, isComplete: true };
  }
}
