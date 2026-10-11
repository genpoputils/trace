import test, { describe } from 'node:test';
import assert from 'node:assert';
import { BrowserAnalysisService, AnalysisWorkerLike } from '../src/lib/services/browser-analysis-service';
import { WorkerRequest, WorkerResponse } from '../src/lib/worker/worker-types';
import { ProjectAnalysis } from '../src/lib/types/trace';

class MockWorker implements AnalysisWorkerLike {
  public onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated: boolean = false;
  public lastPostedMessage: WorkerRequest | null = null;
  public shouldThrowOnPostMessage: boolean = false;

  public postMessage(data: WorkerRequest) {
    if (this.shouldThrowOnPostMessage) {
      throw new Error('DataCloneError: Transferable object could not be cloned');
    }
    this.lastPostedMessage = data;
  }

  public terminate() {
    this.terminated = true;
  }

  public simulateError(message: string) {
    this.onerror?.({ message });
  }

  public simulateMessageError() {
    this.onmessageerror?.({ data: null });
  }

  public simulateWorkerSuccess(id: string, mockAnalysis: ProjectAnalysis) {
    this.onmessage?.({
      data: {
        type: 'RESULT',
        id,
        analysis: mockAnalysis,
        skippedFiles: [],
        warnings: [],
      },
    } as unknown as MessageEvent<WorkerResponse>);
  }
}

describe('Web Worker Error Resilience & Job Settlement Suite', () => {
  test('Worker onerror settles pending analysis job promise immediately with rejection', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new MockWorker();
    service.attachWorker(mockWorker);

    assert.strictEqual(service.getActiveJobsCount(), 0);

    const dummyBuffer = new Uint8Array([1, 2, 3, 4]).buffer;

    // Start analysis job in worker
    const jobPromise = service.importZipArchive(dummyBuffer, 'test.zip');
    assert.strictEqual(service.getActiveJobsCount(), 1);

    // Trigger simulated worker failure / crash
    mockWorker.simulateError('Simulated worker out of memory crash');

    // Job promise must reject without hanging
    await assert.rejects(
      async () => {
        await jobPromise;
      },
      (err: Error) => {
        assert.ok(err.message.includes('Simulated worker out of memory crash'));
        return true;
      }
    );

    // Active jobs map must be settled and empty
    assert.strictEqual(service.getActiveJobsCount(), 0);
    assert.strictEqual(mockWorker.terminated, true);
    assert.strictEqual(service.isWorkerAvailable(), false);
  });

  test('Worker onerror settles MULTIPLE concurrent pending analysis jobs', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new MockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer1 = new Uint8Array([1, 2]).buffer;
    const dummyBuffer2 = new Uint8Array([3, 4]).buffer;

    const p1 = service.importZipArchive(dummyBuffer1, 'job1.zip');
    const p2 = service.importZipArchive(dummyBuffer2, 'job2.zip');

    assert.strictEqual(service.getActiveJobsCount(), 2);

    // Simulate worker error
    mockWorker.simulateError('Uncaught worker panic');

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    assert.strictEqual(r1.status, 'rejected');
    assert.strictEqual(r2.status, 'rejected');
    assert.strictEqual(service.getActiveJobsCount(), 0);
  });

  test('postMessage exception immediately rejects analysis promise without leaking active job', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new MockWorker();
    mockWorker.shouldThrowOnPostMessage = true;
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([1, 2, 3]).buffer;

    await assert.rejects(
      async () => {
        await service.importZipArchive(dummyBuffer, 'uncloneable.zip');
      },
      /DataCloneError/
    );

    assert.strictEqual(service.getActiveJobsCount(), 0);
  });

  test('Worker onmessageerror safely settles pending analysis jobs', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new MockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([5, 6]).buffer;
    const jobPromise = service.importZipArchive(dummyBuffer, 'deserialization_test.zip');

    assert.strictEqual(service.getActiveJobsCount(), 1);

    mockWorker.simulateMessageError();

    await assert.rejects(
      async () => {
        await jobPromise;
      },
      /deserialization/
    );

    assert.strictEqual(service.getActiveJobsCount(), 0);
  });

  test('Manual terminateWorker cleanly settles all active jobs and clears worker', async () => {
    const service = new BrowserAnalysisService();
    const mockWorker = new MockWorker();
    service.attachWorker(mockWorker);

    const dummyBuffer = new Uint8Array([7, 8]).buffer;
    const jobPromise = service.importZipArchive(dummyBuffer, 'cancel_me.zip');

    assert.strictEqual(service.getActiveJobsCount(), 1);

    service.terminateWorker('Analysis cancelled by user.');

    await assert.rejects(
      async () => {
        await jobPromise;
      },
      /Analysis cancelled by user/
    );

    assert.strictEqual(service.getActiveJobsCount(), 0);
  });
});
