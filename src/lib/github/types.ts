export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string; // e.g. "facebook/react"
  owner: {
    login: string;
    avatarUrl?: string;
  };
  private: boolean;
  description?: string;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt?: string;
}

export interface GitHubBranch {
  name: string;
  commitSha: string;
  isDefault?: boolean;
}

export interface GitHubCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorName?: string;
  date?: string;
  htmlUrl?: string;
}

export interface GitHubAuthStatus {
  isConfigured: boolean;
  oauthConfigured: boolean;
  hasPersonalToken: boolean;
  currentUser?: {
    login: string;
    name?: string;
    avatarUrl?: string;
  };
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

export interface GitTreeResponse {
  sha: string;
  url: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

export interface GitBlobResponse {
  sha: string;
  size: number;
  url: string;
  content: string;
  encoding: 'base64' | 'utf-8';
}

export interface RepoSourceFilesResult {
  files: Record<string, import('../types/trace').FileRecord>;
  commitSha: string;
  warnings: string[];
  skippedFiles: { path: string; reason: string }[];
}
