import { NextRequest, NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';
import { ZipIngestionService } from '@/lib/ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '@/lib/analyzer/codebase-analyzer';
import { projectStore } from '@/lib/storage/project-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, branch = 'main' } = body;

    if (!owner || !repo) {
      return NextResponse.json({ error: 'owner and repo are required parameters' }, { status: 400 });
    }

    const tokenFromCookie = req.cookies.get('gh_token')?.value;
    const token = body.token || tokenFromCookie;

    // 1. Download repository archive from GitHub
    const { buffer, commitSha } = await githubClient.downloadRepoArchive(owner, repo, branch, token);

    // 2. Safely decompress and validate files
    const zipService = new ZipIngestionService();
    const ingestion = await zipService.ingestZip(buffer, `${owner}-${repo}.zip`);

    if (Object.keys(ingestion.files).length === 0) {
      return NextResponse.json(
        {
          error: `No supported TypeScript/JavaScript files found in '${owner}/${repo}@${branch}'.`,
          skippedFiles: ingestion.skippedFiles,
        },
        { status: 422 }
      );
    }

    // 3. Run static analysis
    const analyzer = new CodebaseAnalyzer();
    const projectName = `${owner}/${repo}`;
    const analysis = analyzer.analyzeProject(projectName, ingestion.files);

    // 4. Attach Git & Commit metadata
    analysis.gitMetadata = {
      owner,
      repo,
      branch,
      commitSha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
    };

    projectStore.saveProject(analysis);

    return NextResponse.json({
      success: true,
      projectId: analysis.projectId,
      projectName: analysis.projectName,
      commitSha,
      shortSha: commitSha.slice(0, 7),
      branch,
      stats: analysis.stats,
      warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
    });
  } catch (error) {
    console.error('GitHub analysis failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze GitHub repository' },
      { status: 500 }
    );
  }
}
