import { GitHubRepo, GitHubBranch, GitHubCommit, GitHubAuthStatus } from './types';

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
   * Directly downloads archive zipball in the browser.
   * If browser CORS restrictions or network blocks cross-origin archive redirection,
   * provides a clear explanation and asks user for a token or to use ZIP upload.
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

    // Step 1: Query exact commit SHA
    let commitSha = '';
    try {
      const commit = await this.getLatestCommit(owner, repo, branch, token);
      commitSha = commit.sha;
    } catch {
      commitSha = 'HEAD';
    }

    // Step 2: Download zipball directly
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
          `Browser CORS prevented direct download of '${owner}/${repo}'. Please download the repository .zip from GitHub and use the 'Import Repository Archive' (ZIP) option, or provide a Personal Access Token.`
        );
      }
      throw err;
    }
  }
}

export const browserGitHubClient = new BrowserGitHubClient();
