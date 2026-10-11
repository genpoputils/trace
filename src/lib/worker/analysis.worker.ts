import { ZipIngestionService } from '../ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer';
import { WorkerRequest, WorkerResponse } from './worker-types';

interface WorkerScope {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || !req.id) return;

  try {
    if (req.type === 'ANALYZE_ZIP') {
      const zipService = new ZipIngestionService();

      const progressUpdate = (stage: string, message: string, current = 0, total = 100) => {
        const msg: WorkerResponse = {
          type: 'PROGRESS',
          id: req.id,
          stage,
          progress: { current, total, message },
        };
        ctx.postMessage(msg);
      };

      progressUpdate('extracting', 'Decompressing archive contents in background worker...', 10, 100);

      const ingestion = await zipService.ingestZip(req.buffer, req.fileName, req.options);

      const fileCount = Object.keys(ingestion.files).length;
      if (fileCount === 0) {
        throw new Error('No supported JavaScript or TypeScript source files found in the archive.');
      }

      progressUpdate('parsing', `Extracted ${fileCount} files. Parsing AST...`, 0, fileCount);

      const analyzer = new CodebaseAnalyzer();
      const analysis = analyzer.analyzeProject(
        ingestion.projectName,
        ingestion.files,
        (stage, prog) => {
          const msg: WorkerResponse = {
            type: 'PROGRESS',
            id: req.id,
            stage,
            progress: prog,
          };
          ctx.postMessage(msg);
        }
      );

      const resultMsg: WorkerResponse = {
        type: 'RESULT',
        id: req.id,
        analysis,
        skippedFiles: ingestion.skippedFiles,
        warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
      };
      ctx.postMessage(resultMsg);
    } else if (req.type === 'ANALYZE_FILES') {
      const analyzer = new CodebaseAnalyzer();
      const analysis = analyzer.analyzeProject(
        req.projectName,
        req.files,
        (stage, prog) => {
          const msg: WorkerResponse = {
            type: 'PROGRESS',
            id: req.id,
            stage,
            progress: prog,
          };
          ctx.postMessage(msg);
        }
      );

      const resultMsg: WorkerResponse = {
        type: 'RESULT',
        id: req.id,
        analysis,
        skippedFiles: [],
        warnings: analysis.warnings.map((w) => w.message),
      };
      ctx.postMessage(resultMsg);
    }
  } catch (err) {
    const errorMsg: WorkerResponse = {
      type: 'ERROR',
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  }
};

export {};
