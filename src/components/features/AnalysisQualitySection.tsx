'use client';

import React, { useState, useMemo } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  AnalysisQualityReport,
  DiagnosticCategory,
  QualityNavigationTarget,
} from '@/lib/quality/analysis-quality-types';
import { deriveAnalysisQuality } from '@/lib/quality/analysis-quality-service';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  FileText,
  CheckCircle2,
  FileCode,
  ArrowRight,
  Filter,
  Info,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { WorkspaceTabId } from '@/components/layout/AppNavigationRail';

interface AnalysisQualitySectionProps {
  analysis: ProjectAnalysis;
  onSelectEntity: (entityId: string) => void;
  onNavigateTab: (tab: WorkspaceTabId) => void;
}

export const AnalysisQualitySection: React.FC<AnalysisQualitySectionProps> = ({
  analysis,
  onSelectEntity,
  onNavigateTab,
}) => {
  // Pure memoized derivation
  const quality: AnalysisQualityReport = useMemo(
    () => deriveAnalysisQuality(analysis),
    [analysis]
  );

  const [categoryFilter, setCategoryFilter] = useState<DiagnosticCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedConfidenceHelp, setExpandedConfidenceHelp] = useState<boolean>(false);
  const [expandedLimitations, setExpandedLimitations] = useState<boolean>(false);

  // Filter diagnostics
  const filteredDiagnostics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quality.diagnostics.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        (d.affectedTarget && d.affectedTarget.toLowerCase().includes(q)) ||
        d.reason.toLowerCase().includes(q) ||
        d.evidence.toLowerCase().includes(q)
      );
    });
  }, [quality.diagnostics, categoryFilter, severityFilter, searchQuery]);

  const handleNavigate = (target?: QualityNavigationTarget) => {
    if (!target) return;
    if (target.entityId) {
      onSelectEntity(target.entityId);
    }
    if (target.tab) {
      onNavigateTab(target.tab);
    }
  };

  const getStatusBadge = () => {
    switch (quality.status) {
      case 'complete':
        return {
          icon: <ShieldCheck size={20} color="var(--success-teal)" />,
          color: 'var(--success-teal)',
          bg: 'rgba(16, 185, 129, 0.1)',
          border: 'rgba(16, 185, 129, 0.3)',
          label: 'Complete',
        };
      case 'partial':
        return {
          icon: <AlertTriangle size={20} color="var(--warning-amber)" />,
          color: 'var(--warning-amber)',
          bg: 'rgba(245, 158, 11, 0.1)',
          border: 'rgba(245, 158, 11, 0.3)',
          label: 'Partial Analysis',
        };
      case 'degraded':
        return {
          icon: <AlertOctagon size={20} color="var(--error-red, #ef4444)" />,
          color: 'var(--error-red, #ef4444)',
          bg: 'rgba(239, 68, 68, 0.1)',
          border: 'rgba(239, 68, 68, 0.3)',
          label: 'Degraded',
        };
      case 'unknown':
      default:
        return {
          icon: <HelpCircle size={20} color="var(--text-muted)" />,
          color: 'var(--text-muted)',
          bg: 'var(--bg-tertiary)',
          border: 'var(--border-color)',
          label: 'Unknown',
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <section
      className="analysis-quality-section"
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
      aria-label="Analysis Quality, Coverage & Trust"
    >
      {/* =========================================================================
          SECTION HEADER
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={22} color="var(--primary-blue)" />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Analysis Quality, Coverage & Trust
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Verification metrics, repository coverage, relationship resolution quality, and actionable diagnostics
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            background: statusBadge.bg,
            border: `1px solid ${statusBadge.border}`,
          }}
          title={quality.statusExplanation}
        >
          {statusBadge.icon}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusBadge.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {statusBadge.label}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PART A. ANALYSIS STATUS EXPLANATION & CAVEATS
         ========================================================================= */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
            {quality.statusHeadline}
          </strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            — {quality.statusExplanation}
          </span>
        </div>

        {quality.statusCaveats.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--warning-amber)' }}>
              Active Caveats
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quality.statusCaveats.map((cav, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <AlertTriangle size={11} color="var(--warning-amber)" /> {cav}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          PART B. REPOSITORY INSPECTION COVERAGE
         ========================================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0 }}>
            Repository Inspection Coverage
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Derived directly from repository ingestion and AST parser outputs
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {/* 1. Files Discovered */}
          <div
            style={{
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
            title={quality.coverage.totalDiscovered.explanation}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Files Discovered</span>
              <FileText size={14} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>
              {quality.coverage.totalDiscovered.isKnown && quality.coverage.totalDiscovered.value !== null
                ? quality.coverage.totalDiscovered.value
                : 'Unknown'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {quality.coverage.totalDiscovered.explanation}
            </div>
          </div>

          {/* 2. Files Successfully Analyzed */}
          <div
            style={{
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
            title={quality.coverage.filesAnalyzed.explanation}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Files Analyzed</span>
              <CheckCircle2 size={14} color="var(--success-teal)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success-teal)', marginTop: 6 }}>
              {quality.coverage.filesAnalyzed.isKnown ? quality.coverage.filesAnalyzed.value : 'Not measured'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {quality.coverage.filesAnalyzed.explanation}
            </div>
          </div>

          {/* 3. Files Skipped / Excluded */}
          <div
            style={{
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
            title={quality.coverage.filesSkipped.explanation}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Files Skipped</span>
              <Filter size={14} color="var(--text-muted)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>
              {quality.coverage.filesSkipped.isKnown ? quality.coverage.filesSkipped.value : 'Not recorded'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {quality.coverage.filesSkipped.explanation}
            </div>
          </div>

          {/* 4. Files with Parse Errors */}
          <div
            style={{
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
            title={quality.coverage.filesWithErrors.explanation}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Parse Errors</span>
              <AlertTriangle size={14} color={quality.coverage.filesWithErrors.value > 0 ? 'var(--warning-amber)' : 'var(--text-muted)'} />
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: quality.coverage.filesWithErrors.value > 0 ? 'var(--warning-amber)' : 'var(--text-primary)',
                marginTop: 6,
              }}
            >
              {quality.coverage.filesWithErrors.isKnown ? quality.coverage.filesWithErrors.value : 'Not measured'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {quality.coverage.filesWithErrors.explanation}
            </div>
          </div>

          {/* 5. AST Coverage Percentage */}
          <div
            style={{
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
            title={quality.coverage.coveragePercentage.explanation}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{quality.coverage.coveragePercentage.label}</span>
              <FileCode size={14} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-blue)', marginTop: 6 }}>
              {quality.coverage.coveragePercentage.isKnown && quality.coverage.coveragePercentage.value !== null
                ? `${quality.coverage.coveragePercentage.value}%`
                : 'Not measured'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {quality.coverage.coveragePercentage.explanation}
            </div>
          </div>
        </div>

        {/* Detected Languages bar */}
        {quality.coverage.detectedLanguages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Detected Languages:</span>
            {quality.coverage.detectedLanguages.map((lang, idx) => (
              <span
                key={idx}
                style={{
                  background: 'var(--bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {lang}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          PART C. RELATIONSHIP RESOLUTION QUALITY
         ========================================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0 }}>
              Relationship Resolution Quality
            </h3>
            <button
              type="button"
              onClick={() => setExpandedConfidenceHelp(!expandedConfidenceHelp)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary-blue)',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
              }}
              aria-expanded={expandedConfidenceHelp}
            >
              <Info size={12} />
              <span>{expandedConfidenceHelp ? 'Hide confidence model' : 'Explain confidence model'}</span>
            </button>
          </div>

          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Resolution Rate:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {quality.resolution.resolutionRate.isKnown && quality.resolution.resolutionRate.value !== null
                ? `${quality.resolution.resolutionRate.value}%`
                : 'Not measured'}
            </strong>{' '}
            (Statically Verified)
          </span>
        </div>

        {/* Confidence Model Definition Popover / Expandable */}
        {expandedConfidenceHelp && (
          <div
            style={{
              padding: 14,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              fontSize: 11,
            }}
          >
            <div>
              <strong style={{ color: 'var(--success-teal)' }}>Statically Resolved</strong>
              <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
                Direct AST binding confirmed via explicit imports, symbol references, or route bindings.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--primary-blue)' }}>Locally Established</strong>
              <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
                Declared within the same file or established through local lexical scope hierarchy.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--warning-amber)' }}>Inferred</strong>
              <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
                Heuristic matching based on symbol names, resource patterns, or external package boundary calls.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Dynamic Unresolved</strong>
              <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
                Runtime dispatch (eval, reflect, dynamic imports) or target exports not statically identifiable.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {/* Total Relationships */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Relationships</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {quality.resolution.totalRelationships}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>In code graph</div>
          </div>

          {/* Statically Resolved */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Statically Resolved</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success-teal)', marginTop: 4 }}>
              {quality.resolution.staticallyResolved}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Direct AST bindings</div>
          </div>

          {/* Locally Established */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Locally Established</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-blue)', marginTop: 4 }}>
              {quality.resolution.locallyEstablished}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Same-file scope</div>
          </div>

          {/* Inferred Links */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inferred Links</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {quality.resolution.inferred}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Package & convention links</div>
          </div>

          {/* Unresolved Calls / Imports */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dynamic / Unresolved</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: quality.resolution.dynamicUnresolved > 0 ? 'var(--warning-amber)' : 'var(--text-muted)', marginTop: 4 }}>
              {quality.resolution.dynamicUnresolved}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {quality.resolution.unresolvedImports > 0 ? `${quality.resolution.unresolvedImports} unresolved imports` : 'Dynamic targets'}
            </div>
          </div>

          {/* Unlinked Routes */}
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unlinked Routes</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: quality.resolution.unlinkedRoutes > 0 ? 'var(--warning-amber)' : 'var(--text-muted)', marginTop: 4 }}>
              {quality.resolution.unlinkedRoutes} / {quality.resolution.routesCount}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {quality.resolution.unlinkedRoutes === 0 ? 'All route handlers linked' : 'Dynamic route handlers'}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PART D. ACTIONABLE LIMITATIONS AND DIAGNOSTICS
         ========================================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0 }}>
              Actionable Diagnostics & Findings ({filteredDiagnostics.length} of {quality.diagnostics.length})
            </h3>
            {!quality.isCompleteDiagnosticSet && (
              <span style={{ fontSize: 10, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                Partial diagnostic set
              </span>
            )}
          </div>

          {/* Diagnostic Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Search Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <Search size={13} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search diagnostics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  width: 160,
                }}
              />
            </div>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'error' | 'warning' | 'info')}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Severities</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as DiagnosticCategory | 'all')}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Categories</option>
              <option value="parse_errors">Parse Errors</option>
              <option value="unresolved_relationships">Unresolved Relationships</option>
              <option value="unsupported_files">Unsupported Files</option>
              <option value="dependency_diagnostics">Dependency Diagnostics</option>
              <option value="partial_analysis">Partial Analysis</option>
            </select>
          </div>
        </div>

        {/* Diagnostics Table / List */}
        {filteredDiagnostics.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {quality.diagnostics.length === 0
              ? 'No diagnostics or warnings were reported for this analysis.'
              : 'No diagnostics match the selected filters.'}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 460,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredDiagnostics.map((diag) => {
              const sevColor =
                diag.severity === 'error'
                  ? 'var(--error-red, #ef4444)'
                  : diag.severity === 'warning'
                  ? 'var(--warning-amber)'
                  : 'var(--primary-blue)';

              const sevBg =
                diag.severity === 'error'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : diag.severity === 'warning'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(59, 130, 246, 0.1)';

              return (
                <div
                  key={diag.id}
                  style={{
                    padding: 14,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderLeft: `4px solid ${sevColor}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          background: sevBg,
                          color: sevColor,
                        }}
                      >
                        {diag.severity}
                      </span>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                        {diag.title}
                      </strong>
                      {diag.affectedTarget && (
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-tertiary)',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          {diag.affectedTarget}
                        </span>
                      )}
                    </div>

                    {/* Actionable Navigation Button */}
                    {diag.navigationTarget ? (
                      <button
                        type="button"
                        onClick={() => handleNavigate(diag.navigationTarget)}
                        className="tool-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          padding: '4px 8px',
                          flexShrink: 0,
                        }}
                        title={`Navigate to ${diag.affectedTarget || 'target'}`}
                      >
                        <span>{diag.navigationTarget.actionLabel}</span>
                        <ArrowRight size={12} />
                      </button>
                    ) : null}
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    {diag.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, fontSize: 11, paddingTop: 4 }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Why it matters: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{diag.reason}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Evidence: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{diag.evidence}</span>
                    </div>
                  </div>

                  {diag.nextAction && (
                    <div style={{ fontSize: 11, color: 'var(--primary-blue)', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                      <strong>Suggested action: </strong>
                      <span>{diag.nextAction}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Global Analyzer Limitations Drawer */}
        <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: 10 }}>
          <button
            type="button"
            onClick={() => setExpandedLimitations(!expandedLimitations)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
            }}
            aria-expanded={expandedLimitations}
          >
            <Info size={12} />
            <span>{expandedLimitations ? 'Hide static analyzer boundary limitations' : 'View static analyzer boundary limitations'}</span>
            {expandedLimitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {expandedLimitations && (
            <ul
              style={{
                marginTop: 8,
                paddingLeft: 20,
                fontSize: 11,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {quality.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
