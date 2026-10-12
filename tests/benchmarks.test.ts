import { test, describe } from 'node:test';
import assert from 'node:assert';
import { runBenchmark } from '../scripts/benchmark-analysis';

describe('GT-002: Analysis Stages Benchmarking & Regression Suite', () => {
  test('Runs repeatable analysis benchmark on representative small and large repositories', () => {
    const results = runBenchmark();

    // Small repo checks
    assert.ok(results.small.fileCount > 0, 'Small repo has files');
    assert.ok(results.small.symbols > 0, 'Small repo has extracted symbols');
    assert.ok(results.small.relationships > 0, 'Small repo has relationships');
    assert.ok(results.small.totalDurationMs < 2000, `Small repo completed in reasonable time (${results.small.totalDurationMs}ms)`);
    assert.ok(results.small.stages?.parsing !== undefined, 'Parsing stage recorded');
    assert.ok(results.small.stages?.resolution !== undefined, 'Resolution stage recorded');
    assert.ok(results.small.stages?.centrality !== undefined, 'Centrality stage recorded');
    assert.ok(results.small.stages?.dependencies !== undefined, 'Dependencies stage recorded');

    // Large repo checks
    assert.ok(results.large.fileCount >= 100, 'Large repo has 100+ files');
    assert.ok(results.large.symbols >= 500, 'Large repo has 500+ symbols');
    assert.ok(results.large.relationships >= 250, 'Large repo has 250+ relationships');
    assert.ok(results.large.totalDurationMs < 5000, `Large repo completed in reasonable time (${results.large.totalDurationMs}ms)`);
    assert.ok(results.large.stages?.parsing !== undefined, 'Large repo parsing stage recorded');
    assert.ok(results.large.stages?.resolution !== undefined, 'Large repo resolution stage recorded');
    assert.ok(results.large.stages?.centrality !== undefined, 'Large repo centrality stage recorded');
    assert.ok(results.large.stages?.dependencies !== undefined, 'Large repo dependencies stage recorded');
  });
});
