'use client';

import React from 'react';
import { ArchitectureCategoryGroup } from '@/lib/features/feature-map-types';
import {
  Compass,
  ArrowRight,
  Route,
  LayoutGrid,
  Zap,
  Database,
  ExternalLink,
  Layers,
} from 'lucide-react';

interface ArchitectureSummaryProps {
  groups: ArchitectureCategoryGroup[];
  onSelectEntity: (entityId: string) => void;
  onExploreGraph: (entityId: string) => void;
}

export const ArchitectureSummary: React.FC<ArchitectureSummaryProps> = ({
  groups,
  onSelectEntity,
  onExploreGraph,
}) => {
  if (groups.length === 0) {
    return null;
  }

  const getCategoryIcon = (groupId: string) => {
    switch (groupId) {
      case 'entry_points':
        return <Route size={16} color="var(--primary-blue)" />;
      case 'ui_components':
        return <LayoutGrid size={16} color="var(--primary-blue)" />;
      case 'services_logic':
        return <Zap size={16} color="var(--success-teal)" />;
      case 'data_persistence':
        return <Database size={16} color="var(--warning-amber)" />;
      case 'external_boundaries':
        return <ExternalLink size={16} color="var(--error-red)" />;
      default:
        return <Layers size={16} color="var(--text-secondary)" />;
    }
  };

  return (
    <section
      className="architecture-summary-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label="Application Structure Summary"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Application Structure
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Discovered components, entry points, and persistence layers derived from codebase relationships.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>Entry Points</span>
          <ArrowRight size={12} />
          <span>Services</span>
          <ArrowRight size={12} />
          <span>Data Storage</span>
        </div>
      </div>

      {/* Grid of Discovered Categories */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {groups.map((grp) => (
          <div
            key={grp.id}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {getCategoryIcon(grp.id)}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {grp.name}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {grp.count} {grp.count === 1 ? 'entity' : 'entities'}
              </span>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, minHeight: 28, lineHeight: 1.4 }}>
              {grp.description}
            </p>

            {/* Top Entities List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grp.topEntities.map((ent) => (
                <div
                  key={ent.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    fontSize: 12,
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => onSelectEntity(ent.id)}
                  title={`Inspect ${ent.name} in ${ent.filePath}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span className={`kind-badge ${ent.kind}`}>{ent.kind}</span>
                    <span
                      style={{
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ent.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExploreGraph(ent.id);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 2,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Explore in interactive code graph"
                    aria-label={`Explore ${ent.name} in graph`}
                  >
                    <Compass size={13} color="var(--primary-blue)" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
