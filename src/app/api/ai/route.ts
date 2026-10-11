import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';
import { AIInvestigatorService } from '@/lib/ai/investigator-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, question, targetEntityId } = body;

    if (!projectId || !question) {
      return NextResponse.json(
        { error: 'projectId and question are required parameters' },
        { status: 400 }
      );
    }

    const project = projectStore.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project '${projectId}' not found` }, { status: 404 });
    }

    const investigator = new AIInvestigatorService(project);
    const result = await investigator.investigate(question, targetEntityId);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI investigation failed' },
      { status: 500 }
    );
  }
}
