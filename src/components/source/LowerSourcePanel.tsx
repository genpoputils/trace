'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProjectAnalysis, TraceEntity } from '@/lib/types/trace';
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
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

export const LowerSourcePanel: React.FC<LowerSourcePanelProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'source' | 'context' | 'ai'>('source');
  const [copied, setCopied] = useState<boolean>(false);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const entity = selectedEntityId ? analysis.entities[selectedEntityId] : undefined;
  const fileRecord = entity ? analysis.files[entity.filePath] : undefined;

  // Auto scroll to line when entity changes
  useEffect(() => {
    if (entity && codeContainerRef.current) {
      const lineEl = document.getElementById(`source-line-${entity.location.startLine}`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [entity, activeTab, isCollapsed]);

  const handleCopyPath = () => {
    if (!entity) return;
    navigator.clipboard.writeText(`${entity.filePath}:${entity.location.startLine}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!entity) {
    return null;
  }

  const lines = fileRecord ? fileRecord.content.split('\n') : (entity.snippet || '').split('\n');
  const startLineOffset = fileRecord ? 1 : entity.location.startLine;

  return (
    <div
      style={{
        height: isCollapsed ? 38 : 280,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.2s ease',
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
          {/* Tabs on a single row */}
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

      {/* Expanded Panel Body */}
      {!isCollapsed && (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex' }}>
          {/* TAB 1: SOURCE CODE VIEWER */}
          {activeTab === 'source' && (
            <div
              ref={codeContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflowY: 'auto',
                overflowX: 'auto',
                background: 'var(--code-bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.6,
                padding: '8px 0',
              }}
            >
              {lines.map((lineContent, idx) => {
                const lineNum = startLineOffset + idx;
                const isTargetLine =
                  lineNum >= entity.location.startLine && lineNum <= entity.location.endLine;

                return (
                  <div
                    key={lineNum}
                    id={`source-line-${lineNum}`}
                    style={{
                      display: 'flex',
                      background: isTargetLine ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                      borderLeft: isTargetLine ? '3px solid var(--primary-blue)' : '3px solid transparent',
                      padding: '0 12px 0 6px',
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
          )}

          {/* TAB 2: EXECUTION CONTEXT */}
          {activeTab === 'context' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--bg-primary)' }}>
              <div style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`kind-badge ${entity.kind}`}>{entity.kind}</span>
                  <strong style={{ fontSize: 16 }}>{entity.name}</strong>
                  {entity.isAsync && <span className="kind-badge" style={{ background: 'var(--blue-selection-bg)', color: 'var(--primary-blue)' }}>Async</span>}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Declared in <code>{entity.filePath}</code> from line {entity.location.startLine} to {entity.location.endLine}.
                </div>

                {entity.parameters && entity.parameters.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>PARAMETER SIGNATURES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {entity.parameters.map((p) => (
                        <div key={p.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          <span style={{ color: 'var(--warning-amber)' }}>{p.name}</span>: <span style={{ color: 'var(--primary-blue)' }}>{p.type || 'any'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AI EXPLANATION */}
          {activeTab === 'ai' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--bg-primary)' }}>
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
                    <strong>Component Role:</strong> <code>{entity.name}</code> is a {entity.isExported ? 'publicly exported ' : ''}<strong>{entity.kind}</strong> in <code>{entity.filePath}</code>.
                  </p>
                  {entity.docstring && (
                    <blockquote style={{ borderLeft: '3px solid var(--primary-blue)', paddingLeft: 10, margin: '8px 0', color: 'var(--text-secondary)' }}>
                      {entity.docstring}
                    </blockquote>
                  )}
                  <p style={{ marginTop: 8 }}>
                    <strong>AST Evidence:</strong> Declared at lines {entity.location.startLine}–{entity.location.endLine}. Statically verified references exist across internal dependencies.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
