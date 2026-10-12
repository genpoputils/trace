'use client';

import React, { useState, useMemo } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import { CodebaseFeature, AudienceMode } from '@/lib/features/feature-map-types';
import { filterFeatures } from '@/lib/features/feature-map-service';
import { FeatureSearchToolbar } from './FeatureSearchToolbar';
import { FeatureList } from './FeatureList';
import { FeatureDetailPanel } from './FeatureDetailPanel';

interface FeatureMapViewProps {
  analysis: ProjectAnalysis;
  features: CodebaseFeature[];
  audienceMode: AudienceMode;
  onSelectEntity: (entityId: string) => void;
  onExploreGraph: (entityId: string) => void;
}

export const FeatureMapView: React.FC<FeatureMapViewProps> = ({
  analysis,
  features,
  audienceMode,
  onSelectEntity,
  onExploreGraph,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(() => {
    return features.length > 0 ? features[0].id : null;
  });

  // Filter features
  const filteredFeatures = useMemo(() => {
    return filterFeatures(features, searchQuery, selectedCategory, selectedConfidence);
  }, [features, searchQuery, selectedCategory, selectedConfidence]);

  // Keep selected feature valid
  const effectiveSelectedFeature = useMemo(() => {
    if (selectedFeatureId) {
      const match = features.find((f) => f.id === selectedFeatureId);
      if (match) return match;
    }
    return filteredFeatures.length > 0 ? filteredFeatures[0] : null;
  }, [features, filteredFeatures, selectedFeatureId]);

  return (
    <section
      className="feature-map-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label="Codebase Feature Map"
    >
      {/* Search & Filter Toolbar */}
      <FeatureSearchToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedConfidence={selectedConfidence}
        onConfidenceChange={setSelectedConfidence}
        totalCandidates={features.length}
        filteredCount={filteredFeatures.length}
        isPartial={analysis.isPartial}
      />

      {/* Two-Column Workspace (38% List / 62% Details) */}
      <div
        className="feature-map-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 38%) minmax(400px, 62%)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Left Column: Feature List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            Showing {filteredFeatures.length} candidate {filteredFeatures.length === 1 ? 'feature' : 'features'}
          </div>
          <FeatureList
            features={filteredFeatures}
            selectedFeatureId={effectiveSelectedFeature?.id || null}
            onSelectFeature={setSelectedFeatureId}
          />
        </div>

        {/* Right Column: Selected Feature Details */}
        <div>
          {effectiveSelectedFeature ? (
            <FeatureDetailPanel
              feature={effectiveSelectedFeature}
              allFeatures={features}
              audienceMode={audienceMode}
              onSelectEntity={onSelectEntity}
              onExploreGraph={onExploreGraph}
              onSelectFeature={setSelectedFeatureId}
            />
          ) : (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              Select a capability from the list on the left to inspect its supporting code and architecture relationships.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
