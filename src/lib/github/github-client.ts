import {
  GitHubRepo,
  GitHubBranch,
  GitHubCommit,
  GitHubAuthStatus,
} from './types';

export class GitHubClient {
  private clientId: string;
  private clientSecret: string;
  private defaultToken?: string;

  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID || '';
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    this.defaultToken = process.env.GITHUB_TOKEN || '';
  }

  public getAuthStatus(sessionToken?: string): GitHubAuthStatus {
    return {
      isConfigured: !!(this.clientId && this.clientSecret) || !!(sessionToken || this.defaultToken),
      oauthConfigured: !!(this.clientId && this.clientSecret),
      hasPersonalToken: !!(sessionToken || this.defaultToken),
    };
  }

  public getOAuthLoginUrl(redirectUri?: string, state?: string): string {
    if (!this.clientId) {
      throw new Error('GITHUB_CLIENT_ID is not configured in server environment.');
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'repo,read:user',
      state: state || 'agy_trace_state',
    });
    if (redirectUri) {
      params.append('redirect_uri', redirectUri);
    }
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCode(code: string, redirectUri?: string): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('GitHub OAuth credentials are not configured in server environment.');
    }

    const payload: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    };
    if (redirectUri) payload.redirect_uri = redirectUri;

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return data.access_token;
  }

  public async listUserRepos(token?: string): Promise<GitHubRepo[]> {
    const effectiveToken = token || this.defaultToken;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (effectiveToken) {
      headers.Authorization = `token ${effectiveToken}`;
    }

    const endpoint = effectiveToken
      ? 'https://api.github.com/user/repos?sort=updated&per_page=30'
      : 'https://api.github.com/repositories?per_page=15';

    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('GitHub token expired or unauthorized. Please re-authenticate.');
      }
      if (res.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please configure a GitHub token.');
      }
      throw new Error(`GitHub API error: HTTP ${res.status}`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) return [];

    return rawList.map((r: any) => ({
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
    const effectiveToken = token || this.defaultToken;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (effectiveToken) {
      headers.Authorization = `token ${effectiveToken}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Repository '${owner}/${repo}' not found or access denied.`);
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
    const effectiveToken = token || this.defaultToken;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (effectiveToken) {
      headers.Authorization = `token ${effectiveToken}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to list branches for '${owner}/${repo}': HTTP ${res.status}`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) return [];

    return rawList.map((b: any) => ({
      name: b.name,
      commitSha: b.commit?.sha || '',
    }));
  }

  public async getLatestCommit(owner: string, repo: string, branch: string, token?: string): Promise<GitHubCommit> {
    const effectiveToken = token || this.defaultToken;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (effectiveToken) {
      headers.Authorization = `token ${effectiveToken}`;
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

  public async downloadRepoArchive(
    owner: string,
    repo: string,
    branch: string,
    token?: string
  ): Promise<{ buffer: Buffer; commitSha: string }> {
    const effectiveToken = token || this.defaultToken;
    const headers: Record<string, string> = {
      'User-Agent': 'GenPopUtils-Trace/1.0',
    };
    if (effectiveToken) {
      headers.Authorization = `token ${effectiveToken}`;
    }

    // Step 1: Get exact latest commit SHA for accurate metadata recording
    let commitSha = '';
    try {
      const commit = await this.getLatestCommit(owner, repo, branch, token);
      commitSha = commit.sha;
    } catch {
      commitSha = 'HEAD';
    }

    // Step 2: Download zipball
    const downloadUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
    const res = await fetch(downloadUrl, { headers, redirect: 'follow' });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Archive download not available for '${owner}/${repo}@${branch}'`);
      }
      throw new Error(`Failed to download repository archive from GitHub: HTTP ${res.status}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    return { buffer, commitSha };
  }
}

export const githubClient = new GitHubClient();
