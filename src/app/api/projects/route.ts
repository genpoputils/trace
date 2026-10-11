import { NextResponse } from 'next/server';
import { projectStore } from '@/lib/storage/project-store';

export async function GET() {
  try {
    const list = projectStore.listProjects();
    return NextResponse.json({ projects: list });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list projects' },
      { status: 500 }
    );
  }
}
