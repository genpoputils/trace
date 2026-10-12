import {
  ProjectAnalysis,
  FileRecord,
  ExecutionPath,
  DataFlowTrace,
  ImpactReport,
  SearchResult,
  SearchQuery,
  AnalysisLifecycleState,
  AnalysisStageProgress,
  AnalysisErrorDetails,
  AnalysisPerformanceMetrics,
} from '../types/trace';
import { IngestionOptions, ZipIngestionService } from '../ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer';
import { localProjectStore, ProjectSummary } from '../storage/local-project-store';
import { ExecutionPathEngine, TraceOptions } from '../tracing/execution-path';
import { DataFlowEngine } from '../dataflow/dataflow';
import { ImpactAnalysisService } from '../impact/impact-analysis';
import { SearchService } from '../search/search-service';
import { AIInvestigatorService, InvestigationResponse } from '../ai/investigator-service';
import { browserGitHubClient } from '../github/browser-github-client';
import { WorkerRequest, WorkerResponse } from '../worker/worker-types';

export type ProgressCallback = (
  stage: string,
  progress: { current: number; total: number; message: string }
) => void;

export interface AnalysisWorkerLike {
  postMessage: (message: WorkerRequest, transfer?: Transferable[]) => void;
  terminate?: () => void;
  onmessage?: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
}

export interface AnalysisSessionState {
  status: AnalysisLifecycleState;
  sessionId: string | null;
  projectName: string;
  currentStage: string;
  progress: {
    current: number;
    total: number;
    message: string;
  };
  stages: AnalysisStageProgress[];
  isPartial: boolean;
  partialReason?: string;
  error: AnalysisErrorDetails | null;
  startTime: number;
  elapsedMs: number;
  totalDurationMs?: number;
  performanceMetrics?: AnalysisPerformanceMetrics;
  projectId?: string;
  canCancel: boolean;
  canRetry: boolean;
}

export class BrowserAnalysisService {
  private worker: Worker | AnalysisWorkerLike | null = null;
  private workerAvailable: boolean = false;
  private activeJobs: Map<
    string,
    {
      resolve: (res: {
        analysis: ProjectAnalysis;
        skippedFiles: { path: string; reason: string }[];
        warnings: string[];
      }) => void;
      reject: (err: Error) => void;
      onProgress?: ProgressCallback;
    }
  > = new Map();

  // Session & Stale Analysis Protection
  private activeSessionId: string | null = null;
  private activeAbortController: AbortController | null = null;
  private currentJobId: string | null = null;
  private lastAnalysisParams:
    | { type: 'zip'; data: File | ArrayBuffer | Uint8Array; fileName: string; options: IngestionOptions }
    | { type: 'github'; owner: string; repo: string; branch: string; token?: string }
    | null = null;

  private sessionState: AnalysisSessionState = {
    status: 'idle',
    sessionId: null,
    projectName: '',
    currentStage: '',
    progress: { current: 0, total: 0, message: 'Ready to analyse a codebase' },
    stages: [],
    isPartial: false,
    error: null,
    startTime: 0,
    elapsedMs: 0,
    canCancel: false,
    canRetry: false,
  };

  private listeners: Set<(state: AnalysisSessionState) => void> = new Set();

  // Fast in-memory caches to preserve < 0.1ms tab switching performance
  private traceCache: Map<string, ExecutionPath> = new Map();
  private impactCache: Map<string, ImpactReport> = new Map();
  private dataflowCache: Map<string, DataFlowTrace> = new Map();

  constructor() {
    this.initWorker();
  }

  public subscribe(listener: (state: AnalysisSessionState) => void): () => void {
    this.listeners.add(listener);
    try {
      listener(this.sessionState);
    } catch (e) {
      console.error('Error invoking analysis session listener:', e);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSessionState(): AnalysisSessionState {
    return this.sessionState;
  }

  private notify(partial: Partial<AnalysisSessionState>) {
    this.sessionState = {
      ...this.sessionState,
      ...partial,
      elapsedMs:
        this.sessionState.startTime > 0 ? Math.round(performance.now() - this.sessionState.startTime) : 0,
    };
    for (const listener of this.listeners) {
      try {
        listener(this.sessionState);
      } catch (err) {
        console.error('Trace: session listener threw error:', err);
      }
    }
  }

  private failAllPendingJobs(error: Error) {
    if (this.activeJobs.size === 0) return;
    const pending = Array.from(this.activeJobs.values());
    this.activeJobs.clear();
    for (const job of pending) {
      try {
        job.reject(error);
      } catch {
        // Prevent unhandled throw during iteration
      }
    }
  }

  public terminateWorker(reason: string = 'Web Worker terminated.'): void {
    if (this.worker) {
      try {
        this.worker.terminate?.();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.workerAvailable = false;
    this.failAllPendingJobs(new Error(reason));
  }

  public getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  public isWorkerAvailable(): boolean {
    return this.workerAvailable;
  }

  public attachWorker(workerInstance: AnalysisWorkerLike | null): void {
    if (this.worker) {
      try {
        this.worker.terminate?.();
      } catch {}
    }
    this.worker = workerInstance;
    this.workerAvailable = !!workerInstance;
    if (workerInstance) {
      this.setupWorkerHandlers(workerInstance);
    }
  }

  private setupWorkerHandlers(worker: AnalysisWorkerLike) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg || !msg.id) return;

      const job = this.activeJobs.get(msg.id);
      if (!job) return;

      if (msg.type === 'PROGRESS') {
        job.onProgress?.(msg.stage, msg.progress);
      } else if (msg.type === 'RESULT') {
        this.activeJobs.delete(msg.id);
        job.resolve({
          analysis: msg.analysis,
          skippedFiles: msg.skippedFiles,
          warnings: msg.warnings,
        });
      } else if (msg.type === 'ERROR') {
        this.activeJobs.delete(msg.id);
        job.reject(new Error(msg.error));
      }
    };

    worker.onerror = (err: unknown) => {
      let msg = 'Web Worker error occurred during analysis.';
      if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
        msg = (err as { message: string }).message;
      } else if (typeof err === 'string') {
        msg = err;
      }
      console.warn('Trace: Web Worker error, settling all pending analysis jobs:', msg);
      this.terminateWorker(`Web Worker error: ${msg}`);
    };

    worker.onmessageerror = (err: unknown) => {
      console.warn('Trace: Web Worker message deserialization error:', err);
      this.terminateWorker('Web Worker message deserialization error occurred.');
    };
  }

  private initWorker() {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker = worker;
        this.workerAvailable = true;
        this.setupWorkerHandlers(worker as unknown as AnalysisWorkerLike);
      } catch (err) {
        console.warn('Trace: Web Worker initialization not supported, using main thread fallback:', err);
        this.worker = null;
        this.workerAvailable = false;
      }
    }
  }

  /**
   * User or system cancellation of active analysis session
   */
  public cancelActiveAnalysis(reason: string = 'Analysis cancelled by user.'): void {
    if (!this.activeSessionId && this.sessionState.status !== 'running') {
      return;
    }

    this.activeSessionId = null;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
      this.activeAbortController = null;
    }

    if (this.currentJobId && this.worker) {
      try {
        this.worker.postMessage({ type: 'CANCEL', id: this.currentJobId });
      } catch {}
    }

    this.failAllPendingJobs(new Error(reason));

    const updatedStages = this.sessionState.stages.map((s) =>
      s.status === 'running' ? { ...s, status: 'failed' as const, message: 'Cancelled' } : s
    );

    this.notify({
      status: 'cancelled',
      currentStage: 'cancelled',
      canCancel: false,
      canRetry: !!this.lastAnalysisParams,
      progress: {
        current: this.sessionState.progress.current,
        total: this.sessionState.progress.total,
        message: reason,
      },
      stages: updatedStages,
    });
  }

  public canRetry(): boolean {
    return !!this.lastAnalysisParams && this.sessionState.status !== 'running';
  }

  public async retryLastAnalysis(): Promise<{ projectId: string; analysis: ProjectAnalysis } | null> {
    if (!this.lastAnalysisParams) return null;
    if (this.lastAnalysisParams.type === 'github') {
      const { owner, repo, branch, token } = this.lastAnalysisParams;
      return this.importGitHubRepo(owner, repo, branch, token);
    } else if (this.lastAnalysisParams.type === 'zip') {
      const { data, fileName, options } = this.lastAnalysisParams;
      return this.importZipArchive(data, fileName, options);
    }
    return null;
  }

  /**
   * Run decompression and AST parsing via Web Worker or fallback to main thread
   */
  public async importZipArchive(
    data: File | ArrayBuffer | Uint8Array,
    fileName: string = 'project.zip',
    options: IngestionOptions = {},
    onProgress?: ProgressCallback
  ): Promise<{
    projectId: string;
    analysis: ProjectAnalysis;
    skippedFiles: { path: string; reason: string }[];
    warnings: string[];
  }> {
    // Generate new unique session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeSessionId = sessionId;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
    }
    this.activeAbortController = new AbortController();

    this.lastAnalysisParams = { type: 'zip', data, fileName, options };

    // Standard stages for ZIP analysis
    const initialStages: AnalysisStageProgress[] = [
      { id: 'extracting', name: 'Decompress archive', status: 'running' },
      { id: 'parsing', name: 'Syntax & AST parsing', status: 'pending' },
      { id: 'resolving', name: 'Cross-module resolution', status: 'pending' },
      { id: 'centrality', name: 'Graph metrics & centrality', status: 'pending' },
      { id: 'dependencies', name: 'Dependency intelligence', status: 'pending' },
      { id: 'finalisation', name: 'Finalising & indexing', status: 'pending' },
    ];

    const sessionStartTime = performance.now();
    this.notify({
      status: 'running',
      sessionId,
      projectName: fileName.replace(/\.zip$/i, ''),
      currentStage: 'extracting',
      progress: { current: 0, total: 100, message: 'Extracting archive contents...' },
      stages: initialStages,
      isPartial: false,
      error: null,
      startTime: sessionStartTime,
      canCancel: true,
      canRetry: false,
    });

    const updateStageProgress = (
      stageId: string,
      prog: { current: number; total: number; message: string }
    ) => {
      if (this.activeSessionId !== sessionId) return;
      onProgress?.(stageId, prog);

      const stages = this.sessionState.stages.map((s) => {
        if (s.id === stageId) {
          return { ...s, status: 'running' as const, current: prog.current, total: prog.total, message: prog.message };
        }
        // If it was previous and running, mark completed
        const currentIndex = initialStages.findIndex((x) => x.id === stageId);
        const thisIndex = initialStages.findIndex((x) => x.id === s.id);
        if (thisIndex < currentIndex && s.status === 'running') {
          return { ...s, status: 'completed' as const };
        }
        return s;
      });

      this.notify({
        currentStage: stageId,
        progress: prog,
        stages,
      });
    };

    try {
      let arrayBuffer: ArrayBuffer;
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data instanceof Uint8Array) {
        arrayBuffer = data.buffer as ArrayBuffer;
      } else {
        arrayBuffer = await data.arrayBuffer();
      }

      if (this.activeSessionId !== sessionId) {
        throw new Error('Analysis cancelled by user.');
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.currentJobId = jobId;

      let result: {
        analysis: ProjectAnalysis;
        skippedFiles: { path: string; reason: string }[];
        warnings: string[];
      };

      if (!this.worker && typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        this.initWorker();
      }

      if (this.workerAvailable && this.worker) {
        result = await new Promise((resolve, reject) => {
          this.activeJobs.set(jobId, {
            resolve,
            reject,
            onProgress: (stage, prog) => updateStageProgress(stage, prog),
          });
          const req: WorkerRequest = {
            type: 'ANALYZE_ZIP',
            id: jobId,
            buffer: arrayBuffer,
            fileName,
            options,
          };
          try {
            // Transfer ArrayBuffer for zero-copy high performance
            this.worker!.postMessage(req, [arrayBuffer]);
          } catch (postErr) {
            this.activeJobs.delete(jobId);
            reject(postErr instanceof Error ? postErr : new Error(String(postErr)));
          }
        });
      } else {
        // Main-thread fallback (Node tests or restricted environments)
        updateStageProgress('extracting', {
          current: 10,
          total: 100,
          message: 'Decompressing archive contents...',
        });
        const zipService = new ZipIngestionService();
        const ingestion = await zipService.ingestZip(arrayBuffer, fileName, options);

        if (this.activeSessionId !== sessionId) {
          throw new Error('Analysis cancelled by user.');
        }

        const fileCount = Object.keys(ingestion.files).length;
        if (fileCount === 0) {
          throw new Error('No supported JavaScript or TypeScript source files found in the archive.');
        }

        updateStageProgress('parsing', {
          current: 0,
          total: fileCount,
          message: `Extracted ${fileCount} files. Parsing AST...`,
        });

        const analyzer = new CodebaseAnalyzer();
        const analysis = analyzer.analyzeProject(
          ingestion.projectName,
          ingestion.files,
          (stage, prog) => updateStageProgress(stage, prog),
          { signal: this.activeAbortController?.signal }
        );

        result = {
          analysis,
          skippedFiles: ingestion.skippedFiles,
          warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
        };
      }

      // Check stale session ID before writing to store
      if (this.activeSessionId !== sessionId) {
        throw new Error('Analysis superseded by a newer session.');
      }

      updateStageProgress('finalisation', {
        current: 100,
        total: 100,
        message: 'Persisting analysis to local store...',
      });

      result.analysis.skippedFiles = result.skippedFiles;
      await localProjectStore.saveProject(result.analysis);

      const totalDuration = Math.round(performance.now() - sessionStartTime);
      const isPartial = Boolean(
        result.analysis.isPartial ||
        result.skippedFiles.length > 0 ||
        result.warnings.some((w) => w.toLowerCase().includes('error'))
      );

      const partialReason = isPartial
        ? result.analysis.partialReason ||
          `${result.skippedFiles.length} file(s) skipped or excluded during analysis.`
        : undefined;

      const completedStages = this.sessionState.stages.map((s) => ({
        ...s,
        status: 'completed' as const,
      }));

      this.notify({
        status: isPartial ? 'partial' : 'completed',
        currentStage: 'completed',
        isPartial,
        partialReason,
        projectId: result.analysis.projectId,
        totalDurationMs: totalDuration,
        performanceMetrics: result.analysis.analysisMetadata,
        canCancel: false,
        canRetry: false,
        progress: {
          current: result.analysis.stats.totalFiles,
          total: result.analysis.stats.totalFiles,
          message: `Analysis completed in ${(totalDuration / 100).toFixed(1)}s. ${result.analysis.stats.totalSymbols} symbols indexed.`,
        },
        stages: completedStages,
      });

      return {
        projectId: result.analysis.projectId,
        analysis: result.analysis,
        skippedFiles: result.skippedFiles,
        warnings: result.warnings,
      };
    } catch (err) {
      if (this.activeSessionId === sessionId) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isCancelled = errorMsg.includes('cancelled');

        if (isCancelled) {
          this.cancelActiveAnalysis(errorMsg);
        } else {
          const formattedError: AnalysisErrorDetails = {
            title: 'Repository analysis failed',
            message: errorMsg,
            stage: this.sessionState.currentStage,
            recoveryAction:
              'Check that the archive contains uncorrupted JavaScript or TypeScript source code, or retry with a different archive.',
            canRetry: true,
            technicalDetails: err instanceof Error ? err.stack : undefined,
          };

          const failedStages = this.sessionState.stages.map((s) =>
            s.id === this.sessionState.currentStage ? { ...s, status: 'failed' as const } : s
          );

          this.notify({
            status: 'failed',
            error: formattedError,
            canCancel: false,
            canRetry: true,
            stages: failedStages,
            progress: {
              current: 0,
              total: 100,
              message: errorMsg,
            },
          });
        }
      }
      throw err;
    }
  }

  /**
   * Directly analyze in-memory files record
   */
  public async analyzeFiles(
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: ProgressCallback
  ): Promise<{ projectId: string; analysis: ProjectAnalysis }> {
    const sessionId = this.activeSessionId || `session_${Date.now()}`;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.currentJobId = jobId;

    let analysis: ProjectAnalysis;

    if (!this.worker && typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      this.initWorker();
    }

    if (this.workerAvailable && this.worker) {
      const res = await new Promise<{
        analysis: ProjectAnalysis;
        skippedFiles: { path: string; reason: string }[];
        warnings: string[];
      }>((resolve, reject) => {
        this.activeJobs.set(jobId, { resolve, reject, onProgress });
        const req: WorkerRequest = {
          type: 'ANALYZE_FILES',
          id: jobId,
          projectName,
          files,
        };
        try {
          this.worker!.postMessage(req);
        } catch (postErr) {
          this.activeJobs.delete(jobId);
          reject(postErr instanceof Error ? postErr : new Error(String(postErr)));
        }
      });
      analysis = res.analysis;
    } else {
      const analyzer = new CodebaseAnalyzer();
      analysis = analyzer.analyzeProject(projectName, files, onProgress, {
        signal: this.activeAbortController?.signal,
      });
    }

    // Stale session protection
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      throw new Error('Analysis superseded by a newer session.');
    }

    await localProjectStore.saveProject(analysis);
    return { projectId: analysis.projectId, analysis };
  }

  /**
   * Import from GitHub directly via browser tree & blob streaming
   */
  public async importGitHubRepo(
    owner: string,
    repo: string,
    branch: string = 'main',
    token?: string,
    onProgress?: ProgressCallback
  ): Promise<{ projectId: string; analysis: ProjectAnalysis; cached?: boolean }> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeSessionId = sessionId;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
    }
    this.activeAbortController = new AbortController();

    this.lastAnalysisParams = { type: 'github', owner, repo, branch, token };

    const initialStages: AnalysisStageProgress[] = [
      { id: 'connecting', name: 'GitHub connection', status: 'running' },
      { id: 'fetching', name: 'Git tree & files streaming', status: 'pending' },
      { id: 'parsing', name: 'AST parsing', status: 'pending' },
      { id: 'resolving', name: 'Cross-module relationships', status: 'pending' },
      { id: 'centrality', name: 'Graph centrality', status: 'pending' },
      { id: 'dependencies', name: 'Dependency intelligence', status: 'pending' },
      { id: 'finalisation', name: 'Finalisation', status: 'pending' },
    ];

    const sessionStartTime = performance.now();
    this.notify({
      status: 'running',
      sessionId,
      projectName: `${owner}/${repo}`,
      currentStage: 'connecting',
      progress: { current: 5, total: 100, message: `Connecting to GitHub for ${owner}/${repo}@${branch}...` },
      stages: initialStages,
      isPartial: false,
      error: null,
      startTime: sessionStartTime,
      canCancel: true,
      canRetry: false,
    });

    const updateStageProgress = (
      stageId: string,
      prog: { current: number; total: number; message: string }
    ) => {
      if (this.activeSessionId !== sessionId) return;
      onProgress?.(stageId, prog);

      const stages = this.sessionState.stages.map((s) => {
        if (s.id === stageId) {
          return { ...s, status: 'running' as const, current: prog.current, total: prog.total, message: prog.message };
        }
        const currentIndex = initialStages.findIndex((x) => x.id === stageId);
        const thisIndex = initialStages.findIndex((x) => x.id === s.id);
        if (thisIndex < currentIndex && s.status === 'running') {
          return { ...s, status: 'completed' as const };
        }
        return s;
      });

      this.notify({
        currentStage: stageId,
        progress: prog,
        stages,
      });
    };

    try {
      updateStageProgress('connecting', {
        current: 5,
        total: 100,
        message: `Connecting to GitHub for ${owner}/${repo}@${branch}...`,
      });

      // 1. Resolve commit SHA for deduplication check
      let commitSha: string | null = null;
      try {
        const commit = await browserGitHubClient.getLatestCommit(owner, repo, branch, token);
        commitSha = commit.sha;
      } catch {
        // Continue to fetch if commit listing failed
      }

      if (this.activeSessionId !== sessionId) {
        throw new Error('Analysis cancelled by user.');
      }

      // 2. Check cached analysis in IndexedDB / memory
      if (commitSha) {
        const cached = await localProjectStore.findProjectByCommit(owner, repo, commitSha);
        if (cached) {
          updateStageProgress('completed', {
            current: 100,
            total: 100,
            message: `Loaded cached analysis for commit ${commitSha.slice(0, 7)}.`,
          });

          this.notify({
            status: 'completed',
            currentStage: 'completed',
            projectId: cached.projectId,
            canCancel: false,
            canRetry: false,
            stages: this.sessionState.stages.map((s) => ({ ...s, status: 'completed' as const })),
            progress: {
              current: cached.stats.totalFiles,
              total: cached.stats.totalFiles,
              message: `Loaded cached analysis for commit ${commitSha.slice(0, 7)}.`,
            },
          });

          return { projectId: cached.projectId, analysis: cached, cached: true };
        }
      }

      // 3. Tree-based source file download pinned to commit SHA
      updateStageProgress('fetching', {
        current: 15,
        total: 100,
        message: `Scanning Git tree and streaming source files for ${owner}/${repo}@${branch}...`,
      });

      const { files, commitSha: resolvedSha, warnings, skippedFiles } =
        await browserGitHubClient.fetchRepositorySourceFiles({
          owner,
          repo,
          branch,
          token,
          signal: this.activeAbortController?.signal,
          onProgress: (stage, prog) => updateStageProgress(stage, prog),
        });

      if (this.activeSessionId !== sessionId) {
        throw new Error('Analysis cancelled by user.');
      }

      const actualSha = commitSha || resolvedSha;

      // 4. Ingest and analyze
      updateStageProgress('parsing', {
        current: 0,
        total: Object.keys(files).length,
        message: `Analyzing syntax & AST for ${Object.keys(files).length} files...`,
      });

      const { analysis } = await this.analyzeFiles(
        `${owner}/${repo}`,
        files,
        (stage, prog) => updateStageProgress(stage, prog)
      );

      if (this.activeSessionId !== sessionId) {
        throw new Error('Analysis superseded by a newer session.');
      }

      // Record verified Git revision metadata (PAT is NEVER stored in gitMetadata)
      analysis.projectName = `${owner}/${repo}`;
      analysis.gitMetadata = {
        owner,
        repo,
        branch,
        commitSha: actualSha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${actualSha}`,
        repoUrl: `https://github.com/${owner}/${repo}`,
      };

      for (const sf of skippedFiles) {
        analysis.warnings.push({
          filePath: sf.path,
          message: sf.reason,
          severity: 'info',
        });
      }
      for (const w of warnings) {
        analysis.warnings.push({
          message: w,
          severity: 'warning',
        });
      }

      analysis.skippedFiles = skippedFiles;
      await localProjectStore.saveProject(analysis);

      const totalDuration = Math.round(performance.now() - sessionStartTime);
      const isPartial = Boolean(
        analysis.isPartial ||
        skippedFiles.length > 0 ||
        warnings.length > 0
      );

      const partialReason = isPartial
        ? analysis.partialReason ||
          `${skippedFiles.length} file(s) or objects were skipped or truncated by GitHub limits.`
        : undefined;

      const completedStages = this.sessionState.stages.map((s) => ({
        ...s,
        status: 'completed' as const,
      }));

      this.notify({
        status: isPartial ? 'partial' : 'completed',
        currentStage: 'completed',
        isPartial,
        partialReason,
        projectId: analysis.projectId,
        totalDurationMs: totalDuration,
        performanceMetrics: analysis.analysisMetadata,
        canCancel: false,
        canRetry: false,
        progress: {
          current: analysis.stats.totalFiles,
          total: analysis.stats.totalFiles,
          message: `GitHub repository analyzed in ${(totalDuration / 1000).toFixed(1)}s. ${analysis.stats.totalSymbols} symbols indexed.`,
        },
        stages: completedStages,
      });

      return { projectId: analysis.projectId, analysis, cached: false };
    } catch (err) {
      if (this.activeSessionId === sessionId) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isCancelled = errorMsg.includes('cancelled');

        if (isCancelled) {
          this.cancelActiveAnalysis(errorMsg);
        } else {
          let recoveryAction = 'Check the repository URL and branch, or export and upload a ZIP archive.';
          if (errorMsg.includes('rate limit')) {
            recoveryAction = 'Provide a GitHub Personal Access Token to get 5,000 requests/hour, or use ZIP upload.';
          } else if (errorMsg.includes('unauthorized') || errorMsg.includes('401')) {
            recoveryAction = 'Check that your Personal Access Token is valid and has "repo" permissions.';
          }

          const formattedError: AnalysisErrorDetails = {
            title: 'GitHub repository import failed',
            message: errorMsg,
            stage: this.sessionState.currentStage,
            recoveryAction,
            canRetry: true,
            technicalDetails: err instanceof Error ? err.stack : undefined,
          };

          const failedStages = this.sessionState.stages.map((s) =>
            s.id === this.sessionState.currentStage ? { ...s, status: 'failed' as const } : s
          );

          this.notify({
            status: 'failed',
            error: formattedError,
            canCancel: false,
            canRetry: true,
            stages: failedStages,
            progress: {
              current: 0,
              total: 100,
              message: errorMsg,
            },
          });
        }
      }
      throw err;
    }
  }

  public async getProject(projectId: string): Promise<ProjectAnalysis | null> {
    return localProjectStore.getProject(projectId);
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    return localProjectStore.listProjects();
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    // Clear relevant caches
    for (const key of this.traceCache.keys()) {
      if (key.startsWith(projectId)) this.traceCache.delete(key);
    }
    for (const key of this.impactCache.keys()) {
      if (key.startsWith(projectId)) this.impactCache.delete(key);
    }
    for (const key of this.dataflowCache.keys()) {
      if (key.startsWith(projectId)) this.dataflowCache.delete(key);
    }
    return localProjectStore.deleteProject(projectId);
  }

  /**
   * Execution Path Tracing with in-memory caching
   */
  public async traceExecutionPath(
    projectId: string,
    entityId: string,
    options: TraceOptions = {}
  ): Promise<ExecutionPath> {
    const direction = options.direction || 'forward';
    const cacheKey = `${projectId}:${entityId}:${direction}:${options.maxDepth || 12}`;

    if (this.traceCache.has(cacheKey)) {
      return this.traceCache.get(cacheKey)!;
    }

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found in local store.`);
    }

    const engine = new ExecutionPathEngine(project);
    const trace = engine.tracePath(entityId, options);
    this.traceCache.set(cacheKey, trace);
    return trace;
  }

  /**
   * Data Flow Analysis with in-memory caching
   */
  public async traceDataFlow(
    projectId: string,
    symbolOrEntityId: string,
    originEntityId?: string
  ): Promise<DataFlowTrace> {
    const cacheKey = `${projectId}:${symbolOrEntityId}:${originEntityId || ''}`;
    if (this.dataflowCache.has(cacheKey)) {
      return this.dataflowCache.get(cacheKey)!;
    }

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found in local store.`);
    }

    const engine = new DataFlowEngine(project);
    const flowTrace = engine.traceDataFlow(symbolOrEntityId, originEntityId);
    this.dataflowCache.set(cacheKey, flowTrace);
    return flowTrace;
  }

  /**
   * Change Impact Blast Radius with in-memory caching
   */
  public async analyzeImpact(projectId: string, entityId: string): Promise<ImpactReport> {
    const cacheKey = `${projectId}:${entityId}`;
    if (this.impactCache.has(cacheKey)) {
      return this.impactCache.get(cacheKey)!;
    }

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found in local store.`);
    }

    const service = new ImpactAnalysisService(project);
    const impact = service.analyzeImpact(entityId);
    this.impactCache.set(cacheKey, impact);
    return impact;
  }

  /**
   * Symbol and Route Search
   */
  public async searchSymbols(projectId: string, query: SearchQuery): Promise<SearchResult[]> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found in local store.`);
    }

    const service = new SearchService(project);
    return service.search(query);
  }

  /**
   * Deterministic Offline AI Explanation
   */
  public async investigateQuestion(
    projectId: string,
    question: string,
    targetEntityId?: string
  ): Promise<InvestigationResponse> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found in local store.`);
    }

    const investigator = new AIInvestigatorService(project);
    return investigator.investigate(question, targetEntityId);
  }
}

// Global browser singleton service
export const browserAnalysisService = new BrowserAnalysisService();
