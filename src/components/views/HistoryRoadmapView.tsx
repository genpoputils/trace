'use client';

import React from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  History,
  GitCommit,
  GitBranch,
  ArrowRight,
} from 'lucide-react';

interface HistoryRoadmapViewProps {
  analysis: ProjectAnalysis;
  onNavigateTab: (tab: 'graph' | 'impact') => void;
}

export const HistoryRoadmapView: React.FC<HistoryRoadmapViewProps> = ({
  analysis,
  onNavigateTab,
}) => {
  const gitMeta = analysis.gitMetadata;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Banner */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderTop: '3px solid var(--text-muted)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            <History size={14} /> Roadmap Feature • Planned for Milestone EPIC-E
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            Revision & Commit History Intelligence
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
            Track architecture evolution, compare diffs across revisions, and detect breaking changes between Git commits.
          </p>
        </div>

        {/* Current Active Commit Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitCommit size={16} color="var(--primary-blue)" /> Current Verified Revision
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Analyzed Commit SHA:</span>
              <code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4, color: 'var(--primary-blue)' }}>
                {gitMeta?.commitSha || 'c8f12a9712...'}
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Branch:</span>
              <span className="branch-pill">
                <GitBranch size={11} /> {gitMeta?.branch || 'main'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Analysis Timestamp:</span>
              <span>{new Date(analysis.analyzedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* What's Coming in Milestone EPIC-E */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Capabilities in Development for Milestone EPIC-E:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <strong>GT-040: Revision Diff Engine</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Compare AST symbols and dependency graphs across two arbitrary git revisions.
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <strong>GT-041: Cross-Revision Symbol Matching</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Track renamed, moved, and modified methods across refactoring commits.
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <strong>GT-042: Graph Removal Visualizer</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Highlight newly introduced, deleted, or altered graph nodes with color coding.
              </p>
            </div>
          </div>
        </div>

        {/* Action Link to Current Impact Analysis */}
        <div
          style={{
            padding: 16,
            background: 'var(--blue-selection-bg)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong style={{ color: 'var(--primary-blue)', fontSize: 14 }}>
              Looking for Change Impact Analysis?
            </strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Impact Analysis calculates the blast radius and affected routes for any symbol right now.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('impact')}
            className="btn-upload"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Go to Impact Analysis <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
