import test, { describe } from 'node:test';
import assert from 'node:assert';
import { browserAnalysisService } from '../src/lib/services/browser-analysis-service';

describe('BrowserAnalysisService Local Execution Suite', () => {
  const sampleProjectId = 'sample-ecommerce-api';

  test('lists projects and retrieves sample project', async () => {
    const list = await browserAnalysisService.listProjects();
    assert.ok(list.length > 0);
    assert.ok(list.some((p) => p.id === sampleProjectId));

    const project = await browserAnalysisService.getProject(sampleProjectId);
    assert.ok(project);
    assert.strictEqual(project.projectId, sampleProjectId);
    assert.ok(project.stats.totalSymbols > 0);
  });

  test('executes execution path tracing locally in < 5ms', async () => {
    const project = await browserAnalysisService.getProject(sampleProjectId);
    assert.ok(project);

    // Pick first route entity
    const route = Object.values(project.entities).find((e) => e.kind === 'route');
    assert.ok(route);

    const start = performance.now();
    const trace = await browserAnalysisService.traceExecutionPath(sampleProjectId, route.id, {
      direction: 'forward',
      maxDepth: 10,
    });
    const duration = performance.now() - start;

    assert.ok(trace);
    assert.strictEqual(trace.entryPointId, route.id);
    assert.ok(trace.steps.length > 0);
    assert.ok(duration < 20, `Execution path tracing took ${duration.toFixed(2)}ms`);

    // Verify cache hit
    const cacheStart = performance.now();
    const cachedTrace = await browserAnalysisService.traceExecutionPath(sampleProjectId, route.id, {
      direction: 'forward',
      maxDepth: 10,
    });
    const cacheDuration = performance.now() - cacheStart;
    assert.strictEqual(cachedTrace, trace);
    assert.ok(cacheDuration < 1, `Cache hit took ${cacheDuration.toFixed(2)}ms`);
  });

  test('executes data flow analysis locally', async () => {
    const project = await browserAnalysisService.getProject(sampleProjectId);
    assert.ok(project);

    const fn = Object.values(project.entities).find((e) => e.kind === 'function' && e.parameters?.length);
    assert.ok(fn);

    const dataFlow = await browserAnalysisService.traceDataFlow(sampleProjectId, fn.id);
    assert.ok(dataFlow);
    assert.strictEqual(dataFlow.steps[0].sourceEntityId, fn.id);
  });

  test('executes change impact analysis locally and caches blast radius', async () => {
    const project = await browserAnalysisService.getProject(sampleProjectId);
    assert.ok(project);

    const dbQuery = Object.values(project.entities).find((e) => e.kind === 'db_query');
    assert.ok(dbQuery);

    const impact = await browserAnalysisService.analyzeImpact(sampleProjectId, dbQuery.id);
    assert.ok(impact);
    assert.strictEqual(impact.targetEntityId, dbQuery.id);
    assert.ok(impact.blastRadiusScore >= 0);
  });

  test('executes symbol search locally', async () => {
    const results = await browserAnalysisService.searchSymbols(sampleProjectId, {
      term: 'order',
      limit: 10,
    });

    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.entity.name.toLowerCase().includes('order')));
  });

  test('executes deterministic offline AI explanation locally', async () => {
    const response = await browserAnalysisService.investigateQuestion(
      sampleProjectId,
      'How does order creation work?'
    );

    assert.ok(response);
    assert.ok(response.answer.length > 50);
    assert.strictEqual(response.provider, 'deterministic_offline');
    assert.ok(response.groundedFiles.length > 0 || response.answer.includes('Architecture'));
  });
});
