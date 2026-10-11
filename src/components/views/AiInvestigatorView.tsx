'use client';

import React, { useState } from 'react';
import { ProjectAnalysis, TraceEntity } from '@/lib/types/trace';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';
import { InvestigationResponse } from '@/lib/ai/investigator-service';
import {
  Sparkles,
  Send,
  RefreshCw,
  CheckCircle,
  FileText,
  ShieldCheck,
  Compass,
  Zap,
  ShieldAlert,
} from 'lucide-react';

interface AiInvestigatorViewProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  onNavigateTab: (tab: 'graph' | 'paths' | 'dataflow' | 'impact') => void;
}

interface QueryRecord {
  id: string;
  question: string;
  entityName?: string;
  response: InvestigationResponse;
  timestamp: string;
}

export const AiInvestigatorView: React.FC<AiInvestigatorViewProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
  onNavigateTab,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<InvestigationResponse | null>(null);
  const [history, setHistory] = useState<QueryRecord[]>([]);

  const selectedEntity: TraceEntity | undefined = selectedEntityId
    ? analysis.entities[selectedEntityId]
    : undefined;

  const handleAskQuestion = async (promptText: string) => {
    if (!promptText.trim()) return;

    setLoading(true);
    setCurrentResponse(null);

    try {
      const resp = await browserAnalysisService.investigateQuestion(
        analysis.projectId,
        promptText.trim(),
        selectedEntityId || undefined
      );

      if (resp) {
        setCurrentResponse(resp);
        setHistory((prev) => [
          {
            id: `q_${Date.now()}`,
            question: promptText.trim(),
            entityName: selectedEntity?.name,
            response: resp,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);
      }
    } catch (err) {
      console.error('Failed to run local investigation:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Context Bar */}
      <div
        style={{
          padding: '12px 18px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--blue-selection-bg)',
              color: 'var(--primary-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              AI Codebase Investigator
            </strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
              Evidence-grounded local analysis
            </span>
          </div>
        </div>

        {/* Selected Context Entity Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedEntity ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                fontSize: 12,
              }}
            >
              <span className={`kind-badge ${selectedEntity.kind}`}>{selectedEntity.kind}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedEntity.name}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({selectedEntity.filePath}:{selectedEntity.location.startLine})
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Repository-wide Context ({analysis.stats.totalSymbols} symbols indexed)
            </span>
          )}
        </div>
      </div>

      {/* Main Investigation Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Query Input Card */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: 20,
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder={
                  selectedEntity
                    ? `Ask anything about ${selectedEntity.name}... (e.g. "What calls this function?", "Impact of modifying this?")`
                    : 'Ask about codebase architecture, routes, database access, or dependency flows...'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAskQuestion(question);
                }}
                style={{
                  flex: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  outline: 'none',
                }}
                aria-label="Codebase inquiry input"
              />
              <button
                onClick={() => handleAskQuestion(question)}
                disabled={loading || !question.trim()}
                className="btn-upload"
                style={{ padding: '0 18px', display: 'flex', alignItems: 'center', gap: 8 }}
                aria-label="Submit question"
              >
                {loading ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                <span>Investigate</span>
              </button>
            </div>

            {/* Quick Prompt Suggestions */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                One-Click Grounded Analysis Prompts:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  className="tool-btn"
                  onClick={() => handleAskQuestion('Explain how this function works and its core responsibilities')}
                  style={{ fontSize: 12 }}
                >
                  📖 Explain logic & responsibilities
                </button>
                <button
                  className="tool-btn"
                  onClick={() => handleAskQuestion('What could break if I change this function?')}
                  style={{ fontSize: 12 }}
                >
                  💥 Calculate change blast radius
                </button>
                <button
                  className="tool-btn"
                  onClick={() => handleAskQuestion('Trace execution path and inbound callers')}
                  style={{ fontSize: 12 }}
                >
                  ⚡ Inferred execution path
                </button>
                <button
                  className="tool-btn"
                  onClick={() => handleAskQuestion('Trace parameter and data flow origin')}
                  style={{ fontSize: 12 }}
                >
                  🌊 Trace data flow & sinks
                </button>
              </div>
            </div>

            {/* Offline Engine Guarantee */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--text-muted)',
                paddingTop: 4,
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <ShieldCheck size={14} color="var(--success-teal)" />
              <span>
                Deterministic AST static analysis engine running 100% offline in browser memory. No external LLM token leakage or third-party cloud data transmission.
              </span>
            </div>
          </div>

          {/* Current Answer Display */}
          {currentResponse && (
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: 22,
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* Answer Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={16} color="var(--success-teal)" />
                  <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                    Evidence-Backed Investigation Result
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="kind-badge"
                    style={{
                      background: 'var(--success-bg)',
                      color: 'var(--success-teal)',
                      fontSize: 11,
                    }}
                  >
                    High Confidence
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Local AST Engine
                  </span>
                </div>
              </div>

              {/* Formatted Answer Body */}
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {currentResponse.answer}
              </div>

              {/* Evidence Citations */}
              {currentResponse.groundedFiles && currentResponse.groundedFiles.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={13} color="var(--primary-blue)" /> Verified Citations ({currentResponse.groundedFiles.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {currentResponse.groundedFiles.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const matching = Object.values(analysis.entities).find((e) => e.filePath === f);
                          if (matching) {
                            onSelectEntity(matching.id);
                            onNavigateTab('graph');
                          }
                        }}
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          background: 'var(--bg-secondary)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--border-color)',
                          color: 'var(--primary-blue)',
                          cursor: 'pointer',
                        }}
                        title={`Inspect ${f} in graph`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Jump Shortcuts */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button
                  onClick={() => onNavigateTab('graph')}
                  className="tool-btn"
                  style={{ fontSize: 12 }}
                >
                  <Compass size={13} /> View on Code Graph
                </button>
                <button
                  onClick={() => onNavigateTab('paths')}
                  className="tool-btn"
                  style={{ fontSize: 12 }}
                >
                  <Zap size={13} /> Trace Execution Path
                </button>
                <button
                  onClick={() => onNavigateTab('impact')}
                  className="tool-btn"
                  style={{ fontSize: 12 }}
                >
                  <ShieldAlert size={13} /> View Blast Radius
                </button>
              </div>
            </div>
          )}

          {/* History of Session Queries */}
          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Session Inquiries ({history.length})
              </div>
              {history.map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13, color: 'var(--primary-blue)' }}>
                      Q: {rec.question}
                    </strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rec.timestamp}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto' }}>
                    {rec.response.answer.slice(0, 240)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
