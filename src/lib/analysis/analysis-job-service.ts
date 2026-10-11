import { githubClient } from '@/lib/github/github-client';
import { ZipIngestionService } from '@/lib/ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '@/lib/analyzer/codebase-analyzer';
import { projectStore } from '@/lib/storage/project-store';

export type JobStage =
  | 'queued'
  | 'connecting'
  | 'fetching'
  | 'discovering'
  | 'parsing'
  | 'extracting'
  | 'resolving'
  | 'preparing'
  | 'completed'
  | 'failed';

export interface AnalysisJob {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  stage: JobStage;
  progress: {
    current: number;
    total: number;
    message: string;
  };
  error?: string;
  projectId?: string;
  commitSha?: string;
  shortSha?: string;
  stats?: any;
  warnings?: string[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class AnalysisJobService {
  private jobs: Map<string, AnalysisJob> = new Map();
  private repoJobIndex: Map<string, string> = new Map(); // `${owner}/${repo}@${branch}` -> jobId

  public getJob(jobId: string): AnalysisJob | null {
    return this.jobs.get(jobId) || null;
  }

  public async startOrGetJob(
    owner: string,
    repo: string,
    branch: string = 'main',
    token?: string
  ): Promise<{ jobId: string; status: JobStage; projectId?: string; cached?: boolean }> {
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}@${branch.toLowerCase()}`;

    // 1. Resolve commit SHA if possible for instant cache check
    let commitSha: string | null = null;
    try {
      const commit = await githubClient.getLatestCommit(owner, repo, branch, token);
      commitSha = commit.sha;
    } catch {
      // Branch might be tag, commit SHA, or rate limited
    }

    // 2. Check cache if commit SHA was resolved
    if (commitSha) {
      const cachedProject = projectStore.findProjectByCommit(owner, repo, commitSha);
      if (cachedProject) {
        const jobId = `cached_${Date.now()}`;
        const job: AnalysisJob = {
          id: jobId,
          owner,
          repo,
          branch,
          stage: 'completed',
          progress: {
            current: 100,
            total: 100,
            message: `Loaded cached analysis for commit ${commitSha.slice(0, 7)}.`,
          },
          projectId: cachedProject.projectId,
          commitSha,
          shortSha: commitSha.slice(0, 7),
          stats: cachedProject.stats,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: Date.now(),
        };
        this.jobs.set(jobId, job);
        return { jobId, status: 'completed', projectId: cachedProject.projectId, cached: true };
      }
    }

    // 3. Deduplicate active background jobs for the same repository & branch
    const existingJobId = this.repoJobIndex.get(key);
    if (existingJobId) {
      const existingJob = this.jobs.get(existingJobId);
      if (existingJob && existingJob.stage !== 'failed' && existingJob.stage !== 'completed') {
        return { jobId: existingJob.id, status: existingJob.stage, cached: false };
      }
    }

    // 4. Create and enqueue new background analysis job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: AnalysisJob = {
      id: jobId,
      owner,
      repo,
      branch,
      commitSha: commitSha || undefined,
      shortSha: commitSha ? commitSha.slice(0, 7) : undefined,
      stage: 'connecting',
      progress: {
        current: 0,
        total: 100,
        message: `Connecting to GitHub repository ${owner}/${repo}@${branch}...`,
      },
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.repoJobIndex.set(key, jobId);

    // Asynchronously execute job in background worker
    this.runBackgroundJob(job, token).catch((err) => {
      console.error(`Job ${jobId} failed with unhandled error:`, err);
    });

    return { jobId, status: 'connecting', cached: false };
  }

  private async runBackgroundJob(job: AnalysisJob, token?: string) {
    try {
      // Stage: Fetching
      job.stage = 'fetching';
      job.progress = {
        current: 10,
        total: 100,
        message: `Downloading source archive for ${job.owner}/${job.repo}@${job.branch}...`,
      };
      job.updatedAt = Date.now();

      const { buffer, commitSha } = await githubClient.downloadRepoArchive(
        job.owner,
        job.repo,
        job.branch,
        token
      );
      job.commitSha = commitSha;
      job.shortSha = commitSha.slice(0, 7);

      // Check cache again with resolved commitSha
      const cached = projectStore.findProjectByCommit(job.owner, job.repo, commitSha);
      if (cached) {
        job.stage = 'completed';
        job.projectId = cached.projectId;
        job.stats = cached.stats;
        job.progress = {
          current: 100,
          total: 100,
          message: `Loaded cached analysis for commit ${job.shortSha}.`,
        };
        job.completedAt = Date.now();
        job.updatedAt = Date.now();
        return;
      }

      // Stage: Discovering
      job.stage = 'discovering';
      job.progress = {
        current: 30,
        total: 100,
        message: 'Decompressing archive and discovering supported source files...',
      };
      job.updatedAt = Date.now();

      const zipService = new ZipIngestionService();
      const ingestion = await zipService.ingestZip(buffer, `${job.owner}-${job.repo}.zip`);

      const fileCount = Object.keys(ingestion.files).length;
      if (fileCount === 0) {
        job.stage = 'failed';
        job.error = `No supported TypeScript/JavaScript files found in '${job.owner}/${job.repo}@${job.branch}'.`;
        job.updatedAt = Date.now();
        return;
      }

      // Stage: Parsing & Extracting
      job.stage = 'parsing';
      job.progress = {
        current: 0,
        total: fileCount,
        message: `Parsing AST across ${fileCount} files...`,
      };
      job.updatedAt = Date.now();

      const analyzer = new CodebaseAnalyzer();
      const projectName = `${job.owner}/${job.repo}`;

      const analysis = analyzer.analyzeProject(projectName, ingestion.files, (stage, prog) => {
        job.stage = stage as JobStage;
        job.progress = prog;
        job.updatedAt = Date.now();
      });

      // Stage: Completed
      analysis.gitMetadata = {
        owner: job.owner,
        repo: job.repo,
        branch: job.branch,
        commitSha: job.commitSha,
        commitUrl: `https://github.com/${job.owner}/${job.repo}/commit/${job.commitSha}`,
        repoUrl: `https://github.com/${job.owner}/${job.repo}`,
      };

      projectStore.saveProject(analysis);

      job.stage = 'completed';
      job.projectId = analysis.projectId;
      job.stats = analysis.stats;
      job.warnings = [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)];
      job.progress = {
        current: fileCount,
        total: fileCount,
        message: `Indexed ${analysis.stats.totalFiles} files, ${analysis.stats.totalSymbols} symbols, and ${analysis.stats.totalRelationships} relationships.`,
      };
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
    } catch (err) {
      job.stage = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.updatedAt = Date.now();
    }
  }
}

const globalJobService = global as unknown as { __analysisJobServiceInstance?: AnalysisJobService };
if (globalJobService.__analysisJobServiceInstance) {
  Object.setPrototypeOf(globalJobService.__analysisJobServiceInstance, AnalysisJobService.prototype);
}
export const analysisJobService =
  globalJobService.__analysisJobServiceInstance || new AnalysisJobService();
if (process.env.NODE_ENV !== 'production') {
  globalJobService.__analysisJobServiceInstance = analysisJobService;
}
