import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ProjectAnalysis } from '../src/lib/types/trace';
import { localProjectStore } from '../src/lib/storage/local-project-store';
import { deriveAnalysisQuality, clearQualityCache } from '../src/lib/quality/analysis-quality-service';
import { inferFeatureMap, clearFeatureCache } from '../src/lib/features/feature-map-service';

describe('Overview & Analysis Quality Integration and Workflow Suite', () => {
  beforeEach(() => {
    clearQualityCache();
    clearFeatureCache();
  });

  /* ==============================================================================
     1. Status and metrics display from actual analysis object
     ============================================================================== */
  test('1. Loads sample e-commerce project and derives genuine quality report with real metrics', async () => {
    const sample = await localProjectStore.getProject('sample-ecommerce-api');
    assert.ok(sample, 'Sample project should exist in store');

    const quality = deriveAnalysisQuality(sample);
    assert.ok(quality.status === 'complete' || quality.status === 'partial');
    assert.ok(quality.coverage.filesAnalyzed.value > 0);
    assert.strictEqual(quality.coverage.filesAnalyzed.isKnown, true);
    assert.ok(quality.resolution.totalRelationships > 0);
    assert.ok(quality.resolution.staticallyResolved > 0);
    assert.ok(quality.coverage.detectedLanguages.length > 0);
  });

  /* ==============================================================================
     2. Unknown values do not display as zero
     ============================================================================== */
  test('2. Unknown quantities retain null values and isKnown: false without falling back to zero', () => {
    const unmeasuredAnalysis: ProjectAnalysis = {
      projectId: 'unmeasured-project',
      projectName: 'Unmeasured Project',
      analyzedAt: '2026-10-12T10:00:00Z',
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
      skippedFiles: undefined, // omitted inventory
    };

    const quality = deriveAnalysisQuality(unmeasuredAnalysis);
    assert.strictEqual(quality.coverage.totalDiscovered.value, null);
    assert.strictEqual(quality.coverage.totalDiscovered.isKnown, false);
    assert.notStrictEqual(quality.coverage.totalDiscovered.value, 0);

    assert.strictEqual(quality.resolution.resolutionRate.value, null);
    assert.strictEqual(quality.resolution.resolutionRate.isKnown, false);
    assert.notStrictEqual(quality.resolution.resolutionRate.value, 0);
  });

  /* ==============================================================================
     3. Selecting a diagnostic opens the correct source/entity
     ============================================================================== */
  test('3. Selecting a diagnostic targets the exact entity ID and file line carried by the analysis', () => {
    const analysis: ProjectAnalysis = {
      projectId: 'nav-test',
      projectName: 'Navigation Test',
      analyzedAt: '2026-10-12T10:00:00Z',
      version: '1.0.0',
      stats: {
        totalFiles: 1,
        totalLines: 50,
        languages: ['TypeScript'],
        totalSymbols: 1,
        totalRelationships: 0,
        unresolvedCalls: 0,
        routesCount: 1,
        dbQueriesCount: 0,
        mostConnected: [],
      },
      entities: {
        'src/routes/items.ts#route#GET /api/items#15': {
          id: 'src/routes/items.ts#route#GET /api/items#15',
          name: 'GET /api/items',
          kind: 'route',
          filePath: 'src/routes/items.ts',
          location: { filePath: 'src/routes/items.ts', startLine: 15, endLine: 15, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'GET', routePath: '/api/items' },
        },
      },
      relationships: [],
      files: {
        'src/routes/items.ts': {
          path: 'src/routes/items.ts',
          content: 'export const route = "/api/items";',
          lines: 50,
          size: 1000,
          language: 'typescript',
        },
      },
      warnings: [],
      limitations: [],
      skippedFiles: [],
    };

    const quality = deriveAnalysisQuality(analysis);
    // Unlinked route diagnostic
    const routeDiag = quality.diagnostics.find((d) => d.category === 'unresolved_relationships');
    assert.ok(routeDiag);
    assert.ok(routeDiag.navigationTarget);
    assert.strictEqual(routeDiag.navigationTarget.entityId, 'src/routes/items.ts#route#GET /api/items#15');
    assert.strictEqual(routeDiag.navigationTarget.line, 15);
    assert.strictEqual(routeDiag.navigationTarget.tab, 'graph');
  });

  /* ==============================================================================
     4. Repository switching clears previous repository's diagnostics
     ============================================================================== */
  test('4. Repository switching invalidates previous diagnostics and prevents cross-repo pollution', async () => {
    const sample = await localProjectStore.getProject('sample-ecommerce-api');
    assert.ok(sample);

    const reportSample = deriveAnalysisQuality(sample);
    const initialDiagCount = reportSample.diagnostics.length;

    // Switch to another project
    const otherRepo: ProjectAnalysis = {
      projectId: 'other-repo-clean',
      projectName: 'Other Clean Repo',
      analyzedAt: '2026-10-12T11:00:00Z',
      version: '1.0.0',
      stats: {
        totalFiles: 1,
        totalLines: 10,
        languages: ['TypeScript'],
        totalSymbols: 1,
        totalRelationships: 1,
        unresolvedCalls: 0,
        routesCount: 0,
        dbQueriesCount: 0,
        mostConnected: [],
      },
      entities: {
        'src/index.ts#function#hello#1': {
          id: 'src/index.ts#function#hello#1',
          name: 'hello',
          kind: 'function',
          filePath: 'src/index.ts',
          location: { filePath: 'src/index.ts', startLine: 1, endLine: 5, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [
        {
          id: 'rel-1',
          sourceId: 'src/index.ts#function#hello#1',
          targetId: 'src/index.ts#function#hello#1',
          kind: 'calls',
          confidence: 'locally_established',
        },
      ],
      files: {
        'src/index.ts': {
          path: 'src/index.ts',
          content: 'export function hello() {}',
          lines: 10,
          size: 100,
          language: 'typescript',
        },
      },
      warnings: [],
      limitations: [],
      skippedFiles: [],
    };

    const reportOther = deriveAnalysisQuality(otherRepo);
    assert.strictEqual(reportOther.diagnostics.length, 0);
    assert.strictEqual(reportOther.status, 'complete');

    // Switch back to sample: returns consistent sample report
    const reportBack = deriveAnalysisQuality(sample);
    assert.strictEqual(reportBack.diagnostics.length, initialDiagCount);
  });

  /* ==============================================================================
     5. Partial-analysis warnings remain visible
     ============================================================================== */
  test('5. Partial-analysis status and caveats remain clearly exposed in the quality report', () => {
    const partialProject: ProjectAnalysis = {
      projectId: 'partial-proj',
      projectName: 'Partial Project',
      analyzedAt: '2026-10-12T10:00:00Z',
      version: '1.0.0',
      isPartial: true,
      partialReason: 'GitHub API truncated repository tree at 1,000 files.',
      stats: {
        totalFiles: 10,
        totalLines: 500,
        languages: ['TypeScript'],
        totalSymbols: 15,
        totalRelationships: 10,
        unresolvedCalls: 2,
        routesCount: 1,
        dbQueriesCount: 0,
        mostConnected: [],
      },
      entities: {},
      relationships: [],
      files: {},
      warnings: [],
      limitations: [],
      skippedFiles: [{ path: 'dist/app.js', reason: 'Build bundle excluded' }],
    };

    const quality = deriveAnalysisQuality(partialProject);
    assert.strictEqual(quality.status, 'partial');
    assert.ok(quality.statusCaveats.length > 0);
    const partialDiag = quality.diagnostics.find((d) => d.category === 'partial_analysis');
    assert.ok(partialDiag);
    assert.ok(partialDiag.description.includes('truncated'));
  });

  /* ==============================================================================
     6. Feature Map caveats correspond to the current analysis
     ============================================================================== */
  test('6. Feature Map derives caveats when supporting files encounter analysis errors', () => {
    const analysisWithError: ProjectAnalysis = {
      projectId: 'feat-err-test',
      projectName: 'Feature Error Test',
      analyzedAt: '2026-10-12T10:00:00Z',
      version: '1.0.0',
      stats: {
        totalFiles: 2,
        totalLines: 60,
        languages: ['TypeScript'],
        totalSymbols: 2,
        totalRelationships: 1,
        unresolvedCalls: 0,
        routesCount: 1,
        dbQueriesCount: 0,
        mostConnected: [],
      },
      entities: {
        'src/routes/payment.ts#route#POST /api/pay#5': {
          id: 'src/routes/payment.ts#route#POST /api/pay#5',
          name: 'POST /api/pay',
          kind: 'route',
          filePath: 'src/routes/payment.ts',
          location: { filePath: 'src/routes/payment.ts', startLine: 5, endLine: 5, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/pay' },
        },
        'src/handlers/payHandler.ts#function#payHandler#10': {
          id: 'src/handlers/payHandler.ts#function#payHandler#10',
          name: 'payHandler',
          kind: 'function',
          filePath: 'src/handlers/payHandler.ts',
          location: { filePath: 'src/handlers/payHandler.ts', startLine: 10, endLine: 20, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [
        {
          id: 'rel-pay-1',
          sourceId: 'src/routes/payment.ts#route#POST /api/pay#5',
          targetId: 'src/handlers/payHandler.ts#function#payHandler#10',
          kind: 'routes_to',
          confidence: 'statically_resolved',
        },
      ],
      files: {
        'src/routes/payment.ts': {
          path: 'src/routes/payment.ts',
          content: 'export const route = "/api/pay";',
          lines: 20,
          size: 400,
          language: 'typescript',
        },
        'src/handlers/payHandler.ts': {
          path: 'src/handlers/payHandler.ts',
          content: 'export function payHandler() {}',
          lines: 40,
          size: 600,
          language: 'typescript',
        },
      },
      warnings: [
        {
          filePath: 'src/handlers/payHandler.ts',
          line: 12,
          message: 'Failed to parse AST: Syntax error at line 12',
          severity: 'error',
        },
      ],
      limitations: [],
      skippedFiles: [],
    };

    const features = inferFeatureMap(analysisWithError);
    assert.strictEqual(features.length, 1);
    const payFeature = features[0];
    assert.ok(payFeature.trustExplanation);
    assert.strictEqual(payFeature.trustExplanation.hasIncompleteAnalysis, true);
    assert.ok(payFeature.caveats && payFeature.caveats.length > 0);
    assert.ok(payFeature.caveats.some((c) => c.includes('AST parsing errors occurred in supporting file')));
  });
});
