import { ProjectAnalysis } from '../types/trace';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer';
import { SAMPLE_ECOMMERCE_API } from '../fixtures/sample-codebases';

class ProjectStore {
  private projects: Map<string, ProjectAnalysis> = new Map();
  private analyzer: CodebaseAnalyzer;

  constructor() {
    this.analyzer = new CodebaseAnalyzer();
    // Pre-populate with default sample e-commerce project
    this.seedDefaultProject();
  }

  private seedDefaultProject() {
    const analysis = this.analyzer.analyzeProject(
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
    this.projects.set(analysis.projectId, analysis);
  }

  public getProject(projectId: string): ProjectAnalysis | null {
    if (this.projects.has(projectId)) {
      return this.projects.get(projectId)!;
    }
    if (projectId === 'sample-ecommerce-api') {
      this.seedDefaultProject();
      return this.projects.get('sample-ecommerce-api')!;
    }
    return null;
  }

  public saveProject(analysis: ProjectAnalysis): void {
    this.projects.set(analysis.projectId, analysis);
  }

  public findProjectByCommit(owner: string, repo: string, commitSha: string): ProjectAnalysis | null {
    const o = owner.toLowerCase();
    const r = repo.toLowerCase();
    for (const project of this.projects.values()) {
      if (
        project.gitMetadata?.owner &&
        project.gitMetadata?.repo &&
        project.gitMetadata.owner.toLowerCase() === o &&
        project.gitMetadata.repo.toLowerCase() === r &&
        project.gitMetadata.commitSha === commitSha
      ) {
        return project;
      }
    }
    return null;
  }

  public listProjects(): { id: string; name: string; filesCount: number; symbolsCount: number; analyzedAt: string }[] {
    if (this.projects.size === 0) {
      this.seedDefaultProject();
    }
    return Array.from(this.projects.values()).map((p) => ({
      id: p.projectId,
      name: p.projectName,
      filesCount: p.stats.totalFiles,
      symbolsCount: p.stats.totalSymbols,
      analyzedAt: p.analyzedAt,
    }));
  }

  public deleteProject(projectId: string): boolean {
    return this.projects.delete(projectId);
  }
}

// Global singleton instance across Next.js API calls in dev/prod
const globalStore = global as unknown as { __projectStoreInstance?: ProjectStore };
if (globalStore.__projectStoreInstance) {
  Object.setPrototypeOf(globalStore.__projectStoreInstance, ProjectStore.prototype);
}
export const projectStore = globalStore.__projectStoreInstance || new ProjectStore();
if (process.env.NODE_ENV !== 'production') {
  globalStore.__projectStoreInstance = projectStore;
}
