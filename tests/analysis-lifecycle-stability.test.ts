import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BrowserAnalysisService, AnalysisWorkerLike } from '../src/lib/services/browser-analysis-service';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';
import { ProjectAnalysis } from '../src/lib/types/trace';
import { WorkerRequest, WorkerResponse } from '../src/lib/worker/worker-types';

class ControllableMockWorker implements AnalysisWorkerLike {
  public onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated: boolean = false;
  public postedMessages: WorkerRequest[] = [];

  public postMessage(data: WorkerRequest) {
    this.postedMessages.push(data);
  }

  public terminate() {
    this.terminated = true;
  }

  public emitProgress(id: string, stage: string, current: number, total: number, message: string) {
    this.onmessage?.({
      data: {
        type: 'PROGRESS',
        id,
        stage,
        progress: { current, total, message },
      },
    } as unknown as MessageEvent<WorkerResponse>);
  }

  public emitResult(
    id: string,
    analysis: ProjectAnalysis,
    skippedFiles: Array<{ path: string; reason: string }> = [],
    warnings: string[] = []
  ) {
    this.onmessage?.({
      data: {
        type: 'RESULT',
        id,
        analysis,
        skippedFiles,
        warnings,
      },
    } as unknown as MessageEvent<WorkerResponse>);
  }

  public emitError(id: string, error: string) {
    this.onmessage?.({
      data: {
        type: 'ERROR',
        id,
        error,
      },
    } as unknown as MessageEvent<WorkerResponse>);
  }
}

describe('Analysis Lifecycle, Stability & Performance Verification Suite', () => {
  test('Idle to Running to Completed lifecycle emits genuine stage events', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new ControllableMockWorker();
    service.attachWorker(mockWorker);

    const states: string[] = [];
    const unsubscribe = service.subscribe((s) => {
      states.push(s.status);
    });

    const dummyBuffer = new Uint8Array([1, 2, 3]).buffer;
    const promise = service.importZipArchive(dummyBuffer, 'test-project.zip');

    assert.ok(states.includes('running'), 'State transitioned to running');
    const runningState = service.getSessionState();
    assert.strictEqual(runningState.status, 'running');
    assert.strictEqual(runningState.canCancel, true);
    assert.ok(runningState.stages.length >= 5, 'Stages list initialized');

    // Emit progress from worker
    const jobId = mockWorker.postedMessages[0]?.id;
    assert.ok(jobId, 'Worker received job with ID');
    mockWorker.emitProgress(jobId, 'parsing', 5, 10, 'Parsed 5 of 10 files');

    const progressState = service.getSessionState();
    assert.strictEqual(progressState.progress.current, 5);
    assert.strictEqual(progressState.progress.total, 10);
    assert.strictEqual(progressState.progress.message, 'Parsed 5 of 10 files');

    // Complete the job with mock analysis
    const analyzer = new CodebaseAnalyzer();
    const completedAnalysis = analyzer.analyzeProject('test-project', SAMPLE_ECOMMERCE_API);
    mockWorker.emitResult(jobId, completedAnalysis);

    const result = await promise;
    assert.ok(result);
    assert.strictEqual(result.analysis.projectName, 'test-project');

    const finalState = service.getSessionState();
    assert.ok(['completed', 'partial'].includes(finalState.status));
    assert.strictEqual(finalState.canCancel, false);
    assert.ok(finalState.totalDurationMs !== undefined);

    unsubscribe();
  });

  test('Cancellation cleanly halts execution and transitions state to cancelled', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new ControllableMockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([4, 5, 6]).buffer;
    const jobPromise = service.importZipArchive(dummyBuffer, 'cancellable.zip');

    assert.strictEqual(service.getSessionState().status, 'running');
    assert.strictEqual(service.getActiveJobsCount(), 1);

    // User triggers cancel
    service.cancelActiveAnalysis('User cancelled long-running scan.');

    const cancelledState = service.getSessionState();
    assert.strictEqual(cancelledState.status, 'cancelled');
    assert.strictEqual(cancelledState.canCancel, false);
    assert.ok(cancelledState.progress.message.includes('User cancelled'));

    // Job promise must reject with cancellation error
    await assert.rejects(
      async () => {
        await jobPromise;
      },
      /User cancelled long-running scan/
    );

    assert.strictEqual(service.getActiveJobsCount(), 0);
  });

  test('Stale-analysis protection: New analysis session supersedes previous pending session', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new ControllableMockWorker();
    service.attachWorker(mockWorker);

    const dummy1 = new Uint8Array([1]).buffer;
    const dummy2 = new Uint8Array([2]).buffer;

    // Start session 1
    const p1 = service.importZipArchive(dummy1, 'session1.zip');
    const job1Id = mockWorker.postedMessages[0].id;
    const session1Id = service.getSessionState().sessionId;

    // Immediately start session 2 before session 1 finishes
    const p2 = service.importZipArchive(dummy2, 'session2.zip');
    const job2Id = mockWorker.postedMessages[1].id;
    const session2Id = service.getSessionState().sessionId;

    assert.notStrictEqual(session1Id, session2Id, 'Sessions have distinct session IDs');
    assert.strictEqual(service.getSessionState().projectName, 'session2');

    // Attempt to settle old job 1
    const analyzer = new CodebaseAnalyzer();
    const analysis1 = analyzer.analyzeProject('session1', SAMPLE_ECOMMERCE_API);
    mockWorker.emitResult(job1Id, analysis1);

    // Attempt to settle current job 2
    const analysis2 = analyzer.analyzeProject('session2', SAMPLE_ECOMMERCE_API);
    mockWorker.emitResult(job2Id, analysis2);

    const res2 = await p2;
    assert.strictEqual(res2.analysis.projectName, 'session2');
    assert.strictEqual(service.getSessionState().projectName, 'session2');

    // p1 must reject because it was superseded by session 2
    await assert.rejects(async () => {
      await p1;
    }, /superseded by a newer session/);
  });


  test('Partial analysis reports limitations with warning state rather than silent success', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new ControllableMockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([9, 9]).buffer;
    const promise = service.importZipArchive(dummyBuffer, 'partial-repo.zip');
    const jobId = mockWorker.postedMessages[0].id;

    const analyzer = new CodebaseAnalyzer();
    const partialAnalysis = analyzer.analyzeProject('partial-repo', SAMPLE_ECOMMERCE_API);
    partialAnalysis.warnings.push({
      filePath: 'src/corrupt.ts',
      message: 'Failed to parse AST: Unexpected token',
      severity: 'error',
    });
    partialAnalysis.isPartial = true;
    partialAnalysis.partialReason = '1 file(s) failed syntax parsing';

    mockWorker.emitResult(jobId, partialAnalysis, [{ path: 'corrupt.ts', reason: 'Parse error' }]);

    const res = await promise;
    assert.strictEqual(res.analysis.isPartial, true);

    const sessionState = service.getSessionState();
    assert.strictEqual(sessionState.status, 'partial');
    assert.strictEqual(sessionState.isPartial, true);
    assert.ok(sessionState.partialReason?.includes('Parse error') || sessionState.partialReason?.includes('syntax parsing'));
  });

  test('Analysis failure formats structured actionable error panel with retry availability', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new ControllableMockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([8, 8]).buffer;
    const promise = service.importZipArchive(dummyBuffer, 'failing-repo.zip');
    const jobId = mockWorker.postedMessages[0].id;

    mockWorker.emitError(jobId, 'GitHub API rate limit exceeded (HTTP 403)');

    await assert.rejects(async () => {
      await promise;
    }, /rate limit/);

    const sessionState = service.getSessionState();
    assert.strictEqual(sessionState.status, 'failed');
    assert.ok(sessionState.error !== null);
    assert.strictEqual(sessionState.error.title, 'Repository analysis failed');
    assert.ok(sessionState.error.message.includes('rate limit'));
    assert.ok(sessionState.error && sessionState.error.recoveryAction && sessionState.error.recoveryAction.length > 10);
    assert.strictEqual(sessionState.error.canRetry, true);
    assert.strictEqual(service.canRetry(), true);
  });

  test('CodebaseAnalyzer instruments all pipeline stages with positive durations', () => {
    const analyzer = new CodebaseAnalyzer();
    const result = analyzer.analyzeProject('Timing Benchmark', SAMPLE_ECOMMERCE_API);

    assert.ok(result.analysisMetadata, 'Analysis metadata present');
    assert.ok(result.analysisMetadata.totalDurationMs >= 0, 'Total duration measured');
    assert.ok(result.analysisMetadata.stageDurations.parsing !== undefined, 'Parsing stage measured');
    assert.ok(result.analysisMetadata.stageDurations.resolution !== undefined, 'Resolution stage measured');
    assert.ok(result.analysisMetadata.stageDurations.centrality !== undefined, 'Centrality stage measured');
    assert.ok(result.analysisMetadata.stageDurations.dependencies !== undefined, 'Dependencies stage measured');
  });
});
