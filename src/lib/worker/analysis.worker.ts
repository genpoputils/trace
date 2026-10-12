import { ZipIngestionService } from '../ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer';
import { WorkerRequest, WorkerResponse } from './worker-types';

interface WorkerScope {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const ctx = self as unknown as WorkerScope;
const cancelledJobs = new Set<string>();

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || !req.id) return;

  if (req.type === 'CANCEL') {
    cancelledJobs.add(req.id);
    return;
  }

  const cancellationToken = {
    get isCancelled() {
      return cancelledJobs.has(req.id);
    },
  };

  try {
    if (req.type === 'ANALYZE_ZIP') {
      const zipService = new ZipIngestionService();

      const progressUpdate = (stage: string, message: string, current = 0, total = 100) => {
        if (cancellationToken.isCancelled) return;
        const msg: WorkerResponse = {
          type: 'PROGRESS',
          id: req.id,
          stage,
          progress: { current, total, message },
        };
        ctx.postMessage(msg);
      };

      progressUpdate('extracting', 'Decompressing archive contents in background worker...', 10, 100);

      const extractionStart = performance.now();
      const ingestion = await zipService.ingestZip(req.buffer, req.fileName, req.options);
      const extractionDuration = Math.round((performance.now() - extractionStart) * 100) / 100;

      if (cancellationToken.isCancelled) {
        cancelledJobs.delete(req.id);
        return;
      }

      const fileCount = Object.keys(ingestion.files).length;
      if (fileCount === 0) {
        throw new Error('No supported JavaScript or TypeScript source files found in the archive.');
      }

      progressUpdate('parsing', `Extracted ${fileCount} files. Parsing AST...`, 0, fileCount);

      const analyzer = new CodebaseAnalyzer();
      const analysis = await analyzer.analyzeProjectAsync(
        ingestion.projectName,
        ingestion.files,
        (stage, prog) => {
          if (cancellationToken.isCancelled) return;
          const msg: WorkerResponse = {
            type: 'PROGRESS',
            id: req.id,
            stage,
            progress: prog,
          };
          ctx.postMessage(msg);
        },
        { cancellationToken }
      );

      if (cancellationToken.isCancelled) {
        cancelledJobs.delete(req.id);
        return;
      }

      // Attach worker metrics
      if (analysis.analysisMetadata) {
        analysis.analysisMetadata.workerUsed = true;
        analysis.analysisMetadata.stageDurations.extraction = extractionDuration;
      }

      const resultMsg: WorkerResponse = {
        type: 'RESULT',
        id: req.id,
        analysis,
        skippedFiles: ingestion.skippedFiles,
        warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
      };
      ctx.postMessage(resultMsg);
      cancelledJobs.delete(req.id);
    } else if (req.type === 'ANALYZE_FILES') {
      const analyzer = new CodebaseAnalyzer();
      const analysis = await analyzer.analyzeProjectAsync(
        req.projectName,
        req.files,
        (stage, prog) => {
          if (cancellationToken.isCancelled) return;
          const msg: WorkerResponse = {
            type: 'PROGRESS',
            id: req.id,
            stage,
            progress: prog,
          };
          ctx.postMessage(msg);
        },
        { cancellationToken }
      );

      if (cancellationToken.isCancelled) {
        cancelledJobs.delete(req.id);
        return;
      }

      if (analysis.analysisMetadata) {
        analysis.analysisMetadata.workerUsed = true;
      }

      const resultMsg: WorkerResponse = {
        type: 'RESULT',
        id: req.id,
        analysis,
        skippedFiles: [],
        warnings: analysis.warnings.map((w) => w.message),
      };
      ctx.postMessage(resultMsg);
      cancelledJobs.delete(req.id);
    }
  } catch (err) {
    if (cancellationToken.isCancelled) {
      cancelledJobs.delete(req.id);
      return;
    }
    const errorMsg: WorkerResponse = {
      type: 'ERROR',
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  }
};


export {};
