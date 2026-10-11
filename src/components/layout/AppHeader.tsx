'use client';

import React from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  Compass,
  Search,
  Upload,
  GitBranch,
  GitCommit,
  Sun,
  Moon,
} from 'lucide-react';

import { ProjectSummary } from '@/lib/storage/local-project-store';

export function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

interface AppHeaderProps {
  analysis: ProjectAnalysis | null;
  currentProjectId: string;
  projectsList: ProjectSummary[];
  theme: 'light' | 'dark';
  onSelectProject: (projectId: string) => void;
  onOpenSearch: () => void;
  onOpenGitHubModal: () => void;
  onOpenUploadModal: () => void;
  onToggleTheme: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  analysis,
  currentProjectId,
  projectsList,
  theme,
  onSelectProject,
  onOpenSearch,
  onOpenGitHubModal,
  onOpenUploadModal,
  onToggleTheme,
}) => {
  const gitMeta = analysis?.gitMetadata;
  const repoName = gitMeta ? `${gitMeta.owner}/${gitMeta.repo}` : analysis?.projectName || '';
  const branchName = gitMeta?.branch || 'main';
  const commitShortSha = gitMeta?.commitSha ? gitMeta.commitSha.slice(0, 7) : null;

  return (
    <header className="app-header" role="banner">
      {/* Brand & Repository Identity */}
      <div className="brand-section">
        <div className="brand-logo-badge" aria-label="GenPopUtils Trace Logo">
          <Compass size={17} />
        </div>
        <div className="brand-title">
          <span>GenPopUtils</span>
          <span className="brand-sub">Trace</span>
        </div>

        {/* Repository breadcrumb & Git metadata */}
        {analysis && (
          <div className="header-breadcrumb">
            <span className="breadcrumb-repo" title={repoName}>
              {repoName}
            </span>
            <span style={{ color: 'var(--text-muted)' }} aria-hidden="true">/</span>
            <span className="branch-pill" title={`Active Branch: ${branchName}`}>
              <GitBranch size={11} color="var(--text-secondary)" /> {branchName}
            </span>
            {commitShortSha && (
              <span className="commit-pill" title={`Analyzed Git Commit: ${gitMeta?.commitSha}`}>
                <GitCommit size={11} /> {commitShortSha}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Header Actions & Controls */}
      <div className="header-controls">
        {/* Project Switcher */}
        {projectsList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="project-switcher" style={{ display: 'none' }}>Select Project</label>
            <select
              id="project-switcher"
              value={currentProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
              className="tool-btn"
              style={{
                padding: '5px 8px',
                fontSize: 12,
                maxWidth: 160,
                textOverflow: 'ellipsis',
                background: 'var(--bg-tertiary)',
              }}
              title="Switch repository or project"
              aria-label="Switch project"
            >
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Global Search Trigger */}
        <button
          className="search-trigger-btn"
          onClick={onOpenSearch}
          title="Search symbols, functions, routes, and files (Ctrl+K / ⌘K)"
          aria-label="Open global search modal"
        >
          <Search size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Search symbols...
          </span>
          <span className="kbd-badge">Ctrl K</span>
        </button>

        {/* Connect GitHub */}
        <button
          className="btn-github"
          onClick={onOpenGitHubModal}
          title="Connect public or private GitHub repository"
          aria-label="Connect GitHub Repository"
        >
          <GitHubIcon size={14} />
          <span className="btn-label-desktop">Connect GitHub</span>
        </button>

        {/* Import ZIP */}
        <button
          className="btn-upload"
          onClick={onOpenUploadModal}
          title="Import and analyze repository .zip archive"
          aria-label="Upload repository ZIP archive"
        >
          <Upload size={13} />
          <span className="btn-label-desktop">Upload ZIP</span>
        </button>

        {/* Theme Switcher */}
        <button
          className="tool-btn"
          onClick={onToggleTheme}
          style={{ padding: '5px 8px' }}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  );
};
