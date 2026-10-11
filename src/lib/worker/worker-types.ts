import { ProjectAnalysis, FileRecord } from '../types/trace';
import { IngestionOptions } from '../ingestion/zip-ingestion';

export type WorkerRequest =
  | {
      type: 'ANALYZE_ZIP';
      id: string;
      buffer: ArrayBuffer;
      fileName: string;
      options?: IngestionOptions;
    }
  | {
      type: 'ANALYZE_FILES';
      id: string;
      projectName: string;
      files: Record<string, FileRecord>;
    };

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  id: string;
  stage: string;
  progress: {
    current: number;
    total: number;
    message: string;
  };
}

export interface WorkerResultMessage {
  type: 'RESULT';
  id: string;
  analysis: ProjectAnalysis;
  skippedFiles: { path: string; reason: string }[];
  warnings: string[];
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  id: string;
  error: string;
}

export type WorkerResponse =
  | WorkerProgressMessage
  | WorkerResultMessage
  | WorkerErrorMessage;
