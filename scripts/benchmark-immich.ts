import { githubClient } from '../src/lib/github/github-client';
import { ZipIngestionService } from '../src/lib/ingestion/zip-ingestion';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import dagre from 'dagre';

async function runBenchmark() {
  console.log('=== BENCHMARK: immich-app/immich ANALYSIS LIFECYCLE ===\n');

  const memStart = process.memoryUsage();
  console.log(`Initial RSS: ${(memStart.rss / 1024 / 1024).toFixed(1)} MB, Heap: ${(memStart.heapUsed / 1024 / 1024).toFixed(1)} MB`);

  // Step 1: Commit Resolution & Download
  console.log('\n[1/7] Fetching commit & downloading archive...');
  const t0 = performance.now();
  let archive: { buffer: Buffer; commitSha: string };
  try {
    archive = await githubClient.downloadRepoArchive('immich-app', 'immich', 'main');
  } catch (err: any) {
    console.error('Download failed:', err.message);
    return;
  }
  const t1 = performance.now();
  console.log(`Downloaded in ${((t1 - t0) / 1000).toFixed(2)}s. Commit: ${archive.commitSha.slice(0, 7)}`);
  console.log(`Archive size: ${(archive.buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Step 2: Extraction & Filtering
  console.log('\n[2/7] Extracting ZIP & discovering source files...');
  const zipService = new ZipIngestionService();
  const t2 = performance.now();
  const ingestion = await zipService.ingestZip(archive.buffer, 'immich.zip');
  const t3 = performance.now();
  const totalFiles = Object.keys(ingestion.files).length;
  console.log(`Extracted in ${((t3 - t2) / 1000).toFixed(2)}s.`);
  console.log(`Supported Source Files: ${totalFiles}`);
  console.log(`Skipped Files: ${ingestion.skippedFiles.length}`);
  console.log(`Total Extracted Bytes: ${(ingestion.totalExtractedBytes / 1024 / 1024).toFixed(2)} MB`);
  if (ingestion.warnings.length > 0) {
    console.log(`Ingestion Warnings:`, ingestion.warnings);
  }

  // Step 3: Parsing & Symbol Extraction
  console.log('\n[3/7] Parsing AST & extracting symbols...');
  const analyzer = new CodebaseAnalyzer();
  const t4 = performance.now();
  const analysis = analyzer.analyzeProject('immich-app/immich', ingestion.files);
  const t5 = performance.now();
  console.log(`Analyzed in ${((t5 - t4) / 1000).toFixed(2)}s.`);
  console.log(`Total Symbols (Entities): ${analysis.stats.totalSymbols}`);
  console.log(`Total Relationships: ${analysis.stats.totalRelationships}`);
  console.log(`Total Lines: ${analysis.stats.totalLines.toLocaleString()}`);
  console.log(`Routes: ${analysis.stats.routesCount}, DB Queries: ${analysis.stats.dbQueriesCount}`);

  // Step 4: Serialization Size
  console.log('\n[4/7] Measuring serialization payload size...');
  const jsonString = JSON.stringify(analysis);
  console.log(`Serialized JSON Size: ${(Buffer.byteLength(jsonString, 'utf8') / 1024 / 1024).toFixed(2)} MB`);

  // Check size without file contents
  const withoutFileContents = {
    ...analysis,
    files: Object.fromEntries(
      Object.entries(analysis.files).map(([k, v]) => [k, { ...v, content: '' }])
    ),
  };
  const leanJsonString = JSON.stringify(withoutFileContents);
  console.log(`Lean JSON Size (without full source strings): ${(Buffer.byteLength(leanJsonString, 'utf8') / 1024 / 1024).toFixed(2)} MB`);

  // Step 5: Dagre Layout Simulation
  console.log('\n[5/7] Simulating frontend Graph Layout (Dagre)...');
  const candidateEntities = Object.values(analysis.entities).filter((e) => e.kind !== 'file');
  console.log(`Total non-file entities: ${candidateEntities.length}`);

  // How the current RelationshipGraph filters nodes:
  const topHubIds = new Set(analysis.stats.mostConnected.slice(0, 35).map((m) => m.symbolId));
  for (const e of candidateEntities) {
    if (e.kind === 'route' || e.kind === 'db_query' || e.kind === 'component') topHubIds.add(e.id);
  }
  const currentFilteredNodes = candidateEntities.filter((e) => topHubIds.has(e.id));
  console.log(`Current RelationshipGraph visible nodes count: ${currentFilteredNodes.length}`);

  const entityIds = new Set(currentFilteredNodes.map((n) => n.id));
  const currentFilteredEdges = analysis.relationships.filter(
    (r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId)
  );
  console.log(`Current RelationshipGraph visible edges count: ${currentFilteredEdges.length}`);

  const t6 = performance.now();
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90 });
  currentFilteredNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 240, height: 95 });
  });
  currentFilteredEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.sourceId, edge.targetId);
  });
  dagre.layout(dagreGraph);
  const t7 = performance.now();
  console.log(`Dagre layout calculated in ${((t7 - t6) / 1000).toFixed(2)}s (${(t7 - t6).toFixed(0)} ms).`);

  const memEnd = process.memoryUsage();
  console.log(`\nFinal RSS: ${(memEnd.rss / 1024 / 1024).toFixed(1)} MB, Heap: ${(memEnd.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  console.log('\n=== BENCHMARK COMPLETE ===');
}

runBenchmark().catch(console.error);
