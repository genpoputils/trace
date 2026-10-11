'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  FolderGit2,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Play,
  Download,
  UploadCloud,
} from 'lucide-react';
import { GitHubRepo, GitHubBranch } from '@/lib/github/types';
import { browserGitHubClient } from '@/lib/github/browser-github-client';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectLoaded: (projectId: string) => void;
  onOpenUploadModal?: () => void;
}

export const GitHubModal: React.FC<GitHubModalProps> = ({
  isOpen,
  onClose,
  onProjectLoaded,
  onOpenUploadModal,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'public' | 'setup'>('connect');

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
  const [currentJob, setCurrentJob] = useState<{
    id: string;
    stage: string;
    progress: { current: number; total: number; message: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttemptedRepo, setLastAttemptedRepo] = useState<{ owner: string; repo: string; branch: string } | null>(null);

  const mouseDownOnOverlayRef = useRef(false);
  const activePollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBranches = useCallback(async (owner: string, repo: string, token?: string) => {
    setLoadingBranches(true);
    try {
      const branchList = await browserGitHubClient.listBranches(owner, repo, token || personalToken || undefined);
      setBranches(branchList);
      if (branchList.length > 0) {
        setSelectedBranch(branchList[0].name);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBranches(false);
    }
  }, [personalToken]);

  const fetchRepos = useCallback(async (token?: string) => {
    setLoadingRepos(true);
    setError(null);
    try {
      const repoList = await browserGitHubClient.listUserRepos(token || personalToken || undefined);
      setRepos(repoList);
      if (repoList.length > 0) {
        const first = repoList[0];
        setSelectedRepoFullName(first.fullName);
        fetchBranches(first.owner.login, first.name, token || personalToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error fetching GitHub repositories.');
    } finally {
      setLoadingRepos(false);
    }
  }, [personalToken, fetchBranches]);

  // Clean up polling on unmount
  useEffect(() => {
    const pollId = activePollRef.current;
    return () => {
      if (pollId) clearInterval(pollId);
    };
  }, []);

  // Fetch repos on modal open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchRepos();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, fetchRepos]);

  const handleSelectRepo = (fullName: string) => {
    setSelectedRepoFullName(fullName);
    const [owner, repo] = fullName.split('/');
    fetchBranches(owner, repo);
  };

  const handleStartAnalysis = async (owner: string, repo: string, branch: string) => {
    setLastAttemptedRepo({ owner, repo, branch });
    setAnalyzing(true);
    setError(null);
    setCurrentJob(null);
    setAnalysisStatus(`Connecting to GitHub API for ${owner}/${repo}@${branch}...`);

    try {
      const result = await browserAnalysisService.importGitHubRepo(
        owner,
        repo,
        branch,
        personalToken || undefined,
        (stage, prog) => {
          setAnalysisStatus(prog.message);
          setCurrentJob({
            id: `job_${Date.now()}`,
            stage,
            progress: prog,
          });
        }
      );

      if (result.cached) {
        setAnalysisStatus(`Loaded cached analysis!`);
      } else {
        setAnalysisStatus('Analysis complete! Loading interactive graph...');
      }
      onProjectLoaded(result.projectId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          mouseDownOnOverlayRef.current = true;
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlayRef.current) {
          onClose();
        }
        mouseDownOnOverlayRef.current = false;
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderGit2 size={20} color="var(--primary-blue)" />
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
                  {personalToken ? (
                    <span style={{ color: 'var(--success-teal)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Personal Access Token Applied (Active Session)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <Globe size={14} /> Public Mode (50 req/hr rate limit). Add a token for private repos and 5,000 req/hr.
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setActiveTab('setup')}
                  className="tool-btn"
                  style={{ fontSize: 11 }}
                >
                  <HelpCircle size={13} /> Token Guide
                </button>
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
                  {loadingRepos && <span style={{ color: 'var(--primary-blue)', fontSize: 11 }}><RefreshCw size={11} className="animate-spin" /> Loading repos...</span>}
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
                  {loadingBranches && <span style={{ color: 'var(--primary-blue)', fontSize: 11 }}><RefreshCw size={11} className="animate-spin" /> Fetching branches...</span>}
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
                  Direct Browser-Side GitHub Integration:
                </strong>
                <p style={{ marginBottom: 8 }}>
                  Trace runs 100% locally in your browser without requiring a backend server.
                </p>
                <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li><strong>Public Repositories:</strong> Analyze any public repository directly without signing in (subject to GitHub&apos;s 60 req/hr public rate limit).</li>
                  <li><strong>Private Repositories:</strong> Generate a Personal Access Token on GitHub with <code>repo</code> scope at <code>github.com/settings/tokens</code>.</li>
                  <li><strong>Local Security:</strong> Your token is kept only in active browser memory during this tab session. It is never stored on disk, never sent to external servers, and never written to localStorage.</li>
                  <li><strong>CORS Fallback:</strong> If browser CORS restrictions prevent direct zipball downloads for specific repositories, download the repository <code>.zip</code> directly from GitHub and use Trace&apos;s <strong>&quot;Import Repository Archive&quot;</strong> button.</li>
                </ol>
              </div>

              <div style={{ padding: 12, background: 'var(--blue-selection-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--primary-blue)' }}>
                <strong>Zero Trace Backend Required:</strong> Repositories are decompressed and analyzed in your browser&apos;s Web Worker, keeping full code privacy on your machine.
              </div>
            </div>
          )}

          {/* Real-Time Live Analysis Progress Card */}
          {analyzing && (
            <div
              style={{
                padding: 14,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={14} className="animate-spin" color="var(--primary-blue)" />
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {currentJob?.stage ? currentJob.stage.toUpperCase() : 'PROCESSING'}
                  </strong>
                </div>
                {currentJob?.progress?.total ? (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {currentJob.progress.current} / {currentJob.progress.total}
                  </span>
                ) : null}
              </div>

              {/* Progress bar */}
              {currentJob?.progress?.total && currentJob.progress.total > 0 ? (
                <div
                  style={{
                    height: 6,
                    width: '100%',
                    background: 'var(--border-color)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(5, Math.round((currentJob.progress.current / currentJob.progress.total) * 100)))}%`,
                      background: 'var(--primary-blue)',
                      transition: 'width 0.25s ease-out',
                    }}
                  />
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {analysisStatus}
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Analysis executes directly in your browser&apos;s Web Worker. You can safely keep this open or close it.
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (() => {
            const corsMatch = error.match(/direct download of '([^'/]+)\/([^']+)'/);
            const targetOwner = lastAttemptedRepo?.owner || (corsMatch ? corsMatch[1] : null);
            const targetRepo = lastAttemptedRepo?.repo || (corsMatch ? corsMatch[2] : null);
            const targetBranch = lastAttemptedRepo?.branch || 'main';
            const isCorsError = error.includes('CORS') || error.includes('direct download');

            return (
              <div
                style={{
                  padding: 12,
                  background: 'var(--error-bg)',
                  border: '1px solid var(--error-red)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  color: 'var(--error-red)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ lineHeight: 1.4 }}>{error}</span>
                </div>

                {isCorsError && targetOwner && targetRepo && (
                  <div
                    style={{
                      padding: 12,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginTop: 2,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Download size={14} color="var(--primary-blue)" /> 1-Click Browser Download & Import
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      GitHub&apos;s download server (<code>codeload.github.com</code>) blocks direct client-side fetch requests in static apps. Use the link below to download the ZIP directly via your browser, then import it:
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <a
                        href={`https://github.com/${targetOwner}/${targetRepo}/archive/refs/heads/${targetBranch}.zip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tool-btn active"
                        style={{
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          background: 'var(--primary-blue)',
                          color: '#fff',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        <Download size={13} /> 1. Download {targetRepo}.zip
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenUploadModal?.();
                        }}
                        className="tool-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          fontSize: 12,
                        }}
                      >
                        <UploadCloud size={13} /> 2. Import Downloaded ZIP
                      </button>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                      <strong>Repository Language Notice:</strong> Trace analyzes <strong>TypeScript and JavaScript</strong> projects (.ts, .tsx, .js, .jsx). Non-JS/TS repositories (such as Rust or Python in <em>{targetOwner}/{targetRepo}</em>) will only index JS/TS components.
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
