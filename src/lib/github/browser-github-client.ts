import {
  GitHubRepo,
  GitHubBranch,
  GitHubCommit,
  GitHubAuthStatus,
  GitTreeResponse,
  GitBlobResponse,
  GitTreeItem,
  RepoSourceFilesResult,
} from './types';
import { isEligibleSourceFile, detectLanguage } from '../ingestion/zip-ingestion';
import { FileRecord } from '../types/trace';

interface GitHubApiRawRepo {
  id: number;
  name: string;
  full_name: string;
  owner?: { login?: string; avatar_url?: string };
  private?: boolean;
  description?: string;
  default_branch?: string;
  html_url: string;
  updated_at: string;
}

interface GitHubApiRawBranch {
  name: string;
  commit?: { sha?: string };
}

export interface FetchRepoOptions {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
  concurrency?: number;
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  signal?: AbortSignal;
  onProgress?: (stage: string, progress: { current: number; total: number; message: string }) => void;
}

/**
 * Safely decodes base64 content into a UTF-8 string across both browser and Node environments.
 */
export function decodeBase64Utf8(base64Str: string): string {
  const clean = base64Str.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(clean, 'base64').toString('utf-8');
  }
  const binaryStr = atob(clean);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Bounded concurrency executor for async tasks with AbortSignal cancellation support.
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  const workers = new Array(poolSize).fill(null).map(async () => {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        throw new Error('Analysis cancelled by user.');
      }
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}


export class BrowserGitHubClient {
  public getAuthStatus(userToken?: string): GitHubAuthStatus {
    return {
      isConfigured: !!userToken,
      oauthConfigured: false, // In a static-only browser app, personal access token (PAT) is used
      hasPersonalToken: !!userToken,
    };
  }

  public async listUserRepos(token?: string): Promise<GitHubRepo[]> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const endpoint = token
      ? 'https://api.github.com/user/repos?sort=updated&per_page=30'
      : 'https://api.github.com/repositories?per_page=15';

    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('GitHub token expired or unauthorized. Please re-enter your Personal Access Token.');
      }
      if (res.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Provide a GitHub Personal Access Token to increase your limit to 5,000 requests/hour.');
      }
      throw new Error(`GitHub API error: HTTP ${res.status}`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) return [];

    return (rawList as GitHubApiRawRepo[]).map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: {
        login: r.owner?.login || '',
        avatarUrl: r.owner?.avatar_url,
      },
      private: !!r.private,
      description: r.description,
      defaultBranch: r.default_branch || 'main',
      htmlUrl: r.html_url,
      updatedAt: r.updated_at,
    }));
  }

  public async getRepoDetails(owner: string, repo: string, token?: string): Promise<GitHubRepo> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Repository '${owner}/${repo}' not found or access denied. If private, check your Personal Access Token permissions.`);
      }
      throw new Error(`GitHub API error fetching repository details: HTTP ${res.status}`);
    }

    const r = await res.json();
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: {
        login: r.owner?.login || owner,
        avatarUrl: r.owner?.avatar_url,
      },
      private: !!r.private,
      description: r.description,
      defaultBranch: r.default_branch || 'main',
      htmlUrl: r.html_url,
      updatedAt: r.updated_at,
    };
  }

  public async listBranches(owner: string, repo: string, token?: string): Promise<GitHubBranch[]> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to list branches for '${owner}/${repo}': HTTP ${res.status}`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) return [];

    return (rawList as GitHubApiRawBranch[]).map((b) => ({
      name: b.name,
      commitSha: b.commit?.sha || '',
    }));
  }

  public async getLatestCommit(owner: string, repo: string, branch: string, token?: string): Promise<GitHubCommit> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Branch or commit '${branch}' not found for '${owner}/${repo}'. Check repository spelling and branch name.`);
      }
      if (res.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Provide a GitHub Personal Access Token to increase your limit to 5,000 requests/hour.');
      }
      throw new Error(`Failed to retrieve commit for branch '${branch}': HTTP ${res.status}`);
    }

    const c = await res.json();
    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit?.message || '',
      authorName: c.commit?.author?.name,
      date: c.commit?.author?.date,
      htmlUrl: c.html_url,
    };
  }

  /**
   * Retrieve the full Git tree for a commit SHA.
   */
  public async getGitTree(
    owner: string,
    repo: string,
    commitSha: string,
    recursive: boolean = true,
    token?: string
  ): Promise<GitTreeResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const endpoint = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}${recursive ? '?recursive=1' : ''}`;
    const res = await fetch(endpoint, { headers });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Unauthorized: GitHub token invalid or expired. Please re-enter your Personal Access Token.');
      }
      if (res.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Provide a Personal Access Token with repo scope to increase rate limit to 5,000 req/hr.');
      }
      if (res.status === 404) {
        throw new Error(`Git tree not found for '${owner}/${repo}@${commitSha}'. If this repository is private, provide a Personal Access Token.`);
      }
      throw new Error(`Failed to fetch Git tree for '${owner}/${repo}': HTTP ${res.status}`);
    }

    return (await res.json()) as GitTreeResponse;
  }

  /**
   * Fetches raw file text from raw.githubusercontent.com pinned to commit SHA (CORS-enabled).
   */
  public async getRawFileContent(
    owner: string,
    repo: string,
    commitSha: string,
    filePath: string,
    token?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `token ${token.trim()}`;
    }

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${filePath}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch raw file '${filePath}': HTTP ${res.status}`);
    }
    return res.text();
  }

  /**
   * Fetches blob content from GitHub Git Blobs API (decodes base64).
   */
  public async getBlobContent(
    owner: string,
    repo: string,
    blobSha: string,
    token?: string
  ): Promise<string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${blobSha}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch blob '${blobSha}': HTTP ${res.status}`);
    }

    const data = (await res.json()) as GitBlobResponse;
    if (data.encoding === 'base64') {
      return decodeBase64Utf8(data.content);
    }
    return data.content;
  }

  /**
   * Imports repository source files through the Git Tree & Blobs/Raw APIs.
   * Completely avoids codeload.github.com archive CORS blocks in the browser.
   */
  public async fetchRepositorySourceFiles(options: FetchRepoOptions): Promise<RepoSourceFilesResult> {
    const {
      owner,
      repo,
      branch = 'main',
      token,
      concurrency = 6,
      maxFiles = 1500,
      maxFileSize = 2 * 1024 * 1024,
      maxTotalSize = 40 * 1024 * 1024,
      onProgress,
    } = options;

    onProgress?.('discovering', {
      current: 5,
      total: 100,
      message: `Resolving commit SHA for ${owner}/${repo}@${branch}...`,
    });

    let commitSha = '';
    if (/^[0-9a-f]{40}$/i.test(branch.trim())) {
      commitSha = branch.trim();
    } else {
      const commit = await this.getLatestCommit(owner, repo, branch, token);
      commitSha = commit.sha;
    }

    onProgress?.('discovering', {
      current: 12,
      total: 100,
      message: `Fetching Git tree for ${owner}/${repo}@${commitSha.slice(0, 7)}...`,
    });

    const treeRes = await this.getGitTree(owner, repo, commitSha, true, token);
    const warnings: string[] = [];
    const skippedFiles: { path: string; reason: string }[] = [];

    if (treeRes.truncated) {
      warnings.push('Repository tree was truncated by GitHub API (>100,000 objects). Only indexed objects were scanned.');
    }

    const rawTree = treeRes.tree || [];
    let eligibleItems: GitTreeItem[] = [];

    for (const item of rawTree) {
      if (item.type !== 'blob') continue;
      const check = isEligibleSourceFile(item.path, item.size, maxFileSize);
      if (!check.eligible) {
        skippedFiles.push({ path: item.path, reason: check.reason || 'Excluded file or directory' });
        continue;
      }
      eligibleItems.push(item);
    }

    if (eligibleItems.length > maxFiles) {
      warnings.push(
        `Candidate file count (${eligibleItems.length}) exceeded safety limit (${maxFiles}). Truncated to first ${maxFiles} source files.`
      );
      eligibleItems = eligibleItems.slice(0, maxFiles);
    }

    const totalEligible = eligibleItems.length;
    if (totalEligible === 0) {
      onProgress?.('indexing', {
        current: 100,
        total: 100,
        message: `No eligible source files found in ${owner}/${repo}.`,
      });
      return {
        files: {},
        commitSha,
        warnings: ['No eligible JavaScript or TypeScript source files found in repository.'],
        skippedFiles,
      };
    }

    onProgress?.('indexing', {
      current: 15,
      total: 100,
      message: `Found ${totalEligible} eligible source files. Starting download...`,
    });

    const files: Record<string, FileRecord> = {};
    let downloadedCount = 0;
    let totalExtractedBytes = 0;
    let sizeLimitReached = false;

    if (options.signal?.aborted) {
      throw new Error('Analysis cancelled by user.');
    }

    // Concurrency-limited downloading
    await pMap(
      eligibleItems,
      async (item) => {
        if (sizeLimitReached || options.signal?.aborted) return;


        let content = '';
        try {
          // Attempt raw fetch first (zero API rate limit consumption for public repos)
          try {
            content = await this.getRawFileContent(owner, repo, commitSha, item.path, token);
          } catch (rawErr) {
            // If raw fetch fails and we have a blob SHA, fallback to Git Blobs API (needed for private repos)
            if (item.sha) {
              content = await this.getBlobContent(owner, repo, item.sha, token);
            } else {
              throw rawErr;
            }
          }
        } catch (fetchErr) {
          skippedFiles.push({
            path: item.path,
            reason: `Failed to download: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
          });
          return;
        }

        // Check for binary content
        if (content.includes('\0')) {
          skippedFiles.push({ path: item.path, reason: 'Binary file detected' });
          return;
        }

        const byteLength =
          typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(content).length
            : content.length;

        if (byteLength > maxFileSize) {
          skippedFiles.push({
            path: item.path,
            reason: `File size (${(byteLength / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`,
          });
          return;
        }

        if (totalExtractedBytes + byteLength > maxTotalSize) {
          if (!sizeLimitReached) {
            sizeLimitReached = true;
            warnings.push(
              `Total source code size exceeded safety limit (${(maxTotalSize / 1024 / 1024).toFixed(0)}MB). Remaining files omitted.`
            );
          }
          return;
        }

        totalExtractedBytes += byteLength;
        const lines = content.split('\n').length;
        const language = detectLanguage(item.path);

        files[item.path] = {
          path: item.path,
          content,
          lines,
          size: byteLength,
          language,
        };

        downloadedCount++;
        onProgress?.('fetching', {
          current: downloadedCount,
          total: totalEligible,
          message: `Downloaded ${downloadedCount} / ${totalEligible} files (${item.path})...`,
        });
      },
      concurrency,
      options.signal
    );


    if (totalEligible > 0 && Object.keys(files).length === 0) {
      const firstSkipped = skippedFiles.find((s) => s.reason.startsWith('Failed to download'));
      throw new Error(
        `Failed to download repository files from GitHub. ${firstSkipped ? firstSkipped.reason : 'All file requests failed.'}`
      );
    }

    return {
      files,
      commitSha,
      warnings,
      skippedFiles,
    };
  }

  /**
   * Downloads archive zipball in environments where archive redirection is supported.
   * Kept for backwards compatibility and offline test tooling.
   */
  public async downloadRepoArchive(
    owner: string,
    repo: string,
    branch: string,
    token?: string
  ): Promise<{ buffer: ArrayBuffer; commitSha: string }> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    let commitSha = '';
    try {
      const commit = await this.getLatestCommit(owner, repo, branch, token);
      commitSha = commit.sha;
    } catch {
      commitSha = 'HEAD';
    }

    const downloadUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
    try {
      const res = await fetch(downloadUrl, { headers, redirect: 'follow' });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Archive download not available for '${owner}/${repo}@${branch}'`);
        }
        if (res.status === 403) {
          throw new Error('GitHub API rate limit exceeded or private repo access denied. Please provide a Personal Access Token.');
        }
        throw new Error(`Failed to download repository archive: HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      return { buffer, commitSha };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch') || msg.includes('CORS') || msg.includes('NetworkError')) {
        throw new Error(
          `Browser CORS prevented direct download of '${owner}/${repo}'. Please use direct tree-based import or provide a repository archive ZIP.`
        );
      }
      throw err;
    }
  }
}

export const browserGitHubClient = new BrowserGitHubClient();
