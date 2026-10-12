'use client';

import React, { useState } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import { OverviewAnalysisSummary, AudienceMode } from '@/lib/features/feature-map-types';
import {
  GitBranch,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
} from 'lucide-react';
import { formatRelativeTime } from '@/components/layout/RepositorySelector';

interface OverviewSummaryProps {
  analysis: ProjectAnalysis;
  overview: OverviewAnalysisSummary;
  audienceMode: AudienceMode;
  onNavigateTab?: (tab: 'graph' | 'overview') => void;
}

export const OverviewSummary: React.FC<OverviewSummaryProps> = ({
  analysis,
  overview,
  audienceMode,
}) => {
  const [evidenceExpanded, setEvidenceExpanded] = useState<boolean>(false);

  const git = analysis.gitMetadata;
  const isPartial = !!analysis.isPartial;
  const shortSha = git?.commitSha ? git.commitSha.slice(0, 7) : undefined;

  return (
    <section
      className="overview-summary-card"
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderTop: '3px solid var(--primary-blue)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label="Repository Identity and Application Summary"
    >
      {/* 1. Repository Identity Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 14,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {analysis.projectName}
          </span>

          {git?.owner && git?.repo && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                background: 'var(--bg-tertiary)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <ExternalLink size={12} /> {git.owner}/{git.repo}
            </span>
          )}

          {git?.branch && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              title={`Branch: ${git.branch}`}
            >
              <GitBranch size={12} color="var(--primary-blue)" /> {git.branch}
            </span>
          )}

          {shortSha && (
            <span
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              title={`Commit: ${git?.commitSha}`}
            >
              <GitCommit size={12} /> {shortSha}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Analysis State Indicator */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: isPartial ? 'var(--warning-bg)' : 'rgba(16, 185, 129, 0.1)',
              color: isPartial ? 'var(--warning-amber)' : 'var(--success-teal)',
              border: `1px solid ${isPartial ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}
          >
            {isPartial ? (
              <>
                <AlertTriangle size={13} />
                <span>Partial Analysis</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} />
                <span>Analysis Complete</span>
              </>
            )}
          </div>

          {analysis.analyzedAt && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Analysed {formatRelativeTime(analysis.analyzedAt)}
            </span>
          )}
        </div>
      </div>

      {/* 2. Deterministic Application Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--primary-blue)',
            }}
          >
            {audienceMode === 'stakeholder' ? 'Application Purpose & Capabilities' : 'System Architecture Overview'}
          </span>

          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--primary-blue)',
              fontWeight: 600,
            }}
            title="Summary is deterministically derived from static AST entity declarations"
          >
            Inferred from code evidence
          </span>
        </div>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            margin: 0,
            maxWidth: 1000,
          }}
        >
          {audienceMode === 'stakeholder'
            ? overview.stakeholderDescription
            : overview.applicationPurpose}
        </p>
      </div>

      {/* 3. Expandable Contributing Evidence Section */}
      <div
        style={{
          borderTop: '1px dashed var(--border-color)',
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setEvidenceExpanded(!evidenceExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
          }}
          aria-expanded={evidenceExpanded}
          aria-controls="overview-evidence-drawer"
        >
          <Info size={14} color="var(--primary-blue)" />
          <span>
            {evidenceExpanded ? 'Hide contributing evidence' : 'View contributing evidence & analysis notes'}
          </span>
          {evidenceExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {evidenceExpanded && (
          <div
            id="overview-evidence-drawer"
            style={{
              marginTop: 12,
              padding: 14,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {overview.evidencePoints.map((pt, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 10,
                    background: 'var(--panel-bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {pt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {pt.detail}
                  </div>
                </div>
              ))}
            </div>

            {overview.caveats.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {overview.caveats.map((cav, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ color: 'var(--warning-amber)' }}>•</span>
                    <span>{cav}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
