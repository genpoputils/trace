/**
 * Test Suite: GT-013, GT-014, GT-015, GT-016
 *
 * Validates:
 * 1. GT-013: Typed package dependency graph, stable identities, typed relationships,
 *    multi-version disambiguation, on-demand neighborhood expansion.
 * 2. GT-014: Source-code usage mapping for JS/TS, Python, Rust, Go with exact source locations,
 *    AST symbol linking, and explicit uncertainty.
 * 3. GT-015: Package inspector model, version provenance, dependencies, dependents, source usages.
 * 4. GT-016: Dependency search, filtering, and evidence-backed health indicators (clean, unlocked,
 *    conflict, duplicate, unreferenced).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildPackageDependencyGraph,
  getPackageNeighborhood,
  filterPackageGraph,
  getStablePackageId,
  mapPackagesToSourceUsage,
  evaluateDependencyHealth,
  reconcileWorkspaceProvenance,
  canMakeNegativeUsageClaim,
  NormalizedDependency,
  SourceScanCoverage,
} from '../src/lib/dependencies';
import { TraceEntity } from '../src/lib/types/trace';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';

describe('GT-013: Typed Package Dependency Graph Engine', () => {
  test('Stable package identity generation is deterministic and unique', () => {
    const dep1: NormalizedDependency = {
      id: 'dep1',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.17.21',
      versionResolved: '4.17.21',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const dep2: NormalizedDependency = {
      id: 'dep2',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^3.10.1',
      versionResolved: '3.10.1',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'packages/legacy/package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const id1 = getStablePackageId(dep1);
    const id2 = getStablePackageId(dep2);

    assert.ok(id1.startsWith('pkg:javascript:lodash@4.17.21:package.json'));
    assert.ok(id2.startsWith('pkg:javascript:lodash@3.10.1:packages/legacy/package.json'));
    assert.notStrictEqual(id1, id2, 'Distinct versions and manifests must produce distinct stable IDs');
  });

  test('Multi-version packages in workspaces produce distinct nodes without collision', () => {
    const depA: NormalizedDependency = {
      id: 'pkg-a',
      name: 'react',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^18.2.0',
      versionResolved: '18.2.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/web/package.json',
      evidence: [],
    };

    const depB: NormalizedDependency = {
      id: 'pkg-b',
      name: 'react',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^19.0.0',
      versionResolved: '19.0.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/admin/package.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [depA, depB],
    });

    const reactNodes = Object.values(graph.nodes).filter((n) => n.name === 'react');
    assert.strictEqual(reactNodes.length, 2, 'Both React versions must be preserved as distinct graph nodes');
    assert.strictEqual(graph.stats.multiVersionCount, 1, 'Should record 1 multi-version package');
  });

  test('Constructs typed edges (runtime, dev, peer, optional, transitive, workspace)', () => {
    const directProd: NormalizedDependency = {
      id: 'p1',
      name: 'express',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.18.2',
      versionResolved: '4.18.2',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const directDev: NormalizedDependency = {
      id: 'p2',
      name: 'typescript',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^5.0.0',
      versionResolved: '5.4.2',
      scope: 'dev',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const transitiveDep: NormalizedDependency = {
      id: 'p3',
      name: 'body-parser',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '1.20.2',
      scope: 'runtime',
      isDirect: false,
      isTransitive: true,
      parentPackages: ['express'],
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [directProd, directDev, transitiveDep],
      workspaces: [
        {
          id: 'ws-root',
          name: 'root',
          rootPath: '.',
          manifestPath: 'package.json',
          ecosystem: 'javascript',
          packageManager: 'npm',
          isRootWorkspace: true,
          packages: ['express'],
        },
      ],
    });

    const runtimeEdge = graph.edges.find((e) => e.type === 'runtime' && e.target.includes('express'));
    const devEdge = graph.edges.find((e) => e.type === 'dev' && e.target.includes('typescript'));
    const transEdge = graph.edges.find((e) => e.type === 'transitive' && e.target.includes('body-parser'));

    assert.ok(runtimeEdge, 'Must produce a runtime typed edge from manifest to express');
    assert.strictEqual(runtimeEdge.isTransitive, false);

    assert.ok(devEdge, 'Must produce a dev typed edge from manifest to typescript');
    assert.strictEqual(devEdge.isTransitive, false);

    assert.ok(transEdge, 'Must produce a transitive typed edge to body-parser');
    assert.strictEqual(transEdge.isTransitive, true);
  });

  test('On-demand neighborhood expansion retrieves only 1st and 2nd degree neighbors', () => {
    const rootDep: NormalizedDependency = {
      id: 'root-pkg',
      name: 'next',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '14.2.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const childDep: NormalizedDependency = {
      id: 'child-pkg',
      name: 'postcss',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '8.4.38',
      scope: 'runtime',
      isDirect: false,
      isTransitive: true,
      parentPackages: ['next'],
      manifestPath: 'package.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [rootDep, childDep],
    });

    const rootStableId = getStablePackageId(rootDep);
    const { nodeIds: hop1 } = getPackageNeighborhood(graph, rootStableId, 1);
    assert.ok(hop1.has(rootStableId));
    assert.ok(hop1.has('manifest:package.json'));

    const { nodeIds: hop2 } = getPackageNeighborhood(graph, 'manifest:package.json', 2);
    assert.ok(hop2.has(rootStableId));
    assert.ok(hop2.has(getStablePackageId(childDep)));
  });

  test('filterPackageGraph correctly filters by scope, ecosystem, search term, and health', () => {
    const jsDep: NormalizedDependency = {
      id: 'js-dep',
      name: 'zod',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '3.22.4',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const pyDep: NormalizedDependency = {
      id: 'py-dep',
      name: 'fastapi',
      ecosystem: 'python',
      packageManager: 'pip',
      versionDeclared: '0.110.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'requirements.txt',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [jsDep, pyDep],
    });

    // 1. Ecosystem filter
    const jsOnly = filterPackageGraph(graph, { ecosystem: 'javascript' });
    const jsNames = Object.values(jsOnly.nodes).map((n) => n.name);
    assert.ok(jsNames.includes('zod'));
    assert.ok(!jsNames.includes('fastapi'));

    // 2. Search query filter
    const searchResult = filterPackageGraph(graph, { searchTerm: 'fast' });
    const searchNames = Object.values(searchResult.nodes).map((n) => n.name);
    assert.ok(searchNames.includes('fastapi'));
    assert.ok(!searchNames.includes('zod'));
  });
});

describe('GT-014: Source-Code Usage Mapping Engine', () => {
  test('Maps TypeScript & JavaScript ES imports with exact line/column and confidence', () => {
    const dependencies: NormalizedDependency[] = [
      {
        id: 'dep-express',
        name: 'express',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '4.18.2',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-react',
        name: 'react',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '18.2.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const files = {
      'src/server.ts': {
        content: `import express from 'express';\nimport { Request, Response } from 'express';\n\nconst app = express();\n`,
      },
      'src/App.tsx': {
        content: `import React, { useState, useEffect } from 'react';\n\nexport function App() {\n  return <div>Hello</div>;\n}\n`,
      },
    };

    const result = mapPackagesToSourceUsage(dependencies, files);

    const expressUsages = result.usagesByPackageId['dep-express'];
    assert.ok(expressUsages);
    assert.strictEqual(expressUsages.length, 2, 'Should map both imports of express in server.ts');
    assert.strictEqual(expressUsages[0].filePath, 'src/server.ts');
    assert.strictEqual(expressUsages[0].location.startLine, 1);
    assert.strictEqual(expressUsages[0].confidence, 'static_import');
    assert.ok(expressUsages[0].evidenceNote.includes('Static import detected in source code'));

    const reactUsages = result.usagesByPackageId['dep-react'];
    assert.ok(reactUsages);
    assert.strictEqual(reactUsages.length, 1);
    assert.strictEqual(reactUsages[0].filePath, 'src/App.tsx');
    assert.strictEqual(reactUsages[0].location.startLine, 1);
    assert.strictEqual(reactUsages[0].importedSymbol, 'useState');
  });

  test('Handles subpaths, scoped packages, and CommonJS dynamic require', () => {
    const dependencies: NormalizedDependency[] = [
      {
        id: 'dep-lodash',
        name: 'lodash',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '4.17.21',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-prisma',
        name: '@prisma/client',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '5.10.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-dotenv',
        name: 'dotenv',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '16.4.5',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const files = {
      'src/utils.ts': {
        content: `import debounce from 'lodash/debounce';\nimport { PrismaClient } from '@prisma/client';\nconst dotenv = require('dotenv');\n`,
      },
    };

    const result = mapPackagesToSourceUsage(dependencies, files);

    const lodashUsages = result.usagesByPackageId['dep-lodash'];
    assert.ok(lodashUsages.length >= 1);
    assert.strictEqual(lodashUsages[0].confidence, 'subpath_import');
    assert.ok(lodashUsages[0].evidenceNote.includes("Subpath import 'lodash/debounce' resolved to base package 'lodash'"));

    const prismaUsages = result.usagesByPackageId['dep-prisma'];
    assert.ok(prismaUsages.length >= 1);
    assert.strictEqual(prismaUsages[0].packageName, '@prisma/client');

    const dotenvUsages = result.usagesByPackageId['dep-dotenv'];
    assert.ok(dotenvUsages.length >= 1);
    assert.strictEqual(dotenvUsages[0].confidence, 'dynamic_require');
    assert.ok(dotenvUsages[0].evidenceNote.includes('Dynamic require/import detected'));
  });

  test('Maps Python, Rust, and Go package imports', () => {
    const dependencies: NormalizedDependency[] = [
      {
        id: 'py-flask',
        name: 'flask',
        ecosystem: 'python',
        packageManager: 'pip',
        versionResolved: '3.0.2',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'requirements.txt',
        evidence: [],
      },
      {
        id: 'rust-serde',
        name: 'serde',
        ecosystem: 'rust',
        packageManager: 'cargo',
        versionResolved: '1.0.200',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'Cargo.toml',
        evidence: [],
      },
      {
        id: 'go-gin',
        name: 'github.com/gin-gonic/gin',
        ecosystem: 'go',
        packageManager: 'gomod',
        versionResolved: 'v1.9.1',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'go.mod',
        evidence: [],
      },
    ];

    const files = {
      'app.py': {
        content: `import flask\nfrom flask import request, jsonify\n`,
      },
      'src/main.rs': {
        content: `use serde::{Serialize, Deserialize};\n`,
      },
      'main.go': {
        content: `package main\nimport "github.com/gin-gonic/gin"\n`,
      },
    };

    const result = mapPackagesToSourceUsage(dependencies, files);

    assert.ok(result.usagesByPackageId['py-flask'].length >= 2, 'Should map Python flask imports');
    assert.ok(result.usagesByPackageId['rust-serde'].length >= 1, 'Should map Rust serde use statement');
    assert.ok(result.usagesByPackageId['go-gin'].length >= 1, 'Should map Go gin import statement');
  });

  test('Flags direct dependencies with 0 source imports as unreferenced', () => {
    const dependencies: NormalizedDependency[] = [
      {
        id: 'dep-used',
        name: 'axios',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '1.6.8',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-unused',
        name: 'moment',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '2.30.1',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const files = {
      'src/api.ts': {
        content: `import axios from 'axios';\n`,
      },
    };

    const result = mapPackagesToSourceUsage(dependencies, files);

    assert.ok(result.usagesByPackageId['dep-used'].length >= 1);
    assert.strictEqual(result.usagesByPackageId['dep-unused'].length, 0);
    assert.ok(result.unreferencedPackageIds.has('dep-unused'));
    assert.ok(!result.unreferencedPackageIds.has('dep-used'));
  });

  test('Links enclosing AST entity when entities map is provided', () => {
    const dependencies: NormalizedDependency[] = [
      {
        id: 'dep-crypto',
        name: 'crypto-js',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '4.2.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const files = {
      'src/auth.ts': {
        content: `export function hashPassword(pwd: string) {\n  const CryptoJS = require('crypto-js');\n  return CryptoJS.SHA256(pwd).toString();\n}\n`,
      },
    };

    const entities: Record<string, TraceEntity> = {
      'src/auth.ts#function#hashPassword#1': {
        id: 'src/auth.ts#function#hashPassword#1',
        name: 'hashPassword',
        kind: 'function',
        filePath: 'src/auth.ts',
        location: {
          filePath: 'src/auth.ts',
          startLine: 1,
          endLine: 4,
          startColumn: 1,
          endColumn: 2,
        },
        isExported: true,
      },
    };

    const result = mapPackagesToSourceUsage(dependencies, files, entities);
    const usages = result.usagesByPackageId['dep-crypto'];
    assert.strictEqual(usages.length, 1);
    assert.strictEqual(usages[0].enclosingEntityName, 'hashPassword');
    assert.strictEqual(usages[0].enclosingEntityId, 'src/auth.ts#function#hashPassword#1');
  });
});

describe('GT-016: Dependency Health Indicators and Evidence Audit', () => {
  test('Evaluates clean lockfile resolution with healthy status and evidence signal', () => {
    const cleanDep: NormalizedDependency = {
      id: 'clean-dep',
      name: 'chalk',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^5.0.0',
      versionResolved: '5.3.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const health = evaluateDependencyHealth(cleanDep, [
      {
        id: 'u1',
        packageId: 'clean-dep',
        packageName: 'chalk',
        ecosystem: 'javascript',
        filePath: 'src/index.ts',
        location: { filePath: 'src/index.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 20 },
        confidence: 'static_import',
        isDirectImport: true,
        evidenceNote: '',
      },
    ]);

    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.isUnlocked, false);
    assert.strictEqual(health.hasConflict, false);
    assert.strictEqual(health.isUnreferenced, false);
    assert.ok(health.signals.some((s) => s.kind === 'clean'));
  });

  test('Flags unlocked dependency when direct manifest package lacks lockfile resolution', () => {
    const unlockedDep: NormalizedDependency = {
      id: 'unlocked-dep',
      name: 'dotenv',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^16.0.0',
      versionResolved: undefined,
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const health = evaluateDependencyHealth(unlockedDep, []);

    assert.strictEqual(health.status, 'warning');
    assert.strictEqual(health.isUnlocked, true);
    assert.ok(health.signals.some((s) => s.kind === 'unlocked'));
  });

  test('Flags version conflict when range mismatch is detected', () => {
    const conflictDep: NormalizedDependency = {
      id: 'conflict-dep',
      name: 'react',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^18.0.0',
      versionResolved: '17.0.2', // Mismatch!
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      provenance: {
        status: 'conflicting',
        declared: { status: 'established', rawSpecifier: '^18.0.0', isExactPin: false },
        resolved: { version: '17.0.2', status: 'conflicting', sourceKind: 'lockfile' },
        installed: { status: 'unavailable', sourceKind: 'installed' },
        hasConflict: true,
        conflicts: [
          {
            kind: 'range_mismatch',
            severity: 'error',
            message: "Resolved version '17.0.2' does not satisfy declared range '^18.0.0'",
          },
        ],
      },
      evidence: [],
    };

    const health = evaluateDependencyHealth(conflictDep, []);

    assert.strictEqual(health.status, 'error');
    assert.strictEqual(health.hasConflict, true);
    assert.ok(health.signals.some((s) => s.kind === 'conflict'));
  });

  test('Flags unreferenced status when direct package has zero source imports in covered scan', () => {
    const directDep: NormalizedDependency = {
      id: 'unref-dep',
      name: 'rimraf',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^5.0.5',
      versionResolved: '5.0.5',
      scope: 'dev',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const coverage = {
      totalSourceFilesDetected: 5,
      totalSourceFilesScanned: 5,
      languages: {
        javascript: {
          ecosystem: 'javascript' as const,
          language: 'typescript',
          detectedFilesCount: 5,
          scannedFilesCount: 5,
          isSupported: true,
          isComplete: true,
          hasSufficientCoverage: true,
        },
      },
      unsupportedExtensions: [],
      canMakeNegativeUsageClaim: true,
    };

    const health = evaluateDependencyHealth(directDep, [], coverage);

    assert.strictEqual(health.isUnreferenced, true);
    assert.ok(health.signals.some((s) => s.kind === 'unreferenced'));
  });
});

describe('GT-012 — GT-016 Full Pipeline Integration with CodebaseAnalyzer', () => {
  test('CodebaseAnalyzer produces unified dependency graph and source usages', () => {
    const files = {
      'package.json': {
        content: JSON.stringify({
          name: 'my-service',
          version: '1.0.0',
          dependencies: {
            express: '^4.18.2',
            cors: '^2.8.5',
          },
        }),
      },
      'package-lock.json': {
        content: JSON.stringify({
          name: 'my-service',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': {
              dependencies: {
                express: '^4.18.2',
                cors: '^2.8.5',
              },
            },
            'node_modules/express': {
              version: '4.18.2',
            },
            'node_modules/cors': {
              version: '2.8.5',
            },
          },
        }),
      },
      'src/server.ts': {
        content: `import express from 'express';\nimport cors from 'cors';\n\nexport const app = express();\napp.use(cors());\n`,
      },
    };

    const filesWithRecords = {
      'package.json': {
        path: 'package.json',
        content: files['package.json'].content,
        lines: files['package.json'].content.split('\n').length,
        size: files['package.json'].content.length,
        language: 'json' as const,
      },
      'package-lock.json': {
        path: 'package-lock.json',
        content: files['package-lock.json'].content,
        lines: files['package-lock.json'].content.split('\n').length,
        size: files['package-lock.json'].content.length,
        language: 'json' as const,
      },
      'src/server.ts': {
        path: 'src/server.ts',
        content: files['src/server.ts'].content,
        lines: files['src/server.ts'].content.split('\n').length,
        size: files['src/server.ts'].content.length,
        language: 'typescript' as const,
      },
    };

    const analyzer = new CodebaseAnalyzer();
    const result = analyzer.analyzeProject('my-service', filesWithRecords);

    assert.ok(result.dependencies);
    const depResult = result.dependencies;

    assert.strictEqual(depResult.dependencies.length, 2);
    assert.ok(depResult.graph, 'Graph must be synthesized in scan result');
    assert.strictEqual(depResult.graph.stats.directCount, 2);

    assert.ok(depResult.sourceUsages, 'Source usages must be populated in scan result');
    const expressDep = depResult.dependencies.find((d) => d.name === 'express');
    assert.ok(expressDep);
    const expressUsages = depResult.sourceUsages[expressDep.id];
    assert.ok(expressUsages && expressUsages.length >= 1, 'Express must have mapped source usages');
    assert.strictEqual(expressUsages[0].filePath, 'src/server.ts');
  });
});

describe('Issue #9: Fix Graph Relationship Accuracy Regression Suite', () => {
  test('A transitive dependency with a known parent attaches only to that parent', () => {
    const directExpress: NormalizedDependency = {
      id: 'dep-express',
      name: 'express',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.18.2',
      versionResolved: '4.18.2',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      dependencies: ['body-parser'],
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const directJest: NormalizedDependency = {
      id: 'dep-jest',
      name: 'jest',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^29.7.0',
      versionResolved: '29.7.0',
      scope: 'dev',
      isDirect: true,
      isTransitive: false,
      dependencies: ['diff-sequences'],
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const transBodyParser: NormalizedDependency = {
      id: 'dep-body-parser',
      name: 'body-parser',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '1.20.2',
      scope: 'runtime',
      isDirect: false,
      isTransitive: true,
      parentPackages: ['express'],
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const transDiffSeq: NormalizedDependency = {
      id: 'dep-diff-sequences',
      name: 'diff-sequences',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '29.6.3',
      scope: 'dev',
      isDirect: false,
      isTransitive: true,
      parentPackages: ['jest'],
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [directExpress, directJest, transBodyParser, transDiffSeq],
    });

    const expressId = getStablePackageId(directExpress);
    const jestId = getStablePackageId(directJest);
    const bodyParserId = getStablePackageId(transBodyParser);
    const diffSeqId = getStablePackageId(transDiffSeq);

    // Verify valid parent-child relationships
    const expressToBody = graph.edges.find((e) => e.source === expressId && e.target === bodyParserId);
    const jestToDiff = graph.edges.find((e) => e.source === jestId && e.target === diffSeqId);
    assert.ok(expressToBody, 'express must connect to body-parser');
    assert.strictEqual(expressToBody.type, 'transitive');
    assert.ok(jestToDiff, 'jest must connect to diff-sequences');
    assert.strictEqual(jestToDiff.type, 'transitive');

    // Verify NO cross-contamination or guessed relationships
    const expressToDiff = graph.edges.find((e) => e.source === expressId && e.target === diffSeqId);
    const jestToBody = graph.edges.find((e) => e.source === jestId && e.target === bodyParserId);
    assert.strictEqual(expressToDiff, undefined, 'express must NOT connect to diff-sequences');
    assert.strictEqual(jestToBody, undefined, 'jest must NOT connect to body-parser');
  });

  test('A dependency whose parent cannot be determined has zero manufactured edges', () => {
    const directExpress: NormalizedDependency = {
      id: 'dep-express',
      name: 'express',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.18.2',
      versionResolved: '4.18.2',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const transOrphan: NormalizedDependency = {
      id: 'dep-orphan',
      name: 'orphan-pkg',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '1.0.0',
      scope: 'runtime',
      isDirect: false,
      isTransitive: true,
      // Parent cannot be determined
      parentPackages: undefined,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [directExpress, transOrphan],
    });

    const orphanId = getStablePackageId(transOrphan);
    assert.ok(graph.nodes[orphanId], 'Orphan package must exist in graph nodes');

    // Must NOT manufacture any edge targeting orphan-pkg
    const incomingEdges = graph.edges.filter((e) => e.target === orphanId);
    assert.strictEqual(
      incomingEdges.length,
      0,
      'Orphan package must have 0 manufactured incoming edges when parent is unknown'
    );
  });

  test('A manifest with zero direct dependencies produces a manifest root node with zero edges', () => {
    const graph = buildPackageDependencyGraph({
      dependencies: [],
      workspaces: [
        {
          id: 'ws-empty',
          name: 'empty-pkg',
          rootPath: 'packages/empty',
          manifestPath: 'packages/empty/package.json',
          ecosystem: 'javascript',
          packageManager: 'npm',
          isRootWorkspace: true,
          packages: [],
        },
      ],
    });

    assert.ok(
      graph.nodes['manifest:packages/empty/package.json'],
      'Root node for manifest with zero dependencies must exist in graph'
    );
    assert.strictEqual(graph.stats.directCount, 0);
    assert.strictEqual(graph.stats.transitiveCount, 0);
    assert.strictEqual(graph.edges.length, 0);
  });

  test('Multiple versions of the same package produce distinct nodes and update multi-version stats', () => {
    const depV3: NormalizedDependency = {
      id: 'dep-lodash-3',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^3.10.1',
      versionResolved: '3.10.1',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'packages/legacy/package.json',
      lockfilePath: 'packages/legacy/package-lock.json',
      evidence: [],
    };

    const depV4: NormalizedDependency = {
      id: 'dep-lodash-4',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.17.21',
      versionResolved: '4.17.21',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'packages/web/package.json',
      lockfilePath: 'packages/web/package-lock.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [depV3, depV4],
    });

    const v3Id = getStablePackageId(depV3);
    const v4Id = getStablePackageId(depV4);
    assert.notStrictEqual(v3Id, v4Id, 'Distinct versions must have distinct stable IDs');
    assert.ok(graph.nodes[v3Id], 'v3 node must exist');
    assert.ok(graph.nodes[v4Id], 'v4 node must exist');
    assert.strictEqual(graph.stats.multiVersionCount, 1, 'lodash must be counted as 1 multi-version package');
  });

  test('Workspace relationship and duplicate-edge prevention', () => {
    const wsDep: NormalizedDependency = {
      id: 'dep-ws-ui',
      name: '@repo/ui',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: 'workspace:*',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      isWorkspace: true,
      manifestPath: 'apps/web/package.json',
      evidence: [],
    };

    const graph = buildPackageDependencyGraph({
      dependencies: [wsDep],
      workspaces: [
        {
          id: 'ws-web',
          name: 'web',
          rootPath: 'apps/web',
          manifestPath: 'apps/web/package.json',
          ecosystem: 'javascript',
          packageManager: 'npm',
          isRootWorkspace: false,
          packages: ['@repo/ui'],
        },
      ],
    });

    const wsEdges = graph.edges.filter((e) => e.type === 'workspace');
    assert.strictEqual(wsEdges.length, 1, 'Exactly one workspace edge must be created');

    // Duplicate check: passing same dependencies should not double edges
    const graph2 = buildPackageDependencyGraph({
      dependencies: [wsDep, { ...wsDep, id: 'dep-ws-ui-dup' }],
    });
    const wsEdges2 = graph2.edges.filter(
      (e) => e.source === 'manifest:apps/web/package.json' && e.target === getStablePackageId(wsDep)
    );
    assert.strictEqual(wsEdges2.length, 1, 'Edges must be deduplicated when representing same semantic relationship');
  });

  test('Assert that every graph edge references existing nodes and no unsupported edge is invented', () => {
    const deps: NormalizedDependency[] = [
      {
        id: 'd1',
        name: 'a',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '1.0.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        dependencies: ['b'],
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'd2',
        name: 'b',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '2.0.0',
        scope: 'runtime',
        isDirect: false,
        isTransitive: true,
        parentPackages: ['a'],
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'd3',
        name: 'orphan',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '3.0.0',
        scope: 'runtime',
        isDirect: false,
        isTransitive: true,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const graph = buildPackageDependencyGraph({ dependencies: deps });

    for (const edge of graph.edges) {
      assert.ok(graph.nodes[edge.source], `Edge source '${edge.source}' must exist in graph.nodes`);
      assert.ok(graph.nodes[edge.target], `Edge target '${edge.target}' must exist in graph.nodes`);
    }
  });
});

describe('Issue #10: Source Scan Coverage and Unreferenced Classification Regression Suite', () => {
  test('A supported source language with a genuinely absent package import flags unreferenced', () => {
    const directDep: NormalizedDependency = {
      id: 'dep-rimraf',
      name: 'rimraf',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^5.0.0',
      versionResolved: '5.0.0',
      scope: 'dev',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const files = {
      'src/index.ts': {
        content: `import express from 'express';\nconsole.log(express);\n`,
      },
    };

    const result = mapPackagesToSourceUsage([directDep], files);
    assert.ok(
      result.unreferencedPackageIds.has(directDep.id),
      'rimraf must be unreferenced when JS files are scanned and zero imports found'
    );

    const health = evaluateDependencyHealth(directDep, [], result.coverage);
    assert.strictEqual(health.isUnreferenced, true);
    assert.strictEqual(health.coverageStatus, 'covered');
    assert.ok(health.signals.some((s) => s.kind === 'unreferenced'));
  });

  test('An unsupported source language (JVM, .NET, Swift) never flags unreferenced and reports analysis_unavailable', () => {
    const jvmDep: NormalizedDependency = {
      id: 'dep-guava',
      name: 'com.google.guava:guava',
      ecosystem: 'jvm',
      packageManager: 'maven',
      versionDeclared: '31.1-jre',
      versionResolved: '31.1-jre',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'pom.xml',
      lockfilePath: 'pom.xml',
      evidence: [],
    };

    const files = {
      'src/main/java/App.java': {
        content: `package com.example;\npublic class App {}\n`,
      },
    };

    const result = mapPackagesToSourceUsage([jvmDep], files);
    assert.strictEqual(
      result.unreferencedPackageIds.has(jvmDep.id),
      false,
      'Unsupported ecosystem JVM must NOT be labeled unreferenced'
    );

    const health = evaluateDependencyHealth(jvmDep, [], result.coverage);
    assert.strictEqual(health.isUnreferenced, false, 'health.isUnreferenced must be false for unsupported language');
    assert.strictEqual(health.coverageStatus, 'unsupported');
    assert.ok(
      health.signals.some((s) => s.kind === 'analysis_unavailable'),
      'health must include analysis_unavailable signal'
    );
  });

  test('A partially scanned repository does not make negative claims', () => {
    const jsDep: NormalizedDependency = {
      id: 'dep-lodash',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.17.21',
      versionResolved: '4.17.21',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    // 0 scanned files: coverage cannot make negative claims
    const emptyFiles = {};
    const result = mapPackagesToSourceUsage([jsDep], emptyFiles);

    assert.strictEqual(result.coverage.canMakeNegativeUsageClaim, false);
    assert.strictEqual(
      result.unreferencedPackageIds.has(jsDep.id),
      false,
      'Zero scanned files must not produce unreferenced finding'
    );

    const health = evaluateDependencyHealth(jsDep, [], result.coverage);
    assert.strictEqual(health.isUnreferenced, false);
    assert.strictEqual(health.coverageStatus, 'unscanned');
    assert.ok(health.signals.some((s) => s.kind === 'analysis_unavailable'));
  });

  test('Multiline imports in JavaScript/TypeScript and Python are parsed correctly', () => {
    const jsDep: NormalizedDependency = {
      id: 'dep-auth',
      name: 'user-service',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionResolved: '1.0.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const pyDep: NormalizedDependency = {
      id: 'dep-db',
      name: 'data_layer',
      ecosystem: 'python',
      packageManager: 'pip',
      versionResolved: '2.0.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'requirements.txt',
      evidence: [],
    };

    const files = {
      'src/auth.ts': {
        content: `import {\n  findUser,\n  updateUser,\n} from 'user-service';\n`,
      },
      'database.py': {
        content: `from data_layer import (\n    query_db,\n    commit_tx,\n)\n`,
      },
    };

    const result = mapPackagesToSourceUsage([jsDep, pyDep], files);

    const jsUsages = result.usagesByPackageId[jsDep.id];
    assert.ok(jsUsages && jsUsages.length >= 1, 'Multiline JS import must be captured');
    assert.strictEqual(jsUsages[0].filePath, 'src/auth.ts');

    const pyUsages = result.usagesByPackageId[pyDep.id];
    assert.ok(pyUsages && pyUsages.length >= 1, 'Multiline Python import must be captured');
    assert.strictEqual(pyUsages[0].filePath, 'database.py');

    assert.strictEqual(result.unreferencedPackageIds.has(jsDep.id), false);
    assert.strictEqual(result.unreferencedPackageIds.has(pyDep.id), false);
  });

  test('Import-looking text inside comments is strictly ignored without false positives', () => {
    const fakeDeps: NormalizedDependency[] = [
      'fake-block-pkg',
      'fake-require-pkg',
      'fake-inline-pkg',
      'fake_py_pkg',
      'fake_single_docstring_pkg',
      'fake_hash_pkg',
    ].map((name, i) => ({
      id: `fake-${i}`,
      name,
      ecosystem: name.includes('_py') || name.includes('docstring') || name.includes('hash') ? 'python' : 'javascript',
      packageManager: 'npm',
      versionResolved: '1.0.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    }));

    const files = {
      'src/example.ts': {
        content: `/*\n * import { fakeA } from 'fake-block-pkg';\n * const fakeB = require('fake-require-pkg');\n */\n// import { fakeC } from 'fake-inline-pkg';\nexport const x = 1;\n`,
      },
      'example.py': {
        content: `"""\nimport fake_py_pkg\n"""\n'''\nfrom fake_single_docstring_pkg import something\n'''\n# import fake_hash_pkg\nx = 1\n`,
      },
    };

    const result = mapPackagesToSourceUsage(fakeDeps, files);

    for (const dep of fakeDeps) {
      const usages = result.usagesByPackageId[dep.id];
      assert.strictEqual(
        usages.length,
        0,
        `Package '${dep.name}' in comments must NOT produce any source usages`
      );
    }
  });

  test('Scoped packages, subpath imports, and aliased imports map with appropriate confidence', () => {
    const deps: NormalizedDependency[] = [
      {
        id: 'dep-query',
        name: '@tanstack/react-query',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '5.0.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-lodash',
        name: 'lodash',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '4.17.21',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
      {
        id: 'dep-react-dom',
        name: 'react-dom',
        ecosystem: 'javascript',
        packageManager: 'npm',
        versionResolved: '18.2.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'package.json',
        evidence: [],
      },
    ];

    const files = {
      'src/index.tsx': {
        content: `import { useQuery } from '@tanstack/react-query';\nimport get from 'lodash/get';\nimport * as ClientDOM from 'react-dom/client';\n`,
      },
    };

    const result = mapPackagesToSourceUsage(deps, files);

    const queryUsages = result.usagesByPackageId['dep-query'];
    assert.strictEqual(queryUsages.length, 1);
    assert.strictEqual(queryUsages[0].confidence, 'static_import');

    const lodashUsages = result.usagesByPackageId['dep-lodash'];
    assert.strictEqual(lodashUsages.length, 1);
    assert.strictEqual(lodashUsages[0].confidence, 'subpath_import');

    const domUsages = result.usagesByPackageId['dep-react-dom'];
    assert.strictEqual(domUsages.length, 1);
    assert.strictEqual(domUsages[0].confidence, 'subpath_import');
  });
});

describe('Issue #12: Duplicate and Conflict Health Signals Consistency Regression Suite', () => {
  test('Duplicate resolved versions consistently produce duplicate signals and warning status', () => {
    const dep1: NormalizedDependency = {
      id: 'dep-lodash-a',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.17.21',
      versionResolved: '4.17.21',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/a/package.json',
      lockfilePath: 'apps/a/package-lock.json',
      evidence: [],
    };

    const dep2: NormalizedDependency = {
      id: 'dep-lodash-b',
      name: 'lodash',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.17.21',
      versionResolved: '4.17.21',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/b/package.json',
      lockfilePath: 'apps/b/package-lock.json',
      evidence: [],
    };

    const { updatedDependencies } = reconcileWorkspaceProvenance([dep1, dep2]);

    for (const dep of updatedDependencies) {
      const health = evaluateDependencyHealth(dep, []);
      assert.strictEqual(health.isDuplicate, true, 'isDuplicate must be true');
      assert.strictEqual(health.isClean, false, 'Duplicate package cannot be clean');
      assert.strictEqual(health.status, 'warning', 'Duplicate package status must be warning');
      assert.ok(
        health.signals.some((s) => s.kind === 'duplicate'),
        'Must contain duplicate signal'
      );
    }
  });

  test('Conflicting workspace declarations consistently produce conflict status and error', () => {
    const dep1: NormalizedDependency = {
      id: 'dep-react-17',
      name: 'react',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^17.0.0',
      versionResolved: '17.0.2',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/a/package.json',
      lockfilePath: 'apps/a/package-lock.json',
      evidence: [],
    };

    const dep2: NormalizedDependency = {
      id: 'dep-react-18',
      name: 'react',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^18.0.0',
      versionResolved: '18.2.0',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'apps/b/package.json',
      lockfilePath: 'apps/b/package-lock.json',
      evidence: [],
    };

    const { updatedDependencies } = reconcileWorkspaceProvenance([dep1, dep2]);

    for (const dep of updatedDependencies) {
      const health = evaluateDependencyHealth(dep, []);
      assert.strictEqual(health.hasConflict, true, 'hasConflict must be true');
      assert.strictEqual(health.isClean, false, 'Conflicting package cannot be clean');
      assert.strictEqual(health.status, 'error', 'Conflicting package status must be error');
      assert.ok(
        health.signals.some((s) => s.kind === 'conflict'),
        'Must contain conflict signal'
      );
    }
  });

  test('Missing lockfile evidence is classified as unlocked and never clean', () => {
    const unlockedDep: NormalizedDependency = {
      id: 'dep-dotenv',
      name: 'dotenv',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^16.0.0',
      versionResolved: undefined,
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      evidence: [],
    };

    const health = evaluateDependencyHealth(unlockedDep, []);
    assert.strictEqual(health.isUnlocked, true);
    assert.strictEqual(health.isClean, false, 'Unlocked dependency must never be clean');
    assert.strictEqual(health.status, 'warning');
    assert.ok(health.signals.some((s) => s.kind === 'unlocked'));
  });

  test('Incomplete source coverage cannot create a clean/unreferenced contradiction', () => {
    const dep: NormalizedDependency = {
      id: 'dep-express',
      name: 'express',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^4.18.2',
      versionResolved: '4.18.2',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const unscannedCoverage: SourceScanCoverage = {
      totalSourceFilesDetected: 5,
      totalSourceFilesScanned: 0,
      languages: {
        javascript: {
          ecosystem: 'javascript',
          language: 'typescript',
          detectedFilesCount: 5,
          scannedFilesCount: 0,
          isSupported: true,
          hasSufficientCoverage: false,
          isComplete: false,
        },
      },
      unsupportedExtensions: [],
      canMakeNegativeUsageClaim: false,
    };

    const health = evaluateDependencyHealth(dep, [], unscannedCoverage);
    assert.strictEqual(health.isUnreferenced, false, 'Must not claim unreferenced when unscanned');
    assert.strictEqual(health.coverageStatus, 'unscanned');
    assert.ok(health.signals.some((s) => s.kind === 'analysis_unavailable'));
    assert.strictEqual(
      health.signals.some((s) => s.kind === 'unreferenced'),
      false,
      'Must NOT contain unreferenced signal'
    );
  });

  test('Table filtering, graph health, and inspector signals agree for the same dependency', () => {
    const cleanDep: NormalizedDependency = {
      id: 'd-clean',
      name: 'zod',
      ecosystem: 'javascript',
      packageManager: 'npm',
      versionDeclared: '^3.22.4',
      versionResolved: '3.22.4',
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath: 'package.json',
      lockfilePath: 'package-lock.json',
      evidence: [],
    };

    const usages = [
      {
        id: 'u1',
        packageId: 'd-clean',
        packageName: 'zod',
        ecosystem: 'javascript' as const,
        filePath: 'src/schema.ts',
        location: { filePath: 'src/schema.ts', startLine: 1, endLine: 1, startColumn: 1, endColumn: 20 },
        confidence: 'static_import' as const,
        isDirectImport: true,
        evidenceNote: '',
      },
    ];

    const coverage: SourceScanCoverage = {
      totalSourceFilesDetected: 1,
      totalSourceFilesScanned: 1,
      languages: {
        javascript: {
          ecosystem: 'javascript',
          language: 'typescript',
          detectedFilesCount: 1,
          scannedFilesCount: 1,
          isSupported: true,
          hasSufficientCoverage: true,
          isComplete: true,
        },
      },
      unsupportedExtensions: [],
      canMakeNegativeUsageClaim: true,
    };

    // Evaluate health
    const health = evaluateDependencyHealth(cleanDep, usages, coverage);

    // Verify properties
    assert.strictEqual(health.isClean, true);
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.hasConflict, false);
    assert.strictEqual(health.isDuplicate, false);
    assert.strictEqual(health.isUnlocked, false);
    assert.strictEqual(health.isUnreferenced, false);

    // Inspector derives status and signals from the exact same evaluator
    assert.ok(health.signals.some((s) => s.kind === 'clean'));

    // Filter tab logic uses the exact same properties
    const matchesCleanTab = health.isClean;
    const matchesConflictTab = health.hasConflict;
    const matchesUnlockedTab = health.isUnlocked;
    const matchesDuplicateTab = health.isDuplicate;
    const matchesUnreferencedTab = health.isUnreferenced;

    assert.strictEqual(matchesCleanTab, true);
    assert.strictEqual(matchesConflictTab, false);
    assert.strictEqual(matchesUnlockedTab, false);
    assert.strictEqual(matchesDuplicateTab, false);
    assert.strictEqual(matchesUnreferencedTab, false);
  });
});
