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
