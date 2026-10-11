'use client';

import React from 'react';
import {
  BarChart3,
  Compass,
  Zap,
  Waves,
  ShieldAlert,
  Package,
  History,
  Sparkles,
  FolderTree,
} from 'lucide-react';

export type WorkspaceTabId =
  | 'overview'
  | 'graph'
  | 'paths'
  | 'dataflow'
  | 'impact'
  | 'dependencies'
  | 'history'
  | 'ai';

interface AppNavigationRailProps {
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  fileExplorerOpen: boolean;
  onToggleFileExplorer: () => void;
  hasAnalysis: boolean;
}

export const AppNavigationRail: React.FC<AppNavigationRailProps> = ({
  activeTab,
  onTabChange,
  fileExplorerOpen,
  onToggleFileExplorer,
  hasAnalysis,
}) => {
  return (
    <nav className="app-nav-rail" aria-label="Primary workspace views">
      {/* 1. OVERVIEW */}
      <button
        className={`rail-item ${activeTab === 'overview' ? 'active' : ''}`}
        onClick={() => onTabChange('overview')}
        title="Overview — Repository summary & metrics"
        aria-label="Overview tab"
      >
        <span className="rail-icon">
          <BarChart3 size={18} />
        </span>
        <span className="rail-label">Overview</span>
      </button>

      {/* 2. EXPLORE (CODE GRAPH) */}
      <button
        className={`rail-item ${activeTab === 'graph' ? 'active' : ''}`}
        onClick={() => onTabChange('graph')}
        title="Explore — Interactive code architecture graph"
        aria-label="Explore graph tab"
      >
        <span className="rail-icon">
          <Compass size={18} />
        </span>
        <span className="rail-label">Explore</span>
      </button>

      {/* 3. EXECUTION PATHS */}
      <button
        className={`rail-item ${activeTab === 'paths' ? 'active' : ''}`}
        onClick={() => onTabChange('paths')}
        title="Execution Paths — Inferred runtime call hierarchies"
        aria-label="Execution paths tab"
      >
        <span className="rail-icon">
          <Zap size={18} />
        </span>
        <span className="rail-label">Paths</span>
      </button>

      {/* 4. DATA FLOW */}
      <button
        className={`rail-item ${activeTab === 'dataflow' ? 'active' : ''}`}
        onClick={() => onTabChange('dataflow')}
        title="Data Flow — Parameter and state propagation chains"
        aria-label="Data flow tab"
      >
        <span className="rail-icon">
          <Waves size={18} />
        </span>
        <span className="rail-label">Data Flow</span>
      </button>

      {/* 5. IMPACT ANALYSIS */}
      <button
        className={`rail-item ${activeTab === 'impact' ? 'active' : ''}`}
        onClick={() => onTabChange('impact')}
        title="Impact Analysis — Change blast radius calculation"
        aria-label="Impact analysis tab"
      >
        <span className="rail-icon">
          <ShieldAlert size={18} />
        </span>
        <span className="rail-label">Impact</span>
      </button>

      <div className="rail-divider" aria-hidden="true" />

      {/* 6. DEPENDENCIES */}
      <button
        className={`rail-item ${activeTab === 'dependencies' ? 'active' : ''}`}
        onClick={() => onTabChange('dependencies')}
        title="Dependencies — Manifests & ecosystem dependency inventory"
        aria-label="Dependencies inventory tab"
      >
        <span className="rail-icon">
          <Package size={18} />
        </span>
        <span className="rail-label">Deps</span>
      </button>

      {/* 7. HISTORY (ROADMAP/PLANNED) */}
      <button
        className={`rail-item ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => onTabChange('history')}
        title="History — Commit history and change analysis (in development)"
        aria-label="History tab (in development)"
      >
        <span className="rail-icon">
          <History size={18} />
        </span>
        <span className="rail-label">History</span>
      </button>

      {/* 8. AI INVESTIGATOR */}
      <button
        className={`rail-item ${activeTab === 'ai' ? 'active' : ''}`}
        onClick={() => onTabChange('ai')}
        title="AI Investigator — Grounded contextual code exploration"
        aria-label="AI Investigator tab"
      >
        <span className="rail-icon">
          <Sparkles size={18} color="var(--primary-blue)" />
        </span>
        <span className="rail-label" style={{ color: 'var(--primary-blue)' }}>AI Ask</span>
      </button>

      {/* Push File Explorer Toggle to Bottom */}
      <div style={{ flex: 1 }} />

      {hasAnalysis && (
        <>
          <div className="rail-divider" aria-hidden="true" />
          <button
            className={`rail-item ${fileExplorerOpen ? 'active' : ''}`}
            onClick={onToggleFileExplorer}
            title={fileExplorerOpen ? 'Hide File Explorer sidebar' : 'Show File Explorer sidebar'}
            aria-label={fileExplorerOpen ? 'Hide File Explorer sidebar' : 'Show File Explorer sidebar'}
          >
            <span className="rail-icon">
              <FolderTree size={18} />
            </span>
            <span className="rail-label">Files</span>
          </button>
        </>
      )}
    </nav>
  );
};
