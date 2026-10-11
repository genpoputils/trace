import test, { describe } from 'node:test';
import assert from 'node:assert';
import { LocalProjectStore } from '../src/lib/storage/local-project-store';

describe('LocalProjectStore Suite', () => {
  test('seeds and retrieves default sample project instantly in-memory', async () => {
    const store = new LocalProjectStore();
    const sample = await store.getProject('sample-ecommerce-api');
    assert.ok(sample);
    assert.strictEqual(sample.projectId, 'sample-ecommerce-api');
    assert.ok(sample.stats.totalFiles > 0);
    assert.ok(sample.stats.totalSymbols > 0);
  });

  test('saves, retrieves, and lists custom analyzed project', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const customProject = {
      ...sample,
      projectId: 'custom-proj-1',
      projectName: 'Custom Test Project',
    };

    await store.saveProject(customProject);

    const retrieved = await store.getProject('custom-proj-1');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.projectName, 'Custom Test Project');

    const list = await store.listProjects();
    assert.ok(list.some((p) => p.id === 'custom-proj-1'));
    assert.ok(list.some((p) => p.id === 'sample-ecommerce-api'));
  });

  test('finds project by commit SHA deduplication', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const customProject = {
      ...sample,
      projectId: 'immich-test',
      projectName: 'immich-app/immich',
      gitMetadata: {
        owner: 'immich-app',
        repo: 'immich',
        branch: 'main',
        commitSha: 'a1b2c3d4e5f67890',
      },
    };

    await store.saveProject(customProject);

    const found = await store.findProjectByCommit('immich-app', 'immich', 'a1b2c3d4e5f67890');
    assert.ok(found);
    assert.strictEqual(found.projectId, 'immich-test');

    const notFound = await store.findProjectByCommit('immich-app', 'immich', 'wrong-sha');
    assert.strictEqual(notFound, null);
  });

  test('deletes project and protects default sample project', async () => {
    const store = new LocalProjectStore();
    const sample = store.getSampleProject();

    const customProject = {
      ...sample,
      projectId: 'delete-me',
      projectName: 'Delete Me',
    };

    await store.saveProject(customProject);
    assert.ok(await store.getProject('delete-me'));

    const deleted = await store.deleteProject('delete-me');
    assert.strictEqual(deleted, true);
    assert.strictEqual(await store.getProject('delete-me'), null);

    // Default sample cannot be deleted
    const sampleDeleted = await store.deleteProject('sample-ecommerce-api');
    assert.strictEqual(sampleDeleted, false);
    assert.ok(await store.getProject('sample-ecommerce-api'));
  });
});
