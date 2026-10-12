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

export interface AnalyzerOptions {
  signal?: AbortSignal;
  cancellationToken?: { isCancelled?: boolean };
}

export class CodebaseAnalyzer {
  private tsAdapter: TypeScriptAdapter;

  constructor() {
    this.tsAdapter = new TypeScriptAdapter();
  }

  /**
   * Run full static analysis synchronously (for tests or synchronous fallback)
   */
  public analyzeProject(
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: AnalyzerProgressCallback,
    options?: AnalyzerOptions
  ): ProjectAnalysis {
    return this.runPipeline(false, projectName, files, onProgress, options) as ProjectAnalysis;
  }

  /**
   * Run full static analysis cooperatively and asynchronously (yields to event loop for cancellation and browser responsiveness)
   */
  public async analyzeProjectAsync(
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: AnalyzerProgressCallback,
    options?: AnalyzerOptions
  ): Promise<ProjectAnalysis> {
    return this.runPipeline(true, projectName, files, onProgress, options) as Promise<ProjectAnalysis>;
  }

  private runPipeline(
    isAsync: boolean,
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: AnalyzerProgressCallback,
    options?: AnalyzerOptions
  ): ProjectAnalysis | Promise<ProjectAnalysis> {
    const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const checkCancellation = () => {
      if (options?.signal?.aborted || options?.cancellationToken?.isCancelled) {
        throw new Error('Analysis cancelled by user.');
      }
    };

    const execute = async (): Promise<ProjectAnalysis> => {
      const startTime = performance.now();
      const stageDurations: Record<string, number> = {};

      checkCancellation();

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

      const fileEntries = Object.entries(files);
      const totalFiles = fileEntries.length;
      let processedFiles = 0;

      // Phase 1: Per-file AST parsing
      const parsingStart = performance.now();
      for (const [filePath, fileRecord] of fileEntries) {
        checkCancellation();
        processedFiles++;
        if (processedFiles % 15 === 0 || processedFiles === totalFiles) {
          onProgress?.('parsing', {
            current: processedFiles,
            total: totalFiles,
            message: `Parsed AST for ${processedFiles} / ${totalFiles} files...`,
          });
          if (isAsync) {
            await yieldToEventLoop();
          }
        }

        if (this.tsAdapter.supports(filePath)) {
          languagesSet.add(fileRecord.language);
          try {
            const output = this.tsAdapter.analyzeFile(fileRecord);
            fileOutputs[filePath] = output;

            registerEntity(output.fileEntity);
            for (const ent of output.entities) {
              registerEntity(ent);
            }
            for (const rel of output.relationships) {
              allRelationships.push(rel);
            }
            for (const warn of output.warnings) {
              allWarnings.push(warn);
            }
          } catch (err) {
            allWarnings.push({
              filePath,
              message: `Failed to parse AST: ${err instanceof Error ? err.message : String(err)}`,
              severity: 'error',
            });
          }
        } else {
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
      stageDurations.parsing = Math.round((performance.now() - parsingStart) * 100) / 100;

      checkCancellation();
      if (isAsync) {
        await yieldToEventLoop();
      }

      // Phase 2: Cross-Module Import Resolution
      const resolvingStart = performance.now();
      onProgress?.('resolving', {
        current: 0,
        total: allRelationships.length,
        message: `Resolving dependencies across ${allRelationships.length} relationships...`,
      });

      const resolvedRelationships: TraceRelationship[] = [];
      let unresolvedCount = 0;
      let relIndex = 0;

      for (const rel of allRelationships) {
        relIndex++;
        if (relIndex % 50 === 0 || relIndex === allRelationships.length) {
          checkCancellation();
          onProgress?.('resolving', {
            current: relIndex,
            total: allRelationships.length,
            message: `Resolved ${relIndex} / ${allRelationships.length} relationships...`,
          });
          if (isAsync) {
            await yieldToEventLoop();
          }
        }

        if (rel.targetId.startsWith('__import__:')) {
          const parts = rel.targetId.split(':');
          const sourceModule = parts[1];
          const symbolName = parts.slice(2).join(':');

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
          resolvedRelationships.push(rel);
        }
      }

      // Phase 3: Route-to-Handler Linkage
      this.linkRouteHandlers(resolvedRelationships, allEntities);

      // Deduplicate relationships
      const uniqueResolvedRelationships = this.deduplicateRelationships(resolvedRelationships);
      stageDurations.resolution = Math.round((performance.now() - resolvingStart) * 100) / 100;

      checkCancellation();
      if (isAsync) {
        await yieldToEventLoop();
      }

      // Phase 4: Graph metrics & Centrality (Notice: emits 'centrality' matching stage ID)
      const centralityStart = performance.now();
      onProgress?.('centrality', {
        current: 1,
        total: 1,
        message: 'Calculating graph centrality and connectivity metrics...',
      });

      const { mostConnected } = this.calculateCentrality(uniqueResolvedRelationships, allEntities);
      const routesCount = Object.values(allEntities).filter((e) => e.kind === 'route').length;
      const dbQueriesCount = Object.values(allEntities).filter((e) => e.kind === 'db_query').length;
      const totalLines = Object.values(files).reduce((acc, f) => acc + f.lines, 0);
      stageDurations.centrality = Math.round((performance.now() - centralityStart) * 100) / 100;

      checkCancellation();
      if (isAsync) {
        await yieldToEventLoop();
      }

      // Phase 5: Multi-Ecosystem Dependency Intelligence Scan
      const depStart = performance.now();
      onProgress?.('dependencies', {
        current: 0,
        total: 1,
        message: 'Scanning dependency manifests across ecosystems...',
      });

      const depScanner = EcosystemRegistry.getInstance();
      const depResult = depScanner.scanRepositorySync(files, allEntities);
      const discoveredManifestCount = depResult.discoveredFiles.length;

      onProgress?.('dependencies', {
        current: discoveredManifestCount,
        total: Math.max(1, discoveredManifestCount),
        message: `Scanned ${discoveredManifestCount} package manifest(s)...`,
      });

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
      stageDurations.dependencies = Math.round((performance.now() - depStart) * 100) / 100;

      checkCancellation();
      if (isAsync) {
        await yieldToEventLoop();
      }

      // Phase 6: Finalisation
      onProgress?.('finalisation', {
        current: totalFiles,
        total: totalFiles,
        message: 'Finalising project analysis and metrics index...',
      });

      const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const errorCount = allWarnings.filter((w) => w.severity === 'error').length;
      const isPartial = errorCount > 0;
      const partialReason = isPartial
        ? `${errorCount} parsing or dependency diagnostic error(s) occurred. Some relationships or files may be incomplete.`
        : undefined;

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
        isPartial,
        partialReason,
        analysisMetadata: {
          stageDurations,
          totalDurationMs,
          workerUsed: false,
          timestamp: new Date().toISOString(),
        },
      };
    };

    if (isAsync) {
      return execute();
    }

    // Synchronous execution path: run directly
    // Because execute is async, we can run synchronous logic when isAsync is false:
    // To ensure 100% synchronous execution for callers of analyzeProject:
    return this.runPureSync(projectName, files, onProgress, options);
  }

  private runPureSync(
    projectName: string,
    files: Record<string, FileRecord>,
    onProgress?: AnalyzerProgressCallback,
    options?: AnalyzerOptions
  ): ProjectAnalysis {
    const startTime = performance.now();
    const stageDurations: Record<string, number> = {};

    const checkCancellation = () => {
      if (options?.signal?.aborted || options?.cancellationToken?.isCancelled) {
        throw new Error('Analysis cancelled by user.');
      }
    };

    checkCancellation();

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

    const fileEntries = Object.entries(files);
    const totalFiles = fileEntries.length;
    let processedFiles = 0;

    const parsingStart = performance.now();
    for (const [filePath, fileRecord] of fileEntries) {
      checkCancellation();
      processedFiles++;
      if (processedFiles % 15 === 0 || processedFiles === totalFiles) {
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
          registerEntity(output.fileEntity);
          for (const ent of output.entities) {
            registerEntity(ent);
          }
          for (const rel of output.relationships) {
            allRelationships.push(rel);
          }
          for (const warn of output.warnings) {
            allWarnings.push(warn);
          }
        } catch (err) {
          allWarnings.push({
            filePath,
            message: `Failed to parse AST: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'error',
          });
        }
      } else {
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
    stageDurations.parsing = Math.round((performance.now() - parsingStart) * 100) / 100;

    checkCancellation();

    const resolvingStart = performance.now();
    onProgress?.('resolving', {
      current: 0,
      total: allRelationships.length,
      message: `Resolving dependencies across ${allRelationships.length} relationships...`,
    });

    const resolvedRelationships: TraceRelationship[] = [];
    let unresolvedCount = 0;
    let relIndex = 0;

    for (const rel of allRelationships) {
      relIndex++;
      if (relIndex % 50 === 0 || relIndex === allRelationships.length) {
        checkCancellation();
        onProgress?.('resolving', {
          current: relIndex,
          total: allRelationships.length,
          message: `Resolved ${relIndex} / ${allRelationships.length} relationships...`,
        });
      }

      if (rel.targetId.startsWith('__import__:')) {
        const parts = rel.targetId.split(':');
        const sourceModule = parts[1];
        const symbolName = parts.slice(2).join(':');

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
        resolvedRelationships.push(rel);
      }
    }

    this.linkRouteHandlers(resolvedRelationships, allEntities);
    const uniqueResolvedRelationships = this.deduplicateRelationships(resolvedRelationships);
    stageDurations.resolution = Math.round((performance.now() - resolvingStart) * 100) / 100;

    checkCancellation();

    const centralityStart = performance.now();
    onProgress?.('centrality', {
      current: 1,
      total: 1,
      message: 'Calculating graph centrality and connectivity metrics...',
    });

    const { mostConnected } = this.calculateCentrality(uniqueResolvedRelationships, allEntities);
    const routesCount = Object.values(allEntities).filter((e) => e.kind === 'route').length;
    const dbQueriesCount = Object.values(allEntities).filter((e) => e.kind === 'db_query').length;
    const totalLines = Object.values(files).reduce((acc, f) => acc + f.lines, 0);
    stageDurations.centrality = Math.round((performance.now() - centralityStart) * 100) / 100;

    checkCancellation();

    const depStart = performance.now();
    onProgress?.('dependencies', {
      current: 0,
      total: 1,
      message: 'Scanning dependency manifests across ecosystems...',
    });

    const depScanner = EcosystemRegistry.getInstance();
    const depResult = depScanner.scanRepositorySync(files, allEntities);
    const discoveredManifestCount = depResult.discoveredFiles.length;

    onProgress?.('dependencies', {
      current: discoveredManifestCount,
      total: Math.max(1, discoveredManifestCount),
      message: `Scanned ${discoveredManifestCount} dependency manifest(s)...`,
    });

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
    stageDurations.dependencies = Math.round((performance.now() - depStart) * 100) / 100;

    checkCancellation();

    onProgress?.('finalisation', {
      current: totalFiles,
      total: totalFiles,
      message: 'Finalising project analysis and metrics index...',
    });

    const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const errorCount = allWarnings.filter((w) => w.severity === 'error').length;
    const isPartial = errorCount > 0;
    const partialReason = isPartial
      ? `${errorCount} parsing or dependency diagnostic error(s) occurred. Some relationships or files may be incomplete.`
      : undefined;

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
      isPartial,
      partialReason,
      analysisMetadata: {
        stageDurations,
        totalDurationMs,
        workerUsed: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private calculateCentrality(
    uniqueResolvedRelationships: TraceRelationship[],
    allEntities: Record<string, TraceEntity>
  ) {
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

    return { inboundCounts, outboundCounts, mostConnected };
  }

  private deduplicateRelationships(resolvedRelationships: TraceRelationship[]): TraceRelationship[] {
    const unique: TraceRelationship[] = [];
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
        unique.push({ ...r, id: finalId });
      } else {
        unique.push(r);
      }
    }
    return unique;
  }

  private linkRouteHandlers(
    resolvedRelationships: TraceRelationship[],
    allEntities: Record<string, TraceEntity>
  ) {
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
