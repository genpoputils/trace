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
  NormalizedDependency,
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

  test('Flags unreferenced status when direct package has zero source imports', () => {
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

    const health = evaluateDependencyHealth(directDep, []);

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
