'use client';

import React, { useState, useMemo, useRef } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import { AudienceMode } from '@/lib/features/feature-map-types';
import {
  generateCodebaseOverview,
  extractArchitectureGroups,
  inferFeatureMap,
} from '@/lib/features/feature-map-service';
import { AudienceModeSwitch } from '@/components/features/AudienceModeSwitch';
import { OverviewSummary } from '@/components/features/OverviewSummary';
import { ArchitectureSummary } from '@/components/features/ArchitectureSummary';
import { FeatureMapView } from '@/components/features/FeatureMapView';
import {
  FileText,
  Code,
  Network,
  Route,
  Database,
  Award,
  ArrowUpRight,
  Sparkles,
  Info,
  MapPin,
} from 'lucide-react';

interface DashboardViewProps {
  analysis: ProjectAnalysis;
  onSelectEntity: (entityId: string) => void;
  onNavigateTab: (tab: 'graph' | 'paths' | 'dataflow' | 'impact' | 'overview' | 'dependencies' | 'ai') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  analysis,
  onSelectEntity,
  onNavigateTab,
}) => {
  // Audience mode with session storage persistence
  const [audienceMode, setAudienceMode] = useState<AudienceMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('trace_audience_mode');
      if (saved === 'stakeholder' || saved === 'developer') {
        return saved;
      }
    }
    return 'developer';
  });

  const handleAudienceChange = (mode: AudienceMode) => {
    setAudienceMode(mode);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('trace_audience_mode', mode);
    }
  };

  const featureMapRef = useRef<HTMLDivElement>(null);

  // Deterministic Overview & Architecture Inference
  const overview = useMemo(() => generateCodebaseOverview(analysis), [analysis]);
  const archGroups = useMemo(() => extractArchitectureGroups(analysis), [analysis]);
  const features = useMemo(() => inferFeatureMap(analysis), [analysis]);

  const warnings = analysis.warnings || [];

  const handleExploreGraph = (entityId: string) => {
    onSelectEntity(entityId);
    onNavigateTab('graph');
  };

  const scrollToFeatureMap = () => {
    featureMapRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      className="dashboard-overview-container"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '24px 28px',
        background: 'var(--bg-primary)',
      }}
      role="region"
      aria-label="Repository Overview and Feature Map"
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Top Controls: Audience Switch and Quick Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Perspective:</span>
            <AudienceModeSwitch mode={audienceMode} onChange={handleAudienceChange} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={scrollToFeatureMap}
              className="tool-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <MapPin size={14} color="var(--primary-blue)" /> Feature Map ({features.length})
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('graph')}
              className="btn-upload"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              Explore Graph <ArrowUpRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('ai')}
              className="tool-btn active"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <Sparkles size={14} color="var(--primary-blue)" /> Ask AI Investigator
            </button>
          </div>
        </div>

        {/* 1. Repository Identity and Application Purpose Summary */}
        <OverviewSummary
          analysis={analysis}
          overview={overview}
          audienceMode={audienceMode}
          onNavigateTab={onNavigateTab}
        />

        {/* 2. Key Architecture Metric Cards (Clickable) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {/* Files Analysed */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('trace:toggle-files'));
            }}
            title="Files analysed in project"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Files Analysed</span>
              <FileText size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
              {analysis.stats.totalFiles}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {analysis.stats.totalLines.toLocaleString()} lines ({analysis.stats.languages.join(', ')})
            </div>
          </div>

          {/* Symbols Identified */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => onNavigateTab('graph')}
            title="Symbols identified — Click to view in graph"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Symbols Identified</span>
              <Code size={16} color="var(--success-teal)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
              {analysis.stats.totalSymbols}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Functions, classes, components & hooks
            </div>
          </div>

          {/* Discovered Routes */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={scrollToFeatureMap}
            title="Discovered HTTP routes — Click to jump to Feature Map"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>API Endpoints</span>
              <Route size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
              {analysis.stats.routesCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              HTTP routes & controllers
            </div>
          </div>

          {/* Discovered Relationships */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => onNavigateTab('graph')}
            title="Cross-module relationships — Click to view graph"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Relationships</span>
              <Network size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
              {analysis.stats.totalRelationships}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Cross-module calls & imports
            </div>
          </div>

          {/* Database Queries */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Database Queries</span>
              <Database size={16} color="var(--warning-amber)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
              {analysis.stats.dbQueriesCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Prisma & SQL query points
            </div>
          </div>
        </div>

        {/* Warnings / Diagnostics Banner */}
        {warnings.length > 0 && (
          <div
            style={{
              padding: 16,
              background: 'var(--warning-bg)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--warning-amber)' }}>
              <Info size={16} /> Analysis Notes & Diagnostics ({warnings.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 100, overflowY: 'auto' }}>
              {warnings.map((w, idx) => (
                <div key={idx} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  • {w.filePath ? `[${w.filePath}] ` : ''}{w.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Discovered Application Structure (Architecture Summary) */}
        <ArchitectureSummary
          groups={archGroups}
          onSelectEntity={onSelectEntity}
          onExploreGraph={handleExploreGraph}
        />

        {/* 4. Core Feature Map Section */}
        <div ref={featureMapRef} style={{ paddingTop: 8 }}>
          <FeatureMapView
            analysis={analysis}
            features={features}
            audienceMode={audienceMode}
            onSelectEntity={onSelectEntity}
            onExploreGraph={handleExploreGraph}
          />
        </div>

        {/* 5. Most Connected Core Hubs */}
        {analysis.stats.mostConnected && analysis.stats.mostConnected.length > 0 && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              <Award size={18} color="var(--primary-blue)" /> Most Connected Core Hubs
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {analysis.stats.mostConnected.slice(0, 6).map((hub, idx) => (
                <div
                  key={hub.symbolId}
                  onClick={() => handleExploreGraph(hub.symbolId)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to select in interactive graph"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 14 }}>#{idx + 1}</span>
                    <span className={`kind-badge ${hub.kind}`}>{hub.kind}</span>
                    <strong style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {hub.name}
                    </strong>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                    {hub.inboundCount} in / {hub.outboundCount} out
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
