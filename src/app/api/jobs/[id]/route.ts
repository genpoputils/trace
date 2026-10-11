import { NextRequest, NextResponse } from 'next/server';
import { analysisJobService } from '@/lib/analysis/analysis-job-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = analysisJobService.getJob(id);

    if (!job) {
      return NextResponse.json({ error: `Job '${id}' not found.` }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Failed to get job status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
