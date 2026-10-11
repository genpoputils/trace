import {
  ProjectAnalysis,
  FileRecord,
  ExecutionPath,
  DataFlowTrace,
  ImpactReport,
  SearchResult,
  SearchQuery,
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

  // Fast in-memory caches to preserve < 0.1ms tab switching performance
  private traceCache: Map<string, ExecutionPath> = new Map();
  private impactCache: Map<string, ImpactReport> = new Map();
  private dataflowCache: Map<string, DataFlowTrace> = new Map();

  constructor() {
    this.initWorker();
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
    let arrayBuffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      arrayBuffer = data;
    } else if (data instanceof Uint8Array) {
      arrayBuffer = data.buffer as ArrayBuffer;
    } else {
      arrayBuffer = await data.arrayBuffer();
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let result: {
      analysis: ProjectAnalysis;
      skippedFiles: { path: string; reason: string }[];
      warnings: string[];
    };

    if (this.workerAvailable && this.worker) {
      result = await new Promise((resolve, reject) => {
        this.activeJobs.set(jobId, { resolve, reject, onProgress });
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
      onProgress?.('extracting', {
        current: 10,
        total: 100,
        message: 'Decompressing archive contents...',
      });
      const zipService = new ZipIngestionService();
      const ingestion = await zipService.ingestZip(arrayBuffer, fileName, options);

      const fileCount = Object.keys(ingestion.files).length;
      if (fileCount === 0) {
        throw new Error('No supported JavaScript or TypeScript source files found in the archive.');
      }

      onProgress?.('parsing', {
        current: 0,
        total: fileCount,
        message: `Extracted ${fileCount} files. Parsing AST...`,
      });

      const analyzer = new CodebaseAnalyzer();
      const analysis = analyzer.analyzeProject(
        ingestion.projectName,
        ingestion.files,
        (stage, prog) => onProgress?.(stage, prog)
      );

      result = {
        analysis,
        skippedFiles: ingestion.skippedFiles,
        warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
      };
    }

    // Persist to local project store (IndexedDB + in-memory cache)
    await localProjectStore.saveProject(result.analysis);

    return {
      projectId: result.analysis.projectId,
      analysis: result.analysis,
      skippedFiles: result.skippedFiles,
      warnings: result.warnings,
    };
  }

  /**
   * Directly analyze in-memory files record
   */
  public async analyzeFiles(
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: ProgressCallback
  ): Promise<{ projectId: string; analysis: ProjectAnalysis }> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let analysis: ProjectAnalysis;

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
      analysis = analyzer.analyzeProject(projectName, files, onProgress);
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
    onProgress?.('connecting', {
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

    // 2. Check cached analysis in IndexedDB / memory
    if (commitSha) {
      const cached = await localProjectStore.findProjectByCommit(owner, repo, commitSha);
      if (cached) {
        onProgress?.('completed', {
          current: 100,
          total: 100,
          message: `Loaded cached analysis for commit ${commitSha.slice(0, 7)}.`,
        });
        return { projectId: cached.projectId, analysis: cached, cached: true };
      }
    }

    // 3. Tree-based source file download pinned to commit SHA
    onProgress?.('fetching', {
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
        onProgress,
      });

    const actualSha = commitSha || resolvedSha;

    // 4. Ingest and analyze
    onProgress?.('parsing', {
      current: 0,
      total: Object.keys(files).length,
      message: `Analyzing syntax & AST for ${Object.keys(files).length} files...`,
    });

    const { analysis } = await this.analyzeFiles(
      `${owner}/${repo}`,
      files,
      onProgress
    );

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

    // Attach any warnings and skipped file records
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

    // Update project in local store with verified commit revision key
    await localProjectStore.saveProject(analysis);

    return { projectId: analysis.projectId, analysis, cached: false };
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
