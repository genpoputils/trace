'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProjectAnalysis, SearchResult, EntityKind } from '@/lib/types/trace';
import {
  Search,
  X,
  ArrowRight,
  FolderGit2,
  UploadCloud,
  Layers,
} from 'lucide-react';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';
import { useModalAccessibility } from '@/lib/hooks/use-modal-accessibility';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ProjectAnalysis | null;
  onSelectEntity: (entityId: string) => void;
  onOpenGitHubModal?: () => void;
  onOpenUploadModal?: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  analysis,
  onSelectEntity,
  onOpenGitHubModal,
  onOpenUploadModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState<EntityKind | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { containerRef, handleOverlayMouseDown, handleOverlayClick } = useModalAccessibility({
    isOpen,
    onClose,
    initialFocusRef: inputRef,
  });

  // Handle arrow keys and enter within search
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter' && results.length > 0 && selectedIndex < results.length) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          onSelectEntity(selected.entity.id);
          onClose();
        }
      }
    },
    [results, selectedIndex, onSelectEntity, onClose]
  );

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      activeEl.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute search
  useEffect(() => {
    if (!analysis || !searchTerm.trim()) {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setLoading(true);
    });

    browserAnalysisService
      .searchSymbols(analysis.projectId, {
        term: searchTerm.trim(),
        kinds: selectedKind === 'all' ? undefined : [selectedKind],
        limit: 30,
      })
      .then((data) => {
        if (isMounted) {
          setResults(data);
          setSelectedIndex(0);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [searchTerm, selectedKind, analysis]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        ref={containerRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{ maxWidth: 640 }}
      >
        <h2 id="search-modal-title" style={{ display: 'none' }}>Global Symbol Search</h2>

        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            gap: 10,
          }}
        >
          <Search size={18} color="var(--primary-blue)" />
          <input
            ref={inputRef}
            type="text"
            placeholder={
              analysis
                ? "Search functions, routes, classes, files, or symbols..."
                : "No repository loaded — search unavailable"
            }
            value={searchTerm}
            disabled={!analysis}
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
            aria-label="Search symbols"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* If no project is currently loaded */}
        {!analysis ? (
          <div style={{ padding: '36px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Layers size={36} color="var(--text-muted)" />
            <div>
              <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                No Repository Analyzed Yet
              </strong>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 380 }}>
                Symbol search requires an active project. Connect a GitHub repository, upload a ZIP, or load the sample project to begin.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {onOpenGitHubModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenGitHubModal();
                  }}
                  className="btn-github"
                  style={{ fontSize: 12 }}
                >
                  <FolderGit2 size={13} /> Connect GitHub
                </button>
              )}
              {onOpenUploadModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenUploadModal();
                  }}
                  className="btn-upload"
                  style={{ fontSize: 12 }}
                >
                  <UploadCloud size={13} /> Upload ZIP
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Kind Filters */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '10px 18px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-color)',
                overflowX: 'auto',
              }}
              role="tablist"
              aria-label="Filter by symbol type"
            >
              {(['all', 'route', 'function', 'class', 'db_query'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setSelectedKind(kind)}
                  className={`tool-btn ${selectedKind === kind ? 'active' : ''}`}
                  style={{ fontSize: 11, textTransform: 'capitalize' }}
                  role="tab"
                  aria-selected={selectedKind === kind}
                >
                  {kind === 'all' ? 'All Types' : kind.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}
              role="listbox"
            >
              {!searchTerm && (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Type to search across AST symbols, exported functions, routes, and Prisma DB models...
                </div>
              )}

              {searchTerm && results.length === 0 && !loading && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No symbols matched &quot;{searchTerm}&quot;
                </div>
              )}

              {results.map((res, index) => {
                const ent = res.entity;
                const isSelected = index === selectedIndex;

                return (
                  <div
                    key={ent.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectEntity(ent.id);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--blue-selection-bg)' : 'transparent',
                      border: isSelected ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid transparent',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                      <span className={`kind-badge ${ent.kind}`}>{ent.kind}</span>
                      <div style={{ overflow: 'hidden' }}>
                        <strong
                          style={{
                            fontSize: 13,
                            color: isSelected ? 'var(--primary-blue)' : 'var(--text-primary)',
                            display: 'block',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ent.name}
                        </strong>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {ent.filePath}:{ent.location.startLine}
                        </div>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      color={isSelected ? 'var(--primary-blue)' : 'var(--text-muted)'}
                    />
                  </div>
                );
              })}
            </div>

            {/* Footer shortcuts hint */}
            <div
              style={{
                padding: '8px 16px',
                background: 'var(--bg-tertiary)',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <span><kbd className="kbd-badge">↑</kbd> <kbd className="kbd-badge">↓</kbd> Navigate</span>
                <span><kbd className="kbd-badge">Enter</kbd> Select</span>
                <span><kbd className="kbd-badge">Esc</kbd> Close</span>
              </div>
              <span>{results.length} result(s)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
