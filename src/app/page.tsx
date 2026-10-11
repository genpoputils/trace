'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ProjectAnalysis, EntityKind, TraceEntity } from '@/lib/types/trace';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNavigationRail, WorkspaceTabId } from '@/components/layout/AppNavigationRail';
import { FileExplorerSidebar } from '@/components/layout/FileExplorerSidebar';
import { RelationshipGraph } from '@/components/graph/RelationshipGraph';
import { ExecutionPathView } from '@/components/views/ExecutionPathView';
import { DataFlowView } from '@/components/views/DataFlowView';
import { ImpactView } from '@/components/views/ImpactView';
import { DashboardView } from '@/components/views/DashboardView';
import { AiInvestigatorView } from '@/components/views/AiInvestigatorView';
import { DependencyInventoryView } from '@/components/views/DependencyInventoryView';
import { HistoryRoadmapView } from '@/components/views/HistoryRoadmapView';
import { OnboardingEmptyState } from '@/components/onboarding/OnboardingEmptyState';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { LowerSourcePanel } from '@/components/source/LowerSourcePanel';
import { UploadModal } from '@/components/modals/UploadModal';
import { GitHubModal } from '@/components/modals/GitHubModal';
import { SearchModal } from '@/components/modals/SearchModal';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';
import {
  Filter,
  Eye,
  Layers,
  FolderTree,
  RefreshCw,
} from 'lucide-react';

export default function TraceHomePage() {
  const [currentProjectId, setCurrentProjectId] = useState<string>('sample-ecommerce-api');
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('graph');
  const [visitedTabs, setVisitedTabs] = useState<Set<WorkspaceTabId>>(() => new Set(['graph']));
  const [fileExplorerOpen, setFileExplorerOpen] = useState<boolean>(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isNarrowViewport, setIsNarrowViewport] = useState<boolean>(false);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [githubModalOpen, setGithubModalOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);

  // Graph Filters
  const [focusNeighborhood, setFocusNeighborhood] = useState<boolean>(false);
  const [selectedFilterKinds, setSelectedFilterKinds] = useState<EntityKind[]>([]);

  // Available projects list
  const [projectsList, setProjectsList] = useState<import('@/lib/storage/local-project-store').ProjectSummary[]>([]);

  // Viewport resize tracking for responsive drawer
  useEffect(() => {
    const handleResize = () => {
      setIsNarrowViewport(window.innerWidth < 1100);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle tab switching with persistent visited tracking
  const handleTabChange = useCallback((tab: WorkspaceTabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  // Toggle Theme
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Load project list
  const refreshProjectsList = useCallback(() => {
    browserAnalysisService
      .listProjects()
      .then((projects) => {
        setProjectsList(projects);
      })
      .catch((err) => console.error('Failed to list projects:', err));
  }, []);

  useEffect(() => {
    refreshProjectsList();
  }, [refreshProjectsList]);

  // Load project analysis data
  const loadProject = useCallback(
    (projectId: string) => {
      setLoading(true);
      browserAnalysisService
        .getProject(projectId)
        .then((project) => {
          if (project) {
            setAnalysis(project);
            setCurrentProjectId(projectId);
            setVisitedTabs(new Set([activeTab]));
            // Set initial selected entity to first route or central hub
            const firstRoute = Object.values(
              project.entities as Record<string, TraceEntity>
            ).find((e) => e.kind === 'route');
            if (firstRoute) {
              setSelectedEntityId(firstRoute.id);
            } else if (project.stats?.mostConnected?.[0]) {
              setSelectedEntityId(project.stats.mostConnected[0].symbolId);
            }
          }
        })
        .catch((err) => console.error('Failed to load project:', err))
        .finally(() => setLoading(false));
    },
    [activeTab]
  );

  useEffect(() => {
    let ignore = false;
    const fetchInitial = async () => {
      try {
        const project = await browserAnalysisService.getProject(currentProjectId);
        if (!ignore && project) {
          setAnalysis(project);
          const firstRoute = Object.values(
            project.entities as Record<string, TraceEntity>
          ).find((e) => e.kind === 'route');
          if (firstRoute) {
            setSelectedEntityId(firstRoute.id);
          } else if (project.stats?.mostConnected?.[0]) {
            setSelectedEntityId(project.stats.mostConnected[0].symbolId);
          }
        }
      } catch (err) {
        console.error('Failed to load project:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    fetchInitial();
    return () => {
      ignore = true;
    };
  }, [currentProjectId]);

  // Check URL search parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const projParam = params.get('project');
      if (projParam && projectsList.length > 0) {
        const match = projectsList.find(
          (p) => p.id === projParam || p.name.toLowerCase() === projParam.toLowerCase()
        );
        if (match && match.id !== currentProjectId) {
          queueMicrotask(() => setCurrentProjectId(match.id));
        } else if (!match && projParam !== currentProjectId) {
          queueMicrotask(() => setCurrentProjectId(projParam));
        }
      }
    }
  }, [projectsList, currentProjectId]);

  // Precompute file to entities index
  const fileSymbolsMap = useMemo(() => {
    if (!analysis) return new Map<string, TraceEntity[]>();
    const map = new Map<string, TraceEntity[]>();
    for (const entity of Object.values(analysis.entities)) {
      if (entity.kind === 'file') continue;
      const list = map.get(entity.filePath);
      if (list) {
        list.push(entity);
      } else {
        map.set(entity.filePath, [entity]);
      }
    }
    return map;
  }, [analysis]);

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

  const handleEntitySelect = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setInspectorOpen(true);
  }, []);

  const toggleKindFilter = useCallback((kind: EntityKind) => {
    setSelectedFilterKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }, []);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await browserAnalysisService.deleteProject(projectId);
      refreshProjectsList();
      if (currentProjectId === projectId) {
        loadProject('sample-ecommerce-api');
      }
    },
    [currentProjectId, refreshProjectsList, loadProject]
  );

  return (
    <div className="app-container">
      {/* 1. TOP APPLICATION HEADER */}
      <AppHeader
        analysis={analysis}
        currentProjectId={currentProjectId}
        projectsList={projectsList}
        theme={theme}
        onSelectProject={loadProject}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenGitHubModal={() => setGithubModalOpen(true)}
        onOpenUploadModal={() => setUploadModalOpen(true)}
        onToggleTheme={toggleTheme}
      />

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="main-body">
        {/* Navigation Rail */}
        <AppNavigationRail
          activeTab={activeTab}
          onTabChange={handleTabChange}
          fileExplorerOpen={fileExplorerOpen}
          onToggleFileExplorer={() => setFileExplorerOpen(!fileExplorerOpen)}
          hasAnalysis={!!analysis}
        />

        {/* Collapsible File Explorer Sidebar */}
        {analysis && (
          <FileExplorerSidebar
            isOpen={fileExplorerOpen}
            onClose={() => setFileExplorerOpen(false)}
            analysis={analysis}
            selectedEntityId={selectedEntityId}
            fileSymbolsMap={fileSymbolsMap}
            onSelectEntity={handleEntitySelect}
          />
        )}

        {/* Central Workspace Area */}
        <main className="center-workspace" role="main">
          {/* Workspace Toolbar */}
          <div className="workspace-toolbar" role="toolbar" aria-label="View toolbar">
            <div className="toolbar-info">
              {analysis ? (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{analysis.projectName}</strong>
                  <span>•</span>
                  <span>{analysis.stats.totalSymbols} symbols</span>
                  <span>•</span>
                  <span>{analysis.stats.totalRelationships} relationships</span>
                  <span>•</span>
                  <span>{analysis.stats.routesCount} routes</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Workspace Ready</span>
              )}
            </div>

            {/* Contextual Toolbar Controls */}
            <div className="toolbar-controls">
              {activeTab === 'graph' && analysis && (
                <>
                  <button
                    className={`tool-btn ${focusNeighborhood ? 'active' : ''}`}
                    onClick={() => setFocusNeighborhood(!focusNeighborhood)}
                    title="Focus view on selected entity and its direct connections"
                    aria-label="Toggle focus mode"
                  >
                    <Eye size={13} /> {focusNeighborhood ? 'Focus ON' : 'Focus'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Filter size={13} color="var(--text-muted)" aria-hidden="true" />
                    {(['route', 'component', 'hook', 'function', 'db_query'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleKindFilter(k)}
                        className={`tool-btn ${selectedFilterKinds.includes(k) ? 'active' : ''}`}
                        style={{ fontSize: 11, padding: '2px 7px' }}
                        aria-pressed={selectedFilterKinds.includes(k)}
                      >
                        {k.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* File Explorer Quick Toggle */}
              {analysis && (
                <button
                  className={`tool-btn ${fileExplorerOpen ? 'active' : ''}`}
                  onClick={() => setFileExplorerOpen(!fileExplorerOpen)}
                  title={fileExplorerOpen ? 'Hide File Explorer' : 'Show File Explorer'}
                  aria-label="Toggle file explorer"
                >
                  <FolderTree size={13} /> Files
                </button>
              )}

              {/* Inspector Toggle */}
              {analysis && (
                <button
                  className={`tool-btn ${inspectorOpen ? 'active' : ''}`}
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  title={inspectorOpen ? 'Hide Inspector Panel' : 'Show Inspector Panel'}
                  aria-label="Toggle inspector panel"
                >
                  <Layers size={13} /> Inspector
                </button>
              )}
            </div>
          </div>

          {/* Active Canvas / View Area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            {loading ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-blue)',
                  gap: 12,
                }}
              >
                <RefreshCw size={22} className="animate-spin" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  Compiling codebase graph and indexing symbols...
                </span>
              </div>
            ) : !analysis ? (
              <OnboardingEmptyState
                projectsList={projectsList}
                onOpenGitHubModal={() => setGithubModalOpen(true)}
                onOpenUploadModal={() => setUploadModalOpen(true)}
                onSelectProject={loadProject}
                onDeleteProject={handleDeleteProject}
              />
            ) : (
              <>
                {/* 1. GRAPH VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'graph' ? 'block' : 'none' }}>
                  {visitedTabs.has('graph') && (
                    <RelationshipGraph
                      analysis={analysis}
                      selectedEntityId={selectedEntityId}
                      onSelectEntity={handleEntitySelect}
                      filterKinds={selectedFilterKinds}
                      focusEntityId={focusNeighborhood ? selectedEntityId : null}
                    />
                  )}
                </div>

                {/* 2. EXECUTION PATHS VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'paths' ? 'block' : 'none' }}>
                  {visitedTabs.has('paths') && (
                    <ExecutionPathView
                      analysis={analysis}
                      selectedEntityId={selectedEntityId}
                      onSelectEntity={handleEntitySelect}
                    />
                  )}
                </div>

                {/* 3. DATA FLOW VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'dataflow' ? 'block' : 'none' }}>
                  {visitedTabs.has('dataflow') && (
                    <DataFlowView
                      analysis={analysis}
                      selectedEntityId={selectedEntityId}
                      onSelectEntity={handleEntitySelect}
                    />
                  )}
                </div>

                {/* 4. IMPACT ANALYSIS VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'impact' ? 'block' : 'none' }}>
                  {visitedTabs.has('impact') && (
                    <ImpactView
                      analysis={analysis}
                      selectedEntityId={selectedEntityId}
                      onSelectEntity={handleEntitySelect}
                    />
                  )}
                </div>

                {/* 5. OVERVIEW / DASHBOARD VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'overview' ? 'block' : 'none' }}>
                  {visitedTabs.has('overview') && (
                    <DashboardView
                      analysis={analysis}
                      onSelectEntity={handleEntitySelect}
                      onNavigateTab={handleTabChange}
                    />
                  )}
                </div>

                {/* 6. AI INVESTIGATOR VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'ai' ? 'block' : 'none' }}>
                  {visitedTabs.has('ai') && (
                    <AiInvestigatorView
                      analysis={analysis}
                      selectedEntityId={selectedEntityId}
                      onSelectEntity={handleEntitySelect}
                      onNavigateTab={handleTabChange}
                    />
                  )}
                </div>

                {/* 7. DEPENDENCIES VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'dependencies' ? 'block' : 'none' }}>
                  {visitedTabs.has('dependencies') && (
                    <DependencyInventoryView analysis={analysis} />
                  )}
                </div>

                {/* 8. HISTORY VIEW */}
                <div style={{ width: '100%', height: '100%', display: activeTab === 'history' ? 'block' : 'none' }}>
                  {visitedTabs.has('history') && (
                    <HistoryRoadmapView
                      analysis={analysis}
                      onNavigateTab={handleTabChange}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {/* LOWER SOURCE PANEL */}
          {analysis && (
            <LowerSourcePanel
              analysis={analysis}
              selectedEntityId={selectedEntityId}
              onSelectEntity={handleEntitySelect}
              defaultHeightMode="compact"
            />
          )}
        </main>

        {/* RIGHT CONTEXTUAL INSPECTOR PANEL */}
        {analysis && inspectorOpen && (
          <>
            {isNarrowViewport && (
              <div
                className="inspector-drawer-overlay"
                onClick={() => setInspectorOpen(false)}
                aria-hidden="true"
              />
            )}
            <InspectorPanel
              analysis={analysis}
              selectedEntityId={selectedEntityId}
              onSelectEntity={handleEntitySelect}
              onClose={() => setInspectorOpen(false)}
              onOpenAiInvestigator={() => handleTabChange('ai')}
              onOpenExecutionPath={() => handleTabChange('paths')}
              onOpenImpactView={() => handleTabChange('impact')}
              isDrawer={isNarrowViewport}
            />
          </>
        )}
      </div>

      {/* MODALS */}
      <GitHubModal
        isOpen={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onOpenUploadModal={() => {
          setGithubModalOpen(false);
          setUploadModalOpen(true);
        }}
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
