import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';
import { ImpactAnalysisService } from '@/lib/impact/impact-analysis';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, entityId } = body;

    if (!projectId || !entityId) {
      return NextResponse.json(
        { error: 'projectId and entityId are required parameters' },
        { status: 400 }
      );
    }

    const project = projectStore.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project '${projectId}' not found` }, { status: 404 });
    }

    const service = new ImpactAnalysisService(project);
    const impactReport = service.analyzeImpact(entityId);

    return NextResponse.json({ impact: impactReport });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impact analysis failed' },
      { status: 500 }
    );
  }
}
