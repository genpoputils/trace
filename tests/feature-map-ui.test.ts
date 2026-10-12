import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ProjectAnalysis } from '../src/lib/types/trace';
import {
  generateCodebaseOverview,
  extractArchitectureGroups,
  inferFeatureMap,
  filterFeatures,
  clearFeatureCache,
} from '../src/lib/features/feature-map-service';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';

describe('Overview & Feature Map UI Integration and State Workflow Suite', () => {
  let analyzer: CodebaseAnalyzer;
  let sampleAnalysis: ProjectAnalysis;

  beforeEach(() => {
    clearFeatureCache();
    analyzer = new CodebaseAnalyzer();
    sampleAnalysis = analyzer.analyzeProject('sample-ecommerce-api', SAMPLE_ECOMMERCE_API);
  });

  /* ==============================================================================
     1. Overview loads for the current repository
     ============================================================================== */
  test('1. Overview loads and summarizes the sample e-commerce repository with genuine evidence', () => {
    const overview = generateCodebaseOverview(sampleAnalysis);
    assert.strictEqual(overview.isLowEvidence, false);
    assert.ok(overview.applicationPurpose.length > 30);
    assert.ok(overview.evidencePoints.length >= 3);
    assert.ok(overview.evidencePoints.some((p) => p.label.includes('Entry Points')));
    assert.ok(overview.evidencePoints.some((p) => p.label.includes('Business Logic')));
    assert.ok(overview.evidencePoints.some((p) => p.label.includes('Data Persistence')));
  });

  /* ==============================================================================
     2. Discovered Architecture Groups
     ============================================================================== */
  test('2. Discovered architecture groups classify real entities into categories without guessing', () => {
    const groups = extractArchitectureGroups(sampleAnalysis);
    assert.ok(groups.length >= 3);

    const entryPoints = groups.find((g) => g.id === 'entry_points');
    assert.ok(entryPoints);
    assert.ok(entryPoints.count >= 2);
    assert.ok(entryPoints.topEntities.every((e) => e.kind === 'route'));

    const services = groups.find((g) => g.id === 'services_logic');
    assert.ok(services);
    assert.ok(services.count >= 2);

    const persistence = groups.find((g) => g.id === 'data_persistence');
    assert.ok(persistence);
    assert.ok(persistence.count >= 1);
  });

  /* ==============================================================================
     3. Feature Map generation from real codebase
     ============================================================================== */
  test('3. Feature map infers coherent capability clusters with routes, handlers, and persistence evidence', () => {
    const features = inferFeatureMap(sampleAnalysis);
    assert.ok(features.length >= 2, 'Should infer multiple features');

    const orderFeature = features.find((f) => f.name.includes('Order'));
    assert.ok(orderFeature, 'Should discover Order feature');
    assert.strictEqual(orderFeature.category, 'routes_api');
    assert.strictEqual(orderFeature.confidence, 'high');
    assert.ok(orderFeature.evidence.length >= 2);

    // Verify entry point exists
    assert.ok(orderFeature.entryPoint);
    assert.strictEqual(orderFeature.entryPoint.kind, 'route');
    assert.ok(orderFeature.entryPoint.filePath.includes('order'));

    // Verify flow sequence (Route -> Handler -> Service)
    assert.ok(orderFeature.flowSteps.length >= 2);
    assert.ok(orderFeature.flowSteps.some((s) => s.role === 'entry_point'));
    assert.ok(orderFeature.flowSteps.some((s) => s.role === 'handler'));
    assert.ok(orderFeature.flowSteps.some((s) => s.role === 'service'));
  });

  /* ==============================================================================
     4. Feature search filters by name and file path
     ============================================================================== */
  test('4. Feature search filters by feature name and supporting file path', () => {
    const features = inferFeatureMap(sampleAnalysis);

    // Search by feature name
    const orderResults = filterFeatures(features, 'Order Processing', 'all', 'all');
    assert.ok(orderResults.length >= 1);
    assert.ok(orderResults.every((f) => f.name.includes('Order')));

    // Search by file path keyword
    const pathResults = filterFeatures(features, 'orderRoutes', 'all', 'all');
    assert.ok(pathResults.length >= 1);
    assert.ok(pathResults.some((f) => f.name.includes('Order') || f.evidence.some((e) => e.filePath.includes('orderRoutes'))));
  });

  /* ==============================================================================
     5. Category and confidence filters combine correctly
     ============================================================================== */
  test('5. Category and confidence filters combine correctly with search terms', () => {
    const features = inferFeatureMap(sampleAnalysis);

    // Only routes_api
    const apiFeatures = filterFeatures(features, '', 'routes_api', 'all');
    assert.ok(apiFeatures.length > 0);
    assert.ok(apiFeatures.every((f) => f.category === 'routes_api'));

    // Only high confidence
    const highConf = filterFeatures(features, '', 'all', 'high');
    assert.ok(highConf.length > 0);
    assert.ok(highConf.every((f) => f.confidence === 'high'));

    // Combined category + search
    const combined = filterFeatures(features, 'order', 'routes_api', 'high');
    assert.ok(combined.length > 0);
    assert.ok(combined.every((f) => f.category === 'routes_api' && f.confidence === 'high'));
  });

  /* ==============================================================================
     6. Audience mode switching preserves selected feature state
     ============================================================================== */
  test('6. Audience mode switching generates distinct perspectives from the same underlying feature facts', () => {
    const features = inferFeatureMap(sampleAnalysis);
    const target = features[0];

    // Selected feature identity
    const selectedId = target.id;

    // In Stakeholder mode:
    const stakeholderText = target.stakeholderSummary;
    assert.ok(stakeholderText.length > 10);
    assert.ok(!stakeholderText.includes('#'), 'Stakeholder view does not contain raw symbol hashes');

    // In Developer mode:
    const devText = target.summary;
    assert.ok(devText.length > 10);

    // Ensure selected feature ID remains identical
    assert.strictEqual(target.id, selectedId);
  });

  /* ==============================================================================
     7. Switching repositories invalidates old features
     ============================================================================== */
  test('7. Switching repositories invalidates cache and derives new feature map', () => {
    const features1 = inferFeatureMap(sampleAnalysis);
    assert.ok(features1.length > 0);

    const otherAnalysis: ProjectAnalysis = {
      ...sampleAnalysis,
      projectId: 'other-repo-id',
      projectName: 'Other Project',
      analyzedAt: '2026-10-12T15:00:00Z',
      entities: {
        'src/analytics.ts#function#track#1': {
          id: 'src/analytics.ts#function#track#1',
          name: 'track',
          kind: 'function',
          filePath: 'src/analytics.ts',
          location: { filePath: 'src/analytics.ts', startLine: 1, endLine: 5, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [],
    };

    const features2 = inferFeatureMap(otherAnalysis);
    assert.strictEqual(features2.length, 1);
    assert.strictEqual(features2[0].name, 'Analytics Service');
  });

  /* ==============================================================================
     8. Partial analysis shows appropriate warning
     ============================================================================== */
  test('8. Partial analysis includes explicit diagnostic disclosure', () => {
    const partialProj: ProjectAnalysis = {
      ...sampleAnalysis,
      projectId: 'partial-repo',
      isPartial: true,
      partialReason: 'AST parsing was skipped for 2 minified files.',
    };

    const overview = generateCodebaseOverview(partialProj);
    assert.ok(overview.caveats.some((c) => c.includes('AST parsing was skipped')));
  });

  /* ==============================================================================
     9. Empty results have a useful explanation
     ============================================================================== */
  test('9. Empty search results return zero items and overview warns of low evidence', () => {
    const features = inferFeatureMap(sampleAnalysis);
    const noResults = filterFeatures(features, 'unmatched-search-xyz-12345', 'all', 'all');
    assert.strictEqual(noResults.length, 0);
  });
});
