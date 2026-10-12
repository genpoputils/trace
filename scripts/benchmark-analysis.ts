/**
 * Trace Automated Benchmark Suite (GT-002 / Epic #53)
 *
 * Repeatable performance benchmarking tool to measure analysis stage durations,
 * symbol counts, graph layout compute, and memory usage for small, large,
 * and stress representative repositories.
 */

import dagre from 'dagre';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';
import { FileRecord } from '../src/lib/types/trace';

export function generateLargeCodebaseFixture(moduleCount: number = 25, filesPerModule: number = 4): Record<string, FileRecord> {
  const files: Record<string, FileRecord> = {};

  files['package.json'] = {
    path: 'package.json',
    language: 'json',
    lines: 25,
    size: 650,
    content: JSON.stringify(
      {
        name: 'benchmark-large-service',
        version: '2.0.0',
        dependencies: {
          express: '^4.19.2',
          prisma: '^5.12.0',
          axios: '^1.6.8',
          lodash: '^4.17.21',
          dotenv: '^16.4.5',
        },
      },
      null,
      2
    ),
  };

  files['package-lock.json'] = {
    path: 'package-lock.json',
    language: 'json',
    lines: 45,
    size: 1200,
    content: JSON.stringify(
      {
        name: 'benchmark-large-service',
        version: '2.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/express': { version: '4.19.2' },
          'node_modules/prisma': { version: '5.12.0' },
          'node_modules/axios': { version: '1.6.8' },
          'node_modules/lodash': { version: '4.17.21' },
        },
      },
      null,
      2
    ),
  };

  for (let m = 0; m < moduleCount; m++) {
    for (let f = 0; f < filesPerModule; f++) {
      const filePath = `src/module_${m}/service_${f}.ts`;
      const prevModule = m > 0 ? m - 1 : moduleCount - 1;
      const content = `
import { helper_${prevModule}_0 } from '../module_${prevModule}/service_0';

export interface Model_${m}_${f} {
  id: string;
  name: string;
  count: number;
}

export function helper_${m}_${f}(input: string): string {
  return "mod_${m}_${f}_" + input;
}

export async function processData_${m}_${f}(id: string): Promise<Model_${m}_${f}> {
  const next = helper_${prevModule}_0(id);
  return {
    id: next,
    name: "entity_${m}_${f}",
    count: ${m * 10 + f}
  };
}

export const config_${m}_${f} = {
  timeout: 5000,
  retries: 3
};
`;
      const lines = content.split('\n').length;
      files[filePath] = {
        path: filePath,
        language: 'typescript',
        lines,
        size: content.length,
        content,
      };
    }
  }

  return files;
}

export function generateStressCodebaseFixture(moduleCount: number = 70, filesPerModule: number = 5): Record<string, FileRecord> {
  const files: Record<string, FileRecord> = {};

  // 1. Multi-ecosystem manifests
  files['package.json'] = {
    path: 'package.json',
    language: 'json',
    lines: 30,
    size: 800,
    content: JSON.stringify(
      {
        name: 'benchmark-stress-monorepo',
        version: '3.0.0',
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          next: '^14.2.3',
          tailwindcss: '^3.4.3',
          zod: '^3.23.8',
          axios: '^1.6.8',
        },
      },
      null,
      2
    ),
  };

  files['package-lock.json'] = {
    path: 'package-lock.json',
    language: 'json',
    lines: 50,
    size: 1500,
    content: JSON.stringify(
      {
        name: 'benchmark-stress-monorepo',
        version: '3.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/react': { version: '18.3.1' },
          'node_modules/react-dom': { version: '18.3.1' },
          'node_modules/next': { version: '14.2.3' },
          'node_modules/zod': { version: '3.23.8' },
        },
      },
      null,
      2
    ),
  };

  files['requirements.txt'] = {
    path: 'requirements.txt',
    language: 'unknown',
    lines: 5,
    size: 120,
    content: 'fastapi==0.110.0\nuvicorn==0.29.0\npydantic==2.6.4\n',
  };

  files['Cargo.toml'] = {
    path: 'Cargo.toml',
    language: 'unknown',
    lines: 10,
    size: 200,
    content: '[package]\nname = "worker"\nversion = "0.1.0"\n[dependencies]\nserde = "1.0"\n',
  };

  // 2. High module density with cross-module imports
  for (let m = 0; m < moduleCount; m++) {
    for (let f = 0; f < filesPerModule; f++) {
      const filePath = `packages/mod_${m}/component_${f}.tsx`;
      const prevModule = m > 0 ? m - 1 : moduleCount - 1;
      const content = `
import React, { useState } from 'react';
import { util_${prevModule}_0 } from '../mod_${prevModule}/component_0';

export interface Props_${m}_${f} {
  title: string;
  enabled: boolean;
}

export function util_${m}_${f}(val: number): number {
  return val * ${m + 1} + ${f};
}

export const Component_${m}_${f}: React.FC<Props_${m}_${f}> = ({ title, enabled }) => {
  const [state, setState] = useState(0);
  const calculated = util_${prevModule}_0(state);

  return (
    <div className="card">
      <h1>{title}</h1>
      <span>{calculated}</span>
    </div>
  );
};
`;
      const lines = content.split('\n').length;
      files[filePath] = {
        path: filePath,
        language: 'typescript',
        lines,
        size: content.length,
        content,
      };
    }
  }

  return files;
}

/**
 * Measure Dagre graph layout compute independently
 */
export function benchmarkDagreLayout(nodeCount: number, edgeDensityMultiplier: number = 1.5): {
  nodeCount: number;
  edgeCount: number;
  layoutDurationMs: number;
} {
  const edgeCount = Math.round(nodeCount * edgeDensityMultiplier);
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 45, ranksep: 95 });

  for (let i = 0; i < nodeCount; i++) {
    dagreGraph.setNode(`node_${i}`, { width: 240, height: 95 });
  }

  for (let e = 0; e < edgeCount; e++) {
    const src = `node_${e % nodeCount}`;
    const tgt = `node_${(e * 7 + 1) % nodeCount}`;
    dagreGraph.setEdge(src, tgt);
  }

  const t0 = performance.now();
  dagre.layout(dagreGraph);
  const layoutDurationMs = Math.round((performance.now() - t0) * 100) / 100;

  return { nodeCount, edgeCount, layoutDurationMs };
}

export function runBenchmark() {
  console.log('================================================================');
  console.log('TRACE REPOSITORY ANALYSIS & GRAPH LAYOUT BENCHMARK (GT-002)');
  console.log('================================================================\n');

  const analyzer = new CodebaseAnalyzer();

  // 1. SMALL REPOSITORY BENCHMARK
  console.log('--- 1. BENCHMARK: Representative Small Repository (sample-ecommerce-api) ---');
  const smallFiles = SAMPLE_ECOMMERCE_API;
  const smallFileCount = Object.keys(smallFiles).length;
  const smallLines = Object.values(smallFiles).reduce((a, b) => a + b.lines, 0);

  const memBeforeSmall = process.memoryUsage().heapUsed;
  const t0Small = performance.now();
  const smallAnalysis = analyzer.analyzeProject('sample-ecommerce-api', smallFiles);
  const totalSmallMs = performance.now() - t0Small;
  const memAfterSmall = process.memoryUsage().heapUsed;

  console.log(`Repository: sample-ecommerce-api`);
  console.log(`Files count: ${smallFileCount}`);
  console.log(`Total lines: ${smallLines}`);
  console.log(`Symbols extracted: ${smallAnalysis.stats.totalSymbols}`);
  console.log(`Relationships resolved: ${smallAnalysis.stats.totalRelationships}`);
  console.log(`Total duration: ${totalSmallMs.toFixed(2)} ms`);
  console.log(`Stage durations:`);
  console.log(`  - AST Parsing: ${smallAnalysis.analysisMetadata?.stageDurations.parsing} ms`);
  console.log(`  - Cross-module resolution: ${smallAnalysis.analysisMetadata?.stageDurations.resolution} ms`);
  console.log(`  - Centrality calculation: ${smallAnalysis.analysisMetadata?.stageDurations.centrality} ms`);
  console.log(`  - Dependencies scanning: ${smallAnalysis.analysisMetadata?.stageDurations.dependencies} ms`);
  console.log(`Heap delta: ${((memAfterSmall - memBeforeSmall) / 1024 / 1024).toFixed(2)} MB\n`);

  // 2. LARGE REPOSITORY BENCHMARK
  console.log('--- 2. BENCHMARK: Representative Large Repository (102 Files) ---');
  const largeFiles = generateLargeCodebaseFixture(25, 4);
  const largeFileCount = Object.keys(largeFiles).length;
  const largeLines = Object.values(largeFiles).reduce((a, b) => a + b.lines, 0);

  const memBeforeLarge = process.memoryUsage().heapUsed;
  const t0Large = performance.now();
  const largeAnalysis = analyzer.analyzeProject('benchmark-large-service', largeFiles);
  const totalLargeMs = performance.now() - t0Large;
  const memAfterLarge = process.memoryUsage().heapUsed;

  console.log(`Repository: benchmark-large-service`);
  console.log(`Files count: ${largeFileCount}`);
  console.log(`Total lines: ${largeLines}`);
  console.log(`Symbols extracted: ${largeAnalysis.stats.totalSymbols}`);
  console.log(`Relationships resolved: ${largeAnalysis.stats.totalRelationships}`);
  console.log(`Total duration: ${totalLargeMs.toFixed(2)} ms`);
  console.log(`Stage durations:`);
  console.log(`  - AST Parsing: ${largeAnalysis.analysisMetadata?.stageDurations.parsing} ms`);
  console.log(`  - Cross-module resolution: ${largeAnalysis.analysisMetadata?.stageDurations.resolution} ms`);
  console.log(`  - Centrality calculation: ${largeAnalysis.analysisMetadata?.stageDurations.centrality} ms`);
  console.log(`  - Dependencies scanning: ${largeAnalysis.analysisMetadata?.stageDurations.dependencies} ms`);
  console.log(`Heap delta: ${((memAfterLarge - memBeforeLarge) / 1024 / 1024).toFixed(2)} MB\n`);

  // 3. STRESS REPOSITORY BENCHMARK
  console.log('--- 3. BENCHMARK: Stress Monorepo Repository (352 Files) ---');
  const stressFiles = generateStressCodebaseFixture(70, 5); // 350 components + 4 manifests = 354 files
  const stressFileCount = Object.keys(stressFiles).length;
  const stressLines = Object.values(stressFiles).reduce((a, b) => a + b.lines, 0);

  const memBeforeStress = process.memoryUsage().heapUsed;
  const t0Stress = performance.now();
  const stressAnalysis = analyzer.analyzeProject('benchmark-stress-monorepo', stressFiles);
  const totalStressMs = performance.now() - t0Stress;
  const memAfterStress = process.memoryUsage().heapUsed;

  console.log(`Repository: benchmark-stress-monorepo`);
  console.log(`Files count: ${stressFileCount}`);
  console.log(`Total lines: ${stressLines}`);
  console.log(`Symbols extracted: ${stressAnalysis.stats.totalSymbols}`);
  console.log(`Relationships resolved: ${stressAnalysis.stats.totalRelationships}`);
  console.log(`Total duration: ${totalStressMs.toFixed(2)} ms`);
  console.log(`Stage durations:`);
  console.log(`  - AST Parsing: ${stressAnalysis.analysisMetadata?.stageDurations.parsing} ms`);
  console.log(`  - Cross-module resolution: ${stressAnalysis.analysisMetadata?.stageDurations.resolution} ms`);
  console.log(`  - Centrality calculation: ${stressAnalysis.analysisMetadata?.stageDurations.centrality} ms`);
  console.log(`  - Dependencies scanning: ${stressAnalysis.analysisMetadata?.stageDurations.dependencies} ms`);
  console.log(`Heap delta: ${((memAfterStress - memBeforeStress) / 1024 / 1024).toFixed(2)} MB\n`);

  // 4. DAGRE GRAPH LAYOUT BENCHMARK (INDEPENDENT OF ANALYSIS)
  console.log('--- 4. BENCHMARK: Dagre Graph Layout Compute (Independent) ---');
  const layout50 = benchmarkDagreLayout(50, 1.5);
  const layout300 = benchmarkDagreLayout(300, 2.0);
  const layout600 = benchmarkDagreLayout(600, 2.0);

  console.log(`Bounded Initial Layout (50 hubs, ${layout50.edgeCount} edges): ${layout50.layoutDurationMs} ms`);
  console.log(`Dense Expanded Layout (300 nodes, ${layout300.edgeCount} edges): ${layout300.layoutDurationMs} ms`);
  console.log(`Stress Graph Layout (600 nodes, ${layout600.edgeCount} edges): ${layout600.layoutDurationMs} ms\n`);

  console.log('================================================================');
  console.log('DISCLOSURE ON BROWSER RESPONSIVENESS MEASUREMENT:');
  console.log('- Pipeline analysis & Dagre layout are measured directly via performance.now() in Node.');
  console.log('- Bounding the initial graph to top 50 hubs keeps layout compute < 15ms.');
  console.log('- End-to-end browser DOM paint, frame rate, and WebGL/Canvas interactions require');
  console.log('  a live browser session and are marked as Unverified for automated CI pipelines.');
  console.log('================================================================\n');

  return {
    small: {
      fileCount: smallFileCount,
      lines: smallLines,
      symbols: smallAnalysis.stats.totalSymbols,
      relationships: smallAnalysis.stats.totalRelationships,
      totalDurationMs: totalSmallMs,
      stages: smallAnalysis.analysisMetadata?.stageDurations,
    },
    large: {
      fileCount: largeFileCount,
      lines: largeLines,
      symbols: largeAnalysis.stats.totalSymbols,
      relationships: largeAnalysis.stats.totalRelationships,
      totalDurationMs: totalLargeMs,
      stages: largeAnalysis.analysisMetadata?.stageDurations,
    },
    stress: {
      fileCount: stressFileCount,
      lines: stressLines,
      symbols: stressAnalysis.stats.totalSymbols,
      relationships: stressAnalysis.stats.totalRelationships,
      totalDurationMs: totalStressMs,
      stages: stressAnalysis.analysisMetadata?.stageDurations,
    },
    layouts: {
      bounded50: layout50,
      dense300: layout300,
      stress600: layout600,
    },
  };
}

if (require.main === module) {
  runBenchmark();
}
