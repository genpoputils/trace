import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { AIInvestigatorService } from '../src/lib/ai/investigator-service';
import { SearchService } from '../src/lib/search/search-service';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';

describe('AI Investigator & Search Engine Test Suite', () => {
  const analyzer = new CodebaseAnalyzer();
  const analysis = analyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);
  const investigator = new AIInvestigatorService(analysis);
  const searchService = new SearchService(analysis);

  test('AIInvestigator provides grounded answers citing source locations without external API', async () => {
    const serviceFn = Object.values(analysis.entities).find((e) => e.name === 'createOrder');
    assert.ok(serviceFn);

    const result = await investigator.investigate('Explain how this function works', serviceFn.id);

    assert.strictEqual(result.provider, 'deterministic_offline');
    assert.strictEqual(result.confidence, 'high');
    assert.ok(result.groundedFiles.includes('src/services/orderService.ts'), 'Cites source file');
    assert.ok(result.answer.includes('Component Analysis: `createOrder`'), 'Includes component analysis');
    assert.ok(result.answer.includes('Callers'), 'Details callers');
    assert.ok(result.answer.includes('Outbound Calls'), 'Details outbound calls');
  });

  test('AIInvestigator answers impact and execution path questions with factual evidence', async () => {
    const serviceFn = Object.values(analysis.entities).find((e) => e.name === 'createOrder');
    assert.ok(serviceFn);

    const impactRes = await investigator.investigate('What breaks if I change this function?', serviceFn.id);
    assert.ok(impactRes.answer.includes('Change Impact Analysis'), 'Generates impact analysis');
    assert.ok(impactRes.answer.includes('Blast Radius Severity'), 'Includes blast radius');

    const traceRes = await investigator.investigate('Trace the execution path for createOrder', serviceFn.id);
    assert.ok(traceRes.answer.includes('Execution Path'), 'Generates execution path');
  });

  test('SearchService finds functions, routes, and files with scoring', () => {
    const results = searchService.search({ term: 'order' });
    assert.ok(results.length > 0, 'Found search results for order');

    const names = results.map((r) => r.entity.name);
    assert.ok(names.includes('createOrder') || names.includes('createOrderHandler'), 'Found order functions');

    // Search for HTTP route
    const routeResults = searchService.search({ term: 'POST' });
    assert.ok(routeResults.length > 0, 'Found route matching POST');
  });
});
