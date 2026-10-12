/**
 * Ruby Ecosystem Adapter: Bundler (Gemfile, Gemfile.lock)
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

export class RubyAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'ruby' as const;
  public readonly packageManager = 'bundler' as const;
  public readonly displayName = 'Ruby (Bundler)';

  public get capability() {
    return getEcosystemCapability('ruby', 'bundler')!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    return base === 'Gemfile' || base === 'Gemfile.lock';
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'Gemfile') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'ruby',
        packageManager: 'bundler',
        workspacePath,
      };
    }
    if (base === 'Gemfile.lock') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'ruby',
        packageManager: 'bundler',
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

    const lockPath = dir === '.' ? 'Gemfile.lock' : `${dir}/Gemfile.lock`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('Gemfile.lock') : undefined);
    const resolvedMap = new Map<string, { resolvedVersion: string }>();

    if (lockFile) {
      const lockLines = lockFile.content.split('\n');
      let inSpecs = false;

      for (const line of lockLines) {
        if (line.trim() === 'specs:') {
          inSpecs = true;
          continue;
        }
        if (inSpecs && line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          inSpecs = false;
        }
        if (inSpecs) {
          // GEM specs line: "    rails (7.0.4.3)" or "    nokogiri (1.15.2-arm64-darwin)"
          // 4 spaces indent = gem; 6 spaces indent = sub-dependency
          const match = line.match(/^\s{4}([a-zA-Z0-9_.-]+)\s*\(([^)]+)\)/);
          if (match) {
            resolvedMap.set(match[1].toLowerCase(), { resolvedVersion: match[2] });
          }
        }
      }
    } else {
      diagnostics.push({
        filePath: manifestFile.path,
        severity: 'warning',
        code: 'missing_lockfile',
        message: `No Gemfile.lock found for ${manifestFile.path}. Pinned versions cannot be verified.`,
      });
    }

    const lines = manifestFile.content.split('\n');
    let inGroup: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const commentIdx = rawLine.indexOf('#');
      const line = (commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine).trim();

      if (!line) continue;

      if (line.startsWith('group ') && line.includes('do')) {
        inGroup = line;
        continue;
      }
      if (inGroup && line === 'end') {
        inGroup = null;
        continue;
      }

      // gem 'pg', '~> 1.1' or gem "puma", ">= 5.0"
      const gemMatch = line.match(/^gem\s+['"]([a-zA-Z0-9_.-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
      if (gemMatch) {
        const name = gemMatch[1];
        const rawSpec = gemMatch[2] || '*';
        const isDev = inGroup ? inGroup.includes('development') || inGroup.includes('test') : false;
        const scope: DependencyScope = isDev ? 'dev' : 'runtime';

        const resolved = resolvedMap.get(name.toLowerCase());

        const evidence: DependencyEvidence[] = [
          {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: rawSpec,
            line: lineNum,
            snippet: rawLine.trim(),
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

        const depId = `ruby:bundler:${name.toLowerCase()}@${manifestFile.path}`;
        const existing = directDepMap.get(depId);
        if (existing) {
          existing.evidence.push(...evidence);
          if (scope === 'runtime' && existing.scope === 'dev') {
            existing.scope = 'runtime';
          }
          if (rawSpec !== '*' && (!existing.versionDeclared || existing.versionDeclared === '*')) {
            existing.versionDeclared = rawSpec;
          }
          continue;
        }

        const dep: NormalizedDependency = {
          id: depId,
          ecosystem: 'ruby',
          packageManager: 'bundler',
          name,
          versionDeclared: rawSpec,
          versionResolved: resolved?.resolvedVersion,
          scope,
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          lockfilePath: lockFile?.path,
          workspacePath,
          evidence,
        };

        directDepMap.set(depId, dep);
        dependencies.push(dep);
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
