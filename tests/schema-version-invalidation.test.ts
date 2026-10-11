import test, { describe } from 'node:test';
import assert from 'node:assert';
import {
  LocalProjectStore,
  CURRENT_ANALYZER_VERSION,
  STORAGE_SCHEMA_VERSION,
} from '../src/lib/storage/local-project-store';

describe('Schema & Analyzer Version Invalidation Suite', () => {
  test('Returns null and invalidates cache when stored schemaVersion does not match current version', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const staleSchemaProject = {
      ...sample,
      projectId: 'stale-schema-proj',
      projectName: 'Old Schema Repo',
    };

    // Save with older incompatible schema version (0 vs STORAGE_SCHEMA_VERSION)
    await store.saveProject(staleSchemaProject, CURRENT_ANALYZER_VERSION, 0);

    // Query project: must detect incompatible schema and return null
    const result = await store.getProject('stale-schema-proj');
    assert.strictEqual(result, null, 'Incompatible schema version must return null');

    // Listing projects must exclude the invalidated project
    const list = await store.listProjects();
    assert.ok(!list.some((p) => p.id === 'stale-schema-proj'), 'Invalidated project excluded from list');
  });

  test('Returns null and invalidates cache when stored analyzerVersion does not match current version', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const staleAnalyzerProject = {
      ...sample,
      projectId: 'stale-analyzer-proj',
      projectName: 'Old Analyzer Repo',
    };

    // Save with obsolete analyzer version
    await store.saveProject(staleAnalyzerProject, 'trace-v0.8.0-beta', STORAGE_SCHEMA_VERSION);

    // Query project: must detect outdated analyzer version and return null
    const result = await store.getProject('stale-analyzer-proj');
    assert.strictEqual(result, null, 'Incompatible analyzer version must return null');
  });

  test('findProjectByCommit invalidates incompatible cached results and returns null for re-analysis', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const staleCommitProject = {
      ...sample,
      projectId: 'stale-commit-proj',
      projectName: 'testowner/testrepo',
      gitMetadata: {
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        commitSha: 'commit_sha_12345',
      },
    };

    // Save with incompatible analyzer version
    await store.saveProject(staleCommitProject, 'trace-v0.5.0', STORAGE_SCHEMA_VERSION);

    // Reusing commit cache must reject incompatible cache entry
    const found = await store.findProjectByCommit('testowner', 'testrepo', 'commit_sha_12345');
    assert.strictEqual(found, null, 'Incompatible commit cache entry must not be reused');
  });

  test('Accepts and returns projects with matching schema and analyzer versions', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const validProject = {
      ...sample,
      projectId: 'valid-current-proj',
      projectName: 'currentowner/currentrepo',
      gitMetadata: {
        owner: 'currentowner',
        repo: 'currentrepo',
        branch: 'main',
        commitSha: 'commit_valid_sha',
      },
    };

    await store.saveProject(validProject, CURRENT_ANALYZER_VERSION, STORAGE_SCHEMA_VERSION);

    const retrieved = await store.getProject('valid-current-proj');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.projectId, 'valid-current-proj');

    const commitFound = await store.findProjectByCommit('currentowner', 'currentrepo', 'commit_valid_sha');
    assert.ok(commitFound);
    assert.strictEqual(commitFound.projectId, 'valid-current-proj');
  });
});
