import { ProjectAnalysis } from '../types/trace';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer';
import { SAMPLE_ECOMMERCE_API } from '../fixtures/sample-codebases';

export const CURRENT_ANALYZER_VERSION = 'trace-v1.0.0';
export const STORAGE_SCHEMA_VERSION = 1;
const DB_NAME = 'trace_codebase_db';
const STORE_PROJECTS = 'projects';
const STORE_METADATA = 'metadata';
const MAX_IN_MEMORY_PROJECTS = 10;

export interface StoredProjectRecord {
  schemaVersion: number;
  analyzerVersion: string;
  projectId: string;
  projectName: string;
  revisionKey?: string;
  analyzedAt: string;
  analysis: ProjectAnalysis;
}

export interface ProjectSummary {
  id: string;
  name: string;
  filesCount: number;
  symbolsCount: number;
  analyzedAt: string;
  revisionKey?: string;
  isSample?: boolean;
}

/**
 * Local-First Browser Project Store
 * Multi-tier storage: In-Memory Fast Cache -> IndexedDB Persistent Storage
 * Gracefully degrades to purely in-memory if IndexedDB is unavailable or restricted.
 */
export class LocalProjectStore {
  private inMemoryCache: Map<string, ProjectAnalysis> = new Map();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isIndexedDBAvailable: boolean;

  constructor() {
    this.isIndexedDBAvailable = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  private async openDb(): Promise<IDBDatabase | null> {
    if (!this.isIndexedDBAvailable) {
      return null;
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, STORAGE_SCHEMA_VERSION);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'projectId' });
            projectStore.createIndex('revisionKey', 'revisionKey', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_METADATA)) {
            db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
          }
        };

        req.onsuccess = () => {
          resolve(req.result);
        };

        req.onerror = () => {
          console.warn('Trace: IndexedDB open failed. Falling back to in-memory store.', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('Trace: IndexedDB not accessible. Falling back to in-memory store.', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public getSampleProject(): ProjectAnalysis {
    const cached = this.inMemoryCache.get('sample-ecommerce-api');
    if (cached) return cached;

    const analyzer = new CodebaseAnalyzer();
    const analysis = analyzer.analyzeProject(
      'GenPopUtils Store (Sample E-Commerce API)',
      SAMPLE_ECOMMERCE_API
    );
    analysis.projectId = 'sample-ecommerce-api';
    analysis.gitMetadata = {
      owner: 'genpoputils',
      repo: 'ecommerce-core',
      branch: 'main',
      commitSha: 'c8f12a9e3d842bfb8291c94d01bfa5e998184d02',
      commitUrl: 'https://github.com/genpoputils/ecommerce-core/commit/c8f12a9',
      repoUrl: 'https://github.com/genpoputils/ecommerce-core',
    };

    this.cacheInMemory(analysis.projectId, analysis);
    return analysis;
  }

  private cacheInMemory(projectId: string, analysis: ProjectAnalysis) {
    if (this.inMemoryCache.size >= MAX_IN_MEMORY_PROJECTS) {
      // Evict oldest non-sample entry
      for (const key of this.inMemoryCache.keys()) {
        if (key !== 'sample-ecommerce-api') {
          this.inMemoryCache.delete(key);
          break;
        }
      }
    }
    this.inMemoryCache.set(projectId, analysis);
  }

  public async saveProject(analysis: ProjectAnalysis): Promise<void> {
    if (!analysis.projectId) {
      throw new Error('Analysis must have a valid projectId');
    }

    this.cacheInMemory(analysis.projectId, analysis);

    const db = await this.openDb();
    if (!db) return;

    let revisionKey: string | undefined;
    if (analysis.gitMetadata?.owner && analysis.gitMetadata?.repo && analysis.gitMetadata?.commitSha) {
      revisionKey = `${analysis.gitMetadata.owner.toLowerCase()}/${analysis.gitMetadata.repo.toLowerCase()}@${analysis.gitMetadata.commitSha}`;
    }

    const record: StoredProjectRecord = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      analyzerVersion: CURRENT_ANALYZER_VERSION,
      projectId: analysis.projectId,
      projectName: analysis.projectName,
      revisionKey,
      analyzedAt: analysis.analyzedAt,
      analysis,
    };

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('Trace: Failed to persist analysis to IndexedDB:', tx.error);
          resolve();
        };
      } catch (err) {
        console.warn('Trace: IndexedDB transaction error:', err);
        resolve();
      }
    });
  }

  public async getProject(projectId: string): Promise<ProjectAnalysis | null> {
    // 1. Fast in-memory check
    if (this.inMemoryCache.has(projectId)) {
      return this.inMemoryCache.get(projectId)!;
    }

    if (projectId === 'sample-ecommerce-api') {
      return this.getSampleProject();
    }

    // 2. Query IndexedDB
    const db = await this.openDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.get(projectId);

        req.onsuccess = () => {
          const record = req.result as StoredProjectRecord | undefined;
          if (record && record.analysis) {
            // Verify schema compatibility
            if (record.schemaVersion === STORAGE_SCHEMA_VERSION) {
              this.cacheInMemory(projectId, record.analysis);
              resolve(record.analysis);
              return;
            }
          }
          resolve(null);
        };

        req.onerror = () => {
          console.warn('Trace: Failed to read project from IndexedDB:', req.error);
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }

  public async findProjectByCommit(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<ProjectAnalysis | null> {
    const o = owner.toLowerCase();
    const r = repo.toLowerCase();
    const targetKey = `${o}/${r}@${commitSha}`;

    // 1. Check in-memory
    for (const project of this.inMemoryCache.values()) {
      if (
        project.gitMetadata?.owner?.toLowerCase() === o &&
        project.gitMetadata?.repo?.toLowerCase() === r &&
        project.gitMetadata?.commitSha === commitSha
      ) {
        return project;
      }
    }

    // 2. Check IndexedDB index
    const db = await this.openDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const index = store.index('revisionKey');
        const req = index.get(targetKey);

        req.onsuccess = () => {
          const record = req.result as StoredProjectRecord | undefined;
          if (record && record.analysis) {
            this.cacheInMemory(record.projectId, record.analysis);
            resolve(record.analysis);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    const summaries: Map<string, ProjectSummary> = new Map();

    // 1. Seed sample if in-memory is empty
    const sample = this.getSampleProject();
    summaries.set(sample.projectId, {
      id: sample.projectId,
      name: sample.projectName,
      filesCount: sample.stats.totalFiles,
      symbolsCount: sample.stats.totalSymbols,
      analyzedAt: sample.analyzedAt,
      isSample: true,
    });

    // 2. Collect from in-memory cache
    for (const p of this.inMemoryCache.values()) {
      summaries.set(p.projectId, {
        id: p.projectId,
        name: p.projectName,
        filesCount: p.stats.totalFiles,
        symbolsCount: p.stats.totalSymbols,
        analyzedAt: p.analyzedAt,
        isSample: p.projectId === 'sample-ecommerce-api',
      });
    }

    // 3. Collect from IndexedDB
    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_PROJECTS, 'readonly');
          const store = tx.objectStore(STORE_PROJECTS);
          const req = store.openCursor();

          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const record = cursor.value as StoredProjectRecord;
              if (record && record.analysis && !summaries.has(record.projectId)) {
                summaries.set(record.projectId, {
                  id: record.projectId,
                  name: record.projectName,
                  filesCount: record.analysis.stats?.totalFiles || 0,
                  symbolsCount: record.analysis.stats?.totalSymbols || 0,
                  analyzedAt: record.analyzedAt,
                  revisionKey: record.revisionKey,
                  isSample: record.projectId === 'sample-ecommerce-api',
                });
              }
              cursor.continue();
            } else {
              resolve();
            }
          };

          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    return Array.from(summaries.values());
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    if (projectId === 'sample-ecommerce-api') {
      return false; // Preserve sample
    }

    this.inMemoryCache.delete(projectId);

    const db = await this.openDb();
    if (!db) return true;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        store.delete(projectId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async clearAll(): Promise<void> {
    this.inMemoryCache.clear();
    const db = await this.openDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

// Global browser singleton
export const localProjectStore = new LocalProjectStore();
