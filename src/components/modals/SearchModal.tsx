'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProjectAnalysis, SearchResult, EntityKind } from '@/lib/types/trace';
import {
  Search,
  X,
  Code2,
  Route,
  ArrowRight,
} from 'lucide-react';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ProjectAnalysis;
  onSelectEntity: (entityId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  analysis,
  onSelectEntity,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState<EntityKind | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setLoading(true);
    });

    browserAnalysisService.searchSymbols(analysis.projectId, {
      term: searchTerm.trim(),
      kinds: selectedKind === 'all' ? undefined : [selectedKind],
      limit: 25,
    })
      .then((data) => {
        if (isMounted) {
          setResults(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [searchTerm, selectedKind, analysis.projectId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        {/* Search Input Bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-color)', gap: 10 }}>
          <Search size={18} color="var(--primary-blue)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search functions, routes, classes, files, or symbols..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!e.target.value.trim()) setResults([]);
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
            }}
          />
          <button onClick={onClose}><X size={18} color="var(--text-muted)" /></button>
        </div>

        {/* Kind Filters */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 18px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
          {(['all', 'route', 'function', 'class', 'db_query'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setSelectedKind(kind)}
              className={`tool-btn ${selectedKind === kind ? 'active' : ''}`}
              style={{ fontSize: 11, textTransform: 'capitalize' }}
            >
              {kind === 'all' ? 'All Types' : kind.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 10 }}>
          {searchTerm && results.length === 0 && !loading && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No symbols matched &quot;{searchTerm}&quot;
            </div>
          )}

          {results.map((res) => {
            const ent = res.entity;
            return (
              <div
                key={ent.id}
                onClick={() => {
                  onSelectEntity(ent.id);
                  onClose();
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                className="nav-tab-btn"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`kind-badge ${ent.kind}`}>{ent.kind}</span>
                  <div>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ent.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {ent.filePath}:{ent.location.startLine}
                    </div>
                  </div>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
