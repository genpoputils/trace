import { NextRequest, NextResponse } from 'next/server';
import { analysisJobService } from '@/lib/analysis/analysis-job-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, branch = 'main', sync = false } = body;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'owner and repo are required parameters' },
        { status: 400 }
      );
    }

    const tokenFromCookie = req.cookies.get('gh_token')?.value;
    const token = body.token || tokenFromCookie;

    const result = await analysisJobService.startOrGetJob(owner, repo, branch, token);

    // If synchronous execution was explicitly requested (e.g. for testing/compatibility)
    if (sync) {
      const maxWaitMs = 180000;
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const job = analysisJobService.getJob(result.jobId);
        if (job) {
          if (job.stage === 'completed') {
            return NextResponse.json({
              success: true,
              jobId: job.id,
              projectId: job.projectId,
              projectName: `${owner}/${repo}`,
              commitSha: job.commitSha,
              shortSha: job.shortSha,
              branch,
              stats: job.stats,
              warnings: job.warnings || [],
              cached: result.cached || false,
            });
          }
          if (job.stage === 'failed') {
            return NextResponse.json(
              { error: job.error || 'Repository analysis failed' },
              { status: 500 }
            );
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return NextResponse.json(
        { error: 'Analysis timed out during synchronous wait.' },
        { status: 504 }
      );
    }

    // By default: Return job ID immediately (<100ms) for responsive background processing
    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      status: result.status,
      projectId: result.projectId,
      cached: result.cached || false,
    });
  } catch (error) {
    console.error('GitHub analysis enqueue failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze GitHub repository' },
      { status: 500 }
    );
  }
}
