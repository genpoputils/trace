'use client';

import React from 'react';
import { CodebaseFeature } from '@/lib/features/feature-map-types';
import { Route, LayoutGrid, Zap, Database, Layers } from 'lucide-react';

interface FeatureListItemProps {
  feature: CodebaseFeature;
  isSelected: boolean;
  onSelect: (featureId: string) => void;
}

export const FeatureListItem: React.FC<FeatureListItemProps> = ({
  feature,
  isSelected,
  onSelect,
}) => {
  const getCategoryIcon = () => {
    switch (feature.category) {
      case 'routes_api':
        return <Route size={13} color="var(--primary-blue)" />;
      case 'components_ui':
        return <LayoutGrid size={13} color="var(--primary-blue)" />;
      case 'services_logic':
        return <Zap size={13} color="var(--success-teal)" />;
      case 'data_persistence':
        return <Database size={13} color="var(--warning-amber)" />;
      default:
        return <Layers size={13} color="var(--text-muted)" />;
    }
  };

  const getConfidenceBadge = () => {
    switch (feature.confidence) {
      case 'high':
        return {
          label: 'High Confidence',
          color: 'var(--success-teal)',
          bg: 'rgba(16, 185, 129, 0.1)',
        };
      case 'medium':
        return {
          label: 'Medium Confidence',
          color: 'var(--primary-blue)',
          bg: 'rgba(59, 130, 246, 0.1)',
        };
      case 'low':
      default:
        return {
          label: 'Low / Inferred',
          color: 'var(--warning-amber)',
          bg: 'rgba(245, 158, 11, 0.1)',
        };
    }
  };

  const conf = getConfidenceBadge();

  return (
    <div
      className={`feature-list-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(feature.id)}
      role="option"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(feature.id);
        }
      }}
      aria-selected={isSelected}
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: isSelected ? 'var(--panel-bg)' : 'var(--bg-card)',
        border: isSelected
          ? '2px solid var(--primary-blue)'
          : '1px solid var(--border-color)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'all 0.15s ease',
        boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
      }}
    >
      {/* Top Header: Category, Name, and Confidence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {getCategoryIcon()}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: isSelected ? 'var(--primary-blue)' : 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {feature.name}
          </span>
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: conf.color,
            background: conf.bg,
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {feature.confidence}
        </span>
      </div>

      {/* One-line Summary */}
      <p
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          margin: 0,
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {feature.summary}
      </p>

      {/* Footer Info: Entry Point & Evidence Count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 2,
        }}
      >
        {feature.entryPoint ? (
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--bg-tertiary)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              maxWidth: 180,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}
            title={feature.entryPoint.name}
          >
            {feature.entryPoint.name}
          </span>
        ) : (
          <span>Modular capability</span>
        )}

        <span>{feature.evidence.length} supporting {feature.evidence.length === 1 ? 'item' : 'items'}</span>
      </div>
    </div>
  );
};
