'use client';

import React, { useState } from 'react';
import { ProjectAnalysis, TraceEntity } from '@/lib/types/trace';
import {
  X,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Send,
  RefreshCw,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

interface InspectorPanelProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  onClose: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'source' | 'deps' | 'ai'>('source');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGroundedFiles, setAiGroundedFiles] = useState<string[]>([]);

  const entity: TraceEntity | undefined = selectedEntityId
    ? analysis.entities[selectedEntityId]
    : undefined;

  // Inbound & Outbound relationships
  const inbound = React.useMemo(() => {
    if (!selectedEntityId) return [];
    return analysis.relationships.filter(
      (r) => r.targetId === selectedEntityId && (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'imports')
    );
  }, [analysis, selectedEntityId]);

  const outbound = React.useMemo(() => {
    if (!selectedEntityId) return [];
    return analysis.relationships.filter(
      (r) => r.sourceId === selectedEntityId && (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'reads_from')
    );
  }, [analysis, selectedEntityId]);

  // File record for full source code viewing
  const fileRecord = entity ? analysis.files[entity.filePath] : undefined;

  // Run AI investigation
  const handleAskAI = async (questionText: string) => {
    if (!questionText.trim()) return;

    setAiLoading(true);
    setAiAnswer(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: analysis.projectId,
          question: questionText,
          targetEntityId: selectedEntityId,
        }),
      });

      const data = await res.json();
      if (data.result) {
        setAiAnswer(data.result.answer);
        setAiGroundedFiles(data.result.groundedFiles || []);
      } else {
        setAiAnswer(data.error || 'Failed to complete investigation');
      }
    } catch (err) {
      setAiAnswer('Connection error communicating with investigation engine.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!entity) {
    return (
      <div className="right-panel">
        <div className="panel-header">
          <span className="panel-title">Inspector</span>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Click any function, route, or class in the graph or explorer to inspect its source code, dependencies, and execution path.
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel">
      {/* Inspector Header */}
      <div className="panel-header">
        <div className="panel-title" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span className={`kind-badge ${entity.kind}`}>{entity.kind}</span>
          <strong title={entity.name}>{entity.name}</strong>
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'source' ? 'active' : ''}`}
          onClick={() => setActiveTab('source')}
        >
          Source Code
        </button>
        <button
          className={`panel-tab ${activeTab === 'deps' ? 'active' : ''}`}
          onClick={() => setActiveTab('deps')}
        >
          Dependencies ({inbound.length + outbound.length})
        </button>
        <button
          className={`panel-tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Sparkles size={13} color="var(--cyan-primary)" /> AI Investigator
        </button>
      </div>

      {/* Tab Contents */}
      <div className="panel-body">
        {/* TAB 1: SOURCE CODE */}
        {activeTab === 'source' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                <code>{entity.filePath}</code> : Lines {entity.location.startLine}-{entity.location.endLine}
              </span>
              {entity.isExported && <span style={{ color: 'var(--cyan-primary)' }}>Exported</span>}
            </div>

            {entity.docstring && (
              <div style={{ padding: 10, background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--cyan-primary)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>JSDoc:</strong> {entity.docstring}
              </div>
            )}

            {entity.parameters && entity.parameters.length > 0 && (
              <div style={{ background: 'var(--bg-tertiary)', padding: 10, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Parameters: </span>
                {entity.parameters.map((p, idx) => (
                  <span key={p.name} style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber-primary)' }}>
                    {p.name}{p.type ? `: ${p.type}` : ''}{idx < entity.parameters!.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}

            {/* Source Excerpt */}
            <div className="code-viewer-container">
              <div className="code-viewer-header">
                <span>AST Source Snippet</span>
                <span style={{ fontSize: 11 }}>{entity.location.endLine - entity.location.startLine + 1} lines</span>
              </div>
              <pre className="code-pre">
                <code>{entity.snippet || '// No source snippet available'}</code>
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: DEPENDENCIES */}
        {activeTab === 'deps' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Inbound Callers */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Inbound Callers & References ({inbound.length})
              </div>
              {inbound.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                  No inbound callers discovered in static analysis.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inbound.map((rel) => {
                    const caller = analysis.entities[rel.sourceId];
                    if (!caller) return null;
                    return (
                      <div
                        key={rel.id}
                        onClick={() => onSelectEntity(caller.id)}
                        style={{
                          padding: 8,
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <span className={`kind-badge ${caller.kind}`}>{caller.kind}</span>
                          <strong>{caller.name}</strong>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Line {rel.location?.startLine || caller.location.startLine}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outbound Callees */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Outbound Calls & Dependencies ({outbound.length})
              </div>
              {outbound.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                  No outbound calls made by this entity.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {outbound.map((rel) => {
                    const callee = analysis.entities[rel.targetId];
                    return (
                      <div
                        key={rel.id}
                        onClick={() => callee && onSelectEntity(callee.id)}
                        style={{
                          padding: 8,
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: callee ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <span className="kind-badge function">{rel.kind}</span>
                          <strong>{callee ? callee.name : rel.targetId.split(':').pop()}</strong>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Line {rel.location?.startLine || 1}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AI INVESTIGATOR */}
        {activeTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Quick Action Prompts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Ask Grounded Question:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  onClick={() => handleAskAI(`Explain how this function works`)}
                  className="tool-btn"
                  style={{ fontSize: 11 }}
                >
                  📖 Explain logic
                </button>
                <button
                  onClick={() => handleAskAI(`What breaks if I change this function?`)}
                  className="tool-btn"
                  style={{ fontSize: 11 }}
                >
                  💥 Impact analysis
                </button>
                <button
                  onClick={() => handleAskAI(`Trace the execution path starting here`)}
                  className="tool-btn"
                  style={{ fontSize: 11 }}
                >
                  ⚡ Trace execution
                </button>
                <button
                  onClick={() => handleAskAI(`Trace data flow and parameters`)}
                  className="tool-btn"
                  style={{ fontSize: 11 }}
                >
                  🌊 Trace data flow
                </button>
              </div>
            </div>

            {/* Custom Question Input */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Ask about this code..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskAI(aiQuestion)}
                style={{
                  flex: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                }}
              />
              <button
                onClick={() => handleAskAI(aiQuestion)}
                disabled={aiLoading}
                className="btn-upload"
                style={{ padding: '7px 12px' }}
              >
                {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>

            {/* AI Answer Box */}
            {aiAnswer && (
              <div
                style={{
                  background: '#0d1117',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: '#e6edf3',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #21262d' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--emerald-primary)', fontWeight: 600, fontSize: 11 }}>
                    <CheckCircle size={13} /> Grounded in Source Code
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Deterministic Offline Engine</span>
                </div>

                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {aiAnswer}
                </div>

                {aiGroundedFiles.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #21262d', fontSize: 11, color: 'var(--text-muted)' }}>
                    <strong>Citations:</strong> {aiGroundedFiles.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
