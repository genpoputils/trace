'use client';

import React from 'react';
import {
  Compass,
  FolderGit2,
  UploadCloud,
  FolderCode,
  ShieldCheck,
  ArrowRight,
  Database,
  Trash2,
} from 'lucide-react';
import { ProjectSummary } from '@/lib/storage/local-project-store';

interface OnboardingEmptyStateProps {
  projectsList: ProjectSummary[];
  onOpenGitHubModal: () => void;
  onOpenUploadModal: () => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
}

export const OnboardingEmptyState: React.FC<OnboardingEmptyStateProps> = ({
  projectsList,
  onOpenGitHubModal,
  onOpenUploadModal,
  onSelectProject,
  onDeleteProject,
}) => {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 20px',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Hero Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--primary-blue)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
            }}
          >
            <Compass size={28} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--primary-blue)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            GenPopUtils Trace
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Visual Codebase Intelligence Platform
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 560, lineHeight: 1.6 }}>
            Explore software architecture, trace execution hierarchies, track data flows, and analyze change blast radii in an interactive developer workspace.
          </p>
        </div>

        {/* 3 Primary Action Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 16,
          }}
        >
          {/* Card 1: Connect GitHub */}
          <div
            onClick={onOpenGitHubModal}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: 22,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.16s ease',
            }}
            className="trace-node"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                }}
              >
                <FolderGit2 size={20} />
              </div>
              <span className="kind-badge route">GitHub</span>
            </div>
            <div>
              <strong style={{ fontSize: 16, color: 'var(--text-primary)', display: 'block' }}>
                Connect GitHub Repo
              </strong>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                Stream any public or private repository directly via browser Git tree API. No backend clone needed.
              </p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--primary-blue)' }}>
              Select repository <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 2: Upload ZIP */}
          <div
            onClick={onOpenUploadModal}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: 22,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.16s ease',
            }}
            className="trace-node"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--blue-selection-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-blue)',
                }}
              >
                <UploadCloud size={20} />
              </div>
              <span className="kind-badge" style={{ background: 'var(--blue-selection-bg)', color: 'var(--primary-blue)' }}>Local ZIP</span>
            </div>
            <div>
              <strong style={{ fontSize: 16, color: 'var(--text-primary)', display: 'block' }}>
                Upload Project Archive
              </strong>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                Decompress and parse a local <code>.zip</code> file in your browser Web Worker with zero network latency.
              </p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--primary-blue)' }}>
              Choose archive <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 3: Sample Repository */}
          <div
            onClick={() => onSelectProject('sample-ecommerce-api')}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: 22,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.16s ease',
            }}
            className="trace-node"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--success-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--success-teal)',
                }}
              >
                <FolderCode size={20} />
              </div>
              <span className="kind-badge function">Sample</span>
            </div>
            <div>
              <strong style={{ fontSize: 16, color: 'var(--text-primary)', display: 'block' }}>
                Explore Sample Project
              </strong>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                Instant demo with Express routes, Prisma queries, auth middleware, and circular dependency checks.
              </p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--success-teal)' }}>
              Open sample API <ArrowRight size={14} />
            </div>
          </div>
        </div>

        {/* Saved Projects in Browser IndexedDB */}
        {projectsList.length > 0 && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: 20,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                <Database size={16} color="var(--primary-blue)" /> Cached Workspace Projects ({projectsList.length})
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saved in browser storage</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {projectsList.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onClick={() => onSelectProject(p.id)}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {p.filesCount ? `${p.filesCount} files` : 'Ready to inspect'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {onDeleteProject && p.id !== 'sample-ecommerce-api' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(p.id);
                        }}
                        style={{ padding: 4, color: 'var(--text-muted)' }}
                        title="Delete project from cache"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <ArrowRight size={14} color="var(--primary-blue)" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Privacy & Architecture Guarantee Footer */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <ShieldCheck size={16} color="var(--success-teal)" style={{ flexShrink: 0 }} />
          <span>
            <strong>100% Private & Client-Side:</strong> All parsing, AST traversal, and dependency graphs execute within your browser Web Worker. Source code is never transmitted to external servers.
          </span>
        </div>
      </div>
    </div>
  );
};
