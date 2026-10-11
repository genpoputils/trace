/**
 * Source-Code Usage Mapping Engine (GT-014)
 *
 * Connects third-party package dependencies to the source files and AST symbols
 * that import or reference them, with accurate source locations and explicit uncertainty.
 * Browser-safe and zero external network runtime dependencies.
 */

import {
  NormalizedDependency,
  PackageSourceUsage,
} from './types';
import { TraceEntity } from '../types/trace';

export interface SourceUsageMapResult {
  usagesByPackageId: Record<string, PackageSourceUsage[]>;
  usagesByFilePath: Record<string, PackageSourceUsage[]>;
  totalUsagesCount: number;
  unreferencedPackageIds: Set<string>;
}

/**
 * Extracts and maps third-party dependency usage across project source files.
 */
export function mapPackagesToSourceUsage(
  dependencies: NormalizedDependency[],
  files: Record<string, { content: string; language?: string }>,
  entities?: Record<string, TraceEntity>
): SourceUsageMapResult {
  const usagesByPackageId: Record<string, PackageSourceUsage[]> = {};
  const usagesByFilePath: Record<string, PackageSourceUsage[]> = {};
  let totalUsagesCount = 0;

  // Initialize arrays for all dependencies
  for (const dep of dependencies) {
    usagesByPackageId[dep.id] = [];
  }

  // Pre-index dependencies by ecosystem and match keys
  const matchIndex: Array<{
    dep: NormalizedDependency;
    exactKeys: string[];
    prefixKeys: string[];
  }> = [];

  for (const dep of dependencies) {
    const exactKeys = [dep.name.toLowerCase()];
    const prefixKeys = [`${dep.name.toLowerCase()}/`];

    if (dep.alias) {
      exactKeys.push(dep.alias.toLowerCase());
      prefixKeys.push(`${dep.alias.toLowerCase()}/`);
    }

    // Python underscore vs hyphen normalization
    if (dep.ecosystem === 'python') {
      const norm = dep.name.toLowerCase().replace(/[-_.]+/g, '_');
      if (!exactKeys.includes(norm)) {
        exactKeys.push(norm);
        prefixKeys.push(`${norm}.`);
      }
    }

    // Rust underscore vs hyphen normalization
    if (dep.ecosystem === 'rust') {
      const norm = dep.name.toLowerCase().replace(/-/g, '_');
      if (!exactKeys.includes(norm)) {
        exactKeys.push(norm);
        prefixKeys.push(`${norm}::`);
      }
    }

    matchIndex.push({ dep, exactKeys, prefixKeys });
  }

  // Group entities by filePath for fast enclosing symbol lookups
  const entitiesByFile = new Map<string, TraceEntity[]>();
  if (entities) {
    for (const ent of Object.values(entities)) {
      if (ent.kind !== 'file') {
        const list = entitiesByFile.get(ent.filePath) || [];
        list.push(ent);
        entitiesByFile.set(ent.filePath, list);
      }
    }
  }

  // Parse source files
  for (const [rawPath, file] of Object.entries(files)) {
    const filePath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const lowerPath = filePath.toLowerCase();

    // Skip manifests, lockfiles, node_modules, and build output
    if (
      lowerPath.includes('node_modules/') ||
      lowerPath.includes('.git/') ||
      lowerPath.endsWith('package.json') ||
      lowerPath.endsWith('package-lock.json') ||
      lowerPath.endsWith('pnpm-lock.yaml') ||
      lowerPath.endsWith('yarn.lock') ||
      lowerPath.endsWith('cargo.lock') ||
      lowerPath.endsWith('cargo.toml') ||
      lowerPath.endsWith('pyproject.toml') ||
      lowerPath.endsWith('poetry.lock') ||
      lowerPath.endsWith('requirements.txt') ||
      lowerPath.endsWith('go.mod') ||
      lowerPath.endsWith('go.sum')
    ) {
      continue;
    }

    const lines = file.content.split('\n');

    // 1. JavaScript / TypeScript Files
    if (
      lowerPath.endsWith('.ts') ||
      lowerPath.endsWith('.tsx') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.jsx') ||
      lowerPath.endsWith('.mjs') ||
      lowerPath.endsWith('.cjs')
    ) {
      scanJavaScriptSource(
        filePath,
        lines,
        matchIndex.filter((m) => m.dep.ecosystem === 'javascript'),
        entitiesByFile.get(filePath) || [],
        addUsage
      );
    }

    // 2. Python Files
    else if (lowerPath.endsWith('.py')) {
      scanPythonSource(
        filePath,
        lines,
        matchIndex.filter((m) => m.dep.ecosystem === 'python'),
        entitiesByFile.get(filePath) || [],
        addUsage
      );
    }

    // 3. Rust Files
    else if (lowerPath.endsWith('.rs')) {
      scanRustSource(
        filePath,
        lines,
        matchIndex.filter((m) => m.dep.ecosystem === 'rust'),
        entitiesByFile.get(filePath) || [],
        addUsage
      );
    }

    // 4. Go Files
    else if (lowerPath.endsWith('.go')) {
      scanGoSource(
        filePath,
        lines,
        matchIndex.filter((m) => m.dep.ecosystem === 'go'),
        entitiesByFile.get(filePath) || [],
        addUsage
      );
    }
  }

  function addUsage(usage: PackageSourceUsage) {
    if (!usagesByPackageId[usage.packageId]) {
      usagesByPackageId[usage.packageId] = [];
    }
    usagesByPackageId[usage.packageId].push(usage);

    if (!usagesByFilePath[usage.filePath]) {
      usagesByFilePath[usage.filePath] = [];
    }
    usagesByFilePath[usage.filePath].push(usage);
    totalUsagesCount++;
  }

  // Identify direct packages with zero source usages (unreferenced)
  const unreferencedPackageIds = new Set<string>();
  for (const dep of dependencies) {
    if (dep.isDirect && (!usagesByPackageId[dep.id] || usagesByPackageId[dep.id].length === 0)) {
      unreferencedPackageIds.add(dep.id);
    }
  }

  return {
    usagesByPackageId,
    usagesByFilePath,
    totalUsagesCount,
    unreferencedPackageIds,
  };
}

/**
 * Scans JavaScript / TypeScript source lines for ES imports, requires, and dynamic imports.
 */
function scanJavaScriptSource(
  filePath: string,
  lines: string[],
  jsCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // A. Static ES Import:
    // e.g. import React, { useState } from 'react';
    // or import * as React from 'react';
    // or import express from 'express';
    // or import 'react';
    const fromMatch = trimmed.match(/^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/);
    const bareMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);

    if (fromMatch || bareMatch) {
      const sourceModule = fromMatch ? fromMatch[2] : bareMatch![1];
      const importClause = fromMatch ? fromMatch[1].trim() : '';

      if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
        let symbols: { importedSymbol?: string; localAlias?: string } = { importedSymbol: 'default' };

        if (importClause) {
          // Namespace: * as foo
          const nsMatch = importClause.match(/\*\s+as\s+(\w+)/);
          if (nsMatch) {
            symbols = { importedSymbol: '*', localAlias: nsMatch[1] };
          } else {
            // Named imports: { foo, bar as baz }
            const namedMatch = importClause.match(/\{([^}]+)\}/);
            if (namedMatch) {
              const raw = namedMatch[1].trim();
              const firstPart = raw.split(',')[0].trim();
              const asParts = firstPart.split(/\s+as\s+/);
              if (asParts.length === 2) {
                symbols = { importedSymbol: asParts[0].trim(), localAlias: asParts[1].trim() };
              } else {
                symbols = { importedSymbol: firstPart, localAlias: firstPart };
              }
            } else {
              // Default import only
              const defaultPart = importClause.split(',')[0].trim();
              if (defaultPart) {
                symbols = { importedSymbol: 'default', localAlias: defaultPart };
              }
            }
          }
        }

        matchAndEmitUsage(
          filePath,
          lineNum,
          line,
          sourceModule,
          'static_import',
          jsCandidates,
          fileEntities,
          onUsage,
          symbols
        );
        continue;
      }
    }

    // B. CommonJS require: const x = require('pkg') or require('pkg/sub')
    const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const sourceModule = requireMatch[1];
      if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
        matchAndEmitUsage(
          filePath,
          lineNum,
          line,
          sourceModule,
          'dynamic_require',
          jsCandidates,
          fileEntities,
          onUsage
        );
        continue;
      }
    }

    // C. Dynamic import(): import('pkg')
    const dynamicImportMatch = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicImportMatch) {
      const sourceModule = dynamicImportMatch[1];
      if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
        matchAndEmitUsage(
          filePath,
          lineNum,
          line,
          sourceModule,
          'dynamic_require',
          jsCandidates,
          fileEntities,
          onUsage
        );
      }
    }
  }
}

/**
 * Scans Python source lines for imports.
 */
function scanPythonSource(
  filePath: string,
  lines: string[],
  pyCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // from pkg.sub import x, y as z
    const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+([^#]+)/);
    if (fromMatch) {
      const sourceModule = fromMatch[1];
      const imported = fromMatch[2].split(',')[0].trim();
      matchAndEmitUsage(
        filePath,
        lineNum,
        line,
        sourceModule,
        'static_import',
        pyCandidates,
        fileEntities,
        onUsage,
        { importedSymbol: imported }
      );
      continue;
    }

    // import pkg, pkg.sub as alias
    const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/);
    if (importMatch) {
      const sourceModule = importMatch[1];
      const alias = importMatch[2];
      matchAndEmitUsage(
        filePath,
        lineNum,
        line,
        sourceModule,
        'static_import',
        pyCandidates,
        fileEntities,
        onUsage,
        { localAlias: alias }
      );
    }
  }
}

/**
 * Scans Rust source lines for use statements and extern crate.
 */
function scanRustSource(
  filePath: string,
  lines: string[],
  rustCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    const useMatch = trimmed.match(/^use\s+([a-zA-Z0-9_]+)(?:::([^;]+))?/);
    if (useMatch) {
      const crateName = useMatch[1];
      // Skip standard library prefixes
      if (crateName === 'std' || crateName === 'core' || crateName === 'alloc' || crateName === 'crate') {
        continue;
      }
      matchAndEmitUsage(
        filePath,
        lineNum,
        line,
        crateName,
        'static_import',
        rustCandidates,
        fileEntities,
        onUsage,
        { importedSymbol: useMatch[2]?.trim() }
      );
      continue;
    }

    const externMatch = trimmed.match(/^extern\s+crate\s+([a-zA-Z0-9_]+);/);
    if (externMatch) {
      matchAndEmitUsage(
        filePath,
        lineNum,
        line,
        externMatch[1],
        'static_import',
        rustCandidates,
        fileEntities,
        onUsage
      );
    }
  }
}

/**
 * Scans Go source lines for import declarations.
 */
function scanGoSource(
  filePath: string,
  lines: string[],
  goCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    if (trimmed === 'import (') {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock && trimmed === ')') {
      inImportBlock = false;
      continue;
    }

    let importPath = '';
    if (inImportBlock) {
      const match = trimmed.match(/(?:[a-zA-Z0-9_]+\s+)?["']([^"']+)["']/);
      if (match) importPath = match[1];
    } else {
      const match = trimmed.match(/^import\s+(?:[a-zA-Z0-9_]+\s+)?["']([^"']+)["']/);
      if (match) importPath = match[1];
    }

    if (importPath && !importPath.startsWith('.') && importPath.includes('/')) {
      matchAndEmitUsage(
        filePath,
        lineNum,
        line,
        importPath,
        'static_import',
        goCandidates,
        fileEntities,
        onUsage
      );
    }
  }
}

/**
 * Matches a source import specifier against candidate dependencies and emits a typed PackageSourceUsage.
 */
function matchAndEmitUsage(
  filePath: string,
  lineNum: number,
  lineContent: string,
  rawSpecifier: string,
  confidence: 'static_import' | 'dynamic_require',
  candidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void,
  symbols?: { importedSymbol?: string; localAlias?: string }
) {
  const lowerSpec = rawSpecifier.toLowerCase();

  for (const { dep, exactKeys, prefixKeys } of candidates) {
    const isExact = exactKeys.some((k) => lowerSpec === k);
    const isSubpath = !isExact && prefixKeys.some((p) => lowerSpec.startsWith(p));

    if (isExact || isSubpath) {
      // Find enclosing entity if the import falls inside a function/component or directly precedes it
      const enclosing = fileEntities.find(
        (e) => e.location.startLine <= lineNum && e.location.endLine >= lineNum
      );

      const usageConfidence = isSubpath
        ? 'subpath_import'
        : dep.alias && lowerSpec === dep.alias.toLowerCase()
        ? 'uncertain_alias'
        : confidence;

      const usage: PackageSourceUsage = {
        id: `${dep.id}#usage#${filePath}:${lineNum}`,
        packageId: dep.id,
        packageName: dep.name,
        ecosystem: dep.ecosystem,
        filePath,
        location: {
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          startColumn: 1,
          endColumn: lineContent.length + 1,
        },
        importedSymbol: symbols?.importedSymbol,
        localAlias: symbols?.localAlias,
        sourceSnippet: lineContent.trim(),
        enclosingEntityId: enclosing?.id,
        enclosingEntityName: enclosing?.name,
        confidence: usageConfidence,
        isDirectImport: true,
        evidenceNote:
          usageConfidence === 'dynamic_require'
            ? 'Dynamic require/import detected in source file. Static analysis cannot guarantee runtime invocation.'
            : isSubpath
            ? `Subpath import '${rawSpecifier}' resolved to base package '${dep.name}'.`
            : `Static import detected in source code. Runtime execution not dynamically verified.`,
      };

      onUsage(usage);
    }
  }
}
