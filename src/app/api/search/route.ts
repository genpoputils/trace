import { NextRequest, NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';
import { SearchService } from '@/lib/search/search-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, term, kinds, filePattern, limit } = body;

    if (!projectId || !term) {
      return NextResponse.json(
        { error: 'projectId and term are required parameters' },
        { status: 400 }
      );
    }

    const project = projectStore.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project '${projectId}' not found` }, { status: 404 });
    }

    const service = new SearchService(project);
    const results = service.search({
      term,
      kinds,
      filePattern,
      limit: limit || 30,
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
