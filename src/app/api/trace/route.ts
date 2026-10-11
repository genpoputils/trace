import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';
import { ExecutionPathEngine } from '@/lib/tracing/execution-path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, entityId, direction, maxDepth } = body;

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

    const engine = new ExecutionPathEngine(project);
    const trace = engine.tracePath(entityId, {
      direction: direction === 'backward' ? 'backward' : 'forward',
      maxDepth: maxDepth || 12,
    });

    return NextResponse.json({ trace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Execution path tracing failed' },
      { status: 500 }
    );
  }
}
