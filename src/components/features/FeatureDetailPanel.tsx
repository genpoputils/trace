'use client';

import React, { useState } from 'react';
import { CodebaseFeature, AudienceMode } from '@/lib/features/feature-map-types';
import {
  FileCode,
  Compass,
  ArrowRight,
  Route,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
} from 'lucide-react';

interface FeatureDetailPanelProps {
  feature: CodebaseFeature;
  allFeatures: CodebaseFeature[];
  audienceMode: AudienceMode;
  onSelectEntity: (entityId: string) => void;
  onExploreGraph: (entityId: string) => void;
  onSelectFeature: (featureId: string) => void;
}

export const FeatureDetailPanel: React.FC<FeatureDetailPanelProps> = ({
  feature,
  allFeatures,
  audienceMode,
  onSelectEntity,
  onExploreGraph,
  onSelectFeature,
}) => {
  const [evidenceExpanded, setEvidenceExpanded] = useState<boolean>(false);
  const [techEvidenceExpanded, setTechEvidenceExpanded] = useState<boolean>(false);

  // Primary entity to target for actions
  const primaryEntityId =
    feature.entryPoint?.entityId ||
    feature.flowSteps[0]?.entityId ||
    feature.evidence[0]?.entityId;

  // Resolve related features
  const relatedFeatures = feature.relatedFeatureIds
    .map((id) => allFeatures.find((f) => f.id === id))
    .filter((f): f is CodebaseFeature => Boolean(f));

  return (
    <article
      className="feature-detail-panel"
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        overflowY: 'auto',
        maxHeight: 700,
        boxShadow: 'var(--shadow-sm)',
      }}
      aria-label={`Details for capability: ${feature.name}`}
    >
      {/* =========================================================================
          A. Feature Identity & Action Buttons
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--primary-blue)',
              }}
            >
              {feature.category.replace('_', ' ')}
            </span>

            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background:
                  feature.confidence === 'high'
                    ? 'rgba(16, 185, 129, 0.1)'
                    : feature.confidence === 'medium'
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'rgba(245, 158, 11, 0.1)',
                color:
                  feature.confidence === 'high'
                    ? 'var(--success-teal)'
                    : feature.confidence === 'medium'
                    ? 'var(--primary-blue)'
                    : 'var(--warning-amber)',
              }}
            >
              {feature.confidence} confidence
            </span>

            {feature.isInferred && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                }}
                title="Capability grouping inferred deterministically from static analysis"
              >
                Inferred Capability
              </span>
            )}
          </div>

          <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {feature.name}
          </h3>

          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>
            {audienceMode === 'stakeholder' ? feature.stakeholderSummary : feature.summary}
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {primaryEntityId && (
            <>
              <button
                type="button"
                className="tool-btn active"
                onClick={() => onSelectEntity(primaryEntityId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title="Inspect supporting code and location in source viewer"
              >
                <FileCode size={15} />
                <span>Open Source</span>
              </button>

              <button
                type="button"
                className="btn-upload"
                onClick={() => onExploreGraph(primaryEntityId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title="Switch to graph view centered on this capability"
              >
                <Compass size={15} />
                <span>Explore Graph</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Analysis Limitations & Caveats Disclosure */}
      {feature.caveats && feature.caveats.length > 0 && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--warning-bg)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warning-amber)' }}>
            <AlertTriangle size={14} /> Analysis Limitations & Caveats
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {feature.caveats.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Static Code Evidence & Trust Basis Card */}
      {feature.trustExplanation && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              Evidence & Trust Basis
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Static AST Verification
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <div style={{ padding: '8px 10px', background: 'var(--panel-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Direct AST Findings</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{feature.trustExplanation.directEvidenceCount}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--panel-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Statically Resolved</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success-teal)' }}>{feature.trustExplanation.staticallyResolvedCount}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--panel-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inferred Links</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary-blue)' }}>{feature.trustExplanation.inferredCount}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Static code path representation; does not guarantee runtime production dispatch or branch execution.
          </div>
        </div>
      )}

      {/* Stakeholder Perspective: Collapsible technical evidence disclosure */}
      {audienceMode === 'stakeholder' && (
        <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Technical Evidence Summary ({feature.evidence.length} symbols, {feature.flowSteps.length} execution stages)
            </span>
            <button
              type="button"
              onClick={() => setTechEvidenceExpanded(!techEvidenceExpanded)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary-blue)',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {techEvidenceExpanded ? 'Hide technical evidence' : 'View technical evidence'}
              {techEvidenceExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* When in developer mode, or when stakeholder opens technical evidence: show full technical sections */}
      {(audienceMode === 'developer' || techEvidenceExpanded) && (
        <>
          {/* =========================================================================
              B. Entry Points Section
             ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Entry Points
            </h4>

            {feature.entryPoint ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => onSelectEntity(feature.entryPoint!.entityId)}
                title="Click to view entry point in source viewer"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <Route size={15} color="var(--primary-blue)" />
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {feature.entryPoint.name}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {feature.entryPoint.filePath}
                    {feature.entryPoint.startLine !== undefined && `:${feature.entryPoint.startLine}`}
                  </span>
                </div>

                <span style={{ fontSize: 11, color: 'var(--primary-blue)', fontWeight: 600 }}>
                  Inspect →
                </span>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                No explicit entry point identified. This capability operates as modular library or shared utility logic.
              </div>
            )}
          </div>

          {/* =========================================================================
              C. How It Works (Connected Sequence Flow)
             ========================================================================= */}
          {feature.flowSteps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                How It Works
              </h4>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '12px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {feature.flowSteps.map((step, idx) => (
                  <React.Fragment key={step.entityId + idx}>
                    <div
                      style={{
                        padding: '6px 10px',
                        background: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        cursor: 'pointer',
                      }}
                      onClick={() => onSelectEntity(step.entityId)}
                      title={`Step ${step.stepIndex}: ${step.name} (${step.role})`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`kind-badge ${step.kind}`}>{step.kind}</span>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                          {step.name}
                        </strong>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {step.role.replace('_', ' ')} • {step.confidence.replace('_', ' ')}
                      </span>
                    </div>

                    {idx < feature.flowSteps.length - 1 && (
                      <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              D. Supporting Files and Symbols
             ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Supporting Files & Symbols ({feature.evidence.length})
            </h4>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 240,
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 6,
              }}
            >
              {feature.evidence.map((ev) => (
                <div
                  key={ev.entityId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    cursor: 'pointer',
                    gap: 12,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => onSelectEntity(ev.entityId)}
                  title={`Open ${ev.name} in source viewer`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <span className={`kind-badge ${ev.entityKind}`}>{ev.entityKind}</span>
                    <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{ev.name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {ev.filePath}:{ev.startLine || 1}
                    </span>
                  </div>

                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, fontStyle: 'italic' }}>
                    {ev.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
          E. Related Capabilities
         ========================================================================= */}
      {relatedFeatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Connected Capabilities
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {relatedFeatures.map((relFeat) => (
              <div
                key={relFeat.id}
                onClick={() => onSelectFeature(relFeat.id)}
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
                title={`Switch to related capability: ${relFeat.name}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {relFeat.name}
                  </strong>
                  <span style={{ fontSize: 10, color: 'var(--primary-blue)', fontWeight: 600 }}>View →</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Shares services or persistence models with this feature
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          F. Evidence and Limitations Accordion
         ========================================================================= */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <button
          type="button"
          onClick={() => setEvidenceExpanded(!evidenceExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
          }}
          aria-expanded={evidenceExpanded}
        >
          <Info size={14} color="var(--primary-blue)" />
          <span>{evidenceExpanded ? 'Hide Evidence & Static Analysis Limitations' : 'Evidence & Static Analysis Limitations'}</span>
          {evidenceExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {evidenceExpanded && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              lineHeight: 1.5,
            }}
          >
            <div>
              • <strong>Inference Justification:</strong> This capability candidate was formed by grouping{' '}
              {feature.evidence.length} related code entities around the resource identifier &quot;{feature.name}&quot;.
            </div>
            <div>
              • <strong>Relationship Verification:</strong> Internal calls and dependencies were statically analyzed from TypeScript AST nodes and cross-module import tables.
            </div>
            <div>
              • <strong>Static Analysis Caveat:</strong> Dynamic dispatches, runtime configuration flags, and network service meshes cannot be guaranteed from source code alone.
            </div>
          </div>
        )}
      </div>
    </article>
  );
};
