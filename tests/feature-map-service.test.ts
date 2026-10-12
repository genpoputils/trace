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

function createBaseAnalysis(overrides?: Partial<ProjectAnalysis>): ProjectAnalysis {
  return {
    projectId: 'test-project',
    projectName: 'Test Codebase',
    analyzedAt: '2026-10-12T12:00:00Z',
    version: '1.0.0',
    stats: {
      totalFiles: 5,
      totalLines: 200,
      languages: ['TypeScript'],
      totalSymbols: 10,
      totalRelationships: 8,
      unresolvedCalls: 0,
      routesCount: 2,
      dbQueriesCount: 1,
      mostConnected: [],
    },
    entities: {},
    relationships: [],
    files: {},
    warnings: [],
    limitations: [],
    ...overrides,
  };
}

describe('Feature Map & Codebase Overview Inference Engine Suite', () => {
  beforeEach(() => {
    clearFeatureCache();
  });
  /* ==============================================================================
     1. Route linked to a handler and service (Tier A, High Confidence)
     ============================================================================== */
  test('1. Route linked to a handler and service produces Tier A high confidence feature with execution flow', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
        'src/controllers/orderController.ts#function#createOrderHandler#5': {
          id: 'src/controllers/orderController.ts#function#createOrderHandler#5',
          name: 'createOrderHandler',
          kind: 'function',
          filePath: 'src/controllers/orderController.ts',
          location: { filePath: 'src/controllers/orderController.ts', startLine: 5, endLine: 15, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
        'src/services/orderService.ts#function#createOrder#20': {
          id: 'src/services/orderService.ts#function#createOrder#20',
          name: 'createOrder',
          kind: 'function',
          filePath: 'src/services/orderService.ts',
          location: { filePath: 'src/services/orderService.ts', startLine: 20, endLine: 35, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [
        {
          id: 'rel-1',
          sourceId: 'src/routes/order.ts#route#POST /api/orders#10',
          targetId: 'src/controllers/orderController.ts#function#createOrderHandler#5',
          kind: 'routes_to',
          confidence: 'statically_resolved',
        },
        {
          id: 'rel-2',
          sourceId: 'src/controllers/orderController.ts#function#createOrderHandler#5',
          targetId: 'src/services/orderService.ts#function#createOrder#20',
          kind: 'calls',
          confidence: 'statically_resolved',
        },
      ],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1);
    const orderFeature = features[0];
    assert.strictEqual(orderFeature.name, 'Order Processing');
    assert.strictEqual(orderFeature.category, 'routes_api');
    assert.strictEqual(orderFeature.confidence, 'high');
    assert.strictEqual(orderFeature.evidence.length, 3);
    assert.strictEqual(orderFeature.flowSteps.length, 3);
    assert.strictEqual(orderFeature.flowSteps[0].role, 'entry_point');
    assert.strictEqual(orderFeature.flowSteps[1].role, 'handler');
    assert.strictEqual(orderFeature.flowSteps[2].role, 'service');
  });

  /* ==============================================================================
     2. Multiple routes belonging to one corroborated capability are grouped
     ============================================================================== */
  test('2. Multiple routes sharing common resource prefix are grouped into one capability feature', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
        'src/routes/order.ts#route#GET /api/orders/:id#20': {
          id: 'src/routes/order.ts#route#GET /api/orders/:id#20',
          name: 'GET /api/orders/:id',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 20, endLine: 20, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'GET', routePath: '/api/orders/:id' },
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1, 'Should group /api/orders and /api/orders/:id into a single feature');
    assert.strictEqual(features[0].name, 'Order Processing');
    assert.strictEqual(features[0].evidence.length, 2);
  });

  /* ==============================================================================
     3. Two unrelated capability clusters that must remain separate
     ============================================================================== */
  test('3. Distinct resource endpoints remain separate features', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
        'src/routes/auth.ts#route#POST /api/auth/login#10': {
          id: 'src/routes/auth.ts#route#POST /api/auth/login#10',
          name: 'POST /api/auth/login',
          kind: 'route',
          filePath: 'src/routes/auth.ts',
          location: { filePath: 'src/routes/auth.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/auth/login' },
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 2);
    const names = features.map((f) => f.name).sort();
    assert.deepStrictEqual(names, ['Authentication & Access', 'Order Processing']);
  });

  /* ==============================================================================
     4. A shared service used by two features establishes relatedFeatureIds
     ============================================================================== */
  test('4. Shared service or data model creates cross-feature linkages in relatedFeatureIds', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
        'src/routes/checkout.ts#route#POST /api/checkout#10': {
          id: 'src/routes/checkout.ts#route#POST /api/checkout#10',
          name: 'POST /api/checkout',
          kind: 'route',
          filePath: 'src/routes/checkout.ts',
          location: { filePath: 'src/routes/checkout.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/checkout' },
        },
        'src/services/payment.ts#function#processPayment#1': {
          id: 'src/services/payment.ts#function#processPayment#1',
          name: 'processPayment',
          kind: 'function',
          filePath: 'src/services/payment.ts',
          location: { filePath: 'src/services/payment.ts', startLine: 1, endLine: 10, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [
        {
          id: 'rel-ord-pay',
          sourceId: 'src/routes/order.ts#route#POST /api/orders#10',
          targetId: 'src/services/payment.ts#function#processPayment#1',
          kind: 'calls',
          confidence: 'statically_resolved',
        },
        {
          id: 'rel-chk-pay',
          sourceId: 'src/routes/checkout.ts#route#POST /api/checkout#10',
          targetId: 'src/services/payment.ts#function#processPayment#1',
          kind: 'calls',
          confidence: 'statically_resolved',
        },
      ],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 2);
    const orderFeat = features.find((f) => f.name === 'Order Processing')!;
    const checkoutFeat = features.find((f) => f.name === 'Checkout & Payments')!;

    assert.ok(orderFeat.relatedFeatureIds.includes(checkoutFeat.id), 'Order feature links to Checkout');
    assert.ok(checkoutFeat.relatedFeatureIds.includes(orderFeat.id), 'Checkout feature links to Order');
  });

  /* ==============================================================================
     5. An isolated function with insufficient evidence produces Tier C low confidence
     ============================================================================== */
  test('5. Isolated function without corroborating calls produces low confidence candidate', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/utils/calc.ts#function#calculateTax#5': {
          id: 'src/utils/calc.ts#function#calculateTax#5',
          name: 'calculateTax',
          kind: 'function',
          filePath: 'src/utils/calc.ts',
          location: { filePath: 'src/utils/calc.ts', startLine: 5, endLine: 8, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1);
    assert.strictEqual(features[0].confidence, 'low');
    assert.strictEqual(features[0].category, 'services_logic');
  });

  /* ==============================================================================
     6. Missing routes and missing relationships handled gracefully
     ============================================================================== */
  test('6. Repository with UI components but no routes produces component feature with appropriate category', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/components/Header.tsx#component#Header#1': {
          id: 'src/components/Header.tsx#component#Header#1',
          name: 'Header',
          kind: 'component',
          filePath: 'src/components/Header.tsx',
          location: { filePath: 'src/components/Header.tsx', startLine: 1, endLine: 20, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
        'src/components/Header.tsx#hook#useTheme#25': {
          id: 'src/components/Header.tsx#hook#useTheme#25',
          name: 'useTheme',
          kind: 'hook',
          filePath: 'src/components/Header.tsx',
          location: { filePath: 'src/components/Header.tsx', startLine: 25, endLine: 35, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1);
    assert.strictEqual(features[0].category, 'components_ui');
    assert.strictEqual(features[0].name, 'Components Interface');
    assert.strictEqual(features[0].confidence, 'medium');
  });

  /* ==============================================================================
     7. Inferred versus statically resolved relationships preserves confidence distinction
     ============================================================================== */
  test('7. Preserves relationship confidence levels in flow steps and evidence', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/api.ts#route#GET /api/status#1': {
          id: 'src/routes/api.ts#route#GET /api/status#1',
          name: 'GET /api/status',
          kind: 'route',
          filePath: 'src/routes/api.ts',
          location: { filePath: 'src/routes/api.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 10 },
          isExported: true,
          metadata: { httpMethod: 'GET', routePath: '/api/status' },
        },
        'src/handlers.ts#function#statusHandler#5': {
          id: 'src/handlers.ts#function#statusHandler#5',
          name: 'statusHandler',
          kind: 'function',
          filePath: 'src/handlers.ts',
          location: { filePath: 'src/handlers.ts', startLine: 5, endLine: 10, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [
        {
          id: 'rel-inf',
          sourceId: 'src/routes/api.ts#route#GET /api/status#1',
          targetId: 'src/handlers.ts#function#statusHandler#5',
          kind: 'calls',
          confidence: 'inferred',
        },
      ],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1);
    const handlerEv = features[0].evidence.find((e) => e.entityId === 'src/handlers.ts#function#statusHandler#5');
    assert.strictEqual(handlerEv?.confidence, 'inferred');
  });

  /* ==============================================================================
     8. Duplicate candidate prevention
     ============================================================================== */
  test('8. Duplicate entities or overlapping files do not produce duplicate evidence items', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    const orderFeat = features[0];
    const uniqueIds = new Set(orderFeat.evidence.map((e) => e.entityId));
    assert.strictEqual(uniqueIds.size, orderFeat.evidence.length, 'No duplicate evidence IDs');
  });

  /* ==============================================================================
     9. Stable IDs for unchanged input
     ============================================================================== */
  test('9. Feature IDs and properties remain stable and reproducible across runs', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
      },
      relationships: [],
    });

    const run1 = inferFeatureMap(analysis);
    const run2 = inferFeatureMap(analysis);
    assert.strictEqual(run1[0].id, run2[0].id);
    assert.strictEqual(run1[0].name, run2[0].name);
  });

  /* ==============================================================================
     10. Partial analysis and unsupported-file limitations
     ============================================================================== */
  test('10. Partial analysis includes explicit diagnostic caveats in overview summary', () => {
    const analysis = createBaseAnalysis({
      isPartial: true,
      partialReason: 'Syntax error encountered in legacy file.',
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
      },
    });

    const overview = generateCodebaseOverview(analysis);
    assert.ok(overview.caveats.some((c) => c.includes('Syntax error encountered in legacy file.')));
  });

  /* ==============================================================================
     11. Missing source line numbers handled safely
     ============================================================================== */
  test('11. Entities with zero or missing line numbers are handled safely without crash', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/lib/ext.ts#function#externalSync#0': {
          id: 'src/lib/ext.ts#function#externalSync#0',
          name: 'externalSync',
          kind: 'function',
          filePath: 'src/lib/ext.ts',
          location: { filePath: 'src/lib/ext.ts', startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 },
          isExported: true,
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 1);
    assert.strictEqual(features[0].evidence[0].startLine, 0);
  });

  /* ==============================================================================
     12. Empty repository analysis produces neutral overview and empty feature list
     ============================================================================== */
  test('12. Empty repository analysis produces neutral overview and does not fabricate features', () => {
    const emptyAnalysis = createBaseAnalysis({
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
    });

    const overview = generateCodebaseOverview(emptyAnalysis);
    assert.strictEqual(overview.applicationPurpose, 'Trace has not found enough evidence to summarise this application yet.');
    assert.strictEqual(overview.isLowEvidence, true);

    const features = inferFeatureMap(emptyAnalysis);
    assert.strictEqual(features.length, 0);

    const archGroups = extractArchitectureGroups(emptyAnalysis);
    assert.strictEqual(archGroups.length, 0);
  });

  /* ==============================================================================
     13. Search and Filtering
     ============================================================================== */
  test('13. filterFeatures combines search query, category, and confidence correctly', () => {
    const analysis = createBaseAnalysis({
      entities: {
        'src/routes/order.ts#route#POST /api/orders#10': {
          id: 'src/routes/order.ts#route#POST /api/orders#10',
          name: 'POST /api/orders',
          kind: 'route',
          filePath: 'src/routes/order.ts',
          location: { filePath: 'src/routes/order.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/orders' },
        },
        'src/routes/auth.ts#route#POST /api/auth/login#10': {
          id: 'src/routes/auth.ts#route#POST /api/auth/login#10',
          name: 'POST /api/auth/login',
          kind: 'route',
          filePath: 'src/routes/auth.ts',
          location: { filePath: 'src/routes/auth.ts', startLine: 10, endLine: 10, startColumn: 1, endColumn: 20 },
          isExported: true,
          metadata: { httpMethod: 'POST', routePath: '/api/auth/login' },
        },
        'src/components/Header.tsx#component#Header#1': {
          id: 'src/components/Header.tsx#component#Header#1',
          name: 'Header',
          kind: 'component',
          filePath: 'src/components/Header.tsx',
          location: { filePath: 'src/components/Header.tsx', startLine: 1, endLine: 20, startColumn: 1, endColumn: 2 },
          isExported: true,
        },
      },
      relationships: [],
    });

    const features = inferFeatureMap(analysis);
    assert.strictEqual(features.length, 3);

    // Search by text "order"
    const orderResults = filterFeatures(features, 'order', 'all', 'all');
    assert.strictEqual(orderResults.length, 1);
    assert.strictEqual(orderResults[0].name, 'Order Processing');

    // Filter by category "components_ui"
    const uiResults = filterFeatures(features, '', 'components_ui', 'all');
    assert.strictEqual(uiResults.length, 1);
    assert.strictEqual(uiResults[0].category, 'components_ui');

    // Filter by non-existent query
    const emptyResults = filterFeatures(features, 'non-existent-keyword-xyz', 'all', 'all');
    assert.strictEqual(emptyResults.length, 0);
  });
});
