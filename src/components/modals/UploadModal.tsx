'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileArchive,
  RefreshCw,
  AlertTriangle,
  FolderCode,
} from 'lucide-react';
import { browserAnalysisService } from '@/lib/services/browser-analysis-service';
import { useModalAccessibility } from '@/lib/hooks/use-modal-accessibility';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectLoaded: (projectId: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onProjectLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { containerRef, handleOverlayMouseDown, handleOverlayClick } = useModalAccessibility({
    isOpen,
    onClose,
    isBusy: loading,
  });

  if (!isOpen) return null;

  const handleUploadFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please select a valid .zip project archive.');
      return;
    }

    setLoading(true);
    setError(null);
    setProgressStatus('Extracting archive contents in browser...');

    try {
      const result = await browserAnalysisService.importZipArchive(
        file,
        file.name,
        {},
        (_stage, prog) => {
          setProgressStatus(prog.message);
        }
      );

      setProgressStatus('Analysis complete! Loading interactive graph...');
      onProjectLoaded(result.projectId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown upload error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div
        ref={containerRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileArchive size={18} color="var(--primary-blue)" />
            <strong id="upload-modal-title" style={{ fontSize: 15 }}>
              Import Repository Archive
            </strong>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Close upload modal"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.4 : 1,
            }}
          >
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Upload a <code>.zip</code> archive of a TypeScript or JavaScript project. The analyzer will extract AST symbols, cross-module imports, API routes, database operations, and call graphs.
          </p>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".zip"
            style={{ display: 'none' }}
            aria-label="Select ZIP file"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUploadFile(e.target.files[0]);
              }
            }}
          />

          {/* Drag & Drop Zone */}
          <div
            className={`dropzone ${isDragging ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            tabIndex={0}
            role="button"
            aria-label="Upload zip file dropzone"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <RefreshCw size={36} className="animate-spin" color="var(--primary-blue)" />
                <span style={{ fontSize: 13, color: 'var(--primary-blue)', fontWeight: 600 }}>
                  {progressStatus}
                </span>
              </div>
            ) : (
              <>
                <UploadCloud size={40} color="var(--primary-blue)" />
                <div>
                  <strong style={{ fontSize: 14 }}>Click to choose ZIP or drag and drop</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    node_modules, build outputs, and binaries are safely excluded automatically
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: 12,
                background: 'var(--error-bg)',
                border: '1px solid var(--error-red)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'var(--error-red)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              role="alert"
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Privacy Note */}
          <div
            style={{
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <FolderCode size={16} color="var(--primary-blue)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>100% Client-Side Privacy:</strong> Your archive is decompressed and parsed entirely inside your browser using in-memory Web Workers. No source code or secrets are ever uploaded to any server.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            onClick={onClose}
            disabled={loading}
            className="tool-btn"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="btn-upload"
          >
            {loading ? 'Analyzing...' : 'Browse Computer'}
          </button>
        </div>
      </div>
    </div>
  );
};
