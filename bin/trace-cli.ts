#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { ExecutionPathEngine } from '../src/lib/tracing/execution-path';
import { ImpactAnalysisService } from '../src/lib/impact/impact-analysis';
import { FileRecord } from '../src/lib/types/trace';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.cache',
]);

const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);

function scanDirectory(dir: string, baseDir: string = dir): Record<string, FileRecord> {
  const records: Record<string, FileRecord> = {};
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        Object.assign(records, scanDirectory(fullPath, baseDir));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n').length;
          const stat = fs.statSync(fullPath);
          records[relPath] = {
            path: relPath,
            content,
            lines,
            size: stat.size,
            language: ext.includes('ts') ? 'typescript' : ext.includes('json') ? 'json' : 'javascript',
          };
        } catch {
          // ignore unreadable
        }
      }
    }
  }

  return records;
}

async function runCli() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || '.';

  const resolvedDir = path.resolve(process.cwd(), targetDir);

  if (!fs.existsSync(resolvedDir)) {
    console.error(`Error: Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🔍 GenPopUtils Trace — Codebase Intelligence Engine`);
  console.log(`======================================================\n`);
  console.log(`Scanning directory: ${resolvedDir}...`);

  const files = scanDirectory(resolvedDir);
  const fileCount = Object.keys(files).length;

  if (fileCount === 0) {
    console.warn(`No supported JavaScript/TypeScript files found in ${resolvedDir}.`);
    process.exit(0);
  }

  console.log(`Found ${fileCount} supported source files. Analyzing AST and relationships...\n`);

  const analyzer = new CodebaseAnalyzer();
  const projectName = path.basename(resolvedDir);
  const analysis = analyzer.analyzeProject(projectName, files);

  console.log(`------------------------------------------------------`);
  console.log(`📊 Project Overview: ${analysis.projectName}`);
  console.log(`------------------------------------------------------`);
  console.log(`• Total Files:        ${analysis.stats.totalFiles}`);
  console.log(`• Total Lines:        ${analysis.stats.totalLines}`);
  console.log(`• Languages:          ${analysis.stats.languages.join(', ')}`);
  console.log(`• Identified Symbols: ${analysis.stats.totalSymbols}`);
  console.log(`• Relationships:      ${analysis.stats.totalRelationships}`);
  console.log(`• API Routes:         ${analysis.stats.routesCount}`);
  console.log(`• Database Queries:   ${analysis.stats.dbQueriesCount}`);
  console.log(`• Unresolved Calls:   ${analysis.stats.unresolvedCalls}`);

  console.log(`\n🏆 Most Connected Hubs & Core Functions:`);
  for (const hub of analysis.stats.mostConnected.slice(0, 8)) {
    console.log(`  - ${hub.name.padEnd(28)} [${hub.kind}] | in: ${hub.inboundCount}, out: ${hub.outboundCount} (${hub.filePath})`);
  }

  // Check CLI flags
  const traceArgIdx = args.indexOf('--trace');
  if (traceArgIdx !== -1 && args[traceArgIdx + 1]) {
    const symbolToTrace = args[traceArgIdx + 1];
    const ent = Object.values(analysis.entities).find((e) => e.name === symbolToTrace);
    if (!ent) {
      console.log(`\nSymbol '${symbolToTrace}' not found for execution path tracing.`);
    } else {
      console.log(`\n⚡ Statically Inferred Execution Path for '${symbolToTrace}':`);
      const engine = new ExecutionPathEngine(analysis);
      const pathResult = engine.tracePath(ent.id, { direction: 'forward' });
      for (const step of pathResult.steps) {
        const ind = '  '.repeat(step.depth + 1);
        console.log(`${ind}${step.order}. ${step.entityName} [${step.kind}] (${step.filePath}:${step.location.startLine})`);
      }
    }
  }

  const impactArgIdx = args.indexOf('--impact');
  if (impactArgIdx !== -1 && args[impactArgIdx + 1]) {
    const symbolForImpact = args[impactArgIdx + 1];
    const ent = Object.values(analysis.entities).find((e) => e.name === symbolForImpact);
    if (!ent) {
      console.log(`\nSymbol '${symbolForImpact}' not found for impact analysis.`);
    } else {
      console.log(`\n💥 Change Impact Blast Radius for '${symbolForImpact}':`);
      const impactService = new ImpactAnalysisService(analysis);
      const report = impactService.analyzeImpact(ent.id);
      console.log(`• Overall Severity:  ${report.overallSeverity.toUpperCase()} (${report.blastRadiusScore}/100)`);
      console.log(`• Direct Callers:    ${report.directImpacts.length}`);
      console.log(`• Indirect Callers:  ${report.transitiveImpacts.length}`);
      console.log(`• Affected Routes:   ${report.affectedRoutes.length}`);
      console.log(`• Affected Tests:    ${report.affectedTests.length}`);
    }
  }

  const jsonArgIdx = args.indexOf('--json');
  if (jsonArgIdx !== -1 && args[jsonArgIdx + 1]) {
    const outPath = path.resolve(process.cwd(), args[jsonArgIdx + 1]);
    fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2), 'utf8');
    console.log(`\nSaved analysis JSON to: ${outPath}`);
  }

  console.log(`\nDone! Run 'npm run dev' to explore with interactive graph visualization.\n`);
}

runCli().catch((err) => {
  console.error('CLI Execution failed:', err);
  process.exit(1);
});
