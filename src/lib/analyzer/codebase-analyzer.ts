import path from 'path';
import {
  FileRecord,
  ProjectAnalysis,
  TraceEntity,
  TraceRelationship,
  AnalysisWarning,
  EntityKind,
} from '../types/trace';
import { TypeScriptAdapter, FileAnalysisOutput } from './typescript-adapter';

export class CodebaseAnalyzer {
  private tsAdapter: TypeScriptAdapter;

  constructor() {
    this.tsAdapter = new TypeScriptAdapter();
  }

  /**
   * Run full static analysis on a collection of files
   */
  public analyzeProject(
    projectName: string,
    files: Record<string, FileRecord>
  ): ProjectAnalysis {
    const allEntities: Record<string, TraceEntity> = {};
    const allRelationships: TraceRelationship[] = [];
    const allWarnings: AnalysisWarning[] = [];
    const fileOutputs: Record<string, FileAnalysisOutput> = {};
    const languagesSet = new Set<string>();

    let unresolvedCount = 0;

    // Phase 1: Per-file AST parsing
    for (const [filePath, fileRecord] of Object.entries(files)) {
      if (this.tsAdapter.supports(filePath)) {
        languagesSet.add(fileRecord.language);
        try {
          const output = this.tsAdapter.analyzeFile(fileRecord);
          fileOutputs[filePath] = output;

          // Register file entity
          allEntities[output.fileEntity.id] = output.fileEntity;

          // Register child entities
          for (const ent of output.entities) {
            allEntities[ent.id] = ent;
          }

          // Register intra-file relationships
          for (const rel of output.relationships) {
            allRelationships.push(rel);
          }

          for (const w of output.warnings) {
            allWarnings.push(w);
          }

          unresolvedCount += output.unresolvedCalls.length;
        } catch (err) {
          allWarnings.push({
            filePath,
            message: `Failed to parse AST: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'error',
          });
        }
      } else {
        // Non-JS/TS file (e.g. JSON, markdown, config)
        languagesSet.add(fileRecord.language);
        const lines = fileRecord.content.split('\n');
        const fileEnt: TraceEntity = {
          id: `${filePath}#file#${filePath}#1`,
          name: filePath.split('/').pop() || filePath,
          kind: 'file',
          filePath,
          location: {
            filePath,
            startLine: 1,
            endLine: lines.length || 1,
            startColumn: 1,
            endColumn: (lines[lines.length - 1] || '').length + 1,
          },
          isExported: false,
          snippet: lines.slice(0, 10).join('\n'),
        };
        allEntities[fileEnt.id] = fileEnt;
      }
    }

    // Phase 2: Cross-Module Import Resolution
    const resolvedRelationships: TraceRelationship[] = [];

    for (const rel of allRelationships) {
      if (rel.targetId.startsWith('__import__:')) {
        // Format: __import__:sourceModule:symbolName
        const parts = rel.targetId.split(':');
        const sourceModule = parts[1];
        const symbolName = parts.slice(2).join(':'); // may be "obj.method" or "symbolName"

        const sourceEntity = allEntities[rel.sourceId];
        const sourceFilePath = sourceEntity ? sourceEntity.filePath : '';

        const resolvedTargetId = this.resolveCrossModuleSymbol(
          sourceFilePath,
          sourceModule,
          symbolName,
          files,
          fileOutputs,
          allEntities
        );

        if (resolvedTargetId && allEntities[resolvedTargetId]) {
          resolvedRelationships.push({
            ...rel,
            targetId: resolvedTargetId,
            confidence: 'statically_resolved',
            notes: `Statically linked call to ${allEntities[resolvedTargetId].name} in ${allEntities[resolvedTargetId].filePath}`,
          });
        } else {
          // If it is an external package (e.g. axios, lodash, express)
          if (!sourceModule.startsWith('.')) {
            const extId = `external#${sourceModule}#${symbolName}`;
            if (!allEntities[extId]) {
              allEntities[extId] = {
                id: extId,
                name: `${sourceModule}.${symbolName}`,
                kind: 'external_api',
                filePath: `node_modules/${sourceModule}`,
                location: { filePath: sourceModule, startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
                isExported: true,
                metadata: { package: sourceModule },
              };
            }
            resolvedRelationships.push({
              ...rel,
              targetId: extId,
              confidence: 'inferred',
              notes: `Call to external package ${sourceModule}`,
            });
          } else {
            // Local file that could not be resolved
            unresolvedCount++;
            resolvedRelationships.push({
              ...rel,
              confidence: 'dynamic_unresolved',
              notes: `Could not statically link export '${symbolName}' in module '${sourceModule}'`,
            });
          }
        }
      } else if (rel.targetId.startsWith('__inferred__:')) {
        const symbolExpr = rel.targetId.replace('__inferred__:', '');
        // Search if any entity matches this symbolExpr
        const matched = Object.values(allEntities).find((e) => e.name === symbolExpr);
        if (matched) {
          resolvedRelationships.push({
            ...rel,
            targetId: matched.id,
            confidence: 'inferred',
            notes: `Inferred call matching symbol ${symbolExpr}`,
          });
        } else {
          unresolvedCount++;
          resolvedRelationships.push({
            ...rel,
            confidence: 'dynamic_unresolved',
            notes: `Unresolved call: ${symbolExpr}`,
          });
        }
      } else {
        // Direct relationship already resolved
        resolvedRelationships.push(rel);
      }
    }

    // Phase 3: Route-to-Handler Linkage
    // Link route entities to the function/handler they invoke
    for (const entity of Object.values(allEntities)) {
      if (entity.kind === 'route') {
        // Look for calls made from within this route
        const routeCalls = resolvedRelationships.filter(
          (r) => r.sourceId === entity.id && r.kind === 'calls'
        );

        for (const call of routeCalls) {
          if (allEntities[call.targetId]) {
            resolvedRelationships.push({
              id: `${entity.id}->routes_to->${call.targetId}`,
              sourceId: entity.id,
              targetId: call.targetId,
              kind: 'routes_to',
              confidence: 'statically_resolved',
              location: entity.location,
              notes: `Route ${entity.name} executes handler ${allEntities[call.targetId].name}`,
            });
          }
        }
      }
    }

    // Phase 4: Calculate connectivity & Centrality Metrics
    const inboundCounts: Record<string, number> = {};
    const outboundCounts: Record<string, number> = {};

    for (const r of resolvedRelationships) {
      if (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'reads_from') {
        outboundCounts[r.sourceId] = (outboundCounts[r.sourceId] || 0) + 1;
        inboundCounts[r.targetId] = (inboundCounts[r.targetId] || 0) + 1;
      }
    }

    const mostConnected = Object.values(allEntities)
      .filter((e) => e.kind !== 'file')
      .map((e) => {
        const inCount = inboundCounts[e.id] || 0;
        const outCount = outboundCounts[e.id] || 0;
        return {
          symbolId: e.id,
          name: e.name,
          kind: e.kind,
          filePath: e.filePath,
          inboundCount: inCount,
          outboundCount: outCount,
          totalDegree: inCount + outCount,
        };
      })
      .sort((a, b) => b.totalDegree - a.totalDegree)
      .slice(0, 15);

    const routesCount = Object.values(allEntities).filter((e) => e.kind === 'route').length;
    const dbQueriesCount = Object.values(allEntities).filter((e) => e.kind === 'db_query').length;
    const totalLines = Object.values(files).reduce((acc, f) => acc + f.lines, 0);

    return {
      projectId: `proj_${Date.now()}`,
      projectName,
      analyzedAt: new Date().toISOString(),
      version: '1.0.0',
      stats: {
        totalFiles: Object.keys(files).length,
        totalLines,
        languages: Array.from(languagesSet),
        totalSymbols: Object.keys(allEntities).length,
        totalRelationships: resolvedRelationships.length,
        unresolvedCalls: unresolvedCount,
        routesCount,
        dbQueriesCount,
        mostConnected,
      },
      entities: allEntities,
      relationships: resolvedRelationships,
      files,
      warnings: allWarnings,
      limitations: [
        'Interprocedural static analysis only — dynamic runtime dispatch (eval, reflect) is flagged as dynamic_unresolved.',
        'External library types and internals are represented as boundary nodes.',
        'Conditional branches and exception paths are statically detected as potential branches without runtime predicate evaluation.',
      ],
    };
  }

  /**
   * Resolve an import specifier to a concrete target entity in the target file
   */
  private resolveCrossModuleSymbol(
    sourceFilePath: string,
    moduleSpecifier: string,
    symbolName: string,
    files: Record<string, FileRecord>,
    fileOutputs: Record<string, FileAnalysisOutput>,
    allEntities: Record<string, TraceEntity>
  ): string | null {
    if (!moduleSpecifier.startsWith('.')) {
      return null;
    }

    // Resolve relative path
    const dir = path.dirname(sourceFilePath);
    const resolvedBase = path.normalize(path.join(dir, moduleSpecifier)).replace(/\\/g, '/');

    // Candidate file extensions
    const candidates = [
      resolvedBase,
      `${resolvedBase}.ts`,
      `${resolvedBase}.tsx`,
      `${resolvedBase}.js`,
      `${resolvedBase}.jsx`,
      `${resolvedBase}/index.ts`,
      `${resolvedBase}/index.tsx`,
      `${resolvedBase}/index.js`,
    ];

    let targetFile: string | null = null;
    for (const c of candidates) {
      if (files[c]) {
        targetFile = c;
        break;
      }
    }

    if (!targetFile) return null;

    const output = fileOutputs[targetFile];
    if (!output) return null;

    // If symbolName has a dot e.g. "orderService.createOrder"
    const isMethod = symbolName.includes('.');
    const cleanSymbolName = isMethod ? symbolName.split('.').pop()! : symbolName;

    // Search among entities in the target file
    for (const entity of output.entities) {
      if (entity.name === symbolName || entity.name === cleanSymbolName) {
        return entity.id;
      }
      if (symbolName === 'default' && entity.isExported) {
        return entity.id;
      }
    }

    return null;
  }
}
