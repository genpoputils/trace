'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  FolderGit2,
  ChevronDown,
  Search,
  Check,
  GitBranch,
  GitCommit,
  UploadCloud,
  Sparkles,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { ProjectSummary, RepositorySourceType } from '@/lib/storage/local-project-store';
import { GitHubIcon } from './AppHeader';

interface RepositorySelectorProps {
  currentProjectId: string;
  projectsList: ProjectSummary[];
  onSelectProject: (projectId: string) => void;
  onOpenClearLocalDataModal: () => void;
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Unknown';
  try {
    const time = new Date(isoString).getTime();
    if (isNaN(time)) return 'Unknown';
    const diffMs = Date.now() - time;
    if (diffMs < 0) return 'just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const date = new Date(time);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  currentProjectId,
  projectsList,
  onSelectProject,
  onOpenClearLocalDataModal,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Active project lookup
  const activeProject = useMemo(() => {
    return projectsList.find((p) => p.id === currentProjectId) || projectsList[0] || null;
  }, [projectsList, currentProjectId]);

  // Filtered and deduplicated list
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const unique = projectsList.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (!q) return unique;

    return unique.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchOwner = p.owner?.toLowerCase().includes(q) || false;
      const matchRepo = p.repo?.toLowerCase().includes(q) || false;
      const matchId = p.id.toLowerCase().includes(q);
      return matchName || matchOwner || matchRepo || matchId;
    });
  }, [projectsList, searchQuery]);

  // Grouped projects: Sample, GitHub, Upload
  const groupedProjects = useMemo(() => {
    const groups: {
      type: RepositorySourceType;
      title: string;
      items: ProjectSummary[];
    }[] = [
      { type: 'github', title: 'GitHub Repositories', items: [] },
      { type: 'upload', title: 'Uploaded Projects', items: [] },
      { type: 'sample', title: 'Sample Projects', items: [] },
    ];

    for (const p of filteredProjects) {
      const type = p.sourceType || (p.isSample ? 'sample' : p.owner && p.repo ? 'github' : 'upload');
      const grp = groups.find((g) => g.type === type);
      if (grp) {
        grp.items.push(p);
      } else {
        groups[1].items.push(p);
      }
    }

    // Within each group, put active project first, then sort by analyzedAt desc
    for (const g of groups) {
      g.items.sort((a, b) => {
        if (a.id === currentProjectId) return -1;
        if (b.id === currentProjectId) return 1;
        const timeA = new Date(a.analyzedAt || 0).getTime();
        const timeB = new Date(b.analyzedAt || 0).getTime();
        return timeB - timeA;
      });
    }

    return groups.filter((g) => g.items.length > 0);
  }, [filteredProjects, currentProjectId]);

  // Flattened order for keyboard navigation
  const flatVisibleProjects = useMemo(() => {
    const list: ProjectSummary[] = [];
    for (const g of groupedProjects) {
      list.push(...g.items);
    }
    return list;
  }, [groupedProjects]);

  // Open / Close management and focus restoration
  const handleToggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedId(currentProjectId);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    } else {
      triggerButtonRef.current?.focus();
    }
  }, [isOpen, currentProjectId]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = flatVisibleProjects.findIndex((p) => p.id === highlightedId);
        const nextIndex = currentIndex < flatVisibleProjects.length - 1 ? currentIndex + 1 : 0;
        if (flatVisibleProjects[nextIndex]) {
          setHighlightedId(flatVisibleProjects[nextIndex].id);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = flatVisibleProjects.findIndex((p) => p.id === highlightedId);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatVisibleProjects.length - 1;
        if (flatVisibleProjects[prevIndex]) {
          setHighlightedId(flatVisibleProjects[prevIndex].id);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = flatVisibleProjects.find((p) => p.id === highlightedId);
        if (selected) {
          onSelectProject(selected.id);
          setIsOpen(false);
        }
        return;
      }
    },
    [isOpen, flatVisibleProjects, highlightedId, onSelectProject]
  );

  const getSourceBadge = (type?: RepositorySourceType, isSample?: boolean) => {
    const finalType = type || (isSample ? 'sample' : 'upload');
    switch (finalType) {
      case 'github':
        return (
          <span className="repo-badge repo-badge-github" title="Remote GitHub repository">
            <GitHubIcon size={10} /> GitHub
          </span>
        );
      case 'upload':
        return (
          <span className="repo-badge repo-badge-upload" title="Locally uploaded archive">
            <UploadCloud size={10} /> ZIP Upload
          </span>
        );
      case 'sample':
      default:
        return (
          <span className="repo-badge repo-badge-sample" title="Bundled sample project">
            <Sparkles size={10} /> Sample
          </span>
        );
    }
  };

  const displayName = activeProject
    ? activeProject.owner && activeProject.repo
      ? `${activeProject.owner}/${activeProject.repo}`
      : activeProject.name
    : 'Select repository...';

  const customProjectsCount = projectsList.filter(
    (p) => !p.isSample && p.id !== 'sample-ecommerce-api'
  ).length;

  return (
    <div
      className="repo-selector-container"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      style={{ position: 'relative' }}
    >
      {/* Closed State Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        className={`repo-selector-trigger ${isOpen ? 'active' : ''}`}
        onClick={handleToggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="repo-selector-popover-list"
        aria-label={`Current repository: ${displayName}. Click to switch repository`}
        title={`Current repository: ${displayName} (${activeProject?.sourceType || 'Sample'})`}
      >
        <FolderGit2 size={13} className="repo-selector-icon" aria-hidden="true" />
        <span className="repo-selector-name" title={displayName}>
          {displayName}
        </span>
        {activeProject && getSourceBadge(activeProject.sourceType, activeProject.isSample)}
        <ChevronDown
          size={12}
          className={`repo-selector-chevron ${isOpen ? 'open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Open Popover Dropdown Panel */}
      {isOpen && (
        <div
          className="repo-selector-popover"
          role="dialog"
          aria-label="Repository switcher"
        >
          {/* Search Header */}
          <div className="repo-selector-search-box">
            <Search size={13} className="repo-selector-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className="repo-selector-search-input"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedId(null);
              }}
              aria-label="Search repositories by name or owner"
            />
          </div>

          {/* Repository List with Groups */}
          <div
            id="repo-selector-popover-list"
            className="repo-selector-list"
            role="listbox"
            tabIndex={-1}
          >
            {groupedProjects.length === 0 ? (
              <div className="repo-selector-empty">
                No repositories found matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              groupedProjects.map((group) => (
                <div key={group.type} className="repo-selector-group">
                  <div className="repo-selector-group-title">{group.title}</div>
                  {group.items.map((project) => {
                    const isSelected = project.id === currentProjectId;
                    const isHighlighted = project.id === highlightedId;
                    const humanTime = formatRelativeTime(project.analyzedAt);
                    const shortSha = project.commitSha ? project.commitSha.slice(0, 7) : null;

                    return (
                      <div
                        key={project.id}
                        role="option"
                        aria-selected={isSelected}
                        className={`repo-selector-row ${isSelected ? 'selected' : ''} ${
                          isHighlighted ? 'highlighted' : ''
                        }`}
                        onClick={() => {
                          onSelectProject(project.id);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setHighlightedId(project.id)}
                      >
                        <div className="repo-row-main">
                          <div className="repo-row-header">
                            <span className="repo-row-name" title={project.name}>
                              {project.owner && project.repo
                                ? `${project.owner}/${project.repo}`
                                : project.name}
                            </span>
                            {getSourceBadge(project.sourceType, project.isSample)}
                            {isSelected && (
                              <Check
                                size={14}
                                className="repo-row-check"
                                aria-label="Active repository"
                              />
                            )}
                          </div>

                          <div className="repo-row-meta">
                            {project.branch && (
                              <span className="repo-row-branch" title={`Branch: ${project.branch}`}>
                                <GitBranch size={10} /> {project.branch}
                              </span>
                            )}
                            {shortSha && (
                              <span className="repo-row-sha" title={`Commit: ${project.commitSha}`}>
                                <GitCommit size={10} /> {shortSha}
                              </span>
                            )}
                            <span className="repo-row-counts">
                              {project.filesCount} {project.filesCount === 1 ? 'file' : 'files'} •{' '}
                              {project.symbolsCount} symbols
                            </span>
                            <span className="repo-row-time" title={`Analyzed at: ${project.analyzedAt}`}>
                              {humanTime}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Management / Footer Area */}
          <div className="repo-selector-footer">
            <span className="repo-selector-count">
              {projectsList.length} total {projectsList.length === 1 ? 'project' : 'projects'} (
              {customProjectsCount} saved)
            </span>
            <button
              type="button"
              className="btn-clear-local"
              onClick={() => {
                setIsOpen(false);
                onOpenClearLocalDataModal();
              }}
              title="Clear saved local analyses and reset to initial state"
            >
              <Trash2 size={11} aria-hidden="true" />
              <span>Clear local data</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
