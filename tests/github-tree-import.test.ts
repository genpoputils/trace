import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BrowserGitHubClient, decodeBase64Utf8, pMap } from '../src/lib/github/browser-github-client';
import { BrowserAnalysisService } from '../src/lib/services/browser-analysis-service';

describe('GitHub Tree-Based Import & CORS Resilience Suite', () => {
  const originalFetch = globalThis.fetch;
  let ghClient: BrowserGitHubClient;
  let service: BrowserAnalysisService;

  beforeEach(() => {
    ghClient = new BrowserGitHubClient();
    service = new BrowserAnalysisService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('decodeBase64Utf8 decodes standard ASCII and multibyte Unicode/emojis cleanly', () => {
    const ascii = 'export const name = "Trace";';
    const asciiB64 = Buffer.from(ascii).toString('base64');
    assert.strictEqual(decodeBase64Utf8(asciiB64), ascii);

    const unicode = '// 🚀 Welcome to GenPopUtils Trace — 智能分析';
    const unicodeB64 = Buffer.from(unicode, 'utf-8').toString('base64');
    assert.strictEqual(decodeBase64Utf8(unicodeB64), unicode);
  });

  test('pMap bounds maximum concurrency to specified limit', async () => {
    const items = Array.from({ length: 15 }, (_, i) => i);
    let active = 0;
    let maxObservedActive = 0;

    await pMap(
      items,
      async (item) => {
        active++;
        if (active > maxObservedActive) maxObservedActive = active;
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return item * 2;
      },
      4
    );

    assert.ok(maxObservedActive <= 4, `Max active (${maxObservedActive}) should be <= 4`);
  });

  test('Public repository tree/file import fetches via raw.githubusercontent without CORS block', async () => {
    const commitSha = '1111111111111111111111111111111111111111';

    globalThis.fetch = async (url: string | URL | Request) => {
      const u = String(url);

      if (u.includes('/commits/main')) {
        return new Response(JSON.stringify({ sha: commitSha, commit: { message: 'Initial commit' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (u.includes(`/git/trees/${commitSha}`)) {
        return new Response(
          JSON.stringify({
            sha: commitSha,
            truncated: false,
            tree: [
              { path: 'src/index.ts', type: 'blob', sha: 'sha_index', size: 120 },
              { path: 'src/calc.ts', type: 'blob', sha: 'sha_calc', size: 85 },
              { path: 'node_modules/dep/index.js', type: 'blob', sha: 'sha_nm', size: 50 },
              { path: 'dist/bundle.js', type: 'blob', sha: 'sha_dist', size: 500 },
              { path: 'src/calc.test.ts', type: 'blob', sha: 'sha_test', size: 100 },
              { path: 'package-lock.json', type: 'blob', sha: 'sha_lock', size: 200 },
              { path: 'README.md', type: 'blob', sha: 'sha_md', size: 60 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (u.includes('raw.githubusercontent.com') && u.includes('src/index.ts')) {
        return new Response('export function greet(name: string) { return "Hello " + name; }', {
          status: 200,
        });
      }

      if (u.includes('raw.githubusercontent.com') && u.includes('src/calc.ts')) {
        return new Response('export function add(a: number, b: number) { return a + b; }', {
          status: 200,
        });
      }

      return new Response('Not Found', { status: 404 });
    };

    const res = await ghClient.fetchRepositorySourceFiles({
      owner: 'acme',
      repo: 'library',
      branch: 'main',
    });

    assert.strictEqual(res.commitSha, commitSha);
    assert.strictEqual(Object.keys(res.files).length, 2);
    assert.ok(res.files['src/index.ts']);
    assert.ok(res.files['src/calc.ts']);
    assert.strictEqual(res.files['src/index.ts'].language, 'typescript');

    const skippedPaths = res.skippedFiles.map((s) => s.path);
    assert.ok(skippedPaths.includes('node_modules/dep/index.js'));
    assert.ok(skippedPaths.includes('dist/bundle.js'));
    assert.ok(skippedPaths.includes('src/calc.test.ts'));
    assert.ok(skippedPaths.includes('package-lock.json'));
    assert.ok(skippedPaths.includes('README.md'));
  });

  test('Private repository uses Git Blobs API with Authorization header and base64 decoding', async () => {
    const commitSha = '2222222222222222222222222222222222222222';
    const fakeToken = 'ghp_secretToken1234567890';
    let authHeaderObserved = false;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);

      if (u.includes('/commits/main')) {
        return new Response(JSON.stringify({ sha: commitSha, commit: { message: 'Private commit' } }), {
          status: 200,
        });
      }

      if (u.includes(`/git/trees/${commitSha}`)) {
        return new Response(
          JSON.stringify({
            sha: commitSha,
            truncated: false,
            tree: [{ path: 'src/secret.ts', type: 'blob', sha: 'blob_secret_sha', size: 150 }],
          }),
          { status: 200 }
        );
      }

      // Raw fetch fails for private repository
      if (u.includes('raw.githubusercontent.com')) {
        return new Response('Not Found', { status: 404 });
      }

      // Git Blobs API fallback
      if (u.includes('/git/blobs/blob_secret_sha')) {
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers && headers.Authorization === `Bearer ${fakeToken}`) {
          authHeaderObserved = true;
        }
        return new Response(
          JSON.stringify({
            sha: 'blob_secret_sha',
            size: 40,
            encoding: 'base64',
            content: Buffer.from("export const apiKey = 'secret_live_999';").toString('base64'),
          }),
          { status: 200 }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const res = await ghClient.fetchRepositorySourceFiles({
      owner: 'org',
      repo: 'private-repo',
      branch: 'main',
      token: fakeToken,
    });

    assert.ok(authHeaderObserved, 'Authorization Bearer header was sent to GitHub Git Blobs API');
    assert.ok(res.files['src/secret.ts']);
    assert.strictEqual(res.files['src/secret.ts'].content, "export const apiKey = 'secret_live_999';");
  });

  test('Filters out oversized files before downloading and reports warning on truncated tree', async () => {
    const commitSha = '3333333333333333333333333333333333333333';
    let hugeFileDownloaded = false;

    globalThis.fetch = async (url: string | URL | Request) => {
      const u = String(url);

      if (u.includes('/commits/main')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }

      if (u.includes(`/git/trees/${commitSha}`)) {
        return new Response(
          JSON.stringify({
            sha: commitSha,
            truncated: true, // Marked truncated by GitHub
            tree: [
              { path: 'src/normal.ts', type: 'blob', sha: 'sha_norm', size: 500 },
              { path: 'src/huge-bundle.js', type: 'blob', sha: 'sha_huge', size: 10 * 1024 * 1024 }, // 10MB
            ],
          }),
          { status: 200 }
        );
      }

      if (u.includes('normal.ts')) {
        return new Response('export const normal = 1;', { status: 200 });
      }

      if (u.includes('huge-bundle.js')) {
        hugeFileDownloaded = true;
        return new Response('big', { status: 200 });
      }

      return new Response('404', { status: 404 });
    };

    const res = await ghClient.fetchRepositorySourceFiles({
      owner: 'org',
      repo: 'big-repo',
      branch: 'main',
      maxFileSize: 2 * 1024 * 1024,
    });

    assert.strictEqual(hugeFileDownloaded, false, 'Oversized file was not fetched');
    assert.ok(res.files['src/normal.ts']);
    assert.strictEqual(res.files['src/huge-bundle.js'], undefined);
    assert.ok(
      res.warnings.some((w) => w.includes('truncated by GitHub API')),
      'Recorded truncated tree warning'
    );
  });

  test('BrowserAnalysisService.importGitHubRepo stores commit metadata and reuses cache on second call', async () => {
    const commitSha = '4444444444444444444444444444444444444444';
    let networkFetches = 0;

    globalThis.fetch = async (url: string | URL | Request) => {
      networkFetches++;
      const u = String(url);

      if (u.includes('/commits/main')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }

      if (u.includes(`/git/trees/${commitSha}`)) {
        return new Response(
          JSON.stringify({
            sha: commitSha,
            truncated: false,
            tree: [{ path: 'src/app.ts', type: 'blob', sha: 'app_sha', size: 80 }],
          }),
          { status: 200 }
        );
      }

      if (u.includes('src/app.ts')) {
        return new Response('export function startApp() { return true; }', { status: 200 });
      }

      return new Response('404', { status: 404 });
    };

    // First import: downloads and analyzes
    const firstResult = await service.importGitHubRepo('cache-org', 'cached-app', 'main');
    assert.strictEqual(firstResult.cached, false);
    assert.strictEqual(firstResult.analysis.gitMetadata?.commitSha, commitSha);
    const initialFetches = networkFetches;

    // Second import: retrieves from cache deduplication without re-fetching Git tree or source files
    const secondResult = await service.importGitHubRepo('cache-org', 'cached-app', 'main');
    assert.strictEqual(secondResult.cached, true);
    assert.strictEqual(secondResult.analysis.gitMetadata?.commitSha, commitSha);
    // Only 1 additional request was made (to resolve latest commit SHA)
    assert.strictEqual(networkFetches, initialFetches + 1);
  });

  test('Archive CORS failure regression: tree-based import bypasses archive download completely', async () => {
    const commitSha = '5555555555555555555555555555555555555555';
    let zipballAttempted = false;

    globalThis.fetch = async (url: string | URL | Request) => {
      const u = String(url);

      if (u.includes('/zipball/')) {
        zipballAttempted = true;
        throw new TypeError('Failed to fetch: CORS error on codeload.github.com');
      }

      if (u.includes('/commits/master')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }

      if (u.includes(`/git/trees/${commitSha}`)) {
        return new Response(
          JSON.stringify({
            sha: commitSha,
            truncated: false,
            tree: [{ path: 'src/main.ts', type: 'blob', sha: 'sha_main', size: 50 }],
          }),
          { status: 200 }
        );
      }

      if (u.includes('src/main.ts')) {
        return new Response('export const version = "1.0.0";', { status: 200 });
      }

      return new Response('404', { status: 404 });
    };

    const res = await service.importGitHubRepo('mojombo', 'grit', 'master');
    assert.strictEqual(zipballAttempted, false, 'Did not attempt CORS-blocked zipball endpoint');
    assert.ok(res.analysis.entities, 'Analysis completed successfully');
    assert.strictEqual(res.analysis.gitMetadata?.commitSha, commitSha);
  });
});
