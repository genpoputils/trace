/**
 * Test Suite: GT-012 Dependency Version Provenance
 *
 * Validates:
 * 1. Explicit separation of Declared, Resolved, and Installed versions.
 * 2. Source provenance preservation (manifest path, lockfile path, installed file path, evidence chain).
 * 3. Range matching and exact pin evaluation (^, ~, ~=, >= <, ==, =).
 * 4. Missing lockfiles: declared-only packages with no lockfile resolution must NOT infer resolved version.
 * 5. Stale / conflicting lockfiles: detected and classified (range_mismatch, missing_lockfile_resolution).
 * 6. Installed environment detection: detected only from actual disk evidence (node_modules or dist-info),
 *    never inferred from lockfile or manifest.
 * 7. Multi-ecosystem fixtures: JavaScript (npm), Python (pip & Poetry), Rust (Cargo), Go (go.mod).
 * 8. Workspace / monorepo cross-manifest reconciliation: duplicate packages and conflicting range versions.
 * 9. Package aliases (npm:pkg@range and Cargo rename).
 * 10. Scan stats reflecting withResolvedVersionCount, declaredOnlyCount, withInstalledVersionCount, conflictsCount.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  EcosystemRegistry,
  parseSemver,
  compareSemver,
  isExactVersionPin,
  satisfiesVersionRange,
  buildDependencyProvenance,
  evaluateDependencyHealth,
} from '../src/lib/dependencies';

describe('GT-012: Dependency Version Provenance Engine', () => {
  const registry = EcosystemRegistry.getInstance();

  describe('Semver and Range Evaluation', () => {
    test('parseSemver parses standard and pre-release versions', () => {
      const v1 = parseSemver('1.2.3');
      assert.ok(v1);
      assert.strictEqual(v1.major, 1);
      assert.strictEqual(v1.minor, 2);
      assert.strictEqual(v1.patch, 3);

      const v2 = parseSemver('v2.0.1-alpha.1');
      assert.ok(v2);
      assert.strictEqual(v2.major, 2);
      assert.strictEqual(v2.minor, 0);
      assert.strictEqual(v2.patch, 1);
      assert.strictEqual(v2.prerelease, 'alpha.1');

      const invalid = parseSemver('not-a-version');
      assert.strictEqual(invalid, null);
    });

    test('compareSemver accurately compares version numbers', () => {
      assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
      assert.strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
      assert.strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
      assert.strictEqual(compareSemver('2.0.0', '1.2.4'), 1);
    });

    test('isExactVersionPin identifies exact pins vs ranges', () => {
      assert.strictEqual(isExactVersionPin('4.18.2'), true);
      assert.strictEqual(isExactVersionPin('==1.2.3', 'python'), true);
      assert.strictEqual(isExactVersionPin('=1.28.0', 'rust'), true);
      assert.strictEqual(isExactVersionPin('v1.0.0'), true);

      assert.strictEqual(isExactVersionPin('^4.18.2'), false);
      assert.strictEqual(isExactVersionPin('~1.2.3'), false);
      assert.strictEqual(isExactVersionPin('~=2.0', 'python'), false);
      assert.strictEqual(isExactVersionPin('>=1.0.0'), false);
      assert.strictEqual(isExactVersionPin('*'), false);
      assert.strictEqual(isExactVersionPin('latest'), false);
    });

    test('satisfiesVersionRange evaluates caret, tilde, python ~=, inequalities, and wildcards', () => {
      // Caret (^)
      assert.strictEqual(satisfiesVersionRange('1.2.4', '^1.2.3').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('1.9.0', '^1.2.3').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('2.0.0', '^1.2.3').satisfies, false);
      assert.strictEqual(satisfiesVersionRange('1.2.2', '^1.2.3').satisfies, false);

      // Tilde (~)
      assert.strictEqual(satisfiesVersionRange('1.2.5', '~1.2.3').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('1.3.0', '~1.2.3').satisfies, false);

      // Python Compatible (~=)
      assert.strictEqual(satisfiesVersionRange('2.4.2', '~=2.4.0', 'python').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('2.5.0', '~=2.4.0', 'python').satisfies, false);

      // Inequalities (>=, <)
      assert.strictEqual(satisfiesVersionRange('1.5.0', '>=1.0.0 <2.0.0').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('2.0.0', '>=1.0.0 <2.0.0').satisfies, false);
      assert.strictEqual(satisfiesVersionRange('0.9.0', '>=1.0.0 <2.0.0').satisfies, false);

      // Wildcard
      assert.strictEqual(satisfiesVersionRange('99.0.0', '*').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('1.0.0', 'latest').satisfies, true);
    });
  });

  describe('JavaScript / npm Ecosystem Provenance', () => {
    test('Separates declared range from resolved lockfile version with full evidence', async () => {
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            name: 'my-app',
            dependencies: {
              express: '^4.18.2',
            },
          }),
        },
        'package-lock.json': {
          content: JSON.stringify({
            name: 'my-app',
            lockfileVersion: 3,
            packages: {
              'node_modules/express': {
                version: '4.18.2',
                resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
                integrity: 'sha512-5/4182',
              },
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const express = scan.dependencies.find((d) => d.name === 'express');
      assert.ok(express, 'Found express dependency');

      assert.strictEqual(express.versionDeclared, '^4.18.2', 'Declared version is range');
      assert.strictEqual(express.versionResolved, '4.18.2', 'Resolved version is concrete');
      assert.strictEqual(express.versionInstalled, undefined, 'Installed version is undefined without node_modules');

      const prov = express.provenance;
      assert.ok(prov, 'Provenance record exists');
      assert.strictEqual(prov.declared.version, '^4.18.2');
      assert.strictEqual(prov.declared.isRange, true);
      assert.strictEqual(prov.declared.sourceFilePath, 'package.json');
      assert.strictEqual(prov.declared.evidenceKind, 'declared_only');

      assert.strictEqual(prov.resolved.version, '4.18.2');
      assert.strictEqual(prov.resolved.isRange, false);
      assert.strictEqual(prov.resolved.sourceFilePath, 'package-lock.json');
      assert.strictEqual(prov.resolved.evidenceKind, 'resolved_lockfile');
      assert.strictEqual(prov.resolved.integrity, 'sha512-5/4182');

      assert.strictEqual(prov.installed.status, 'unavailable');
      assert.strictEqual(prov.status, 'established');
      assert.strictEqual(prov.satisfiesRange, true);
      assert.strictEqual(prov.conflicts.length, 0);
    });

    test('Missing lockfile leaves versionResolved undefined and flags declared-only status', async () => {
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            name: 'unlocked-app',
            dependencies: {
              lodash: '4.17.21', // exact pin in manifest
              react: '^18.2.0',   // range in manifest
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const lodash = scan.dependencies.find((d) => d.name === 'lodash');
      const react = scan.dependencies.find((d) => d.name === 'react');

      assert.ok(lodash);
      assert.ok(react);

      // Crucial requirement: exact pin in manifest is DECLARED, NOT resolved
      assert.strictEqual(lodash.versionDeclared, '4.17.21');
      assert.strictEqual(lodash.versionResolved, undefined, 'Must not infer resolved version without lockfile');
      assert.strictEqual(lodash.provenance?.resolved.status, 'unavailable');
      assert.strictEqual(lodash.provenance?.declared.isRange, false);

      assert.strictEqual(react.versionDeclared, '^18.2.0');
      assert.strictEqual(react.versionResolved, undefined);
      assert.strictEqual(react.provenance?.resolved.status, 'unavailable');
      assert.strictEqual(react.provenance?.declared.isRange, true);

      // Scan stats check
      assert.strictEqual(scan.stats.withResolvedVersionCount, 0);
      assert.strictEqual(scan.stats.declaredOnlyCount, 2);
    });

    test('Stale / conflicting lockfile produces range_mismatch conflict and diagnostic', async () => {
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            dependencies: {
              react: '^18.2.0', // declares 18.x
            },
          }),
        },
        'package-lock.json': {
          content: JSON.stringify({
            lockfileVersion: 3,
            packages: {
              'node_modules/react': {
                version: '17.0.2', // lockfile is stale (17.x does not satisfy ^18.2.0)
              },
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const react = scan.dependencies.find((d) => d.name === 'react');
      assert.ok(react);

      assert.strictEqual(react.versionDeclared, '^18.2.0');
      assert.strictEqual(react.versionResolved, '17.0.2');
      assert.strictEqual(react.provenance?.status, 'conflicting');
      assert.strictEqual(react.provenance?.satisfiesRange, false);

      const conflict = react.provenance?.conflicts.find((c) => c.kind === 'range_mismatch');
      assert.ok(conflict, 'Found range_mismatch conflict');
      assert.strictEqual(conflict.severity, 'error');

      // Diagnostic must be present
      const diag = scan.diagnostics.find(
        (d) => d.code === 'version_conflict' && d.message.includes('react')
      );
      assert.ok(diag, 'Found version_conflict diagnostic');
    });

    test('Detects installed environment from node_modules and never infers when absent', async () => {
      const filesWithInstalled: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            dependencies: {
              dotenv: '^16.0.0',
            },
          }),
        },
        'package-lock.json': {
          content: JSON.stringify({
            packages: {
              'node_modules/dotenv': {
                version: '16.0.3',
              },
            },
          }),
        },
        'node_modules/dotenv/package.json': {
          content: JSON.stringify({
            name: 'dotenv',
            version: '16.0.3',
          }),
        },
      };

      const scan = await registry.scanCodebase(filesWithInstalled);
      const dotenv = scan.dependencies.find((d) => d.name === 'dotenv');
      assert.ok(dotenv);

      assert.strictEqual(dotenv.versionInstalled, '16.0.3');
      assert.strictEqual(dotenv.provenance?.installed.status, 'established');
      assert.strictEqual(dotenv.provenance?.installed.version, '16.0.3');
      assert.strictEqual(dotenv.provenance?.installed.sourceFilePath, 'node_modules/dotenv/package.json');
      assert.strictEqual(dotenv.provenance?.installed.evidenceKind, 'installed_disk');

      assert.strictEqual(scan.stats.withInstalledVersionCount, 1);
    });

    test('Supports npm package alias syntax (npm:actual-pkg@range)', async () => {
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            dependencies: {
              'my-lodash': 'npm:lodash@^4.17.21',
            },
          }),
        },
        'package-lock.json': {
          content: JSON.stringify({
            packages: {
              'node_modules/my-lodash': {
                name: 'lodash',
                version: '4.17.21',
              },
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const lodash = scan.dependencies.find((d) => d.name === 'lodash');
      assert.ok(lodash, 'Found aliased dependency by actual target name');
      assert.strictEqual(lodash.alias, 'my-lodash');
      assert.strictEqual(lodash.versionDeclared, '^4.17.21');
      assert.strictEqual(lodash.versionResolved, '4.17.21');
    });
  });

  describe('Python Ecosystem Provenance (requirements.txt and Poetry)', () => {
    test('requirements.txt exact pin is classified as declared-only without false lockfile inference', async () => {
      const files: Record<string, { content: string }> = {
        'requirements.txt': {
          content: 'requests==2.31.0\nurllib3>=1.26.0,<2.0.0\n',
        },
      };

      const scan = await registry.scanCodebase(files);
      const requests = scan.dependencies.find((d) => d.name === 'requests');
      const urllib3 = scan.dependencies.find((d) => d.name === 'urllib3');

      assert.ok(requests);
      assert.ok(urllib3);

      // requirements.txt exact pin is declared, NOT lockfile resolved
      assert.strictEqual(requests.versionDeclared, '==2.31.0');
      assert.strictEqual(requests.versionResolved, undefined);
      assert.strictEqual(requests.provenance?.declared.isRange, false);
      assert.strictEqual(requests.provenance?.resolved.status, 'unavailable');

      assert.strictEqual(urllib3.versionDeclared, '>=1.26.0,<2.0.0');
      assert.strictEqual(urllib3.versionResolved, undefined);
      assert.strictEqual(urllib3.provenance?.declared.isRange, true);
    });

    test('pyproject.toml with poetry.lock resolves versions and checks compatible release (~=)', async () => {
      const files: Record<string, { content: string }> = {
        'pyproject.toml': {
          content: `
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.104.0"
pydantic = "~=2.1.0"
`,
        },
        'poetry.lock': {
          content: `
[[package]]
name = "fastapi"
version = "0.104.1"
files = [
    {file = "fastapi-0.104.1.whl", hash = "sha256:abc123fastapi"}
]

[[package]]
name = "pydantic"
version = "2.1.2"
files = [
    {file = "pydantic-2.1.2.whl", hash = "sha256:def456pydantic"}
]
`,
        },
      };

      const scan = await registry.scanCodebase(files);
      const fastapi = scan.dependencies.find((d) => d.name === 'fastapi');
      const pydantic = scan.dependencies.find((d) => d.name === 'pydantic');

      assert.ok(fastapi);
      assert.strictEqual(fastapi.versionDeclared, '^0.104.0');
      assert.strictEqual(fastapi.versionResolved, '0.104.1');
      assert.strictEqual(fastapi.provenance?.status, 'established');

      assert.strictEqual(fastapi.provenance?.resolved.sourceFilePath, 'poetry.lock');
      assert.strictEqual(fastapi.provenance?.resolved.integrity, 'sha256:abc123fastapi');

      assert.ok(pydantic);
      assert.strictEqual(pydantic.versionDeclared, '~=2.1.0');
      assert.strictEqual(pydantic.versionResolved, '2.1.2');
      assert.strictEqual(pydantic.provenance?.status, 'established');

    });

    test('Detects Python installed environment from dist-info/METADATA', async () => {
      const files: Record<string, { content: string }> = {
        'requirements.txt': {
          content: 'httpx==0.24.1\n',
        },
        '.venv/lib/python3.11/site-packages/httpx-0.24.1.dist-info/METADATA': {
          content: 'Metadata-Version: 2.1\nName: httpx\nVersion: 0.24.1\n',
        },
      };

      const scan = await registry.scanCodebase(files);
      const httpx = scan.dependencies.find((d) => d.name === 'httpx');
      assert.ok(httpx);

      assert.strictEqual(httpx.versionInstalled, '0.24.1');
      assert.strictEqual(httpx.provenance?.installed.status, 'established');
      assert.strictEqual(httpx.provenance?.installed.evidenceKind, 'installed_disk');
    });
  });

  describe('Rust / Cargo Ecosystem Provenance', () => {
    test('Resolves Cargo.toml declared versions against Cargo.lock and handles Cargo alias rename', async () => {
      const files: Record<string, { content: string }> = {
        'Cargo.toml': {
          content: `
[package]
name = "trace-core"
version = "0.1.0"

[dependencies]
tokio = "1.32.0"
my_serde = { package = "serde", version = "1.0.188" }
`,
        },
        'Cargo.lock': {
          content: `
version = 3

[[package]]
name = "tokio"
version = "1.32.0"
checksum = "checksum-tokio-132"

[[package]]
name = "serde"
version = "1.0.188"
checksum = "checksum-serde-10188"
`,
        },
      };

      const scan = await registry.scanCodebase(files);
      const tokio = scan.dependencies.find((d) => d.name === 'tokio');
      const serde = scan.dependencies.find((d) => d.name === 'serde');

      assert.ok(tokio);
      assert.strictEqual(tokio.versionDeclared, '1.32.0');
      assert.strictEqual(tokio.versionResolved, '1.32.0');
      assert.strictEqual(tokio.provenance?.resolved.integrity, 'checksum-tokio-132');

      assert.ok(serde, 'Resolves serde package');
      assert.strictEqual(serde.alias, 'my_serde');
      assert.strictEqual(serde.versionDeclared, '1.0.188');
      assert.strictEqual(serde.versionResolved, '1.0.188');
    });
  });

  describe('Go Ecosystem Provenance', () => {
    test('Resolves go.mod declared versions against go.sum checksums', async () => {
      const files: Record<string, { content: string }> = {
        'go.mod': {
          content: `
module github.com/example/myservice

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
)
`,
        },
        'go.sum': {
          content: `
github.com/gin-gonic/gin v1.9.1 h1:4Aao0c5+/11q+72lG9p7n5Pj26x9Qp=
github.com/gin-gonic/gin v1.9.1/go.mod h1:1q8j0x5+/2=
`,
        },
      };

      const scan = await registry.scanCodebase(files);
      const gin = scan.dependencies.find((d) => d.name === 'github.com/gin-gonic/gin');
      assert.ok(gin);

      assert.strictEqual(gin.versionDeclared, 'v1.9.1');
      assert.strictEqual(gin.versionResolved, 'v1.9.1');
      assert.strictEqual(gin.provenance?.resolved.integrity, 'h1:4Aao0c5+/11q+72lG9p7n5Pj26x9Qp=');
      assert.strictEqual(gin.provenance?.status, 'established');
    });
  });

  describe('Monorepo Workspaces & Cross-Manifest Conflict Reconciliation', () => {
    test('Flags workspace version conflict when two packages declare mismatched ranges', async () => {
      const files: Record<string, { content: string }> = {
        'packages/frontend/package.json': {
          content: JSON.stringify({
            name: '@mono/frontend',
            dependencies: {
              zod: '^3.21.0',
            },
          }),
        },
        'packages/backend/package.json': {
          content: JSON.stringify({
            name: '@mono/backend',
            dependencies: {
              zod: '^2.0.0', // Conflicting range across monorepo packages!
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const zodEntries = scan.dependencies.filter((d) => d.name === 'zod');
      assert.strictEqual(zodEntries.length, 2, 'Two zod entries in monorepo');

      for (const zod of zodEntries) {
        assert.strictEqual(zod.provenance?.status, 'conflicting');
        const conflict = zod.provenance?.conflicts.find((c) => c.kind === 'workspace_version_conflict');
        assert.ok(conflict, 'Detected workspace_version_conflict');
      }

      const diag = scan.diagnostics.find(
        (d) => d.code === 'version_conflict' && d.message.includes('Workspace version conflict for "zod"')
      );
      assert.ok(diag, 'Emitted version_conflict diagnostic for workspace disparity');
      assert.strictEqual(scan.stats.conflictsCount >= 1, true);
    });

    test('Flags duplicate_version_in_workspace when multiple manifests declare identical version', async () => {
      const files: Record<string, { content: string }> = {
        'packages/a/package.json': {
          content: JSON.stringify({
            name: 'pkg-a',
            dependencies: {
              tslib: '^2.6.0',
            },
          }),
        },
        'packages/b/package.json': {
          content: JSON.stringify({
            name: 'pkg-b',
            dependencies: {
              tslib: '^2.6.0',
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const tslibs = scan.dependencies.filter((d) => d.name === 'tslib');
      assert.strictEqual(tslibs.length, 2);

      for (const tslib of tslibs) {
        const conflict = tslib.provenance?.conflicts.find((c) => c.kind === 'duplicate_version_in_workspace');
        assert.ok(conflict, 'Duplicate version warning recorded');
        assert.strictEqual(conflict.severity, 'warning');
      }
    });
  });

  describe('Missing Information Verification', () => {
    test('Missing information is explicitly marked as unavailable/incomplete, never guessed', async () => {
      // Manifest declaring package with no lockfile and no installed directory
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            dependencies: {
              chalk: '^5.0.0',
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const chalk = scan.dependencies.find((d) => d.name === 'chalk');
      assert.ok(chalk);

      assert.strictEqual(chalk.versionDeclared, '^5.0.0');
      assert.strictEqual(chalk.versionResolved, undefined);
      assert.strictEqual(chalk.versionInstalled, undefined);

      assert.strictEqual(chalk.provenance?.declared.status, 'established');
      assert.strictEqual(chalk.provenance?.resolved.status, 'unavailable');
      assert.strictEqual(chalk.provenance?.installed.status, 'unavailable');
      assert.strictEqual(chalk.provenance?.status, 'incomplete');
    });

    test('Lockfile missing an entry for a declared dependency triggers missing_lockfile_resolution', async () => {
      const files: Record<string, { content: string }> = {
        'package.json': {
          content: JSON.stringify({
            dependencies: {
              'known-pkg': '^1.0.0',
              'unlocked-pkg': '^2.0.0',
            },
          }),
        },
        'package-lock.json': {
          content: JSON.stringify({
            packages: {
              'node_modules/known-pkg': {
                version: '1.0.4',
              },
              // 'unlocked-pkg' is missing from lockfile!
            },
          }),
        },
      };

      const scan = await registry.scanCodebase(files);
      const unlocked = scan.dependencies.find((d) => d.name === 'unlocked-pkg');
      assert.ok(unlocked);

      assert.strictEqual(unlocked.versionDeclared, '^2.0.0');
      assert.strictEqual(unlocked.versionResolved, undefined);

      const conflict = unlocked.provenance?.conflicts.find((c) => c.kind === 'missing_lockfile_resolution');
      assert.ok(conflict, 'Detected missing_lockfile_resolution');
      assert.strictEqual(conflict.severity, 'warning');
    });
  });

  describe('Issue #8: Conservative Semver and Range Evaluation Regression Suite', () => {
    test('Strict SemVer parsing rejects malformed versions and trailing characters', () => {
      assert.strictEqual(parseSemver('1.2.3.4'), null);
      assert.strictEqual(parseSemver('1.2.3abc'), null);
      assert.strictEqual(parseSemver('1.2.3-alpha+build trailing-garbage'), null);
      assert.strictEqual(parseSemver('1.2.3/foo'), null);
      assert.strictEqual(parseSemver('not-a-version'), null);
      assert.strictEqual(parseSemver(''), null);
    });

    test('SemVer 2.0.0 rule 11 prerelease precedence evaluation', () => {
      // Normal version has higher precedence than prerelease
      assert.strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
      assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);

      // Prerelease identifier comparisons
      assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
      assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
      assert.strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-beta'), -1);
      assert.strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta.2'), -1);
      assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
      assert.strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-rc.1'), -1);
      assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);

      // Prerelease versions do not satisfy normal range
      const res = satisfiesVersionRange('1.0.0-alpha.1', '^1.0.0');
      assert.strictEqual(res.satisfies, false);
      assert.strictEqual(res.status, 'not_satisfied');
    });

    test('Zero-major semantic version range boundaries', () => {
      // 0.X.Y: minor version bumps are breaking in SemVer
      assert.strictEqual(satisfiesVersionRange('0.2.1', '^0.2.0').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('0.2.5', '^0.2.0').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('0.3.0', '^0.2.0').satisfies, false);
      assert.strictEqual(satisfiesVersionRange('0.1.9', '^0.2.0').satisfies, false);

      // 0.0.X: patch version bumps are breaking in SemVer
      assert.strictEqual(satisfiesVersionRange('0.0.3', '^0.0.3').satisfies, true);
      assert.strictEqual(satisfiesVersionRange('0.0.4', '^0.0.3').satisfies, false);
    });

    test('Workspace, local path, git URLs, and registry tags return status unknown', () => {
      const ws1 = satisfiesVersionRange('1.0.0', 'workspace:*');
      assert.strictEqual(ws1.status, 'unknown');
      assert.strictEqual(ws1.satisfies, false);

      const ws2 = satisfiesVersionRange('1.0.0', 'workspace:^1.0.0');
      assert.strictEqual(ws2.status, 'unknown');

      const fileSpec = satisfiesVersionRange('1.0.0', 'file:../my-package');
      assert.strictEqual(fileSpec.status, 'unknown');
      assert.strictEqual(fileSpec.satisfies, false);

      const linkSpec = satisfiesVersionRange('1.0.0', 'link:../my-package');
      assert.strictEqual(linkSpec.status, 'unknown');

      const gitSpec = satisfiesVersionRange('1.0.0', 'git+https://github.com/org/repo.git#main');
      assert.strictEqual(gitSpec.status, 'unknown');

      const tagSpec = satisfiesVersionRange('1.0.0', 'latest');
      assert.strictEqual(tagSpec.status, 'satisfied'); // latest is valid wildcard alias
      assert.strictEqual(satisfiesVersionRange('1.0.0', 'next').status, 'unknown');
      assert.strictEqual(satisfiesVersionRange('1.0.0', 'beta').status, 'unknown');
    });

    test('Malformed, unsupported, or ambiguous specifications never default to satisfied', () => {
      const malformed1 = satisfiesVersionRange('1.0.0', '^1.2.3abc');
      assert.strictEqual(malformed1.status, 'unknown');
      assert.strictEqual(malformed1.satisfies, false);

      const malformed2 = satisfiesVersionRange('1.0.0', '>=1.0.0 ?? 2.0.0');
      assert.strictEqual(malformed2.status, 'unknown');
      assert.strictEqual(malformed2.satisfies, false);

      const malformed3 = satisfiesVersionRange('1.0.0', 'some_random_string');
      assert.strictEqual(malformed3.status, 'unknown');
      assert.strictEqual(malformed3.satisfies, false);
    });

    test('Unknown constraints cannot appear as verified clean', () => {
      const prov = buildDependencyProvenance({
        name: 'internal-ui',
        ecosystem: 'javascript',
        packageManager: 'pnpm',
        manifestPath: 'packages/app/package.json',
        lockfilePath: 'pnpm-lock.yaml',
        declaredSpecifier: 'workspace:*',
        resolvedVersion: '1.0.0',
        isDirect: true,
      });

      // Resolved status and overall status are incomplete due to non-standard range constraint
      assert.strictEqual(prov.resolved.status, 'incomplete');
      assert.strictEqual(prov.satisfiesRange, undefined);
      assert.strictEqual(prov.status, 'incomplete');

      const health = evaluateDependencyHealth({
        id: 'pkg-1',
        name: 'internal-ui',
        ecosystem: 'javascript',
        packageManager: 'pnpm',
        versionDeclared: 'workspace:*',
        versionResolved: '1.0.0',
        scope: 'runtime',
        isDirect: true,
        isTransitive: false,
        manifestPath: 'packages/app/package.json',
        lockfilePath: 'pnpm-lock.yaml',
        provenance: prov,
        evidence: [],
      });

      assert.strictEqual(health.isClean, false);
    });
  });
});
