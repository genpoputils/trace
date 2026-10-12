import { test, describe } from 'node:test';
import assert from 'node:assert';
import { runBenchmark, benchmarkDagreLayout } from '../scripts/benchmark-analysis';

describe('GT-002: Analysis Stages & Graph Layout Benchmarking Suite', () => {
  test('Runs repeatable analysis benchmark on small, large, and stress repositories', () => {
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

    // Large repo checks (102 files)
    assert.ok(results.large.fileCount >= 100, 'Large repo has 100+ files');
    assert.ok(results.large.symbols >= 500, 'Large repo has 500+ symbols');
    assert.ok(results.large.relationships >= 250, 'Large repo has 250+ relationships');
    assert.ok(results.large.totalDurationMs < 5000, `Large repo completed in reasonable time (${results.large.totalDurationMs}ms)`);
    assert.ok(results.large.stages?.parsing !== undefined, 'Large repo parsing stage recorded');
    assert.ok(results.large.stages?.resolution !== undefined, 'Large repo resolution stage recorded');
    assert.ok(results.large.stages?.centrality !== undefined, 'Large repo centrality stage recorded');
    assert.ok(results.large.stages?.dependencies !== undefined, 'Large repo dependencies stage recorded');

    // Stress repo checks (350+ files)
    assert.ok(results.stress.fileCount >= 350, 'Stress repo has 350+ files');
    assert.ok(results.stress.symbols >= 1500, 'Stress repo has 1500+ symbols');
    assert.ok(results.stress.relationships >= 500, 'Stress repo has 500+ relationships');
    assert.ok(results.stress.totalDurationMs < 10000, `Stress repo completed in reasonable time (${results.stress.totalDurationMs}ms)`);
    assert.ok(results.stress.stages?.parsing !== undefined, 'Stress repo parsing stage recorded');
    assert.ok(results.stress.stages?.resolution !== undefined, 'Stress repo resolution stage recorded');
    assert.ok(results.stress.stages?.centrality !== undefined, 'Stress repo centrality stage recorded');
    assert.ok(results.stress.stages?.dependencies !== undefined, 'Stress repo dependencies stage recorded');
  });

  test('Measures Dagre hierarchical graph layout independently across scales', () => {
    const layout50 = benchmarkDagreLayout(50, 1.5);
    const layout300 = benchmarkDagreLayout(300, 2.0);

    assert.strictEqual(layout50.nodeCount, 50);
    assert.ok(layout50.layoutDurationMs >= 0);
    assert.strictEqual(layout300.nodeCount, 300);
    assert.ok(layout300.layoutDurationMs >= 0);
  });
});
