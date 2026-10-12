'use client';

import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { useModalAccessibility } from '@/lib/hooks/use-modal-accessibility';

interface ClearLocalDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: () => Promise<void>;
  savedProjectsCount: number;
}

export const ClearLocalDataModal: React.FC<ClearLocalDataModalProps> = ({
  isOpen,
  onClose,
  onConfirmClear,
  savedProjectsCount,
}) => {
  const [clearing, setClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { containerRef, handleOverlayMouseDown, handleOverlayClick } = useModalAccessibility({
    isOpen,
    onClose,
    isBusy: clearing,
  });

  if (!isOpen) return null;

  const handleClear = async () => {
    setClearing(true);
    setErrorMessage(null);
    try {
      await onConfirmClear();
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to clear local repository data. Please check browser storage permissions and retry.'
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        className="modal-content clear-local-data-modal"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-data-dialog-title"
        aria-describedby="clear-data-dialog-desc"
        style={{ maxWidth: 480 }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--error-bg)',
                color: 'var(--error-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden="true"
            >
              <AlertTriangle size={16} />
            </div>
            <h2 id="clear-data-dialog-title" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              Clear local data?
            </h2>
          </div>
          <button
            className="tool-btn"
            onClick={onClose}
            disabled={clearing}
            aria-label="Close dialog"
            style={{ padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 14 }}>
          <p
            id="clear-data-dialog-desc"
            style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}
          >
            This will remove the repository analyses saved by Trace in this browser. Your remote GitHub
            repositories will not be affected. This action cannot be undone.
          </p>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              fontSize: 12,
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 600 }}>Affected local items:</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              • {savedProjectsCount}{' '}
              {savedProjectsCount === 1 ? 'custom repository analysis' : 'custom repository analyses'}{' '}
              in IndexedDB & memory will be removed.
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              • In-memory execution traces and blast radius caches will be wiped.
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              • The bundled sample repository will be restored to its initial state.
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--error-bg)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                color: 'var(--error-red)',
                fontSize: 12,
              }}
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="tool-btn"
              onClick={onClose}
              disabled={clearing}
              style={{ padding: '6px 14px', fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleClear}
              disabled={clearing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#FFFFFF',
                background: 'var(--error-red)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: clearing ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={13} className={clearing ? 'animate-spin' : ''} />
              {clearing ? 'Clearing...' : 'Clear local data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
