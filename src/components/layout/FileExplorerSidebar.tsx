'use client';

import React, { useState, useMemo } from 'react';
import { ProjectAnalysis, TraceEntity } from '@/lib/types/trace';
import { FileCode, Search, X, FolderTree } from 'lucide-react';

interface FileExplorerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  fileSymbolsMap: Map<string, TraceEntity[]>;
  onSelectEntity: (entityId: string) => void;
}

export const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({
  isOpen,
  onClose,
  analysis,
  selectedEntityId,
  fileSymbolsMap,
  onSelectEntity,
}) => {
  const [filterText, setFilterText] = useState('');

  const activeFilePath = selectedEntityId
    ? analysis.entities[selectedEntityId]?.filePath
    : null;

  const filePaths = useMemo(() => {
    const all = Object.keys(analysis.files);
    if (!filterText.trim()) return all;
    const lower = filterText.toLowerCase();
    return all.filter((p) => p.toLowerCase().includes(lower));
  }, [analysis.files, filterText]);

  if (!isOpen) return null;

  return (
    <aside
      className="sub-sidebar"
      aria-label="Repository File Explorer"
    >
      {/* Sidebar Header */}
      <div className="sub-sidebar-header">
        <div className="sub-sidebar-title">
          <FolderTree size={14} color="var(--primary-blue)" />
          <span>Explorer</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            ({analysis.stats.totalFiles})
          </span>
        </div>
        <button
          onClick={onClose}
          className="tool-btn"
          style={{ padding: '2px 5px', fontSize: 11 }}
          title="Collapse File Explorer"
          aria-label="Collapse File Explorer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search
            size={12}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 8, pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="sidebar-search-input"
            style={{ paddingLeft: 26 }}
            aria-label="Filter files in repository"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              style={{ position: 'absolute', right: 6, color: 'var(--text-muted)' }}
              aria-label="Clear filter"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* File Tree List */}
      <div className="sidebar-scroll-content" role="list">
        {filePaths.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No files matched &quot;{filterText}&quot;
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filePaths.map((filePath) => {
              const symbolsInFile = fileSymbolsMap.get(filePath) || [];
              const isFileActive = activeFilePath === filePath;

              return (
                <div
                  key={filePath}
                  role="listitem"
                  onClick={() => {
                    const target =
                      symbolsInFile[0] ||
                      Object.values(analysis.entities).find((e) => e.filePath === filePath);
                    if (target) onSelectEntity(target.id);
                  }}
                  className={`nav-tab-btn ${isFileActive ? 'active' : ''}`}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  title={`${filePath} (${symbolsInFile.length} symbols)`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <FileCode
                      size={13}
                      color={isFileActive ? 'var(--primary-blue)' : 'var(--text-muted)'}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      style={{
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        direction: 'rtl',
                        textAlign: 'left',
                      }}
                    >
                      {filePath}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: isFileActive ? 'var(--primary-blue)' : 'var(--text-muted)',
                      flexShrink: 0,
                      marginLeft: 4,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: isFileActive ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-tertiary)',
                    }}
                  >
                    {symbolsInFile.length}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
