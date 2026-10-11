'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  FolderGit2,
  Lock,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Code2,
  Key,
  HelpCircle,
  Play,
} from 'lucide-react';
import { GitHubRepo, GitHubBranch } from '@/lib/github/types';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectLoaded: (projectId: string) => void;
}

export const GitHubModal: React.FC<GitHubModalProps> = ({
  isOpen,
  onClose,
  onProjectLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'public' | 'setup'>('connect');

  // Auth & Connection State
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [personalToken, setPersonalToken] = useState<string>('');

  // Repos & Branches
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string>('');
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Public repo direct input
  const [publicRepoInput, setPublicRepoInput] = useState<string>('expressjs/express');
  const [publicBranch, setPublicBranch] = useState<string>('master');

  // Loading & Progress
  const [loadingRepos, setLoadingRepos] = useState<boolean>(false);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch status on open
  useEffect(() => {
    if (isOpen) {
      fetch('/api/github/status')
        .then((res) => res.json())
        .then((data) => {
          setAuthStatus(data.status);
          fetchRepos();
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const fetchRepos = async (token?: string) => {
    setLoadingRepos(true);
    setError(null);
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token || personalToken || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.repos) {
        setRepos(data.repos);
        if (data.repos.length > 0) {
          const first = data.repos[0];
          setSelectedRepoFullName(first.fullName);
          fetchBranches(first.owner.login, first.name, token || personalToken);
        }
      } else {
        setError(data.error || 'Failed to fetch repositories.');
      }
    } catch (err) {
      setError('Network error fetching GitHub repositories.');
    } finally {
      setLoadingRepos(false);
    }
  };

  const fetchBranches = async (owner: string, repo: string, token?: string) => {
    setLoadingBranches(true);
    try {
      const res = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, token: token || personalToken || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.branches) {
        setBranches(data.branches);
        if (data.branches.length > 0) {
          setSelectedBranch(data.branches[0].name);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSelectRepo = (fullName: string) => {
    setSelectedRepoFullName(fullName);
    const [owner, repo] = fullName.split('/');
    fetchBranches(owner, repo);
  };

  const handleStartAnalysis = async (owner: string, repo: string, branch: string) => {
    setAnalyzing(true);
    setError(null);
    setAnalysisStatus(`Connecting to GitHub API for ${owner}/${repo}@${branch}...`);

    try {
      setAnalysisStatus('Downloading repository source zipball and resolving commit SHA...');
      const res = await fetch('/api/github/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          token: personalToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Repository analysis failed');
      }

      setAnalysisStatus(`Analysis complete! Commit ${data.shortSha} indexed.`);
      onProjectLoaded(data.projectId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderGit2 size={20} color="var(--cyan-primary)" />
            <div>
              <strong style={{ fontSize: 15, display: 'block' }}>Connect GitHub Repository</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Analyze source code, extract dependency graph, and link exact commit SHA
              </span>
            </div>
          </div>
          <button onClick={onClose}><X size={18} color="var(--text-muted)" /></button>
        </div>

        {/* Tab Navigation */}
        <div className="panel-tabs" style={{ padding: '0 16px' }}>
          <button
            className={`panel-tab ${activeTab === 'connect' ? 'active' : ''}`}
            onClick={() => setActiveTab('connect')}
          >
            Repository Selection
          </button>
          <button
            className={`panel-tab ${activeTab === 'public' ? 'active' : ''}`}
            onClick={() => setActiveTab('public')}
          >
            Public GitHub URL
          </button>
          <button
            className={`panel-tab ${activeTab === 'setup' ? 'active' : ''}`}
            onClick={() => setActiveTab('setup')}
          >
            OAuth Setup Guide
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* TAB 1: CONNECT & SELECT REPOSITORY */}
          {activeTab === 'connect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Auth Header Banner */}
              <div
                style={{
                  padding: 12,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {authStatus?.oauthConfigured ? (
                    <span style={{ color: 'var(--emerald-primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> OAuth Integration Configured
                    </span>
                  ) : (
                    <span style={{ color: 'var(--amber-primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <Key size={14} /> OAuth not yet configured in .env (Use PAT or Public)
                    </span>
                  )}
                </div>

                {authStatus?.oauthConfigured ? (
                  <a
                    href="/api/github/auth"
                    className="tool-btn active"
                    style={{ textDecoration: 'none', fontSize: 11 }}
                  >
                    Authorize with GitHub
                  </a>
                ) : (
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="tool-btn"
                    style={{ fontSize: 11 }}
                  >
                    View Setup Instructions
                  </button>
                )}
              </div>

              {/* Personal Access Token Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Personal Access Token (Optional for Private Repos):
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="ghp_... (paste GitHub token with 'repo' scope)"
                    value={personalToken}
                    onChange={(e) => setPersonalToken(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <button
                    onClick={() => fetchRepos(personalToken)}
                    className="tool-btn"
                    style={{ fontSize: 12 }}
                  >
                    Apply Token
                  </button>
                </div>
              </div>

              {/* Repository Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Select Repository:</span>
                  {loadingRepos && <span style={{ color: 'var(--cyan-primary)', fontSize: 11 }}><RefreshCw size={11} className="animate-spin" /> Loading repos...</span>}
                </label>
                <select
                  value={selectedRepoFullName}
                  onChange={(e) => handleSelectRepo(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {repos.map((r) => (
                    <option key={r.id} value={r.fullName}>
                      {r.fullName} {r.private ? '(Private)' : '(Public)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Branch:</span>
                  {loadingBranches && <span style={{ color: 'var(--cyan-primary)', fontSize: 11 }}><RefreshCw size={11} className="animate-spin" /> Fetching branches...</span>}
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} {b.commitSha ? `(${b.commitSha.slice(0, 7)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Button */}
              <button
                disabled={!selectedRepoFullName || analyzing}
                onClick={() => {
                  const [owner, repo] = selectedRepoFullName.split('/');
                  handleStartAnalysis(owner, repo, selectedBranch || 'main');
                }}
                className="btn-upload"
                style={{ padding: '10px 16px', fontSize: 14, justifyContent: 'center', marginTop: 6 }}
              >
                {analyzing ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} className="animate-spin" /> {analysisStatus}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Play size={16} /> Start Codebase Analysis
                  </span>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: PUBLIC GITHUB REPO DIRECT */}
          {activeTab === 'public' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyze any open-source GitHub repository immediately without requiring an OAuth login or token.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  GitHub Repository (owner/repo or full URL):
                </label>
                <input
                  type="text"
                  placeholder="e.g. expressjs/express or vercel/next.js"
                  value={publicRepoInput}
                  onChange={(e) => setPublicRepoInput(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Branch:
                </label>
                <input
                  type="text"
                  placeholder="master or main"
                  value={publicBranch}
                  onChange={(e) => setPublicBranch(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              {/* Popular One-Click Examples */}
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick Examples:</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    className="tool-btn"
                    onClick={() => { setPublicRepoInput('expressjs/express'); setPublicBranch('master'); }}
                  >
                    expressjs/express
                  </button>
                  <button
                    className="tool-btn"
                    onClick={() => { setPublicRepoInput('facebook/jest'); setPublicBranch('main'); }}
                  >
                    facebook/jest
                  </button>
                </div>
              </div>

              <button
                disabled={!publicRepoInput || analyzing}
                onClick={() => {
                  let cleaned = publicRepoInput.trim();
                  if (cleaned.startsWith('https://github.com/')) {
                    cleaned = cleaned.replace('https://github.com/', '');
                  }
                  const parts = cleaned.split('/');
                  if (parts.length >= 2) {
                    handleStartAnalysis(parts[0], parts[1], publicBranch || 'main');
                  } else {
                    setError('Please specify repository in "owner/repo" format.');
                  }
                }}
                className="btn-upload"
                style={{ padding: '10px 16px', fontSize: 14, justifyContent: 'center', marginTop: 10 }}
              >
                {analyzing ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} className="animate-spin" /> {analysisStatus}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Play size={16} /> Fetch and Analyze Public Repo
                  </span>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: SETUP INSTRUCTIONS */}
          {activeTab === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                  How to Configure GitHub OAuth for Local Development:
                </strong>
                <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>Go to <code>https://github.com/settings/developers</code></li>
                  <li>Click <strong>&quot;New OAuth App&quot;</strong></li>
                  <li>Set <strong>Application name:</strong> <code>GenPopUtils Trace</code></li>
                  <li>Set <strong>Homepage URL:</strong> <code>http://localhost:3000</code></li>
                  <li>Set <strong>Authorization callback URL:</strong> <code>http://localhost:3000/api/github/callback</code></li>
                  <li>Copy the generated <strong>Client ID</strong> and <strong>Client Secret</strong> into your <code>.env.local</code> file:</li>
                </ol>
                <pre
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: '#0d1117',
                    borderRadius: 4,
                    color: '#7ee787',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
{`GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here`}
                </pre>
              </div>

              <div style={{ padding: 12, background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--cyan-primary)' }}>
                <strong>No OAuth setup needed for local inspection:</strong> You can also paste a GitHub Personal Access Token (PAT) with <code>repo</code> scope directly into the field above to analyze private repositories without configuring an OAuth application.
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div
              style={{
                padding: 10,
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid var(--rose-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'var(--rose-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
