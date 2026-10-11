import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TypeScriptAdapter } from '../src/lib/analyzer/typescript-adapter';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { ExecutionPathEngine } from '../src/lib/tracing/execution-path';
import { DataFlowEngine } from '../src/lib/dataflow/dataflow';
import { ImpactAnalysisService } from '../src/lib/impact/impact-analysis';
import { ZipIngestionService } from '../src/lib/ingestion/zip-ingestion';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';
import JSZip from 'jszip';

describe('GenPopUtils Trace - Analysis Engine Test Suite', () => {
  const tsAdapter = new TypeScriptAdapter();
  const codebaseAnalyzer = new CodebaseAnalyzer();

  test('TypeScriptAdapter parses functions, parameters, and Prisma DB operations', () => {
    const file = SAMPLE_ECOMMERCE_API['src/services/orderService.ts'];
    assert.ok(file, 'orderService.ts fixture exists');

    const output = tsAdapter.analyzeFile(file);

    // Should find createOrder and getOrderById
    const createOrderFn = output.entities.find((e) => e.name === 'createOrder');
    assert.ok(createOrderFn, 'Found createOrder function');
    assert.strictEqual(createOrderFn.kind, 'function');
    assert.strictEqual(createOrderFn.isExported, true);
    assert.ok(createOrderFn.parameters, 'createOrder has parameters');
    assert.strictEqual(createOrderFn.parameters[0].name, 'input');

    // Should find Prisma db query
    const prismaCreate = output.entities.find((e) => e.name === 'prisma.order.create');
    assert.ok(prismaCreate, 'Found prisma.order.create query entity');
    assert.strictEqual(prismaCreate.kind, 'db_query');
    assert.strictEqual(prismaCreate.metadata?.dbModel, 'order');
    assert.strictEqual(prismaCreate.metadata?.dbOperation, 'create');
  });

  test('CodebaseAnalyzer resolves cross-module calls and routes', () => {
    const analysis = codebaseAnalyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);

    assert.ok(analysis.stats.totalFiles > 5, 'Analyzed multiple files');
    assert.ok(analysis.stats.totalSymbols > 15, 'Extracted symbols');
    assert.ok(analysis.stats.totalRelationships > 10, 'Created relationships');

    // Check that createOrderHandler calls createOrder across modules
    const handler = Object.values(analysis.entities).find((e) => e.name === 'createOrderHandler');
    const serviceFn = Object.values(analysis.entities).find((e) => e.name === 'createOrder');
    assert.ok(handler, 'Found createOrderHandler');
    assert.ok(serviceFn, 'Found createOrder service');

    const crossCall = analysis.relationships.find(
      (r) => r.sourceId === handler.id && r.targetId === serviceFn.id
    );
    assert.ok(crossCall, 'Cross-module call from controller to service is statically resolved');
    assert.strictEqual(crossCall.confidence, 'statically_resolved');

    // Check centrality metrics
    assert.ok(analysis.stats.mostConnected.length > 0, 'Computed centrality');
  });

  test('ExecutionPathEngine traverses forward calls and backward entry points', () => {
    const analysis = codebaseAnalyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);
    const pathEngine = new ExecutionPathEngine(analysis);

    const handler = Object.values(analysis.entities).find((e) => e.name === 'createOrderHandler');
    assert.ok(handler);

    // Forward trace from handler
    const forwardTrace = pathEngine.tracePath(handler.id, { direction: 'forward' });
    assert.strictEqual(forwardTrace.direction, 'forward');
    assert.ok(forwardTrace.totalSteps >= 3, 'Forward trace discovered multi-step execution path');

    const stepNames = forwardTrace.steps.map((s) => s.entityName);
    assert.ok(stepNames.includes('createOrder'), 'Trace reaches createOrder');

    // Backward trace from DB query
    const dbQuery = Object.values(analysis.entities).find((e) => e.name === 'prisma.order.create');
    assert.ok(dbQuery);

    const backwardTrace = pathEngine.tracePath(dbQuery.id, { direction: 'backward' });
    assert.strictEqual(backwardTrace.direction, 'backward');
    assert.ok(backwardTrace.steps.length >= 2, 'Backward trace reaches callers of DB query');
  });

  test('DataFlowEngine tracks values from parameter to database sink', () => {
    const analysis = codebaseAnalyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);
    const dataFlowEngine = new DataFlowEngine(analysis);

    const serviceFn = Object.values(analysis.entities).find((e) => e.name === 'createOrder');
    assert.ok(serviceFn);

    const dfTrace = dataFlowEngine.traceDataFlow(serviceFn.id);
    assert.strictEqual(dfTrace.rootSymbol, 'input');
    assert.ok(dfTrace.steps.length >= 2, 'Data flow tracks propagation steps');
    assert.ok(dfTrace.limitations.length > 0, 'Reports analysis limitations transparently');
  });

  test('ImpactAnalysisService identifies direct callers, routes, tests, and blast radius', () => {
    const analysis = codebaseAnalyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);
    const impactService = new ImpactAnalysisService(analysis);

    const serviceFn = Object.values(analysis.entities).find((e) => e.name === 'createOrder');
    assert.ok(serviceFn);

    const report = impactService.analyzeImpact(serviceFn.id);
    assert.ok(report.directImpacts.length > 0, 'Discovered direct callers');
    assert.ok(report.blastRadiusScore > 0, 'Computed blast radius score');
    assert.ok(['low', 'medium', 'high', 'critical'].includes(report.overallSeverity));

    // Should detect that tests/order.test.ts is an affected test
    const testImpact = report.affectedTests.find((t) => t.filePath.includes('order.test.ts'));
    assert.ok(testImpact, 'Recognized tests/order.test.ts as affected test suite');
  });

  test('ZipIngestionService protects against path traversal and extracts files', async () => {
    const zipService = new ZipIngestionService();

    // Verify security checks
    assert.strictEqual(zipService.isPathSafe('../../etc/passwd'), false, 'Rejects directory traversal');
    assert.strictEqual(zipService.isPathSafe('/etc/passwd'), false, 'Rejects absolute unix path');
    assert.strictEqual(zipService.isPathSafe('C:\\Windows\\System32'), false, 'Rejects absolute windows path');
    assert.strictEqual(zipService.isPathSafe('src/\0/file.ts'), false, 'Rejects null byte');
    assert.strictEqual(zipService.isPathSafe('src/components/Button.tsx'), true, 'Accepts valid path');

    // Create a mock zip with JSZip
    const zip = new JSZip();
    zip.file('src/index.ts', 'export const greeting = "hello";');
    zip.file('src/utils/math.ts', 'export function add(a: number, b: number) { return a + b; }');
    zip.file('node_modules/dep/index.js', 'console.log("ignore me");');
    zip.file('dist/bundle.js', 'console.log("ignore dist");');
    zip.file('logo.png', 'binary content');

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await zipService.ingestZip(zipBuffer, 'test-repo.zip');

    assert.ok(result.files['src/index.ts'], 'Extracted src/index.ts');
    assert.ok(result.files['src/utils/math.ts'], 'Extracted src/utils/math.ts');
    assert.strictEqual(result.files['node_modules/dep/index.js'], undefined, 'node_modules was excluded');
    assert.strictEqual(result.files['dist/bundle.js'], undefined, 'dist directory was excluded');
    assert.strictEqual(result.files['logo.png'], undefined, 'binary image was excluded');

    const skippedReasons = result.skippedFiles.map((s) => s.reason);
    assert.ok(
      skippedReasons.some((r) => r.includes('Excluded build or dependency directory')),
      'Excluded build directory recorded in skipped list'
    );
  });
});
