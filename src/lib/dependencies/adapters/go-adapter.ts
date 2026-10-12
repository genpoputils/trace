/**
 * Go Ecosystem Adapter: Go Modules (go.mod, go.sum)
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
import { buildDependencyProvenance } from '../provenance';

export class GoAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'go' as const;
  public readonly packageManager = 'gomod' as const;
  public readonly displayName = 'Go (Go Modules)';

  public get capability() {
    return getEcosystemCapability('go', 'gomod')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'go.mod' || base === 'go.sum';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'go.mod') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'go',
        packageManager: 'gomod',
        workspacePath,
      };
    }

    if (base === 'go.sum') {
      return {
        path: filePath,
        kind: 'checksum_file',
        ecosystem: 'go',
        packageManager: 'gomod',
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

    // Check go.sum checksum file
    const sumPath = dir === '.' ? 'go.sum' : `${dir}/go.sum`;
    const sumFile = context.getFile(sumPath) || (dir !== '.' ? context.getFile('go.sum') : undefined);
    const checksumMap = new Map<string, string>();

    if (sumFile) {
      const sumLines = sumFile.content.split('\n');
      for (const line of sumLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const mod = parts[0];
          const isModFile = parts[1].endsWith('/go.mod');
          const ver = parts[1].replace(/\/go\.mod$/, '');
          const hash = parts[2];
          // Always prefer main module checksum over /go.mod metadata checksum
          if (!isModFile || !checksumMap.has(`${mod}@${ver}`)) {
            checksumMap.set(`${mod}@${ver}`, hash);
          }
        }
      }

    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'info',
        code: 'missing_lockfile',
        message: `No go.sum checksum file found for ${manifestFile.path}. Integrity verification unavailable.`,
      });
    }

    const lines = manifestFile.content.split('\n');
    let inRequireBlock = false;
    const directDepMap = new Map<string, NormalizedDependency>();

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('//')) continue;

      if (trimmed === 'require (') {
        inRequireBlock = true;
        continue;
      }
      if (inRequireBlock && trimmed === ')') {
        inRequireBlock = false;
        continue;
      }

      // Check require directive:
      // Single line: require github.com/gin-gonic/gin v1.9.1
      // or inside block: github.com/gin-gonic/gin v1.9.1 // indirect
      let reqLine = '';
      if (trimmed.startsWith('require ') && !trimmed.includes('(')) {
        reqLine = trimmed.substring('require '.length).trim();
      } else if (inRequireBlock) {
        reqLine = trimmed;
      }

      if (reqLine) {
        const isIndirect = reqLine.includes('// indirect');
        const cleanReq = reqLine.replace(/\/\/.*$/, '').trim();
        const parts = cleanReq.split(/\s+/);

        if (parts.length >= 2) {
          const modulePath = parts[0];
          const version = parts[1];
          const isDirect = !isIndirect;
          const scope: DependencyScope = 'runtime';

          const hash = checksumMap.get(`${modulePath}@${version}`);
          const evidence: DependencyEvidence[] = [
            {
              sourceFilePath: manifestFile.path,
              sourceKind: 'manifest',
              evidenceKind: isDirect ? 'declared_only' : 'resolved_lockfile',
              rawSpecifier: version,
              resolvedVersion: version,
              line: lineNum,
              snippet: rawLine.trim(),
            },
          ];

          if (hash && sumFile) {
            evidence.push({
              sourceFilePath: sumFile.path,
              sourceKind: 'checksum_file',
              evidenceKind: 'checksum_verified',
              resolvedVersion: version,
              integrity: hash,
            });
          }

          const provenance = buildDependencyProvenance({
            name: modulePath,
            ecosystem: 'go',
            packageManager: 'gomod',
            manifestPath: manifestFile.path,
            lockfilePath: sumFile?.path,
            declaredSpecifier: isDirect ? version : undefined,
            resolvedVersion: sumFile ? version : undefined,
            integrity: hash,
            isDirect,
            getFile: context.getFile,
          });

          const depId = `go:gomod:${modulePath}@${manifestFile.path}`;
          const existing = directDepMap.get(depId);
          if (existing) {
            existing.evidence.push(...evidence);
            if (isDirect && !existing.isDirect) {
              existing.isDirect = true;
              existing.isTransitive = false;
              existing.versionDeclared = version;
            }
            continue;
          }

          const dep: NormalizedDependency = {
            id: depId,
            ecosystem: 'go',
            packageManager: 'gomod',
            name: modulePath,
            versionDeclared: isDirect ? version : undefined,
            versionResolved: sumFile ? version : undefined,
            versionInstalled: provenance.installed.version,
            scope,
            isDirect,
            isTransitive: isIndirect,
            manifestPath: manifestFile.path,
            lockfilePath: sumFile?.path,
            workspacePath,
            evidence,
            provenance,
            notes: isIndirect ? ['Indirect dependency (required transitively)'] : undefined,
          };

          directDepMap.set(depId, dep);
          dependencies.push(dep);
        }
      }
    }

    return {
      dependencies,
      workspaces: [],
      diagnostics,
      detectedLockfile: sumFile?.path,
      isComplete: true,
    };
  }
}
