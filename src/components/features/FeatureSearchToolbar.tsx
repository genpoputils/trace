'use client';

import React from 'react';
import { Search, X, Route, LayoutGrid, Zap, Database } from 'lucide-react';

interface FeatureSearchToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedConfidence: string;
  onConfidenceChange: (confidence: string) => void;
  totalCandidates: number;
  filteredCount: number;
  isPartial?: boolean;
}

export const FeatureSearchToolbar: React.FC<FeatureSearchToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedConfidence,
  onConfidenceChange,
  totalCandidates,
  filteredCount,
  isPartial,
}) => {
  return (
    <div
      className="feature-search-toolbar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 20px',
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
      }}
      role="search"
      aria-label="Search and filter inferred features"
    >
      {/* Title & Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Feature Map
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--primary-blue)',
              }}
            >
              {filteredCount} {filteredCount === 1 ? 'capability' : 'capabilities'}
              {filteredCount !== totalCandidates && ` of ${totalCandidates}`}
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Explore apparent application capabilities and the code behind them.
          </p>
        </div>

        {isPartial && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--warning-amber)',
              background: 'var(--warning-bg)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            Partial analysis coverage — some capabilities may be inferred with reduced confidence.
          </span>
        )}
      </div>

      {/* Search Input Bar */}
      <div style={{ position: 'relative', width: '100%' }}>
        <Search
          size={16}
          color="var(--text-muted)"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search capabilities, routes, files and symbols..."
          style={{
            width: '100%',
            height: 38,
            paddingLeft: 38,
            paddingRight: searchQuery ? 36 : 14,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
          aria-label="Search features"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Clear search query"
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filter Chips Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {/* Category Filters */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>
            Category:
          </span>
          {[
            { id: 'all', label: 'All Candidates' },
            { id: 'routes_api', label: 'Routes & APIs', icon: Route },
            { id: 'components_ui', label: 'UI Components', icon: LayoutGrid },
            { id: 'services_logic', label: 'Services & Logic', icon: Zap },
            { id: 'data_persistence', label: 'Data & Persistence', icon: Database },
          ].map((cat) => {
            const isActive = selectedCategory === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`tool-btn ${isActive ? 'active' : ''}`}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 'var(--radius-sm)',
                }}
                aria-pressed={isActive}
              >
                {Icon && <Icon size={12} />}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Confidence Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Confidence:</span>
          {['all', 'high', 'medium', 'low'].map((conf) => {
            const isActive = selectedConfidence === conf;
            return (
              <button
                key={conf}
                type="button"
                onClick={() => onConfidenceChange(conf)}
                className={`tool-btn ${isActive ? 'active' : ''}`}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  textTransform: 'capitalize',
                  borderRadius: 'var(--radius-sm)',
                }}
                aria-pressed={isActive}
              >
                {conf}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
