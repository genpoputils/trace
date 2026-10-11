'use client';

import React from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  FileText,
  Code,
  Network,
  Route,
  Database,
  AlertTriangle,
  Award,
  ArrowUpRight,
} from 'lucide-react';

interface DashboardViewProps {
  analysis: ProjectAnalysis;
  onSelectEntity: (entityId: string) => void;
  onNavigateTab: (tab: 'graph' | 'paths' | 'dataflow' | 'impact' | 'overview') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  analysis,
  onSelectEntity,
  onNavigateTab,
}) => {
  const routes = React.useMemo(() => {
    return Object.values(analysis.entities).filter((e) => e.kind === 'route');
  }, [analysis]);

  const dbQueries = React.useMemo(() => {
    return Object.values(analysis.entities).filter((e) => e.kind === 'db_query');
  }, [analysis]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Project Header Banner */}
        <div
          style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderTop: '3px solid var(--primary-blue)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-blue)' }}>
              Project Intelligence Overview
            </span>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
              {analysis.projectName}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Analyzed at {new Date(analysis.analyzedAt).toLocaleString()} • Engine v{analysis.version}
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('graph')}
            className="btn-upload"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Explore Interactive Graph <ArrowUpRight size={16} />
          </button>
        </div>

        {/* 6 Key Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Files Analyzed</span>
              <FileText size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.totalFiles}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {analysis.stats.totalLines.toLocaleString()} lines ({analysis.stats.languages.join(', ')})
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Symbols Identified</span>
              <Code size={16} color="var(--success-teal)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.totalSymbols}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Functions, classes & interfaces</div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Relationships</span>
              <Network size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.totalRelationships}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Cross-module calls & imports</div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>API Endpoints</span>
              <Route size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.routesCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Express & Next.js routes</div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Database Queries</span>
              <Database size={16} color="var(--primary-blue)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.dbQueriesCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Prisma & SQL query points</div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 12 }}>Unresolved Calls</span>
              <AlertTriangle size={16} color="var(--warning-amber)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{analysis.stats.unresolvedCalls}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Dynamic dispatches or external</div>
          </div>
        </div>

        {/* Central Hubs & Route Sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Central Hubs Leaderboard */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
              <Award size={18} color="var(--primary-blue)" /> Most Connected Core Hubs
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.stats.mostConnected.slice(0, 7).map((hub, idx) => (
                <div
                  key={hub.symbolId}
                  onClick={() => onSelectEntity(hub.symbolId)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 14 }}>#{idx + 1}</span>
                    <span className={`kind-badge ${hub.kind}`}>{hub.kind}</span>
                    <strong style={{ fontSize: 13 }}>{hub.name}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {hub.inboundCount} in / {hub.outboundCount} out
                  </div>
                </div>
              ))}
            </div>
          </div>

              {/* Discovered API Routes */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                <Route size={18} color="var(--primary-blue)" /> Discovered API Routes ({routes.length})
              </div>
              {routes.length > 30 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing top 30</span>
              )}
            </div>
            {routes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No HTTP route declarations found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {routes.slice(0, 30).map((rt) => (
                  <div
                    key={rt.id}
                    onClick={() => onSelectEntity(rt.id)}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="kind-badge route">Route</span>
                      <strong style={{ fontSize: 13 }}>{rt.name}</strong>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rt.filePath.split('/').pop()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Database Queries Section */}
        {dbQueries.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                <Database size={18} color="var(--primary-blue)" /> Identified Database Operations ({dbQueries.length})
              </div>
              {dbQueries.length > 30 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing top 30</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {dbQueries.slice(0, 30).map((dbq) => (
                <div
                  key={dbq.id}
                  onClick={() => onSelectEntity(dbq.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="kind-badge db_query">DB</span>
                    <strong style={{ fontSize: 12 }}>{dbq.name}</strong>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Line {dbq.location.startLine}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
