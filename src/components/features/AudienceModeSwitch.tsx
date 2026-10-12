'use client';

import React from 'react';
import { AudienceMode } from '@/lib/features/feature-map-types';
import { Users, Code2 } from 'lucide-react';

interface AudienceModeSwitchProps {
  mode: AudienceMode;
  onChange: (mode: AudienceMode) => void;
}

export const AudienceModeSwitch: React.FC<AudienceModeSwitchProps> = ({ mode, onChange }) => {
  return (
    <div
      className="audience-mode-switch"
      role="group"
      aria-label="Target audience perspective"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: 3,
        gap: 3,
      }}
    >
      <button
        type="button"
        className={`audience-mode-btn ${mode === 'stakeholder' ? 'active' : ''}`}
        onClick={() => onChange('stakeholder')}
        aria-pressed={mode === 'stakeholder'}
        title="Stakeholder mode — High-level capabilities, business context, plain-language explanations"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: mode === 'stakeholder' ? 600 : 500,
          color: mode === 'stakeholder' ? 'var(--text-primary)' : 'var(--text-muted)',
          background: mode === 'stakeholder' ? 'var(--panel-bg)' : 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          boxShadow: mode === 'stakeholder' ? 'var(--shadow-sm)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <Users size={14} color={mode === 'stakeholder' ? 'var(--primary-blue)' : 'currentColor'} />
        <span>Stakeholder</span>
      </button>

      <button
        type="button"
        className={`audience-mode-btn ${mode === 'developer' ? 'active' : ''}`}
        onClick={() => onChange('developer')}
        aria-pressed={mode === 'developer'}
        title="Developer mode — Technical architecture, routes, symbols, file paths, call hierarchies"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: mode === 'developer' ? 600 : 500,
          color: mode === 'developer' ? 'var(--text-primary)' : 'var(--text-muted)',
          background: mode === 'developer' ? 'var(--panel-bg)' : 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          boxShadow: mode === 'developer' ? 'var(--shadow-sm)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <Code2 size={14} color={mode === 'developer' ? 'var(--primary-blue)' : 'currentColor'} />
        <span>Developer</span>
      </button>
    </div>
  );
};
