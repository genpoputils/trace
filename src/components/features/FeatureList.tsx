'use client';

import React from 'react';
import { CodebaseFeature } from '@/lib/features/feature-map-types';
import { FeatureListItem } from './FeatureListItem';
import { AlertCircle } from 'lucide-react';

interface FeatureListProps {
  features: CodebaseFeature[];
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
}

export const FeatureList: React.FC<FeatureListProps> = ({
  features,
  selectedFeatureId,
  onSelectFeature,
}) => {
  if (features.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <AlertCircle size={28} color="var(--text-muted)" />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          No features matched your filters
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, maxWidth: 280 }}>
          Try clearing your search term or adjusting the category and confidence filters above.
        </p>
      </div>
    );
  }

  return (
    <div
      className="feature-list-scroll-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflowY: 'auto',
        maxHeight: 700,
        paddingRight: 4,
      }}
      role="listbox"
      aria-label="Discovered application features"
    >
      {features.map((feature) => (
        <FeatureListItem
          key={feature.id}
          feature={feature}
          isSelected={feature.id === selectedFeatureId}
          onSelect={onSelectFeature}
        />
      ))}
    </div>
  );
};
