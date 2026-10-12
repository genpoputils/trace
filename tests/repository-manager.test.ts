import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { localProjectStore, LocalProjectStore } from '../src/lib/storage/local-project-store';
import { BrowserAnalysisService } from '../src/lib/services/browser-analysis-service';
import { ProjectAnalysis } from '../src/lib/types/trace';
import { formatRelativeTime } from '../src/components/layout/RepositorySelector';

describe('Repository Manager, Local Data Reset & GitHub Re-sync Suite', () => {
  const originalFetch = globalThis.fetch;
  let store: LocalProjectStore;
  let service: BrowserAnalysisService;

  beforeEach(async () => {
    store = localProjectStore;
    await store.clearAll();
    service = new BrowserAnalysisService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /* ==============================================================================
     1. Repository Selector & Metadata Classification
     ============================================================================== */
  describe('Repository Selector & Metadata Intelligence', () => {
    test('accurately classifies Sample, GitHub, and ZIP Upload project sources in listProjects', async () => {
      const sample = store.getSampleProject();

      // GitHub project
      const githubProject: ProjectAnalysis = {
        ...sample,
        projectId: 'gh-proj-facebook-react',
        projectName: 'facebook/react',
        sourceType: 'github',
        gitMetadata: {
          owner: 'facebook',
          repo: 'react',
          branch: 'main',
          commitSha: '112233445566778899aabbccddeeff0011223344',
        },
      };

      // ZIP Upload project (no remote GitHub source)
      const zipProject: ProjectAnalysis = {
        ...sample,
        projectId: 'zip-proj-my-app',
        projectName: 'my-custom-archive.zip',
        sourceType: 'upload',
        gitMetadata: undefined,
      };

      await store.saveProject(githubProject);
      await store.saveProject(zipProject);

      const list = await store.listProjects();
      const sampleEntry = list.find((p) => p.id === 'sample-ecommerce-api');
      const ghEntry = list.find((p) => p.id === 'gh-proj-facebook-react');
      const zipEntry = list.find((p) => p.id === 'zip-proj-my-app');

      assert.ok(sampleEntry, 'Sample project entry must exist');
      assert.strictEqual(sampleEntry?.sourceType, 'sample');
      assert.strictEqual(sampleEntry?.isSample, true);

      assert.ok(ghEntry, 'GitHub project entry must exist');
      assert.strictEqual(ghEntry?.sourceType, 'github');
      assert.strictEqual(ghEntry?.owner, 'facebook');
      assert.strictEqual(ghEntry?.repo, 'react');
      assert.strictEqual(ghEntry?.branch, 'main');
      assert.strictEqual(ghEntry?.commitSha, '112233445566778899aabbccddeeff0011223344');

      assert.ok(zipEntry, 'ZIP project entry must exist');
      assert.strictEqual(zipEntry?.sourceType, 'upload');
      assert.strictEqual(zipEntry?.owner, undefined);
      assert.strictEqual(zipEntry?.repo, undefined);
    });

    test('deduplicates project records and includes accurate file/symbol counts', async () => {
      const sample = store.getSampleProject();
      const customProject: ProjectAnalysis = {
        ...sample,
        projectId: 'proj-unique-counts',
        projectName: 'Unique Counts App',
        stats: {
          ...sample.stats,
          totalFiles: 42,
          totalSymbols: 1337,
        },
      };

      await store.saveProject(customProject);
      // Save second time with same ID
      await store.saveProject(customProject);

      const list = await store.listProjects();
      const matches = list.filter((p) => p.id === 'proj-unique-counts');
      assert.strictEqual(matches.length, 1, 'Duplicate saves must not produce duplicate list entries');
      assert.strictEqual(matches[0].filesCount, 42);
      assert.strictEqual(matches[0].symbolsCount, 1337);
    });

    test('formatRelativeTime produces human-friendly relative durations', () => {
      const now = new Date().toISOString();
      assert.strictEqual(formatRelativeTime(now), 'just now');

      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(fiveMinsAgo), '5m ago');

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(twoHoursAgo), '2h ago');

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(threeDaysAgo), '3d ago');

      assert.strictEqual(formatRelativeTime(undefined), 'Unknown');
      assert.strictEqual(formatRelativeTime('not-a-date'), 'Unknown');
    });
  });

  /* ==============================================================================
     2. GitHub Re-sync Operations
     ============================================================================== */
  describe('GitHub Re-sync Engine', () => {
    test('reports already up to date when remote commit SHA matches stored analysis', async () => {
      const sample = store.getSampleProject();
      const currentCommit = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';

      const githubProject: ProjectAnalysis = {
        ...sample,
        projectId: 'resync-up-to-date-test',
        projectName: 'acme/analytics',
        sourceType: 'github',
        gitMetadata: {
          owner: 'acme',
          repo: 'analytics',
          branch: 'main',
          commitSha: currentCommit,
        },
      };

      await store.saveProject(githubProject);

      // Mock GitHub API returning identical commit SHA
      globalThis.fetch = async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('/commits/main')) {
          return new Response(
            JSON.stringify({ sha: currentCommit, commit: { message: 'Existing HEAD commit' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      };

      const result = await service.resyncGitHubProject('resync-up-to-date-test');

      assert.strictEqual(result.status, 'up-to-date');
      assert.strictEqual(result.previousCommitSha, currentCommit);
      assert.strictEqual(result.newCommitSha, currentCommit);
      assert.strictEqual(result.analysis.projectId, 'resync-up-to-date-test');

      // Verify analysis status reflects up-to-date outcome
      const session = service.getSessionState();
      assert.strictEqual(session.status, 'completed');
      assert.ok(session.progress.message.includes('already up to date'));
      assert.ok(session.progress.message.includes(currentCommit.slice(0, 7)));
    });

    test('fetches new remote tree and updates analysis when a newer commit exists', async () => {
      const sample = store.getSampleProject();
      const oldCommit = '0000111122223333444455556666777788889999';
      const newCommit = 'ffff9999eeee8888dddd7777cccc6666bbbb5555';

      const githubProject: ProjectAnalysis = {
        ...sample,
        projectId: 'resync-update-test',
        projectName: 'acme/analytics',
        sourceType: 'github',
        gitMetadata: {
          owner: 'acme',
          repo: 'analytics',
          branch: 'main',
          commitSha: oldCommit,
        },
      };

      await store.saveProject(githubProject);

      // Mock GitHub API returning new commit and tree
      globalThis.fetch = async (url: string | URL | Request) => {
        const u = String(url);

        if (u.includes('/commits/main')) {
          return new Response(
            JSON.stringify({ sha: newCommit, commit: { message: 'feat: add telemetry hooks' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (u.includes(`/git/trees/${newCommit}`)) {
          return new Response(
            JSON.stringify({
              sha: newCommit,
              truncated: false,
              tree: [
                { path: 'src/telemetry.ts', type: 'blob', sha: 'sha_tel', size: 120 },
                { path: 'package.json', type: 'blob', sha: 'sha_pkg', size: 90 },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (u.includes('raw.githubusercontent.com') && u.includes('src/telemetry.ts')) {
          return new Response('export function sendEvent(name: string) { return name; }', {
            status: 200,
          });
        }

        if (u.includes('raw.githubusercontent.com') && u.includes('package.json')) {
          return new Response('{"name": "analytics", "version": "2.0.0"}', {
            status: 200,
          });
        }

        return new Response('Not Found', { status: 404 });
      };

      const result = await service.resyncGitHubProject('resync-update-test');

      assert.strictEqual(result.status, 'updated');
      assert.strictEqual(result.previousCommitSha, oldCommit);
      assert.strictEqual(result.newCommitSha, newCommit);
      assert.strictEqual(result.analysis.gitMetadata?.commitSha, newCommit);

      // Verify updated project is persisted with new commit in store
      const updatedRecord = await store.getProject(result.analysis.projectId);
      assert.ok(updatedRecord);
      assert.strictEqual(updatedRecord?.gitMetadata?.commitSha, newCommit);
    });

    test('rejects re-sync for non-GitHub projects (Sample & ZIP uploads)', async () => {
      // 1. Try to re-sync sample project
      await assert.rejects(
        async () => {
          await service.resyncGitHubProject('sample-ecommerce-api');
        },
        /Re-sync is only available for GitHub repositories/
      );

      // 2. Try to re-sync ZIP upload project
      const sample = store.getSampleProject();
      const zipProject: ProjectAnalysis = {
        ...sample,
        projectId: 'zip-local-only',
        projectName: 'my-project.zip',
        sourceType: 'upload',
        gitMetadata: undefined,
      };
      await store.saveProject(zipProject);

      await assert.rejects(
        async () => {
          await service.resyncGitHubProject('zip-local-only');
        },
        /Re-sync is only available for GitHub repositories/
      );
    });

    test('handles authentication failures (401) with actionable error message and session recovery', async () => {
      const sample = store.getSampleProject();
      const githubProject: ProjectAnalysis = {
        ...sample,
        projectId: 'private-auth-fail',
        projectName: 'secret-corp/private-service',
        sourceType: 'github',
        gitMetadata: {
          owner: 'secret-corp',
          repo: 'private-service',
          branch: 'main',
          commitSha: '9999888877776666',
        },
      };
      await store.saveProject(githubProject);

      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await assert.rejects(
        async () => {
          await service.resyncGitHubProject('private-auth-fail');
        },
        /Bad credentials|401/
      );

      const session = service.getSessionState();
      assert.strictEqual(session.status, 'failed');
      assert.ok(session.error?.recoveryAction?.includes('Personal Access Token'));
      assert.strictEqual(session.canRetry, true);
    });

    test('prevents concurrent analysis / sync operations on the same session', async () => {
      const sample = store.getSampleProject();
      const githubProject: ProjectAnalysis = {
        ...sample,
        projectId: 'concurrent-sync-test',
        projectName: 'org/repo',
        sourceType: 'github',
        gitMetadata: {
          owner: 'org',
          repo: 'repo',
          branch: 'main',
          commitSha: '1234567890abcdef',
        },
      };
      await store.saveProject(githubProject);

      // Hang the fetch promise to keep session running
      let finishFirstFetch: () => void;
      globalThis.fetch = () =>
        new Promise((resolve) => {
          finishFirstFetch = () => {
            resolve(
              new Response(JSON.stringify({ sha: '1234567890abcdef', commit: { message: 'ok' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          };
        });

      // Start first operation
      const firstOp = service.resyncGitHubProject('concurrent-sync-test');

      // Attempt second operation concurrently
      await assert.rejects(
        async () => {
          await service.resyncGitHubProject('concurrent-sync-test');
        },
        /already in progress/
      );

      finishFirstFetch!();
      await firstOp;
    });

    test('safely reuses ephemeral in-memory session token without writing to disk or storage', () => {
      service.setSessionToken('my-org', 'private-repo', 'ghp_ephemeral_token_12345');
      const retrieved = service.getSessionToken('my-org', 'private-repo');
      assert.strictEqual(retrieved, 'ghp_ephemeral_token_12345');

      // Case-insensitivity check
      assert.strictEqual(
        service.getSessionToken('MY-ORG', 'PRIVATE-REPO'),
        'ghp_ephemeral_token_12345'
      );

      // Verify token for different repo returns undefined
      assert.strictEqual(service.getSessionToken('my-org', 'other-repo'), undefined);
    });
  });

  /* ==============================================================================
     3. Clear Local Data Operations
     ============================================================================== */
  describe('Clear Local Data Engine', () => {
    test('clears custom projects, preserves sample regeneration, and resets caches', async () => {
      const sample = store.getSampleProject();

      // Add two custom projects
      await store.saveProject({
        ...sample,
        projectId: 'custom-to-clear-1',
        projectName: 'Custom 1',
      });
      await store.saveProject({
        ...sample,
        projectId: 'custom-to-clear-2',
        projectName: 'Custom 2',
      });

      const beforeCount = await store.countCustomProjects();
      assert.strictEqual(beforeCount, 2);

      // Execute clearLocalData
      const result = await service.clearLocalData();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.projectsCleared, 2);

      // Custom projects should be gone
      assert.strictEqual(await store.getProject('custom-to-clear-1'), null);
      assert.strictEqual(await store.getProject('custom-to-clear-2'), null);

      // Sample project can still be retrieved normally
      const sampleAfter = await store.getProject('sample-ecommerce-api');
      assert.ok(sampleAfter);
      assert.strictEqual(sampleAfter?.projectId, 'sample-ecommerce-api');

      // Project list contains sample project
      const listAfter = await store.listProjects();
      assert.strictEqual(listAfter.length, 1);
      assert.strictEqual(listAfter[0].id, 'sample-ecommerce-api');

      // Session state is reset to idle
      const session = service.getSessionState();
      assert.strictEqual(session.status, 'idle');
    });

    test('storage remains usable for new saves and queries after clearing', async () => {
      await service.clearLocalData();

      const sample = store.getSampleProject();
      const newProject: ProjectAnalysis = {
        ...sample,
        projectId: 'new-project-after-clear',
        projectName: 'Post-Reset Application',
      };

      // Save a new project after clearing
      await store.saveProject(newProject);

      const retrieved = await store.getProject('new-project-after-clear');
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.projectName, 'Post-Reset Application');

      const list = await store.listProjects();
      assert.ok(list.some((p) => p.id === 'new-project-after-clear'));
    });

    test('cancels active analysis during reset and prevents stale data restoration', async () => {
      const sample = store.getSampleProject();

      // Save initial project
      await store.saveProject({
        ...sample,
        projectId: 'active-cancel-test',
        projectName: 'Active App',
      });

      // Simulate a running analysis state
      const internalService = service as unknown as {
        activeSessionId: string | null;
        sessionState: { status: string };
      };
      internalService.activeSessionId = 'stale_session_123';
      internalService.sessionState.status = 'running';

      // Clear local data
      await service.clearLocalData();

      // Verify active session was cancelled
      assert.strictEqual(internalService.activeSessionId, null);
      assert.strictEqual(service.getSessionState().status, 'idle');

      // Verify previous project does not exist
      assert.strictEqual(await store.getProject('active-cancel-test'), null);
    });
  });
});
