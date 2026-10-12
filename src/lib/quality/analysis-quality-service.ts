/**
 * Analysis Quality, Coverage & Trust Derivation Engine
 * GenPopUtils Trace — Visual Codebase Intelligence Platform
 */

import { TraceEntity } from '../types/trace';
import {
  AnalysisQualityReport,
  AnalysisDiagnostic,
  QualityStatus,
  QualityNavigationTarget,
  ProjectAnalysisQualityInput,
} from './analysis-quality-types';

interface QualityCacheEntry {
  cacheKey: string;
  report: AnalysisQualityReport;
}

let activeQualityCache: QualityCacheEntry | null = null;

export function clearQualityCache(): void {
  activeQualityCache = null;
}

function getCacheKey(analysis: ProjectAnalysisQualityInput): string {
  const commit = analysis.gitMetadata?.commitSha || 'local';
  const analyzedAt = analysis.analyzedAt || '0';
  const entityCount = Object.keys(analysis.entities || {}).length;
  const relCount = (analysis.relationships || []).length;
  const warnCount = (analysis.warnings || []).length;
  const fileCount = Object.keys(analysis.files || {}).length;
  return `${analysis.projectId}_${commit}_${analyzedAt}_${fileCount}_${entityCount}_${relCount}_${warnCount}`;
}

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function isSupportedSourceFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Pure derivation engine to calculate analysis quality, coverage metrics, and structured diagnostics
 */
export function deriveAnalysisQuality(
  analysis: ProjectAnalysisQualityInput | null | undefined
): AnalysisQualityReport {
  // 1. Handle empty, null, or uninitialized analysis
  if (!analysis) {
    return createUnknownReport('No repository analysis available.');
  }

  const fileKeys = Object.keys(analysis.files || {});
  const entityKeys = Object.keys(analysis.entities || {});

  if (fileKeys.length === 0 && entityKeys.length === 0 && !analysis.analyzedAt) {
    return createUnknownReport('Empty project without analysis metadata.');
  }

  // 2. Cache check
  const cacheKey = getCacheKey(analysis);
  if (activeQualityCache && activeQualityCache.cacheKey === cacheKey) {
    return activeQualityCache.report;
  }

  const files = analysis.files || {};
  const entities = analysis.entities || {};
  const relationships = analysis.relationships || [];
  const rawWarnings = analysis.warnings || [];
  const limitations = analysis.limitations || [
    'Static interprocedural analysis only — dynamic runtime dispatch (eval, reflection) cannot be statically bound.',
    'External package internals are represented as boundary nodes.',
    'Conditional branching logic is detected without runtime predicate evaluation.',
  ];

  // 3. File coverage analysis
  const supportedFiles: string[] = [];
  const unsupportedFiles: string[] = [];

  for (const filePath of fileKeys) {
    if (isSupportedSourceFile(filePath)) {
      supportedFiles.push(filePath);
    } else {
      unsupportedFiles.push(filePath);
    }
  }

  // Files with parse or analysis errors
  const filesWithErrorsSet = new Set<string>();
  for (const w of rawWarnings) {
    if (w.severity === 'error' && w.filePath) {
      filesWithErrorsSet.add(w.filePath);
    }
  }

  const filesAnalyzedCount = Math.max(0, supportedFiles.length - filesWithErrorsSet.size);

  const hasSkippedInventory = analysis.skippedFiles !== undefined;
  const skippedList = analysis.skippedFiles || [];

  const totalDiscoveredCount = hasSkippedInventory
    ? fileKeys.length + skippedList.length
    : null;

  // Calculate coverage percentage
  let coveragePct: number | null = null;
  let coverageLabel = 'Repository Inspection Coverage';
  let coverageExplanation =
    'Percentage of all discovered repository files successfully inspected into code graph symbols.';

  if (hasSkippedInventory && totalDiscoveredCount !== null && totalDiscoveredCount > 0) {
    coveragePct = Math.round((filesAnalyzedCount / totalDiscoveredCount) * 100);
  } else if (fileKeys.length > 0) {
    coveragePct = Math.round((filesAnalyzedCount / fileKeys.length) * 100);
    coverageLabel = 'Ingested Source Coverage';
    coverageExplanation =
      'Percentage of ingested files successfully parsed into AST symbols (skipped file inventory was not recorded).';
  } else {
    coverageLabel = 'Inspection Coverage';
    coverageExplanation = 'No files discovered in repository.';
  }

  // 4. Relationship resolution analysis
  let staticallyResolved = 0;
  let locallyEstablished = 0;
  let inferred = 0;
  let dynamicUnresolved = 0;
  let unresolvedImports = 0;

  for (const rel of relationships) {
    switch (rel.confidence) {
      case 'statically_resolved':
        staticallyResolved++;
        break;
      case 'locally_established':
        locallyEstablished++;
        break;
      case 'inferred':
        inferred++;
        break;
      case 'dynamic_unresolved':
      default:
        dynamicUnresolved++;
        if (
          rel.notes?.toLowerCase().includes('could not statically link export') ||
          rel.targetId.startsWith('__import__:')
        ) {
          unresolvedImports++;
        }
        break;
    }
  }

  // Route-to-handler linkage analysis
  const routeEntities: TraceEntity[] = [];
  for (const id in entities) {
    if (entities[id].kind === 'route') {
      routeEntities.push(entities[id]);
    }
  }

  const linkedRouteSourceIds = new Set<string>();
  for (const rel of relationships) {
    if (rel.kind === 'routes_to') {
      linkedRouteSourceIds.add(rel.sourceId);
    }
  }

  const unlinkedRoutesList = routeEntities.filter((r) => !linkedRouteSourceIds.has(r.id));
  const unlinkedRoutesCount = unlinkedRoutesList.length;

  const totalRelCount = relationships.length;
  const resolutionRatePct =
    totalRelCount > 0
      ? Math.round(((staticallyResolved + locallyEstablished) / totalRelCount) * 100)
      : null;

  // 5. Build structured diagnostics
  const diagnostics: AnalysisDiagnostic[] = [];
  const seenDiagnosticKeys = new Set<string>();

  const addDiagnostic = (diag: AnalysisDiagnostic) => {
    const dedupeKey = `${diag.category}:${diag.severity}:${diag.affectedTarget || ''}:${diag.title}:${diag.description}`;
    if (!seenDiagnosticKeys.has(dedupeKey)) {
      seenDiagnosticKeys.add(dedupeKey);
      diagnostics.push(diag);
    }
  };

  // Helper to find navigation target
  const resolveNavTarget = (
    filePath?: string,
    line?: number,
    entityId?: string
  ): QualityNavigationTarget | undefined => {
    if (entityId && entities[entityId]) {
      const ent = entities[entityId];
      return {
        entityId: ent.id,
        filePath: ent.filePath,
        line: ent.location.startLine,
        actionLabel: 'Inspect Entity',
      };
    }

    if (filePath && files[filePath]) {
      // Find candidate entity matching this file and line, or file entity
      let candidate: TraceEntity | undefined;
      for (const id in entities) {
        const ent = entities[id];
        if (ent.filePath === filePath) {
          if (line !== undefined && line >= ent.location.startLine && line <= ent.location.endLine) {
            candidate = ent;
            break;
          }
          if (!candidate) candidate = ent;
        }
      }

      const targetId = candidate ? candidate.id : `${filePath}#file#${filePath}#1`;
      return {
        entityId: targetId,
        filePath,
        line: line || candidate?.location.startLine || 1,
        actionLabel: 'Inspect in Source',
      };
    }

    return undefined;
  };

  // 5A. Parse / Analysis Errors from Warnings
  for (const w of rawWarnings) {
    if (w.severity === 'error') {
      const lineStr = w.line ? `:${w.line}` : '';
      const targetStr = w.filePath ? `${w.filePath}${lineStr}` : undefined;
      const nav = resolveNavTarget(w.filePath, w.line);

      addDiagnostic({
        id: `diag:parse_err:${w.filePath || 'global'}:${w.line || 1}:${w.message.slice(0, 40)}`,
        category: 'parse_errors',
        severity: 'error',
        title: 'AST Parsing Failed',
        description: w.message,
        affectedTarget: targetStr,
        reason:
          'Syntax or grammar errors prevented the TypeScript adapter from building an AST for this file. Symbols and relationships inside it may be missing from the graph.',
        evidence: `Analyzer diagnostic: "${w.message}"`,
        nextAction: 'Review the source code syntax in this file and ensure it is valid TypeScript/JavaScript.',
        navigationTarget: nav,
      });
    }
  }

  // 5B. Warnings from Warnings list
  for (const w of rawWarnings) {
    if (w.severity === 'warning') {
      const lineStr = w.line ? `:${w.line}` : '';
      const targetStr = w.filePath ? `${w.filePath}${lineStr}` : undefined;
      const nav = resolveNavTarget(w.filePath, w.line);

      const isDep = w.message.startsWith('[DEP-') || w.message.includes('dependency');
      addDiagnostic({
        id: `diag:warn:${w.filePath || 'global'}:${w.line || 1}:${w.message.slice(0, 40)}`,
        category: isDep ? 'dependency_diagnostics' : 'unresolved_relationships',
        severity: 'warning',
        title: isDep ? 'Dependency Diagnostic' : 'Analysis Warning',
        description: w.message,
        affectedTarget: targetStr,
        reason: isDep
          ? 'Package manifest anomaly or missing lockfile information detected.'
          : 'Potential ambiguous reference or heuristic inference required attention.',
        evidence: `Analyzer warning: "${w.message}"`,
        nextAction: isDep ? 'Inspect the package manifest or run dependency install.' : 'Inspect the source file.',
        navigationTarget: nav,
      });
    }
  }

  // 5C. Unlinked Route Handlers
  for (const route of unlinkedRoutesList) {
    const routeLoc = `${route.filePath}:${route.location.startLine}`;
    addDiagnostic({
      id: `diag:unlinked_route:${route.id}`,
      category: 'unresolved_relationships',
      severity: 'warning',
      title: 'Route Handler Not Statically Linked',
      description: `Endpoint ${route.name} (${route.metadata?.httpMethod || 'HTTP'} ${route.metadata?.routePath || ''}) could not be statically connected to a handler function.`,
      affectedTarget: routeLoc,
      reason:
        'The route declaration was discovered, but the request handler function uses an unresolvable or dynamic dispatch pattern.',
      evidence: `Route entity "${route.name}" in ${route.filePath} has 0 outgoing "routes_to" relationships.`,
      nextAction: 'Inspect the route definition to verify where request handling logic is dispatched.',
      navigationTarget: {
        entityId: route.id,
        filePath: route.filePath,
        line: route.location.startLine,
        tab: 'graph',
        actionLabel: 'Inspect Route in Graph',
      },
    });
  }

  // 5D. Unresolved Internal Module Imports
  for (const rel of relationships) {
    if (
      rel.confidence === 'dynamic_unresolved' &&
      rel.notes?.toLowerCase().includes('could not statically link export')
    ) {
      const sourceEnt = entities[rel.sourceId];
      const nav = sourceEnt ? resolveNavTarget(sourceEnt.filePath, sourceEnt.location.startLine, sourceEnt.id) : undefined;
      addDiagnostic({
        id: `diag:unresolved_import:${rel.id}`,
        category: 'unresolved_relationships',
        severity: 'warning',
        title: 'Unresolved Module Import',
        description: rel.notes || 'Cross-module export could not be statically bound.',
        affectedTarget: sourceEnt ? `${sourceEnt.filePath}:${sourceEnt.location.startLine}` : undefined,
        reason: 'Static import resolution failed to match an exported symbol in the target module path.',
        evidence: `Relationship "${rel.id}" tagged dynamic_unresolved.`,
        nextAction: 'Verify import path and export identifier matching in the calling module.',
        navigationTarget: nav,
      });
    }
  }

  // 5E. Skipped Files Diagnostics
  for (const skipped of skippedList) {
    addDiagnostic({
      id: `diag:skipped:${skipped.path}`,
      category: 'unsupported_files',
      severity: 'info',
      title: 'File Skipped During Ingestion',
      description: `${skipped.path} was excluded from analysis.`,
      affectedTarget: skipped.path,
      reason: skipped.reason,
      evidence: `Ingestion filter rule: "${skipped.reason}"`,
      nextAction: 'If this file is required for analysis, adjust ingestion exclusion rules.',
      navigationTarget: undefined, // Not stored in analysis.files, so no misleading active button
    });
  }

  // 5F. Unsupported Source Files in Repository
  for (const unsupp of unsupportedFiles) {
    const fileEnt = entities[`${unsupp}#file#${unsupp}#1`];
    const nav = fileEnt ? resolveNavTarget(unsupp, 1, fileEnt.id) : undefined;
    addDiagnostic({
      id: `diag:unsupported:${unsupp}`,
      category: 'unsupported_files',
      severity: 'info',
      title: 'Non-JavaScript/TypeScript File',
      description: `${unsupp} is not parsed by the JavaScript/TypeScript AST adapter.`,
      affectedTarget: unsupp,
      reason:
        'Trace currently performs full AST code-graph extraction on TypeScript and JavaScript files (.ts, .tsx, .js, .jsx, .mjs, .cjs).',
      evidence: `File extension is not supported for AST parsing.`,
      nextAction: 'File content is available in the source explorer, but internal symbols are not extracted.',
      navigationTarget: nav,
    });
  }

  // 5G. Partial Analysis Disclosures
  if (analysis.isPartial) {
    addDiagnostic({
      id: `diag:partial_status:${analysis.projectId}`,
      category: 'partial_analysis',
      severity: 'warning',
      title: 'Partial Analysis Flagged',
      description:
        analysis.partialReason ||
        'The analyzer marked this repository analysis as partial due to encountered warnings or errors.',
      affectedTarget: analysis.projectName,
      reason: 'Certain files or call paths may not be fully represented in the code graph.',
      evidence: `ProjectAnalysis.isPartial is true (reason: ${analysis.partialReason || 'None specified'})`,
      nextAction: 'Review the diagnostics list below for specific file and relationship errors.',
      navigationTarget: undefined,
    });
  }

  // 6. Overall Status Determination
  let status: QualityStatus = 'complete';
  let statusHeadline = 'Analysis Complete';
  let statusExplanation =
    'All supported files were inspected and relationships resolved subject to standard static analysis limitations.';
  const statusCaveats: string[] = [];

  const errorDiagnosticsCount = diagnostics.filter((d) => d.severity === 'error').length;

  if (
    errorDiagnosticsCount > 0 &&
    (errorDiagnosticsCount / Math.max(1, supportedFiles.length) > 0.25 ||
      (supportedFiles.length > 0 && filesAnalyzedCount === 0))
  ) {
    status = 'degraded';
    statusHeadline = 'Analysis Degraded';
    statusExplanation =
      'Analysis encountered significant AST parsing errors or unresolvable files that materially affect graph completeness.';
    statusCaveats.push(
      `${errorDiagnosticsCount} fatal parse error(s) prevented multiple files from being parsed into the code graph.`
    );
  } else if (
    analysis.isPartial ||
    errorDiagnosticsCount > 0 ||
    skippedList.length > 0 ||
    unlinkedRoutesCount > 0 ||
    dynamicUnresolved > 0 ||
    unsupportedFiles.length > 0
  ) {
    status = 'partial';
    statusHeadline = 'Partial Analysis';
    statusExplanation =
      'Analysis completed successfully for supported files, with caveats for skipped items, unsupported formats, or unresolved links.';

    if (errorDiagnosticsCount > 0) {
      statusCaveats.push(`${errorDiagnosticsCount} file(s) failed AST parsing.`);
    }
    if (skippedList.length > 0) {
      statusCaveats.push(`${skippedList.length} file(s) were excluded by ingestion rules.`);
    }
    if (unlinkedRoutesCount > 0) {
      statusCaveats.push(`${unlinkedRoutesCount} HTTP route(s) could not be statically connected to handlers.`);
    }
    if (dynamicUnresolved > 0) {
      statusCaveats.push(`${dynamicUnresolved} relationship(s) involve dynamic dispatch or unresolved imports.`);
    }
    if (unsupportedFiles.length > 0) {
      statusCaveats.push(`${unsupportedFiles.length} file(s) use non-TS/JS formats without AST symbol parsing.`);
    }
  }

  const report: AnalysisQualityReport = {
    status,
    statusHeadline,
    statusExplanation,
    statusCaveats,
    coverage: {
      totalDiscovered: {
        value: totalDiscoveredCount,
        isKnown: hasSkippedInventory,
        explanation: hasSkippedInventory
          ? 'Total files discovered during repository ingestion (ingested source + skipped files).'
          : 'Skipped files inventory not recorded in this analysis revision.',
      },
      filesAnalyzed: {
        value: filesAnalyzedCount,
        isKnown: true,
        explanation: 'Supported source files (.ts, .tsx, .js, .jsx) successfully parsed without AST errors.',
      },
      filesSkipped: {
        value: skippedList.length,
        isKnown: hasSkippedInventory,
        explanation: hasSkippedInventory
          ? 'Files excluded during ingestion (build output, tests, node_modules, or binary assets).'
          : 'Skipped files inventory not recorded in this analysis revision.',
      },
      filesWithErrors: {
        value: filesWithErrorsSet.size,
        isKnown: true,
        explanation: 'Supported files that encountered fatal AST parsing or grammar errors.',
      },
      detectedLanguages: analysis.stats?.languages || [],
      coveragePercentage: {
        value: coveragePct,
        isKnown: coveragePct !== null,
        label: coverageLabel,
        explanation: coverageExplanation,
      },
      warningsCount: {
        value: rawWarnings.length,
        isKnown: analysis.warnings !== undefined,
        explanation:
          analysis.warnings !== undefined
            ? 'Total warnings and diagnostics emitted by the analyzer.'
            : 'Warning metadata not available for this revision.',
      },
    },
    resolution: {
      totalRelationships: totalRelCount,
      staticallyResolved,
      locallyEstablished,
      inferred,
      dynamicUnresolved,
      unresolvedImports,
      unlinkedRoutes: unlinkedRoutesCount,
      routesCount: routeEntities.length,
      resolutionRate: {
        value: resolutionRatePct,
        isKnown: resolutionRatePct !== null,
        explanation:
          'Percentage of relationships verified by direct AST syntax or local module binding.',
      },
    },
    diagnostics,
    limitations,
    isCompleteDiagnosticSet: analysis.warnings !== undefined,
    generatedAt: new Date().toISOString(),
  };

  // Cache report
  activeQualityCache = {
    cacheKey,
    report,
  };

  return report;
}

function createUnknownReport(reason: string): AnalysisQualityReport {
  return {
    status: 'unknown',
    statusHeadline: 'Analysis Status Unknown',
    statusExplanation: reason,
    statusCaveats: ['Insufficient analysis data available for quality evaluation.'],
    coverage: {
      totalDiscovered: {
        value: null,
        isKnown: false,
        explanation: 'No repository metadata available.',
      },
      filesAnalyzed: {
        value: 0,
        isKnown: false,
        explanation: 'No files analyzed.',
      },
      filesSkipped: {
        value: 0,
        isKnown: false,
        explanation: 'Skipped inventory unavailable.',
      },
      filesWithErrors: {
        value: 0,
        isKnown: false,
        explanation: 'Error data unavailable.',
      },
      detectedLanguages: [],
      coveragePercentage: {
        value: null,
        isKnown: false,
        label: 'Coverage',
        explanation: 'Not measured — no analysis data.',
      },
      warningsCount: {
        value: 0,
        isKnown: false,
        explanation: 'Warning data unavailable.',
      },
    },
    resolution: {
      totalRelationships: 0,
      staticallyResolved: 0,
      locallyEstablished: 0,
      inferred: 0,
      dynamicUnresolved: 0,
      unresolvedImports: 0,
      unlinkedRoutes: 0,
      routesCount: 0,
      resolutionRate: {
        value: null,
        isKnown: false,
        explanation: 'No relationships available.',
      },
    },
    diagnostics: [],
    limitations: [
      'Analysis has not been run or repository data has been cleared.',
    ],
    isCompleteDiagnosticSet: false,
    generatedAt: new Date().toISOString(),
  };
}
