/**
 * Test Suite: Multi-Ecosystem Dependency Intelligence Foundation
 * Validates ecosystem adapters, detection, parsing, workspace association,
 * capability matrix, evidence preservation, and polyglot scanning.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  EcosystemRegistry,
  ECOSYSTEM_CAPABILITY_MATRIX,
  getEcosystemCapability,
  EcosystemAdapter,
} from '../src/lib/dependencies';
import { FileRecord } from '../src/lib/types/trace';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';

describe('Multi-Ecosystem Dependency Intelligence Test Suite', () => {
  const registry = EcosystemRegistry.getInstance();

  test('Ecosystem Capability Matrix documents all 12 ecosystems and package managers', () => {
    assert.ok(ECOSYSTEM_CAPABILITY_MATRIX.length >= 20, 'Capability matrix covers >= 20 format configurations');

    const expectedEcosystems = [
      'javascript',
      'python',
      'rust',
      'go',
      'jvm',
      'dotnet',
      'php',
      'ruby',
      'dart',
      'swift',
      'cpp',
      'elixir',
    ];

    for (const eco of expectedEcosystems) {
      const entries = ECOSYSTEM_CAPABILITY_MATRIX.filter((c) => c.ecosystem === eco);
      assert.ok(entries.length > 0, `Ecosystem '${eco}' is documented in capability matrix`);
      for (const entry of entries) {
        assert.ok(entry.displayName, `Has display name for ${entry.packageManager}`);
        assert.ok(['supported', 'partial', 'planned'].includes(entry.status));
        assert.ok(Array.isArray(entry.manifestFiles), 'Specifies manifest files');
        assert.ok(Array.isArray(entry.evidenceSupplied), 'Specifies evidence supplied');
        assert.ok(Array.isArray(entry.knownLimitations), 'Specifies known limitations');
        assert.strictEqual(typeof entry.capabilities.manifestDetection, 'boolean');
        assert.strictEqual(typeof entry.capabilities.manifestParsing, 'boolean');
        assert.strictEqual(typeof entry.capabilities.lockfileDetection, 'boolean');
        assert.strictEqual(typeof entry.capabilities.lockfileParsing, 'boolean');
        assert.strictEqual(typeof entry.capabilities.transitiveResolution, 'boolean');
      }
    }

    // Lookup helper
    const npmCap = getEcosystemCapability('javascript', 'npm');
    assert.ok(npmCap);
    assert.strictEqual(npmCap.status, 'supported');
    assert.strictEqual(npmCap.capabilities.lockfileParsing, true);

    const sbtCap = getEcosystemCapability('jvm', 'sbt');
    assert.ok(sbtCap);
    assert.strictEqual(sbtCap.status, 'planned');
    assert.strictEqual(sbtCap.capabilities.manifestParsing, false);
  });

  test('Single-ecosystem repository: npm with package.json and package-lock.json', async () => {
    const pkgJson = JSON.stringify({
      name: 'my-service',
      version: '1.0.0',
      dependencies: {
        express: '^4.18.2',
        dotenv: '^16.0.3',
      },
      devDependencies: {
        typescript: '^5.0.0',
        jest: '^29.5.0',
      },
    });

    const lockJson = JSON.stringify({
      name: 'my-service',
      version: '1.0.0',
      lockfileVersion: 2,
      packages: {
        '': {
          name: 'my-service',
          version: '1.0.0',
          dependencies: { express: '^4.18.2', dotenv: '^16.0.3' },
          devDependencies: { typescript: '^5.0.0', jest: '^29.5.0' },
        },
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
          integrity: 'sha512-5/PsL6iVEkiGu9P0Y630FY9z01WDhU3u/0EQ2tu3ylP0d5rE5QD9cz1cA3P9czSgCUCKE491D2Jq4TXN3KxQ==',
        },
        'node_modules/dotenv': {
          version: '16.0.3',
          resolved: 'https://registry.npmjs.org/dotenv/-/dotenv-16.0.3.tgz',
          integrity: 'sha512-7GO6URveLThP8352==',
        },
        'node_modules/typescript': {
          version: '5.0.4',
          integrity: 'sha512-ts504==',
        },
        'node_modules/qs': {
          version: '6.11.0',
          resolved: 'https://registry.npmjs.org/qs/-/qs-6.11.0.tgz',
          integrity: 'sha512-qs6110==',
        },
      },
    });

    const repoFiles = {
      'package.json': { content: pkgJson },
      'package-lock.json': { content: lockJson },
    };

    const result = await registry.scanRepository(repoFiles);

    assert.strictEqual(result.ecosystems.length, 1);
    assert.strictEqual(result.ecosystems[0], 'javascript');
    assert.strictEqual(result.discoveredFiles.length, 2);

    const expressDep = result.dependencies.find((d) => d.name === 'express');
    assert.ok(expressDep, 'Found express dependency');
    assert.strictEqual(expressDep.isDirect, true);
    assert.strictEqual(expressDep.scope, 'runtime');
    assert.strictEqual(expressDep.versionDeclared, '^4.18.2');
    assert.strictEqual(expressDep.versionResolved, '4.18.2');
    assert.strictEqual(expressDep.lockfilePath, 'package-lock.json');

    // Evidence checks
    assert.strictEqual(expressDep.evidence.length, 2);
    const lockEvidence = expressDep.evidence.find((e) => e.sourceKind === 'lockfile');
    assert.ok(lockEvidence);
    assert.strictEqual(lockEvidence.evidenceKind, 'resolved_lockfile');
    assert.ok(lockEvidence.integrity?.includes('sha512'));

    // Dev dependency
    const tsDep = result.dependencies.find((d) => d.name === 'typescript');
    assert.ok(tsDep);
    assert.strictEqual(tsDep.scope, 'dev');
    assert.strictEqual(tsDep.versionResolved, '5.0.4');

    // Transitive dependency (qs)
    const qsDep = result.dependencies.find((d) => d.name === 'qs');
    assert.ok(qsDep, 'Found transitive dependency qs');
    assert.strictEqual(qsDep.isDirect, false);
    assert.strictEqual(qsDep.isTransitive, true);
    assert.strictEqual(qsDep.versionResolved, '6.11.0');
  });

  test('Missing lockfile scenario: declared-only evidence and diagnostic warning emitted', async () => {
    const pkgJson = JSON.stringify({
      name: 'unlocked-app',
      dependencies: {
        react: '^18.2.0',
      },
    });

    const result = await registry.scanRepository({
      'package.json': { content: pkgJson },
    });

    const reactDep = result.dependencies.find((d) => d.name === 'react');
    assert.ok(reactDep);
    assert.strictEqual(reactDep.versionDeclared, '^18.2.0');
    assert.strictEqual(reactDep.versionResolved, undefined, 'Version resolved must remain undefined without lockfile');
    assert.strictEqual(reactDep.evidence.length, 1);
    assert.strictEqual(reactDep.evidence[0].evidenceKind, 'declared_only');

    // Diagnostic must be present
    const missingDiag = result.diagnostics.find((d) => d.code === 'missing_lockfile');
    assert.ok(missingDiag, 'Diagnostic for missing lockfile recorded');
    assert.strictEqual(missingDiag.severity, 'warning');
  });

  test('Malformed manifest scenario: syntax error gracefully recorded as diagnostic without crash', async () => {
    const result = await registry.scanRepository({
      'package.json': { content: '{ "name": "broken", invalid JSON syntax!!! }' },
      'Cargo.toml': { content: '[package]\nname = "valid_rust"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"' },
    });

    const malformedDiag = result.diagnostics.find((d) => d.code === 'malformed_file');
    assert.ok(malformedDiag, 'Recorded malformed_file diagnostic');
    assert.strictEqual(malformedDiag.severity, 'error');

    // Rust dependency in polyglot repo should still be parsed successfully
    const serdeDep = result.dependencies.find((d) => d.name === 'serde');
    assert.ok(serdeDep, 'Rust dependencies parsed despite JS manifest error');
    assert.strictEqual(serdeDep.ecosystem, 'rust');
  });

  test('Monorepo workspaces: npm workspaces and nested package.json files', async () => {
    const rootPkg = JSON.stringify({
      name: 'my-monorepo',
      private: true,
      workspaces: ['packages/*'],
    });

    const uiPkg = JSON.stringify({
      name: '@monorepo/ui',
      version: '0.1.0',
      dependencies: {
        react: '^18.2.0',
      },
    });

    const corePkg = JSON.stringify({
      name: '@monorepo/core',
      version: '0.1.0',
      dependencies: {
        lodash: '^4.17.21',
      },
    });

    const repoFiles = {
      'package.json': { content: rootPkg },
      'packages/ui/package.json': { content: uiPkg },
      'packages/core/package.json': { content: corePkg },
    };

    const result = await registry.scanRepository(repoFiles);

    assert.ok(result.workspaces.length >= 1, 'Detected monorepo workspace');
    const ws = result.workspaces[0];
    assert.strictEqual(ws.isRootWorkspace, true);
    assert.deepStrictEqual(ws.packages, ['packages/*']);

    // Check workspace attribution on dependencies
    const reactDep = result.dependencies.find((d) => d.name === 'react');
    assert.ok(reactDep);
    assert.strictEqual(reactDep.manifestPath, 'packages/ui/package.json');
    assert.strictEqual(reactDep.workspacePath, 'packages/ui');

    const lodashDep = result.dependencies.find((d) => d.name === 'lodash');
    assert.ok(lodashDep);
    assert.strictEqual(lodashDep.manifestPath, 'packages/core/package.json');
    assert.strictEqual(lodashDep.workspacePath, 'packages/core');
  });

  test('Polyglot repository: simultaneous TypeScript, Python, Rust, and Go manifests', async () => {
    const repoFiles = {
      // JavaScript/TypeScript (pnpm)
      'package.json': {
        content: JSON.stringify({ dependencies: { zod: '^3.21.4' } }),
      },
      'pnpm-lock.yaml': {
        content: `lockfileVersion: 5.4\npackages:\n  /zod@3.21.4:\n    resolution: {integrity: sha512-zod3214==}\n`,
      },

      // Python (Poetry)
      'pyproject.toml': {
        content: `[tool.poetry]\nname = "ml-service"\nversion = "0.1.0"\n\n[tool.poetry.dependencies]\npython = "^3.10"\nfastapi = "^0.100.0"\npydantic = "^2.0.0"\n`,
      },
      'poetry.lock': {
        content: `[[package]]\nname = "fastapi"\nversion = "0.100.0"\n\n[[package]]\nname = "pydantic"\nversion = "2.0.2"\n`,
      },

      // Rust (Cargo)
      'Cargo.toml': {
        content: `[package]\nname = "rust-core"\nversion = "0.1.0"\n\n[dependencies]\ntokio = { version = "1.28", features = ["full"] }\n`,
      },
      'Cargo.lock': {
        content: `version = 3\n\n[[package]]\nname = "tokio"\nversion = "1.28.2"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "sha256tokio1282"\n`,
      },

      // Go (Go Modules)
      'go.mod': {
        content: `module github.com/acme/gateway\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgolang.org/x/crypto v0.14.0 // indirect\n)\n`,
      },
      'go.sum': {
        content: `github.com/gin-gonic/gin v1.9.1 h1:ginhash==\ngolang.org/x/crypto v0.14.0 h1:cryptohash==\n`,
      },
    };

    const result = await registry.scanRepository(repoFiles);

    assert.ok(result.ecosystems.includes('javascript'), 'Has javascript');
    assert.ok(result.ecosystems.includes('python'), 'Has python');
    assert.ok(result.ecosystems.includes('rust'), 'Has rust');
    assert.ok(result.ecosystems.includes('go'), 'Has go');

    assert.strictEqual(result.stats.totalManifests, 4);
    assert.strictEqual(result.stats.totalLockfiles, 4);

    // Verify JS dependency
    const zod = result.dependencies.find((d) => d.name === 'zod');
    assert.ok(zod);
    assert.strictEqual(zod.ecosystem, 'javascript');
    assert.strictEqual(zod.versionResolved, '3.21.4');

    // Verify Python dependencies
    const fastapi = result.dependencies.find((d) => d.name === 'fastapi');
    assert.ok(fastapi);
    assert.strictEqual(fastapi.ecosystem, 'python');
    assert.strictEqual(fastapi.versionResolved, '0.100.0');

    // Verify Rust dependency
    const tokio = result.dependencies.find((d) => d.name === 'tokio');
    assert.ok(tokio);
    assert.strictEqual(tokio.ecosystem, 'rust');
    assert.strictEqual(tokio.versionResolved, '1.28.2');
    assert.strictEqual(tokio.evidence[1].integrity, 'sha256tokio1282');

    // Verify Go dependencies
    const gin = result.dependencies.find((d) => d.name === 'github.com/gin-gonic/gin');
    assert.ok(gin);
    assert.strictEqual(gin.ecosystem, 'go');
    assert.strictEqual(gin.isDirect, true);
    assert.strictEqual(gin.versionResolved, 'v1.9.1');

    const crypto = result.dependencies.find((d) => d.name === 'golang.org/x/crypto');
    assert.ok(crypto);
    assert.strictEqual(crypto.isDirect, false);
    assert.strictEqual(crypto.isTransitive, true);
  });

  test('Preserves package identity and avoids colliding duplicate package names across ecosystems', async () => {
    // Both JS and Rust might depend on something named "uuid" or "tracing"
    const repoFiles = {
      'package.json': {
        content: JSON.stringify({ dependencies: { uuid: '^9.0.0' } }),
      },
      'Cargo.toml': {
        content: `[package]\nname = "rust-app"\nversion = "0.1.0"\n\n[dependencies]\nuuid = { version = "1.3", features = ["v4"] }\n`,
      },
    };

    const result = await registry.scanRepository(repoFiles);
    const uuidDeps = result.dependencies.filter((d) => d.name === 'uuid');
    assert.strictEqual(uuidDeps.length, 2, 'Two distinct dependencies for uuid');

    const jsUuid = uuidDeps.find((d) => d.ecosystem === 'javascript');
    const rustUuid = uuidDeps.find((d) => d.ecosystem === 'rust');
    assert.ok(jsUuid);
    assert.ok(rustUuid);
    assert.notStrictEqual(jsUuid.id, rustUuid.id, 'Distinct stable IDs per ecosystem/manifest');
  });

  test('Unsupported and partially supported formats emit explicit diagnostics', async () => {
    const repoFiles = {
      'package.json': {
        content: JSON.stringify({ dependencies: { bun: 'latest' } }),
      },
      'bun.lockb': {
        content: 'binary content here',
      },
      'build.sbt': {
        content: 'name := "MySbtProject"\nversion := "0.1.0"\nscalaVersion := "2.13.10"',
      },
      'CMakeLists.txt': {
        content: 'cmake_minimum_required(VERSION 3.10)\nproject(MyCppApp)\nfind_package(OpenCV 4.5 REQUIRED)\n',
      },
    };

    const result = await registry.scanRepository(repoFiles);

    // bun.lockb binary format diagnostic
    const bunDiag = result.diagnostics.find((d) => d.filePath.includes('bun.lockb'));
    assert.ok(bunDiag, 'Diagnostic for bun.lockb emitted');
    assert.strictEqual(bunDiag.code, 'unsupported_format');

    // sbt planned diagnostic
    const sbtDiag = result.diagnostics.find((d) => d.filePath.includes('build.sbt'));
    assert.ok(sbtDiag, 'Diagnostic for sbt emitted');
    assert.strictEqual(sbtDiag.code, 'unsupported_feature');

    // cmake parsed best-effort
    const opencvDep = result.dependencies.find((d) => d.name === 'OpenCV');
    assert.ok(opencvDep);
    assert.strictEqual(opencvDep.ecosystem, 'cpp');
    assert.strictEqual(opencvDep.versionDeclared, '4.5');
  });

  test('Adapter registration allows custom ecosystem extension', () => {
    const customRegistry = EcosystemRegistry.createDefault();
    const initialCount = customRegistry.getAllAdapters().length;

    // Define custom test adapter for Haskell Cabal
    const haskellAdapter: EcosystemAdapter = {
      ecosystem: 'unknown',
      packageManager: 'unknown',
      displayName: 'Haskell (Cabal)',
      capability: {
        ecosystem: 'unknown',
        packageManager: 'unknown',
        displayName: 'Haskell (Cabal)',
        status: 'partial',
        manifestFiles: ['*.cabal'],
        lockfiles: ['cabal.project.freeze'],
        capabilities: {
          manifestDetection: true,
          manifestParsing: true,
          lockfileDetection: true,
          lockfileParsing: false,
          transitiveResolution: false,
          workspaceDetection: false,
        },
        evidenceSupplied: ['cabal-package-name'],
        knownLimitations: ['Cabal solver not simulated'],
      },
      matches: (fp) => fp.endsWith('.cabal'),
      classifyFile: (fp) =>
        fp.endsWith('.cabal')
          ? { path: fp, kind: 'manifest', ecosystem: 'unknown', packageManager: 'unknown' }
          : null,
      parse: (mf) => ({
        dependencies: [
          {
            id: `haskell:cabal:base@${mf.path}`,
            ecosystem: 'unknown',
            packageManager: 'unknown',
            name: 'base',
            versionDeclared: '>= 4.14',
            scope: 'runtime',
            isDirect: true,
            isTransitive: false,
            manifestPath: mf.path,
            evidence: [],
          },
        ],
        workspaces: [],
        diagnostics: [],
        isComplete: true,
      }),
    };

    customRegistry.registerAdapter(haskellAdapter);
    assert.strictEqual(customRegistry.getAllAdapters().length, initialCount + 1);

    const discovered = customRegistry.detectFiles(['MyProject.cabal', 'src/Main.hs']);
    assert.strictEqual(discovered.length, 1);
    assert.strictEqual(discovered[0].path, 'MyProject.cabal');
  });

  test('CodebaseAnalyzer seamlessly integrates dependency intelligence scan without breaking TS analysis', () => {
    const analyzer = new CodebaseAnalyzer();

    const mockFiles: Record<string, FileRecord> = {
      'package.json': {
        path: 'package.json',
        language: 'json',
        lines: 10,
        size: 150,
        content: JSON.stringify({
          name: 'hybrid-app',
          dependencies: {
            express: '^4.18.2',
          },
        }),
      },
      'src/index.ts': {
        path: 'src/index.ts',
        language: 'typescript',
        lines: 5,
        size: 120,
        content: `import express from 'express';\nexport function start() { return express(); }\n`,
      },
    };

    const analysis = analyzer.analyzeProject('Hybrid Test', mockFiles);

    assert.ok(analysis.entities);
    assert.ok(analysis.relationships);
    assert.ok(analysis.dependencies, 'Dependencies attached to ProjectAnalysis');
    assert.strictEqual(analysis.dependencies.stats.totalManifests, 1);
    assert.strictEqual(analysis.dependencies.dependencies.length, 1);
    assert.strictEqual(analysis.dependencies.dependencies[0].name, 'express');
  });
});
