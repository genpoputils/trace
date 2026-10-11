'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Zap,
  Copy,
  Check,
  FileCode,
} from 'lucide-react';

interface LowerSourcePanelProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  defaultHeightMode?: 'collapsed' | 'compact' | 'expanded';
}

const LINE_HEIGHT = 22;

export const LowerSourcePanel: React.FC<LowerSourcePanelProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
  defaultHeightMode = 'compact',
}) => {
  const [heightMode, setHeightMode] = useState<'collapsed' | 'compact' | 'expanded'>(defaultHeightMode);
  const [activeTab, setActiveTab] = useState<'source' | 'context'>('source');
  const [copied, setCopied] = useState<boolean>(false);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const entity = selectedEntityId ? analysis.entities[selectedEntityId] : undefined;
  const fileRecord = entity ? analysis.files[entity.filePath] : undefined;

  // Memoize splitting file lines
  const lines = useMemo(() => {
    if (fileRecord) {
      return fileRecord.content.split('\n');
    }
    return (entity?.snippet || '').split('\n');
  }, [fileRecord, entity]);

  const startLineOffset = fileRecord ? 1 : (entity?.location.startLine || 1);

  // Determine current panel height
  const panelHeight =
    heightMode === 'collapsed' ? 38 : heightMode === 'compact' ? 220 : 420;
  const viewportHeight = panelHeight - 38;

  // Virtualization
  const totalHeight = lines.length * LINE_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 15);
  const endIndex = Math.min(lines.length, Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + 15);
  const visibleLines = useMemo(() => {
    return lines.slice(startIndex, endIndex);
  }, [lines, startIndex, endIndex]);
  const offsetY = startIndex * LINE_HEIGHT;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Auto scroll to target entity lines on selection change
  useEffect(() => {
    if (entity && codeContainerRef.current) {
      const targetLineIdx = Math.max(0, entity.location.startLine - startLineOffset);
      const targetScrollTop = Math.max(0, targetLineIdx * LINE_HEIGHT - 60);
      codeContainerRef.current.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
    }
  }, [entity, startLineOffset]);

  // Compute callers and callees
  const executionContext = useMemo(() => {
    if (!entity) return { callers: [], callees: [] };
    const callers: { id: string; name: string; kind: string; file: string; line: number }[] = [];
    const callees: { id: string; name: string; kind: string; file: string; line: number }[] = [];

    for (const rel of analysis.relationships) {
      if (
        rel.targetId === entity.id &&
        (rel.kind === 'calls' || rel.kind === 'routes_to' || rel.kind === 'imports')
      ) {
        const caller = analysis.entities[rel.sourceId];
        if (caller) {
          callers.push({
            id: caller.id,
            name: caller.name,
            kind: caller.kind,
            file: caller.filePath,
            line: rel.location?.startLine || caller.location.startLine,
          });
        }
      }
      if (
        rel.sourceId === entity.id &&
        (rel.kind === 'calls' || rel.kind === 'routes_to' || rel.kind === 'reads_from')
      ) {
        const callee = analysis.entities[rel.targetId];
        if (callee) {
          callees.push({
            id: callee.id,
            name: callee.name,
            kind: callee.kind,
            file: callee.filePath,
            line: rel.location?.startLine || callee.location.startLine,
          });
        }
      }
    }
    return { callers, callees };
  }, [analysis.relationships, analysis.entities, entity]);

  const handleCopyPath = () => {
    if (!entity) return;
    navigator.clipboard.writeText(`${entity.filePath}:${entity.location.startLine}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!entity) {
    return null;
  }

  const isCollapsed = heightMode === 'collapsed';

  return (
    <div
      style={{
        height: panelHeight,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.16s ease',
        zIndex: 30,
        boxShadow: 'var(--shadow-sm)',
        flexShrink: 0,
      }}
      role="region"
      aria-label="Source code viewer"
    >
      {/* Top Bar */}
      <div
        style={{
          height: 38,
          background: 'var(--bg-tertiary)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          minWidth: 0,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className={`panel-tab ${activeTab === 'source' ? 'active' : ''}`}
              style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                setActiveTab('source');
                if (isCollapsed) setHeightMode('compact');
              }}
              aria-label="View source code"
            >
              <Code2 size={13} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-top' }} /> Source
            </button>
            <button
              className={`panel-tab ${activeTab === 'context' ? 'active' : ''}`}
              style={{ padding: '5px 10px', fontSize: 12, borderRadius: 4 }}
              onClick={() => {
                setActiveTab('context');
                if (isCollapsed) setHeightMode('compact');
              }}
              aria-label="View execution context"
            >
              <Zap size={13} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-top' }} /> Context ({executionContext.callers.length + executionContext.callees.length})
            </button>
          </div>

          <span style={{ color: 'var(--border-color)', flexShrink: 0 }} aria-hidden="true">|</span>

          {/* Active File & Symbol Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-secondary)',
              minWidth: 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <FileCode size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <strong
              style={{
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={entity.filePath}
            >
              {entity.filePath}
            </strong>
            <span style={{ flexShrink: 0 }}>:</span>
            <span
              style={{
                color: 'var(--primary-blue)',
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
              }}
            >
              L{entity.location.startLine}–{entity.location.endLine}
            </span>
            <span
              className={`kind-badge ${entity.kind}`}
              style={{ fontSize: 9, padding: '1px 5px', flexShrink: 0 }}
            >
              {entity.name}
            </span>
          </div>
        </div>

        {/* Panel Controls: Copy, Height toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleCopyPath}
            className="tool-btn"
            style={{ fontSize: 11, padding: '3px 8px' }}
            title="Copy path and start line (e.g. src/auth.ts:42)"
            aria-label="Copy file reference"
          >
            {copied ? <Check size={12} color="var(--success-teal)" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy Ref'}</span>
          </button>

          {/* Expand / Minimize Toggle */}
          <button
            onClick={() => {
              if (heightMode === 'expanded') setHeightMode('compact');
              else setHeightMode('expanded');
            }}
            className="tool-btn"
            style={{ padding: '3px 6px' }}
            title={heightMode === 'expanded' ? 'Compact panel' : 'Expand panel'}
            aria-label={heightMode === 'expanded' ? 'Compact panel' : 'Expand panel'}
          >
            {heightMode === 'expanded' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Collapse / Open Toggle */}
          <button
            onClick={() => {
              if (heightMode === 'collapsed') setHeightMode('compact');
              else setHeightMode('collapsed');
            }}
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4 }}
            title={isCollapsed ? 'Open source panel' : 'Collapse source panel'}
            aria-label={isCollapsed ? 'Open source panel' : 'Collapse source panel'}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {/* TAB 1: VIRTUALIZED SOURCE CODE VIEWER */}
          <div
            style={{
              display: activeTab === 'source' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              ref={codeContainerRef}
              onScroll={handleScroll}
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflowY: 'auto',
                overflowX: 'auto',
                background: 'var(--code-bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: `${LINE_HEIGHT}px`,
                position: 'relative',
              }}
            >
              <div style={{ height: Math.max(totalHeight, viewportHeight), width: '100%', position: 'relative' }}>
                <div style={{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }}>
                  {visibleLines.map((lineContent, idx) => {
                    const lineNum = startLineOffset + startIndex + idx;
                    const isTargetLine =
                      lineNum >= entity.location.startLine && lineNum <= entity.location.endLine;

                    return (
                      <div
                        key={lineNum}
                        id={`source-line-${lineNum}`}
                        style={{
                          display: 'flex',
                          height: LINE_HEIGHT,
                          background: isTargetLine ? 'rgba(37, 99, 235, 0.22)' : 'transparent',
                          borderLeft: isTargetLine ? '3px solid var(--primary-blue)' : '3px solid transparent',
                          padding: '0 12px 0 6px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          style={{
                            width: 44,
                            textAlign: 'right',
                            paddingRight: 14,
                            color: isTargetLine ? 'var(--primary-blue)' : 'var(--code-line-num)',
                            userSelect: 'none',
                            flexShrink: 0,
                          }}
                        >
                          {lineNum}
                        </span>
                        <span style={{ color: isTargetLine ? '#FFFFFF' : 'var(--code-text)', whiteSpace: 'pre' }}>
                          {lineContent}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: EXECUTION CONTEXT */}
          <div
            style={{
              display: activeTab === 'context' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: 'auto',
              background: 'var(--bg-primary)',
              padding: 16,
              flexDirection: 'column',
            }}
          >
            <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Inbound Callers */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Inbound Callers ({executionContext.callers.length})
                  </div>
                  {executionContext.callers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      No direct internal callers (may be public entry point).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                      {executionContext.callers.map((c) => (
                        <div
                          key={`${c.id}-${c.line}`}
                          onClick={() => onSelectEntity(c.id)}
                          style={{
                            padding: '5px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`kind-badge ${c.kind}`}>{c.kind}</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>L{c.line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outbound Calls */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Outbound Calls ({executionContext.callees.length})
                  </div>
                  {executionContext.callees.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      No outbound calls invoked.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                      {executionContext.callees.map((c) => (
                        <div
                          key={`${c.id}-${c.line}`}
                          onClick={() => onSelectEntity(c.id)}
                          style={{
                            padding: '5px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="kind-badge function">{c.kind}</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>L{c.line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
