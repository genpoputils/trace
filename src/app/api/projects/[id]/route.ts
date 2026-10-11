import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const project = projectStore.getProject(id);

    if (!project) {
      return NextResponse.json({ error: `Project '${id}' not found` }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch project' },
      { status: 500 }
    );
  }
}
