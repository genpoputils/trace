/**
 * Source-Code Usage Mapping Engine (GT-014)
 *
 * Connects third-party package dependencies to the source files and AST symbols
 * that import or reference them, with accurate source locations, explicit uncertainty,
 * and robust source-analysis coverage tracking.
 * Browser-safe and zero external network runtime dependencies.
 */

import {
  NormalizedDependency,
  PackageSourceUsage,
  SourceScanCoverage,
  EcosystemType,
} from './types';
import { TraceEntity } from '../types/trace';

export interface SourceUsageMapResult {
  usagesByPackageId: Record<string, PackageSourceUsage[]>;
  usagesByFilePath: Record<string, PackageSourceUsage[]>;
  totalUsagesCount: number;
  unreferencedPackageIds: Set<string>;
  coverage: SourceScanCoverage;
}

/**
 * Determines whether the repository's source scan had sufficient coverage to make
 * a negative usage claim ("Unreferenced") for a given ecosystem.
 *
 * Requirements:
 * - Language must be actively supported by a static parser in Trace.
 * - At least one source file of that language must have been scanned.
 * - The scan must be complete (not unsupported or absent).
 */
export function canMakeNegativeUsageClaim(
  ecosystem: EcosystemType,
  coverage?: SourceScanCoverage
): boolean {
  if (!coverage) return false;
  const langCov = coverage.languages[ecosystem];
  if (!langCov) return false;
  return langCov.isSupported && langCov.isComplete !== false && langCov.scannedFilesCount > 0;
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

  // Initialize coverage tracking
  const coverage: SourceScanCoverage = {
    totalSourceFilesDetected: 0,
    totalSourceFilesScanned: 0,
    languages: {
      javascript: {
        ecosystem: 'javascript',
        language: 'TypeScript / JavaScript',
        detectedFilesCount: 0,
        scannedFilesCount: 0,
        isSupported: true,
        isComplete: true,
      },
      python: {
        ecosystem: 'python',
        language: 'Python',
        detectedFilesCount: 0,
        scannedFilesCount: 0,
        isSupported: true,
        isComplete: true,
      },
      rust: {
        ecosystem: 'rust',
        language: 'Rust',
        detectedFilesCount: 0,
        scannedFilesCount: 0,
        isSupported: true,
        isComplete: true,
      },
      go: {
        ecosystem: 'go',
        language: 'Go',
        detectedFilesCount: 0,
        scannedFilesCount: 0,
        isSupported: true,
        isComplete: true,
      },
    },
    unsupportedExtensions: [],
  };

  const supportedEcosystems = new Set(['javascript', 'python', 'rust', 'go']);
  for (const dep of dependencies) {
    if (!supportedEcosystems.has(dep.ecosystem) && !coverage.languages[dep.ecosystem]) {
      coverage.languages[dep.ecosystem] = {
        ecosystem: dep.ecosystem,
        language: dep.ecosystem.toUpperCase(),
        detectedFilesCount: 0,
        scannedFilesCount: 0,
        isSupported: false,
        hasSufficientCoverage: false,
        isComplete: false,
      };
    }
  }

  const unsupportedExtMap: Record<string, { ecosystem: EcosystemType; name: string }> = {
    '.java': { ecosystem: 'unknown', name: 'Java' },
    '.kt': { ecosystem: 'unknown', name: 'Kotlin' },
    '.scala': { ecosystem: 'unknown', name: 'Scala' },
    '.cs': { ecosystem: 'unknown', name: 'C# / .NET' },
    '.fs': { ecosystem: 'unknown', name: 'F#' },
    '.c': { ecosystem: 'unknown', name: 'C' },
    '.cpp': { ecosystem: 'unknown', name: 'C++' },
    '.cc': { ecosystem: 'unknown', name: 'C++' },
    '.h': { ecosystem: 'unknown', name: 'C/C++ Header' },
    '.hpp': { ecosystem: 'unknown', name: 'C++ Header' },
    '.swift': { ecosystem: 'unknown', name: 'Swift' },
    '.rb': { ecosystem: 'unknown', name: 'Ruby' },
    '.php': { ecosystem: 'unknown', name: 'PHP' },
    '.dart': { ecosystem: 'unknown', name: 'Dart' },
  };

  const seenUsageIds = new Set<string>();

  function addUsage(usage: PackageSourceUsage) {
    let finalId = usage.id;
    if (seenUsageIds.has(finalId)) {
      let counter = 2;
      while (seenUsageIds.has(`${usage.id}#${counter}`)) {
        counter++;
      }
      finalId = `${usage.id}#${counter}`;
      usage = { ...usage, id: finalId };
    }
    seenUsageIds.add(finalId);

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

    const dotIdx = lowerPath.lastIndexOf('.');
    const ext = dotIdx !== -1 ? lowerPath.substring(dotIdx) : '';

    // Check unsupported languages
    if (ext && unsupportedExtMap[ext]) {
      coverage.totalSourceFilesDetected++;
      if (!coverage.unsupportedExtensions.includes(ext)) {
        coverage.unsupportedExtensions.push(ext);
      }
      const langName = unsupportedExtMap[ext].name;
      if (!coverage.languages[langName]) {
        coverage.languages[langName] = {
          ecosystem: unsupportedExtMap[ext].ecosystem,
          language: langName,
          detectedFilesCount: 0,
          scannedFilesCount: 0,
          isSupported: false,
          isComplete: false,
          unsupportedReasons: [`Static import parser for ${langName} (${ext}) is not implemented.`],
        };
      }
      coverage.languages[langName].detectedFilesCount++;
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
      coverage.totalSourceFilesDetected++;
      coverage.totalSourceFilesScanned++;
      coverage.languages.javascript.detectedFilesCount++;
      coverage.languages.javascript.scannedFilesCount++;

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
      coverage.totalSourceFilesDetected++;
      coverage.totalSourceFilesScanned++;
      coverage.languages.python.detectedFilesCount++;
      coverage.languages.python.scannedFilesCount++;

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
      coverage.totalSourceFilesDetected++;
      coverage.totalSourceFilesScanned++;
      coverage.languages.rust.detectedFilesCount++;
      coverage.languages.rust.scannedFilesCount++;

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
      coverage.totalSourceFilesDetected++;
      coverage.totalSourceFilesScanned++;
      coverage.languages.go.detectedFilesCount++;
      coverage.languages.go.scannedFilesCount++;

      scanGoSource(
        filePath,
        lines,
        matchIndex.filter((m) => m.dep.ecosystem === 'go'),
        entitiesByFile.get(filePath) || [],
        addUsage
      );
    }
  }

  // Identify direct packages with zero source usages (unreferenced) ONLY when coverage allows negative claim
  const unreferencedPackageIds = new Set<string>();
  for (const dep of dependencies) {
    const hasNoUsages = !usagesByPackageId[dep.id] || usagesByPackageId[dep.id].length === 0;
    if (dep.isDirect && hasNoUsages && canMakeNegativeUsageClaim(dep.ecosystem, coverage)) {
      unreferencedPackageIds.add(dep.id);
    }
  }

  coverage.canMakeNegativeUsageClaim =
    canMakeNegativeUsageClaim('javascript', coverage) ||
    canMakeNegativeUsageClaim('python', coverage) ||
    canMakeNegativeUsageClaim('rust', coverage) ||
    canMakeNegativeUsageClaim('go', coverage);

  return {
    usagesByPackageId,
    usagesByFilePath,
    totalUsagesCount,
    unreferencedPackageIds,
    coverage,
  };
}

/**
 * Scans JavaScript / TypeScript source lines for ES imports, requires, and dynamic imports.
 * Accurately tracks multiline imports and ignores imports appearing inside multiline comments.
 */
function scanJavaScriptSource(
  filePath: string,
  lines: string[],
  jsCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  let inBlockComment = false;
  let multilineImportBuffer: { startLine: number; fullText: string; rawSnippet: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let lineText = lines[i];

    // Handle multiline /* ... */ comments
    if (inBlockComment) {
      const closeIdx = lineText.indexOf('*/');
      if (closeIdx === -1) {
        continue;
      }
      lineText = lineText.substring(closeIdx + 2);
      inBlockComment = false;
    }

    while (lineText.includes('/*')) {
      const openIdx = lineText.indexOf('/*');
      const closeIdx = lineText.indexOf('*/', openIdx + 2);
      if (closeIdx === -1) {
        lineText = lineText.substring(0, openIdx);
        inBlockComment = true;
        break;
      } else {
        lineText = lineText.substring(0, openIdx) + ' ' + lineText.substring(closeIdx + 2);
      }
    }

    // Strip single-line // comments
    const codePart = lineText.replace(/\/\/.*$/, '').trim();

    // Check multiline ES import accumulation
    if (multilineImportBuffer) {
      multilineImportBuffer.fullText += ' ' + codePart;
      multilineImportBuffer.rawSnippet += '\n' + lines[i];

      if (codePart.includes('from ') || codePart.includes(';') || (codePart.includes('from') && /['"]/.test(codePart))) {
        processJsImportClause(
          filePath,
          multilineImportBuffer.startLine,
          multilineImportBuffer.rawSnippet,
          multilineImportBuffer.fullText,
          jsCandidates,
          fileEntities,
          onUsage
        );
        multilineImportBuffer = null;
      }
      continue;
    }

    if (!codePart) continue;

    // Check start of multiline import: e.g. "import {" or "import type {" without inline "from"
    if (codePart.startsWith('import ') && !codePart.includes('from ') && (codePart.includes('{') || codePart.includes('('))) {
      multilineImportBuffer = {
        startLine: lineNum,
        fullText: codePart,
        rawSnippet: lines[i],
      };
      continue;
    }

    // Single-line ES import
    if (codePart.startsWith('import ') || codePart.startsWith('import(')) {
      processJsImportClause(filePath, lineNum, lines[i], codePart, jsCandidates, fileEntities, onUsage);
    }

    // CommonJS require: const x = require('pkg')
    const requireMatch = codePart.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const sourceModule = requireMatch[1];
      if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
        matchAndEmitUsage(
          filePath,
          lineNum,
          lines[i],
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

function processJsImportClause(
  filePath: string,
  lineNum: number,
  snippet: string,
  fullText: string,
  jsCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  // A. Static ES Import with "from":
  // e.g. import React, { useState } from 'react';
  const fromMatch = fullText.match(/^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/);
  const bareMatch = fullText.match(/^import\s+['"]([^'"]+)['"]/);
  const dynamicMatch = fullText.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);

  if (fromMatch || bareMatch) {
    const sourceModule = fromMatch ? fromMatch[2] : bareMatch![1];
    const importClause = fromMatch ? fromMatch[1].trim() : '';

    if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
      let symbols: { importedSymbol?: string; localAlias?: string } = { importedSymbol: 'default' };

      if (importClause) {
        const nsMatch = importClause.match(/\*\s+as\s+(\w+)/);
        if (nsMatch) {
          symbols = { importedSymbol: '*', localAlias: nsMatch[1] };
        } else {
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
        snippet,
        sourceModule,
        'static_import',
        jsCandidates,
        fileEntities,
        onUsage,
        symbols
      );
    }
  } else if (dynamicMatch) {
    const sourceModule = dynamicMatch[1];
    if (sourceModule && !sourceModule.startsWith('.') && !sourceModule.startsWith('/')) {
      matchAndEmitUsage(
        filePath,
        lineNum,
        snippet,
        sourceModule,
        'dynamic_require',
        jsCandidates,
        fileEntities,
        onUsage
      );
    }
  }
}

/**
 * Scans Python source lines for imports, ignoring docstrings and handling multiline imports.
 */
function scanPythonSource(
  filePath: string,
  lines: string[],
  pyCandidates: Array<{ dep: NormalizedDependency; exactKeys: string[]; prefixKeys: string[] }>,
  fileEntities: TraceEntity[],
  onUsage: (u: PackageSourceUsage) => void
) {
  let inTripleQuote: '"""' | "'''" | null = null;
  let multilinePyBuffer: { startLine: number; module: string; rawSnippet: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let lineText = lines[i];

    // Handle triple quotes
    if (inTripleQuote) {
      const closeIdx = lineText.indexOf(inTripleQuote);
      if (closeIdx === -1) {
        continue;
      }
      lineText = lineText.substring(closeIdx + 3);
      inTripleQuote = null;
    }

    while (lineText.includes('"""') || lineText.includes("'''")) {
      const target = lineText.includes('"""') ? '"""' : "'''";
      const openIdx = lineText.indexOf(target);
      const closeIdx = lineText.indexOf(target, openIdx + 3);
      if (closeIdx === -1) {
        lineText = lineText.substring(0, openIdx);
        inTripleQuote = target;
        break;
      } else {
        lineText = lineText.substring(0, openIdx) + ' ' + lineText.substring(closeIdx + 3);
      }
    }

    // Strip Python line comment
    const codePart = lineText.replace(/#.*$/, '').trim();

    if (multilinePyBuffer) {
      multilinePyBuffer.rawSnippet += '\n' + lines[i];
      if (codePart.includes(')')) {
        matchAndEmitUsage(
          filePath,
          multilinePyBuffer.startLine,
          multilinePyBuffer.rawSnippet,
          multilinePyBuffer.module,
          'static_import',
          pyCandidates,
          fileEntities,
          onUsage
        );
        multilinePyBuffer = null;
      }
      continue;
    }

    if (!codePart) continue;

    // Multiline "from module import ("
    const multiFromMatch = codePart.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s*\(/);
    if (multiFromMatch) {
      multilinePyBuffer = {
        startLine: lineNum,
        module: multiFromMatch[1],
        rawSnippet: lines[i],
      };
      continue;
    }

    // Single-line from ... import ...
    const fromMatch = codePart.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+([^#]+)/);
    if (fromMatch) {
      const sourceModule = fromMatch[1];
      const imported = fromMatch[2].split(',')[0].trim();
      matchAndEmitUsage(
        filePath,
        lineNum,
        lines[i],
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
    const importMatch = codePart.match(/^import\s+([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/);
    if (importMatch) {
      const sourceModule = importMatch[1];
      const alias = importMatch[2];
      matchAndEmitUsage(
        filePath,
        lineNum,
        lines[i],
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
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let lineText = lines[i];

    if (inBlockComment) {
      const closeIdx = lineText.indexOf('*/');
      if (closeIdx === -1) continue;
      lineText = lineText.substring(closeIdx + 2);
      inBlockComment = false;
    }

    while (lineText.includes('/*')) {
      const openIdx = lineText.indexOf('/*');
      const closeIdx = lineText.indexOf('*/', openIdx + 2);
      if (closeIdx === -1) {
        lineText = lineText.substring(0, openIdx);
        inBlockComment = true;
        break;
      } else {
        lineText = lineText.substring(0, openIdx) + ' ' + lineText.substring(closeIdx + 2);
      }
    }

    const codePart = lineText.replace(/\/\/.*$/, '').trim();
    if (!codePart) continue;

    const useMatch = codePart.match(/^use\s+([a-zA-Z0-9_]+)(?:::([^;]+))?/);
    if (useMatch) {
      const crateName = useMatch[1];
      // Skip standard library prefixes
      if (crateName === 'std' || crateName === 'core' || crateName === 'alloc' || crateName === 'crate') {
        continue;
      }
      matchAndEmitUsage(
        filePath,
        lineNum,
        lines[i],
        crateName,
        'static_import',
        rustCandidates,
        fileEntities,
        onUsage,
        { importedSymbol: useMatch[2]?.trim() }
      );
      continue;
    }

    const externMatch = codePart.match(/^extern\s+crate\s+([a-zA-Z0-9_]+);/);
    if (externMatch) {
      matchAndEmitUsage(
        filePath,
        lineNum,
        lines[i],
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
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let lineText = lines[i];

    if (inBlockComment) {
      const closeIdx = lineText.indexOf('*/');
      if (closeIdx === -1) continue;
      lineText = lineText.substring(closeIdx + 2);
      inBlockComment = false;
    }

    while (lineText.includes('/*')) {
      const openIdx = lineText.indexOf('/*');
      const closeIdx = lineText.indexOf('*/', openIdx + 2);
      if (closeIdx === -1) {
        lineText = lineText.substring(0, openIdx);
        inBlockComment = true;
        break;
      } else {
        lineText = lineText.substring(0, openIdx) + ' ' + lineText.substring(closeIdx + 2);
      }
    }

    const codePart = lineText.replace(/\/\/.*$/, '').trim();
    if (!codePart) continue;

    if (codePart === 'import (') {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock && codePart === ')') {
      inImportBlock = false;
      continue;
    }

    let importPath = '';
    if (inImportBlock) {
      const match = codePart.match(/(?:[a-zA-Z0-9_]+\s+)?["']([^"']+)["']/);
      if (match) importPath = match[1];
    } else {
      const match = codePart.match(/^import\s+(?:[a-zA-Z0-9_]+\s+)?["']([^"']+)["']/);
      if (match) importPath = match[1];
    }

    if (importPath && !importPath.startsWith('.') && importPath.includes('/')) {
      matchAndEmitUsage(
        filePath,
        lineNum,
        lines[i],
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
      const enclosing = fileEntities.find(
        (e) => e.location.startLine <= lineNum && e.location.endLine >= lineNum
      );

      const usageConfidence = isSubpath
        ? 'subpath_import'
        : dep.alias && lowerSpec === dep.alias.toLowerCase()
        ? 'uncertain_alias'
        : confidence;

      const symbolSuffix = symbols?.importedSymbol ? `:${symbols.importedSymbol}` : '';
      const usage: PackageSourceUsage = {
        id: `${dep.id}#usage#${filePath}:${lineNum}${symbolSuffix}`,
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
