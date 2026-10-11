import { NextRequest, NextResponse } from 'next/server';
import { ZipIngestionService } from '@/lib/ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '@/lib/analyzer/codebase-analyzer';
import { projectStore } from '@/lib/storage/project-store';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'Only .zip archives are supported' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const zipService = new ZipIngestionService();
    const ingestion = await zipService.ingestZip(buffer, file.name);

    if (Object.keys(ingestion.files).length === 0) {
      return NextResponse.json(
        {
          error: 'No supported JavaScript or TypeScript source files found in the archive.',
          skippedFiles: ingestion.skippedFiles,
          warnings: ingestion.warnings,
        },
        { status: 422 }
      );
    }

    const analyzer = new CodebaseAnalyzer();
    const analysis = analyzer.analyzeProject(ingestion.projectName, ingestion.files);

    projectStore.saveProject(analysis);

    return NextResponse.json({
      success: true,
      projectId: analysis.projectId,
      projectName: analysis.projectName,
      stats: analysis.stats,
      skippedFilesCount: ingestion.skippedFiles.length,
      skippedFiles: ingestion.skippedFiles.slice(0, 50),
      warnings: [...ingestion.warnings, ...analysis.warnings.map((w) => w.message)],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal upload and analysis error' },
      { status: 500 }
    );
  }
}
