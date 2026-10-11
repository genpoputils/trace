'use client';

import React from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  History,
  GitCommit,
  GitBranch,
  ArrowRight,
  Clock,
  FileQuestion,
  CheckCircle2,
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
  const hasCommitSha = Boolean(gitMeta?.commitSha && gitMeta.commitSha.trim());
  const hasBranch = Boolean(gitMeta?.branch && gitMeta.branch.trim());

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
      role="region"
      aria-label="Commit history roadmap view"
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

        {/* Current Active Commit Metadata Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasCommitSha ? (
              <>
                <GitCommit size={16} color="var(--primary-blue)" /> Analyzed Git Revision
              </>
            ) : (
              <>
                <FileQuestion size={16} color="var(--text-muted)" /> Repository Revision Status
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Commit SHA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>Analyzed Commit SHA:</span>
              {hasCommitSha ? (
                <code
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    color: 'var(--primary-blue)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                >
                  {gitMeta!.commitSha}
                </code>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
                  Revision unavailable (imported without Git metadata)
                </span>
              )}
            </div>

            {/* Branch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>Branch:</span>
              {hasBranch ? (
                <span className="branch-pill">
                  <GitBranch size={11} /> {gitMeta!.branch}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Not specified
                </span>
              )}
            </div>

            {/* Analysis Timestamp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>Analysis Timestamp:</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} color="var(--text-muted)" />
                {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : 'Unavailable'}
              </span>
            </div>

            {/* Ingestion Source */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>Source Provider:</span>
              <span className="kind-badge function" style={{ fontSize: 11 }}>
                {hasCommitSha ? 'GitHub Remote Tree' : 'Local Archive / In-Memory'}
              </span>
            </div>
          </div>
        </div>

        {/* Planned Capabilities in Milestone EPIC-E */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Planned Capabilities (Milestone EPIC-E)
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            The following capabilities are on the Trace architecture roadmap and are not yet enabled for live code comparisons:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <strong>GT-040: Revision Diff Engine (Planned)</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Compare AST symbols and dependency graphs across two arbitrary git revisions without cloning.
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <strong>GT-041: Cross-Revision Symbol Matching (Planned)</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Track renamed, moved, and modified methods across refactoring commits.
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <strong>GT-042: Graph Removal Visualizer (Planned)</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Highlight newly introduced, deleted, or altered graph nodes with comparative color coding.
              </p>
            </div>
          </div>
        </div>

        {/* Distinction & Action Link to Current Impact Analysis */}
        <div
          style={{
            padding: 16,
            background: 'var(--blue-selection-bg)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ color: 'var(--primary-blue)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={16} /> Current Functionality: Change Impact Analysis
            </strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              While multi-revision Git diffing is in development, you can use Impact Analysis to calculate blast radius, callers, and affected routes for any symbol right now.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('impact')}
            className="btn-upload"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Open Impact Analysis <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
