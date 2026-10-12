import { browserPath as path } from '../utils/browser-path';
import {
  FileRecord,
  ProjectAnalysis,
  TraceEntity,
  TraceRelationship,
  AnalysisWarning,
} from '../types/trace';
import { TypeScriptAdapter, FileAnalysisOutput } from './typescript-adapter';
import { EcosystemRegistry } from '../dependencies/registry';

export type AnalyzerProgressCallback = (
  stage: string,
  progress: { current: number; total: number; message: string }
) => void;

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
    files: Record<string, FileRecord>,
    onProgress?: AnalyzerProgressCallback
  ): ProjectAnalysis {
    const allEntities: Record<string, TraceEntity> = {};
    const entitiesByName = new Map<string, TraceEntity[]>();
    const allRelationships: TraceRelationship[] = [];
    const allWarnings: AnalysisWarning[] = [];
    const fileOutputs: Record<string, FileAnalysisOutput> = {};
    const languagesSet = new Set<string>();

    const registerEntity = (entity: TraceEntity) => {
      allEntities[entity.id] = entity;
      const existing = entitiesByName.get(entity.name);
      if (existing) {
        existing.push(entity);
      } else {
        entitiesByName.set(entity.name, [entity]);
      }
    };

    let unresolvedCount = 0;

    const fileEntries = Object.entries(files);
    const totalFiles = fileEntries.length;
    let processedFiles = 0;

    // Phase 1: Per-file AST parsing
    for (const [filePath, fileRecord] of fileEntries) {
      processedFiles++;
      if (processedFiles % 25 === 0 || processedFiles === totalFiles) {
        onProgress?.('parsing', {
          current: processedFiles,
          total: totalFiles,
          message: `Parsed AST for ${processedFiles} / ${totalFiles} files...`,
        });
      }

      if (this.tsAdapter.supports(filePath)) {
        languagesSet.add(fileRecord.language);
        try {
          const output = this.tsAdapter.analyzeFile(fileRecord);
          fileOutputs[filePath] = output;

          // Register file entity
          registerEntity(output.fileEntity);

          // Register child entities
          for (const ent of output.entities) {
            registerEntity(ent);
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
        registerEntity(fileEnt);
      }
    }

    // Phase 2: Cross-Module Import Resolution
    onProgress?.('resolving', {
      current: 0,
      total: allRelationships.length,
      message: `Resolving dependencies across ${allRelationships.length} relationships...`,
    });

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
          fileOutputs
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
              const extEntity: TraceEntity = {
                id: extId,
                name: `${sourceModule}.${symbolName}`,
                kind: 'external_api',
                filePath: `node_modules/${sourceModule}`,
                location: { filePath: sourceModule, startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
                isExported: true,
                metadata: { package: sourceModule },
              };
              registerEntity(extEntity);
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
        // Search if any entity matches this symbolExpr using O(1) map
        const matches = entitiesByName.get(symbolExpr);
        const matched = matches && matches.length > 0 ? matches[0] : undefined;
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
    // Pre-index calls by sourceId to avoid O(R * N) quadratic loop
    const callsBySourceId = new Map<string, TraceRelationship[]>();
    for (const r of resolvedRelationships) {
      if (r.kind === 'calls') {
        const list = callsBySourceId.get(r.sourceId);
        if (list) {
          list.push(r);
        } else {
          callsBySourceId.set(r.sourceId, [r]);
        }
      }
    }

    for (const entity of Object.values(allEntities)) {
      if (entity.kind === 'route') {
        const routeCalls = callsBySourceId.get(entity.id) || [];
        const seenTargets = new Set<string>();
        for (const call of routeCalls) {
          if (allEntities[call.targetId] && !seenTargets.has(call.targetId)) {
            seenTargets.add(call.targetId);
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

    // Ensure all relationships have strictly unique IDs
    const uniqueResolvedRelationships: TraceRelationship[] = [];
    const seenRelIds = new Set<string>();
    for (const r of resolvedRelationships) {
      let finalId = r.id;
      if (seenRelIds.has(finalId)) {
        let counter = 2;
        while (seenRelIds.has(`${r.id}_${counter}`)) {
          counter++;
        }
        finalId = `${r.id}_${counter}`;
      }
      seenRelIds.add(finalId);
      if (finalId !== r.id) {
        uniqueResolvedRelationships.push({ ...r, id: finalId });
      } else {
        uniqueResolvedRelationships.push(r);
      }
    }

    // Phase 4: Calculate connectivity & Centrality Metrics
    onProgress?.('preparing', {
      current: 1,
      total: 1,
      message: 'Preparing graph centrality and metrics...',
    });
    const inboundCounts: Record<string, number> = {};
    const outboundCounts: Record<string, number> = {};

    for (const r of uniqueResolvedRelationships) {
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

    // Phase 5: Multi-Ecosystem Dependency Intelligence Scan
    const depScanner = EcosystemRegistry.getInstance();
    const depResult = depScanner.scanRepositorySync(files, allEntities);
    if (depResult.discoveredFiles.length > 0) {
      for (const diag of depResult.diagnostics) {
        if (diag.severity === 'error' || diag.severity === 'warning') {
          allWarnings.push({
            filePath: diag.filePath,
            message: `[${diag.code}] ${diag.message}`,
            severity: diag.severity,
          });
        }
      }
    }

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
        totalRelationships: uniqueResolvedRelationships.length,
        unresolvedCalls: unresolvedCount,
        routesCount,
        dbQueriesCount,
        mostConnected,
      },
      entities: allEntities,
      relationships: uniqueResolvedRelationships,
      files,
      warnings: allWarnings,
      limitations: [
        'Interprocedural static analysis only — dynamic runtime dispatch (eval, reflect) is flagged as dynamic_unresolved.',
        'External library types and internals are represented as boundary nodes.',
        'Conditional branches and exception paths are statically detected as potential branches without runtime predicate evaluation.',
      ],
      dependencies: depResult,
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
    fileOutputs: Record<string, FileAnalysisOutput>
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
