import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ProjectAnalysis } from '../src/lib/types/trace';
import {
  deriveAnalysisQuality,
  clearQualityCache,
} from '../src/lib/quality/analysis-quality-service';

function createBaseAnalysis(overrides?: Partial<ProjectAnalysis>): ProjectAnalysis {
  return {
    projectId: 'test-project',
    projectName: 'Test Codebase',
    analyzedAt: '2026-10-12T12:00:00Z',
    version: '1.0.0',
    stats: {
      totalFiles: 3,
      totalLines: 150,
      languages: ['TypeScript'],
      totalSymbols: 6,
      totalRelationships: 4,
      unresolvedCalls: 0,
      routesCount: 1,
      dbQueriesCount: 1,
      mostConnected: [],
    },
    entities: {
      'src/routes/user.ts#route#GET /api/users#5': {
        id: 'src/routes/user.ts#route#GET /api/users#5',
        name: 'GET /api/users',
        kind: 'route',
        filePath: 'src/routes/user.ts',
        location: { filePath: 'src/routes/user.ts', startLine: 5, endLine: 5, startColumn: 1, endColumn: 20 },
        isExported: true,
        metadata: { httpMethod: 'GET', routePath: '/api/users' },
      },
      'src/controllers/userController.ts#function#getUsers#10': {
        id: 'src/controllers/userController.ts#function#getUsers#10',
        name: 'getUsers',
        kind: 'function',
        filePath: 'src/controllers/userController.ts',
        location: { filePath: 'src/controllers/userController.ts', startLine: 10, endLine: 25, startColumn: 1, endColumn: 2 },
        isExported: true,
      },
      'src/services/userService.ts#function#fetchUsers#15': {
        id: 'src/services/userService.ts#function#fetchUsers#15',
        name: 'fetchUsers',
        kind: 'function',
        filePath: 'src/services/userService.ts',
        location: { filePath: 'src/services/userService.ts', startLine: 15, endLine: 30, startColumn: 1, endColumn: 2 },
        isExported: true,
      },
    },
    relationships: [
      {
        id: 'rel-1',
        sourceId: 'src/routes/user.ts#route#GET /api/users#5',
        targetId: 'src/controllers/userController.ts#function#getUsers#10',
        kind: 'routes_to',
        confidence: 'statically_resolved',
      },
      {
        id: 'rel-2',
        sourceId: 'src/controllers/userController.ts#function#getUsers#10',
        targetId: 'src/services/userService.ts#function#fetchUsers#15',
        kind: 'calls',
        confidence: 'statically_resolved',
      },
    ],
    files: {
      'src/routes/user.ts': {
        path: 'src/routes/user.ts',
        content: 'export const route = "/api/users";',
        lines: 20,
        size: 500,
        language: 'typescript',
      },
      'src/controllers/userController.ts': {
        path: 'src/controllers/userController.ts',
        content: 'export function getUsers() {}',
        lines: 30,
        size: 600,
        language: 'typescript',
      },
      'src/services/userService.ts': {
        path: 'src/services/userService.ts',
        content: 'export function fetchUsers() {}',
        lines: 40,
        size: 700,
        language: 'typescript',
      },
    },
    warnings: [],
    limitations: [],
    skippedFiles: [],
    ...overrides,
  };
}

describe('Analysis Quality, Coverage & Trust Derivation Unit Suite', () => {
  beforeEach(() => {
    clearQualityCache();
  });

  /* ==============================================================================
     1. Fully analyzed supported fixture
     ============================================================================== */
  test('1. Fully analyzed supported fixture derives "complete" status with 100% coverage and zero warnings', () => {
    const analysis = createBaseAnalysis();
    const report = deriveAnalysisQuality(analysis);

    assert.strictEqual(report.status, 'complete');
    assert.strictEqual(report.statusHeadline, 'Analysis Complete');
    assert.strictEqual(report.coverage.filesAnalyzed.value, 3);
    assert.strictEqual(report.coverage.filesWithErrors.value, 0);
    assert.strictEqual(report.coverage.coveragePercentage.value, 100);
    assert.strictEqual(report.coverage.coveragePercentage.isKnown, true);
    assert.strictEqual(report.resolution.unlinkedRoutes, 0);
    assert.strictEqual(report.resolution.staticallyResolved, 2);
    assert.strictEqual(report.resolution.dynamicUnresolved, 0);
    assert.strictEqual(report.resolution.resolutionRate.value, 100);
    assert.strictEqual(report.diagnostics.length, 0);
  });

  /* ==============================================================================
     2. Partially analyzed project
     ============================================================================== */
  test('2. Partially analyzed project reflects "partial" status and surfaces partialReason caveat', () => {
    const analysis = createBaseAnalysis({
      isPartial: true,
      partialReason: 'Worker timed out on secondary modules; 2 files omitted.',
    });
    const report = deriveAnalysisQuality(analysis);

    assert.strictEqual(report.status, 'partial');
    assert.strictEqual(report.statusHeadline, 'Partial Analysis');
    const partialDiag = report.diagnostics.find((d) => d.category === 'partial_analysis');
    assert.ok(partialDiag);
    assert.strictEqual(partialDiag.severity, 'warning');
    assert.ok(partialDiag.description.includes('Worker timed out'));
  });

  /* ==============================================================================
     3. Unsupported file types
     ============================================================================== */
  test('3. Unsupported file types are categorized under unsupported_files without AST parsing crash', () => {
    const analysis = createBaseAnalysis({
      files: {
        'src/routes/user.ts': {
          path: 'src/routes/user.ts',
          content: 'export const route = "/api/users";',
          lines: 20,
          size: 500,
          language: 'typescript',
        },
        'docs/architecture.md': {
          path: 'docs/architecture.md',
          content: '# Architecture Overview',
          lines: 50,
          size: 1200,
          language: 'unknown',
        },
        'config/settings.json': {
          path: 'config/settings.json',
          content: '{"port": 8080}',
          lines: 10,
          size: 200,
          language: 'json',
        },
      },
    });

    const report = deriveAnalysisQuality(analysis);
    assert.strictEqual(report.status, 'partial'); // partial due to unsupported files
    assert.strictEqual(report.coverage.filesAnalyzed.value, 1);
    const unsuppDiags = report.diagnostics.filter((d) => d.category === 'unsupported_files');
    assert.strictEqual(unsuppDiags.length, 2);
    assert.ok(unsuppDiags.some((d) => d.affectedTarget === 'docs/architecture.md'));
    assert.ok(unsuppDiags.some((d) => d.affectedTarget === 'config/settings.json'));
  });

  /* ==============================================================================
     4. Parse or analysis errors
     ============================================================================== */
  test('4. Parse errors produce error diagnostics and degrade status when widespread', () => {
    const analysis = createBaseAnalysis({
      warnings: [
        {
          filePath: 'src/routes/user.ts',
          line: 12,
          message: 'Failed to parse AST: Unexpected token (12:4)',
          severity: 'error',
        },
      ],
    });

    const report = deriveAnalysisQuality(analysis);
    assert.strictEqual(report.coverage.filesWithErrors.value, 1);
    assert.strictEqual(report.coverage.filesAnalyzed.value, 2); // 3 supported - 1 error
    const parseDiags = report.diagnostics.filter((d) => d.category === 'parse_errors');
    assert.strictEqual(parseDiags.length, 1);
    assert.strictEqual(parseDiags[0].severity, 'error');
    assert.strictEqual(parseDiags[0].affectedTarget, 'src/routes/user.ts:12');
    assert.ok(parseDiags[0].navigationTarget);
    assert.strictEqual(parseDiags[0].navigationTarget.filePath, 'src/routes/user.ts');
  });

  /* ==============================================================================
     5. Unresolved calls or relationships
     ============================================================================== */
  test('5. Unresolved calls and unlinked route handlers are accurately measured and flagged', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/auth.ts#route#POST /api/login#8': {
          id: 'src/routes/auth.ts#route#POST /api/login#8',
          name: 'POST /api/login',
          kind: 'route',
          filePath: 'src/routes/auth.ts',
          location: { filePath: 'src/routes/auth.ts', startLine: 8, endLine: 8, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/login' },
        },
      },
      relationships: [
        {
          id: 'rel-unresolved-1',
          sourceId: 'src/routes/auth.ts#route#POST /api/login#8',
          targetId: '__import__:./authService:authenticate',
          kind: 'calls',
          confidence: 'dynamic_unresolved',
          notes: "Could not statically link export 'authenticate' in module './authService'",
        },
      ],
      files: {
        'src/routes/auth.ts': {
          path: 'src/routes/auth.ts',
          content: 'export const route = "/api/login";',
          lines: 20,
          size: 500,
          language: 'typescript',
        },
      },
    });

    const report = deriveAnalysisQuality(analysis);
    assert.strictEqual(report.resolution.unlinkedRoutes, 1);
    assert.strictEqual(report.resolution.dynamicUnresolved, 1);
    assert.strictEqual(report.resolution.unresolvedImports, 1);
    assert.strictEqual(report.resolution.staticallyResolved, 0);

    const unlinkedDiag = report.diagnostics.find((d) => d.id === 'diag:unlinked_route:src/routes/auth.ts#route#POST /api/login#8');
    assert.ok(unlinkedDiag);
    assert.strictEqual(unlinkedDiag.severity, 'warning');
    assert.ok(unlinkedDiag.navigationTarget);
    assert.strictEqual(unlinkedDiag.navigationTarget.entityId, 'src/routes/auth.ts#route#POST /api/login#8');
  });

  /* ==============================================================================
     6. Missing coverage metadata
     ============================================================================== */
  test('6. Missing skippedFiles metadata reports totalDiscovered as unknown rather than fabricating zero', () => {
    const analysis = createBaseAnalysis({
      skippedFiles: undefined, // omitted inventory
    });

    const report = deriveAnalysisQuality(analysis);
    assert.strictEqual(report.coverage.totalDiscovered.isKnown, false);
    assert.strictEqual(report.coverage.totalDiscovered.value, null);
    assert.ok(report.coverage.totalDiscovered.explanation.includes('not recorded'));
    assert.strictEqual(report.coverage.filesSkipped.isKnown, false);
    // Coverage percentage falls back to ingested source population with explicit label
    assert.strictEqual(report.coverage.coveragePercentage.label, 'Ingested Source Coverage');
  });

  /* ==============================================================================
     7. Zero diagnostics versus unavailable diagnostic data
     ============================================================================== */
  test('7. Clearly distinguishes verified zero warnings from unavailable warning metadata', () => {
    // Case A: Explicitly zero warnings
    const analysisZero = createBaseAnalysis({ warnings: [] });
    const reportZero = deriveAnalysisQuality(analysisZero);
    assert.strictEqual(reportZero.coverage.warningsCount.isKnown, true);
    assert.strictEqual(reportZero.coverage.warningsCount.value, 0);
    assert.strictEqual(reportZero.isCompleteDiagnosticSet, true);

    // Case B: Undefined warnings (metadata unavailable)
    clearQualityCache();
    const analysisMissing = createBaseAnalysis({ warnings: undefined as any });
    const reportMissing = deriveAnalysisQuality(analysisMissing);
    assert.strictEqual(reportMissing.coverage.warningsCount.isKnown, false);
    assert.strictEqual(reportMissing.isCompleteDiagnosticSet, false);
  });

  /* ==============================================================================
     8. Duplicate warnings
     ============================================================================== */
  test('8. Duplicate warnings are deterministically deduplicated', () => {
    const analysis = createBaseAnalysis({
      warnings: [
        { filePath: 'src/routes/user.ts', line: 10, message: 'Repeated warning text', severity: 'warning' },
        { filePath: 'src/routes/user.ts', line: 10, message: 'Repeated warning text', severity: 'warning' },
        { filePath: 'src/routes/user.ts', line: 10, message: 'Repeated warning text', severity: 'warning' },
      ],
    });

    const report = deriveAnalysisQuality(analysis);
    const matches = report.diagnostics.filter((d) => d.description === 'Repeated warning text');
    assert.strictEqual(matches.length, 1);
  });

  /* ==============================================================================
     9. Stable IDs and deterministic output
     ============================================================================== */
  test('9. Diagnostic IDs and properties remain stable and deterministic across multiple runs', () => {
    const analysis = createBaseAnalysis({
      warnings: [
        { filePath: 'src/routes/user.ts', line: 5, message: 'Sample warning', severity: 'warning' },
      ],
    });

    const report1 = deriveAnalysisQuality(analysis);
    clearQualityCache();
    const report2 = deriveAnalysisQuality(analysis);

    assert.deepStrictEqual(
      report1.diagnostics.map((d) => d.id),
      report2.diagnostics.map((d) => d.id)
    );
    assert.strictEqual(report1.status, report2.status);
    assert.strictEqual(report1.coverage.coveragePercentage.value, report2.coverage.coveragePercentage.value);
  });

  /* ==============================================================================
     10. Empty repositories and interrupted analysis
     ============================================================================== */
  test('10. Empty or unanalyzed repository produces neutral "unknown" report without crash', () => {
    const emptyAnalysis = {
      projectId: 'empty-project',
      projectName: 'Empty Repo',
      analyzedAt: '',
      version: '1.0.0',
      stats: {
        totalFiles: 0,
        totalLines: 0,
        languages: [],
        totalSymbols: 0,
        totalRelationships: 0,
        unresolvedCalls: 0,
        routesCount: 0,
        dbQueriesCount: 0,
        mostConnected: [],
      },
      entities: {},
      relationships: [],
      files: {},
      warnings: [],
      limitations: [],
    } as ProjectAnalysis;

    const report = deriveAnalysisQuality(emptyAnalysis);
    assert.strictEqual(report.status, 'unknown');
    assert.strictEqual(report.coverage.coveragePercentage.isKnown, false);
    assert.strictEqual(report.coverage.coveragePercentage.value, null);
    assert.strictEqual(report.resolution.resolutionRate.isKnown, false);

    // Null safety
    const nullReport = deriveAnalysisQuality(null);
    assert.strictEqual(nullReport.status, 'unknown');
  });

  /* ==============================================================================
     11. Switching analysis revisions without stale derived data
     ============================================================================== */
  test('11. Switching analysis revisions updates cache and invalidates stale diagnostics', () => {
    const rev1 = createBaseAnalysis({
      projectId: 'proj-A',
      gitMetadata: { commitSha: '1111111', branch: 'main' },
      warnings: [{ filePath: 'src/routes/user.ts', line: 1, message: 'Rev 1 warning', severity: 'warning' }],
    });

    const rev2 = createBaseAnalysis({
      projectId: 'proj-A',
      gitMetadata: { commitSha: '2222222', branch: 'main' },
      warnings: [],
    });

    const reportRev1 = deriveAnalysisQuality(rev1);
    assert.strictEqual(reportRev1.diagnostics.length, 1);
    assert.ok(reportRev1.diagnostics[0].description.includes('Rev 1 warning'));

    const reportRev2 = deriveAnalysisQuality(rev2);
    assert.strictEqual(reportRev2.diagnostics.length, 0);
    assert.strictEqual(reportRev2.status, 'complete');
  });

  /* ==============================================================================
     12. Diagnostics linked to valid source locations vs diagnostics with no valid target
     ============================================================================== */
  test('12. Distinguishes diagnostics with actionable navigation targets from items without active buttons', () => {
    const analysis = createBaseAnalysis({
      warnings: [
        // File exists in analysis.files
        { filePath: 'src/routes/user.ts', line: 5, message: 'Known file warning', severity: 'warning' },
        // File does not exist in analysis.files
        { filePath: 'external/unknown.ts', line: 1, message: 'External file warning', severity: 'warning' },
      ],
      skippedFiles: [
        // Skipped files outside files store
        { path: 'build/bundle.js', reason: 'Compiled build output' },
      ],
    });

    const report = deriveAnalysisQuality(analysis);

    const knownFileDiag = report.diagnostics.find((d) => d.description === 'Known file warning');
    assert.ok(knownFileDiag);
    assert.ok(knownFileDiag.navigationTarget, 'Diagnostic for in-project file must provide navigationTarget');
    assert.strictEqual(knownFileDiag.navigationTarget.filePath, 'src/routes/user.ts');

    const externalDiag = report.diagnostics.find((d) => d.description === 'External file warning');
    assert.ok(externalDiag);
    assert.strictEqual(externalDiag.navigationTarget, undefined, 'Diagnostic for un-ingested file must not provide navigationTarget');

    const skippedDiag = report.diagnostics.find((d) => d.affectedTarget === 'build/bundle.js');
    assert.ok(skippedDiag);
    assert.strictEqual(skippedDiag.navigationTarget, undefined, 'Skipped file diagnostic must not have active navigation target');
  });
});
