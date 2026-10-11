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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileArchive size={18} color="var(--primary-blue)" />
            <strong style={{ fontSize: 15 }}>Import Repository Archive</strong>
          </div>
          <button onClick={onClose}><X size={18} color="var(--text-muted)" /></button>
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
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Quick-load sample option */}
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderCode size={16} color="var(--emerald-primary)" />
              <div style={{ fontSize: 12 }}>
                <strong>Sample E-Commerce API</strong>
                <div style={{ color: 'var(--text-muted)' }}>Express + Prisma + Stripe + Auth</div>
              </div>
            </div>
            <button
              onClick={() => {
                onProjectLoaded('sample-ecommerce-api');
                onClose();
              }}
              className="tool-btn active"
              style={{ fontSize: 11 }}
            >
              Load Sample
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
