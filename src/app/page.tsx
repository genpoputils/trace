'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProjectAnalysis, EntityKind } from '@/lib/types/trace';
import { RelationshipGraph } from '@/components/graph/RelationshipGraph';
import { ExecutionPathView } from '@/components/views/ExecutionPathView';
import { DataFlowView } from '@/components/views/DataFlowView';
import { ImpactView } from '@/components/views/ImpactView';
import { DashboardView } from '@/components/views/DashboardView';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { LowerSourcePanel } from '@/components/source/LowerSourcePanel';
import { UploadModal } from '@/components/modals/UploadModal';
import { GitHubModal } from '@/components/modals/GitHubModal';
import { SearchModal } from '@/components/modals/SearchModal';
import {
  Compass,
  Zap,
  Waves,
  ShieldAlert,
  BarChart3,
  Search,
  Upload,
  FolderGit2,
  GitBranch,
  GitCommit,
  Filter,
  Eye,
  FileCode,
  Sparkles,
  Sun,
  Moon,
  ChevronRight,
  ChevronDown,
  Layers,
  Settings,
} from 'lucide-react';

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export default function TraceHomePage() {
  const [currentProjectId, setCurrentProjectId] = useState<string>('sample-ecommerce-api');
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'paths' | 'dataflow' | 'impact' | 'code' | 'ai' | 'settings'>('graph');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [githubModalOpen, setGithubModalOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);

  // Graph Filters
  const [focusNeighborhood, setFocusNeighborhood] = useState<boolean>(false);
  const [selectedFilterKinds, setSelectedFilterKinds] = useState<EntityKind[]>([]);

  // Available projects list
  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);

  // Toggle Theme
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Load project list
  const refreshProjectsList = useCallback(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) {
          setProjectsList(data.projects);
        }
      })
      .catch((err) => console.error('Failed to list projects:', err));
  }, []);

  useEffect(() => {
    refreshProjectsList();
  }, [refreshProjectsList]);

  // Load project analysis data
  const loadProject = useCallback((projectId: string) => {
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.project) {
          setAnalysis(data.project);
          setCurrentProjectId(projectId);
          // Set initial selected entity to first route or central hub
          const firstRoute = Object.values(data.project.entities as Record<string, any>).find(
            (e: any) => e.kind === 'route'
          );
          if (firstRoute) {
            setSelectedEntityId(firstRoute.id);
          } else if (data.project.stats?.mostConnected?.[0]) {
            setSelectedEntityId(data.project.stats.mostConnected[0].symbolId);
          }
        }
      })
      .catch((err) => console.error('Failed to load project:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProject(currentProjectId);
  }, [currentProjectId, loadProject]);

  // Global hotkeys (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEntitySelect = (entityId: string) => {
    setSelectedEntityId(entityId);
    setInspectorOpen(true);
  };

  const toggleKindFilter = (kind: EntityKind) => {
    setSelectedFilterKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  };

  // Repo metadata
  const gitMeta = analysis?.gitMetadata;
  const repoName = gitMeta ? `${gitMeta.owner}/${gitMeta.repo}` : analysis?.projectName || 'Repository';
  const branchName = gitMeta?.branch || 'main';
  const commitShortSha = gitMeta?.commitSha ? gitMeta.commitSha.slice(0, 7) : 'c8f12a9';

  return (
    <div className="app-container">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Compass size={17} />
          </div>
          <div className="brand-title">
            <span>GenPopUtils</span>
            <span className="brand-sub">Trace</span>
          </div>

          {/* Breadcrumb, Branch & Commit Details */}
          {analysis && (
            <div className="header-breadcrumb">
              <span className="breadcrumb-repo">{repoName}</span>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <span className="branch-pill" title="Active Branch">
                <GitBranch size={11} color="var(--text-secondary)" /> {branchName}
              </span>
              <span className="commit-pill" title="Analyzed Commit SHA">
                <GitCommit size={11} /> {commitShortSha}
              </span>
            </div>
          )}
        </div>

        <div className="header-controls">
          {/* Project Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={currentProjectId}
              onChange={(e) => loadProject(e.target.value)}
              className="tool-btn"
              style={{ padding: '5px 8px', fontSize: 12 }}
            >
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Global Search Trigger */}
          <button className="search-trigger-btn" onClick={() => setSearchModalOpen(true)}>
            <Search size={13} />
            <span>Search symbols or code...</span>
            <span className="kbd-badge">Ctrl K</span>
          </button>

          {/* Connect GitHub Repository */}
          <button className="btn-github" onClick={() => setGithubModalOpen(true)}>
            <GitHubIcon size={14} /> Connect GitHub
          </button>

          {/* Import ZIP */}
          <button className="btn-upload" onClick={() => setUploadModalOpen(true)}>
            <Upload size={13} /> Upload ZIP
          </button>

          {/* Theme Switcher */}
          <button
            className="tool-btn"
            onClick={toggleTheme}
            style={{ padding: '5px 8px' }}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </header>

      {/* 2. MAIN APPLICATION WORKSPACE */}
      <div className="main-body">
        {/* LEFT SIDEBAR: Professional IDE Navigation */}
        <aside
          className="left-sidebar"
          style={{
            width: sidebarCollapsed ? 52 : 260,
            transition: 'width 0.18s ease',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            {!sidebarCollapsed && (
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Navigation
              </span>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="tool-btn"
              style={{ padding: '3px 6px', fontSize: 11 }}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} />}
            </button>
          </div>

          <div className="nav-tabs" style={{ padding: sidebarCollapsed ? '6px 4px' : 6 }}>
            <button
              className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              title="Overview"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <BarChart3 size={15} /> {!sidebarCollapsed && 'Overview'}
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'paths' ? 'active' : ''}`}
              onClick={() => setActiveTab('paths')}
              title="Trace Explorer"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <Zap size={15} /> {!sidebarCollapsed && 'Trace Explorer'}
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
              onClick={() => setActiveTab('graph')}
              title="Dependencies (Graph)"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <Compass size={15} /> {!sidebarCollapsed && 'Dependencies (Graph)'}
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'dataflow' ? 'active' : ''}`}
              onClick={() => setActiveTab('dataflow')}
              title="Data Flow"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <Waves size={15} /> {!sidebarCollapsed && 'Data Flow'}
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveTab('impact')}
              title="Impact Analysis"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <ShieldAlert size={15} /> {!sidebarCollapsed && 'Impact Analysis'}
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('graph');
                setInspectorOpen(true);
              }}
              title="AI Insights"
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '8px 0' : '7px 10px' }}
            >
              <Sparkles size={15} color="var(--primary-blue)" /> {!sidebarCollapsed && 'AI Insights'}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Code Explorer Section Header */}
              <div className="sidebar-section-header">
                <span>Code Explorer</span>
                {analysis && <span style={{ fontSize: 10 }}>{analysis.stats.totalFiles} files</span>}
              </div>

              {/* File Tree */}
              <div className="sidebar-scroll-content">
                {analysis && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {Object.keys(analysis.files).map((filePath) => {
                      const symbolsInFile = Object.values(analysis.entities).filter(
                        (e) => e.filePath === filePath && e.kind !== 'file'
                      );
                      const isFileActive = selectedEntityId && analysis.entities[selectedEntityId]?.filePath === filePath;

                      return (
                        <div
                          key={filePath}
                          onClick={() => {
                            const target = symbolsInFile[0] || Object.values(analysis.entities).find((e) => e.filePath === filePath);
                            if (target) handleEntitySelect(target.id);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12,
                            cursor: 'pointer',
                            background: isFileActive ? 'var(--blue-selection-bg)' : 'transparent',
                            color: isFileActive ? 'var(--primary-blue)' : 'var(--text-secondary)',
                            fontWeight: isFileActive ? 600 : 400,
                          }}
                          className="nav-tab-btn"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                            <FileCode size={13} color={isFileActive ? 'var(--primary-blue)' : 'var(--text-muted)'} />
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {filePath}
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {symbolsInFile.length}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* CENTER WORKSPACE */}
        <main className="center-workspace">
          {/* Workspace Toolbar */}
          <div className="workspace-toolbar">
            <div className="toolbar-info">
              {analysis && (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{analysis.projectName}</strong>
                  <span>•</span>
                  <span>{analysis.stats.totalSymbols} symbols</span>
                  <span>•</span>
                  <span>{analysis.stats.totalRelationships} relationships</span>
                  <span>•</span>
                  <span>{analysis.stats.routesCount} routes</span>
                </>
              )}
            </div>

            {/* Contextual Toolbar Controls */}
            <div className="toolbar-controls">
              {activeTab === 'graph' && (
                <>
                  <button
                    className={`tool-btn ${focusNeighborhood ? 'active' : ''}`}
                    onClick={() => setFocusNeighborhood(!focusNeighborhood)}
                    title="Focus view strictly on selected entity and its direct connections"
                  >
                    <Eye size={13} /> {focusNeighborhood ? 'Focus ON' : 'Focus'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Filter size={13} color="var(--text-muted)" />
                    {(['route', 'component', 'hook', 'function', 'db_query'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleKindFilter(k)}
                        className={`tool-btn ${selectedFilterKinds.includes(k) ? 'active' : ''}`}
                        style={{ fontSize: 11, padding: '2px 7px' }}
                      >
                        {k.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Inspector Toggle */}
              {analysis && (
                <button
                  className={`tool-btn ${inspectorOpen ? 'active' : ''}`}
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  title={inspectorOpen ? 'Hide Inspector Panel' : 'Show Inspector Panel'}
                  style={{ marginLeft: 6 }}
                >
                  <Layers size={13} /> {inspectorOpen ? 'Inspector' : 'Open Inspector'}
                </button>
              )}
            </div>
          </div>

          {/* Active Canvas / View */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-blue)', gap: 10 }}>
                <span>Compiling codebase graph and indexing symbols...</span>
              </div>
            ) : !analysis ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                No repository loaded. Click &quot;Connect GitHub&quot; or &quot;Upload ZIP&quot; to begin.
              </div>
            ) : (
              <>
                {activeTab === 'graph' && (
                  <RelationshipGraph
                    analysis={analysis}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={handleEntitySelect}
                    filterKinds={selectedFilterKinds}
                    focusEntityId={focusNeighborhood ? selectedEntityId : null}
                  />
                )}

                {activeTab === 'paths' && (
                  <ExecutionPathView
                    analysis={analysis}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={handleEntitySelect}
                  />
                )}

                {activeTab === 'dataflow' && (
                  <DataFlowView
                    analysis={analysis}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={handleEntitySelect}
                  />
                )}

                {activeTab === 'impact' && (
                  <ImpactView
                    analysis={analysis}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={handleEntitySelect}
                  />
                )}

                {activeTab === 'overview' && (
                  <DashboardView
                    analysis={analysis}
                    onSelectEntity={handleEntitySelect}
                    onNavigateTab={(tab) => setActiveTab(tab as any)}
                  />
                )}
              </>
            )}
          </div>

          {/* LOWER SOURCE PANEL: Source Code, Execution Context, AI Explanation */}
          {analysis && (
            <LowerSourcePanel
              analysis={analysis}
              selectedEntityId={selectedEntityId}
              onSelectEntity={handleEntitySelect}
            />
          )}
        </main>

        {/* RIGHT INSPECTOR PANEL */}
        {analysis && inspectorOpen && (
          <InspectorPanel
            analysis={analysis}
            selectedEntityId={selectedEntityId}
            onSelectEntity={handleEntitySelect}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </div>

      {/* MODALS */}
      <GitHubModal
        isOpen={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onProjectLoaded={(newProjectId) => {
          refreshProjectsList();
          loadProject(newProjectId);
        }}
      />

      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onProjectLoaded={(newProjectId) => {
          refreshProjectsList();
          loadProject(newProjectId);
        }}
      />

      {analysis && (
        <SearchModal
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          analysis={analysis}
          onSelectEntity={handleEntitySelect}
        />
      )}
    </div>
  );
}
