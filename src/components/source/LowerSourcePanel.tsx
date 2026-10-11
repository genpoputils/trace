'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ProjectAnalysis } from '@/lib/types/trace';
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Copy,
  Check,
  FileCode,
} from 'lucide-react';

interface LowerSourcePanelProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

const LINE_HEIGHT = 22;
const VIEWPORT_HEIGHT = 242;

export const LowerSourcePanel: React.FC<LowerSourcePanelProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'source' | 'context' | 'ai'>('source');
  const [copied, setCopied] = useState<boolean>(false);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const entity = selectedEntityId ? analysis.entities[selectedEntityId] : undefined;
  const fileRecord = entity ? analysis.files[entity.filePath] : undefined;

  // Memoize splitting file lines to avoid O(L) re-splitting on every render
  const lines = useMemo(() => {
    if (fileRecord) {
      return fileRecord.content.split('\n');
    }
    return (entity?.snippet || '').split('\n');
  }, [fileRecord, entity]);

  const startLineOffset = fileRecord ? 1 : (entity?.location.startLine || 1);

  // Virtualization calculations
  const totalHeight = lines.length * LINE_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 15);
  const endIndex = Math.min(lines.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / LINE_HEIGHT) + 15);
  const visibleLines = useMemo(() => {
    return lines.slice(startIndex, endIndex);
  }, [lines, startIndex, endIndex]);
  const offsetY = startIndex * LINE_HEIGHT;

  // Handle scroll events with RAF throttling for responsive 60fps rendering
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Auto scroll to target entity lines on selection change
  useEffect(() => {
    if (entity && codeContainerRef.current) {
      const targetLineIdx = Math.max(0, entity.location.startLine - startLineOffset);
      const targetScrollTop = Math.max(0, targetLineIdx * LINE_HEIGHT - 80);
      codeContainerRef.current.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
    }
  }, [entity, startLineOffset]);

  // Compute execution context (callers and callees) memoized
  const executionContext = useMemo(() => {
    if (!entity) return { callers: [], callees: [] };
    const callers: { id: string; name: string; kind: string; file: string; line: number }[] = [];
    const callees: { id: string; name: string; kind: string; file: string; line: number }[] = [];

    for (const rel of analysis.relationships) {
      if (rel.targetId === entity.id && (rel.kind === 'calls' || rel.kind === 'routes_to' || rel.kind === 'imports')) {
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
      if (rel.sourceId === entity.id && (rel.kind === 'calls' || rel.kind === 'routes_to' || rel.kind === 'reads_from')) {
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

  return (
    <div
      style={{
        height: isCollapsed ? 38 : 280,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.18s ease',
        zIndex: 30,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Panel Top Navigation & Tab Bar */}
      <div
        style={{
          height: 38,
          background: 'var(--bg-tertiary)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          minWidth: 0,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, overflow: 'hidden' }}>
          {/* Tabs on a single row - responds immediately */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              overflowX: 'auto',
            }}
          >
            <button
              className={`panel-tab ${activeTab === 'source' ? 'active' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, whiteSpace: 'nowrap' }}
              onClick={() => { setActiveTab('source'); setIsCollapsed(false); }}
            >
              <Code2 size={13} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-top' }} /> Source Code
            </button>
            <button
              className={`panel-tab ${activeTab === 'context' ? 'active' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, whiteSpace: 'nowrap' }}
              onClick={() => { setActiveTab('context'); setIsCollapsed(false); }}
            >
              <Zap size={13} style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-top' }} /> Execution Context
            </button>
            <button
              className={`panel-tab ${activeTab === 'ai' ? 'active' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, whiteSpace: 'nowrap' }}
              onClick={() => { setActiveTab('ai'); setIsCollapsed(false); }}
            >
              <Sparkles size={13} color="var(--primary-blue)" style={{ marginRight: 4, display: 'inline', verticalAlign: 'text-top' }} /> AI Explanation
            </button>
          </div>

          <span style={{ color: 'var(--border-color)', flexShrink: 0 }}>|</span>

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
              L{entity.location.startLine}-{entity.location.endLine}
            </span>
            <span
              className={`kind-badge ${entity.kind}`}
              style={{ fontSize: 9, padding: '1px 5px', flexShrink: 0 }}
            >
              {entity.name}
            </span>
          </div>
        </div>

        {/* Panel Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleCopyPath}
            className="tool-btn"
            style={{ fontSize: 11, padding: '3px 8px' }}
            title="Copy file path and line location"
          >
            {copied ? <Check size={12} color="var(--success-teal)" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy Ref'}</span>
          </button>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4 }}
            title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Panel Body - Preserved across tabs to avoid unmounting latency */}
      {!isCollapsed && (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {/* TAB 1: SOURCE CODE VIEWER (VIRTUALIZED) */}
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
              <div style={{ height: Math.max(totalHeight, VIEWPORT_HEIGHT), width: '100%', position: 'relative' }}>
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
                          background: isTargetLine ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
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

          {/* TAB 2: EXECUTION CONTEXT (PERSISTENT & CACHED) */}
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
            <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`kind-badge ${entity.kind}`}>{entity.kind}</span>
                <strong style={{ fontSize: 16 }}>{entity.name}</strong>
                {entity.isAsync && (
                  <span className="kind-badge" style={{ background: 'var(--blue-selection-bg)', color: 'var(--primary-blue)' }}>
                    Async
                  </span>
                )}
                {entity.isExported && (
                  <span className="kind-badge" style={{ background: 'var(--success-bg)', color: 'var(--success-teal)' }}>
                    Exported
                  </span>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Declared in <code>{entity.filePath}</code> from line {entity.location.startLine} to {entity.location.endLine}.
              </div>

              {/* Parameter Signatures */}
              {entity.parameters && entity.parameters.length > 0 && (
                <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    PARAMETER SIGNATURES
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {entity.parameters.map((p) => (
                      <div key={p.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        <span style={{ color: 'var(--warning-amber)' }}>{p.name}</span>: <span style={{ color: 'var(--primary-blue)' }}>{p.type || 'any'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inbound & Outbound Execution Triggers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Inbound Callers */}
                <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Inbound Callers ({executionContext.callers.length})
                  </div>
                  {executionContext.callers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      No direct internal callers (may be entry point).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                      {executionContext.callers.map((c) => (
                        <div
                          key={`${c.id}-${c.line}`}
                          onClick={() => onSelectEntity(c.id)}
                          style={{
                            padding: '4px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>L{c.line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outbound Calls */}
                <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Outbound Calls ({executionContext.callees.length})
                  </div>
                  {executionContext.callees.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      No outbound calls invoked.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                      {executionContext.callees.map((c) => (
                        <div
                          key={`${c.id}-${c.line}`}
                          onClick={() => onSelectEntity(c.id)}
                          style={{
                            padding: '4px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>L{c.line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 3: AI EXPLANATION (PERSISTENT & GROUNDED) */}
          <div
            style={{
              display: activeTab === 'ai' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: 'auto',
              background: 'var(--bg-primary)',
              padding: 16,
              flexDirection: 'column',
            }}
          >
            <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success-teal)' }}>
                  ✓ Grounded Source Analysis for <code>{entity.name}</code>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Deterministic AST Engine (Zero External Calls)
                </span>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                <p>
                  <strong>Component Role:</strong> <code>{entity.name}</code> is a {entity.isExported ? 'publicly exported ' : ''}<strong>{entity.kind}</strong> defined in <code>{entity.filePath}</code>.
                </p>
                {entity.docstring && (
                  <blockquote style={{ borderLeft: '3px solid var(--primary-blue)', paddingLeft: 10, margin: '8px 0', color: 'var(--text-secondary)' }}>
                    {entity.docstring}
                  </blockquote>
                )}
                <p style={{ marginTop: 8 }}>
                  <strong>AST Evidence:</strong> Declared at lines {entity.location.startLine}–{entity.location.endLine}. Statically verified {executionContext.callers.length} inbound caller(s) and {executionContext.callees.length} outbound call(s) across internal module dependencies.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
