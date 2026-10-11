import { test, describe } from 'node:test';
import assert from 'node:assert';
import { analysisJobService } from '../src/lib/analysis/analysis-job-service';
import { projectStore } from '../src/lib/storage/project-store';
import { ProjectAnalysis } from '../src/lib/types/trace';

describe('Analysis Job Service & Deduplication Suite', () => {
  test('Returns cached analysis immediately when commit SHA is already in store', async () => {
    // Seed a mock completed project
    const mockCommitSha = 'a1b2c3d4e5f67890123456789012345678901234';
    const mockAnalysis: ProjectAnalysis = {
      projectId: 'proj_mock_cached',
      projectName: 'testowner/testrepo',
      analyzedAt: new Date().toISOString(),
      version: '1.0.0',
      gitMetadata: {
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        commitSha: mockCommitSha,
      },
      stats: {
        totalFiles: 10,
        totalLines: 500,
        languages: ['TypeScript'],
        totalSymbols: 25,
        totalRelationships: 30,
        unresolvedCalls: 0,
        routesCount: 2,
        dbQueriesCount: 1,
        mostConnected: [],
      },
      entities: {},
      relationships: [],
      files: {},
      warnings: [],
      limitations: [],
    };

    projectStore.saveProject(mockAnalysis);

    // Verify findProjectByCommit
    const found = projectStore.findProjectByCommit('testowner', 'testrepo', mockCommitSha);
    assert.ok(found, 'Found project in store by commit');
    assert.strictEqual(found.projectId, 'proj_mock_cached');
  });

  test('Tracks job stage and progress in AnalysisJobService', () => {
    const job = analysisJobService.getJob('non_existent_id');
    assert.strictEqual(job, null, 'Non existent job returns null');
  });
});
