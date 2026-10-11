import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';
import { DataFlowEngine } from '@/lib/dataflow/dataflow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, symbolOrEntityId } = body;

    if (!projectId || !symbolOrEntityId) {
      return NextResponse.json(
        { error: 'projectId and symbolOrEntityId are required parameters' },
        { status: 400 }
      );
    }

    const project = projectStore.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project '${projectId}' not found` }, { status: 404 });
    }

    const engine = new DataFlowEngine(project);
    const flowTrace = engine.traceDataFlow(symbolOrEntityId);

    return NextResponse.json({ dataFlow: flowTrace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Data flow analysis failed' },
      { status: 500 }
    );
  }
}
