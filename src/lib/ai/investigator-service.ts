import {
  ProjectAnalysis,
  TraceEntity,
} from '../types/trace';
import { ExecutionPathEngine } from '../tracing/execution-path';
import { DataFlowEngine } from '../dataflow/dataflow';
import { ImpactAnalysisService } from '../impact/impact-analysis';

export interface GroundedContext {
  targetEntity?: TraceEntity;
  codeSnippet?: string;
  sourceLocation?: string;
  directCallers: { name: string; file: string; line: number }[];
  directCallees: { name: string; file: string; line: number }[];
  executionPathSummary?: string[];
  dataFlowSummary?: string[];
  impactSummary?: string;
  unresolvedNotes: string[];
}

export interface InvestigationResponse {
  answer: string;
  provider: 'deterministic_offline' | 'openai' | 'anthropic' | 'gemini';
  groundedFiles: string[];
  groundedLines: string[];
  confidence: 'high' | 'medium' | 'low';
  inferencesIdentified: string[];
}

export class AIInvestigatorService {
  private executionEngine: ExecutionPathEngine;
  private dataFlowEngine: DataFlowEngine;
  private impactService: ImpactAnalysisService;

  constructor(private analysis: ProjectAnalysis) {
    this.executionEngine = new ExecutionPathEngine(analysis);
    this.dataFlowEngine = new DataFlowEngine(analysis);
    this.impactService = new ImpactAnalysisService(analysis);
  }

  /**
   * Build grounded context from graph and AST without leaking sensitive repo secrets
   */
  public buildGroundedContext(entityId: string): GroundedContext {
    const entity = this.analysis.entities[entityId];

    const callers: { name: string; file: string; line: number }[] = [];
    const callees: { name: string; file: string; line: number }[] = [];
    const unresolved: string[] = [];

    if (entity) {
      // Find inbound
      for (const rel of this.analysis.relationships) {
        if (rel.targetId === entity.id && (rel.kind === 'calls' || rel.kind === 'routes_to')) {
          const src = this.analysis.entities[rel.sourceId];
          if (src) {
            callers.push({
              name: src.name,
              file: src.filePath,
              line: rel.location?.startLine || src.location.startLine,
            });
          }
        }
        // Find outbound
        if (rel.sourceId === entity.id && (rel.kind === 'calls' || rel.kind === 'routes_to')) {
          const tgt = this.analysis.entities[rel.targetId];
          if (tgt) {
            callees.push({
              name: tgt.name,
              file: tgt.filePath,
              line: rel.location?.startLine || tgt.location.startLine,
            });
          } else {
            unresolved.push(rel.notes || `Unresolved callee: ${rel.targetId}`);
          }
        }
      }
    }

    // Sanitize snippet: mask possible secrets/tokens
    const sanitizedSnippet = entity?.snippet
      ? entity.snippet.replace(/['"`][A-Za-z0-9_\-]{24,}['"`]/g, '"[REDACTED_SECRET]"')
      : undefined;

    return {
      targetEntity: entity,
      codeSnippet: sanitizedSnippet,
      sourceLocation: entity ? `${entity.filePath}:${entity.location.startLine}-${entity.location.endLine}` : undefined,
      directCallers: callers,
      directCallees: callees,
      unresolvedNotes: unresolved,
    };
  }

  /**
   * Investigate codebase question
   */
  public async investigate(
    question: string,
    targetEntityId?: string
  ): Promise<InvestigationResponse> {
    const groundedFiles: string[] = [];
    const groundedLines: string[] = [];
    const inferences: string[] = [];

    // Check for target entity
    let entity: TraceEntity | undefined;
    if (targetEntityId && this.analysis.entities[targetEntityId]) {
      entity = this.analysis.entities[targetEntityId];
    } else {
      // Try to match symbol name in question
      const words = question.split(/[\s,()]+/);
      for (const w of words) {
        const found = Object.values(this.analysis.entities).find(
          (e) => e.name.toLowerCase() === w.toLowerCase() && e.kind !== 'file'
        );
        if (found) {
          entity = found;
          break;
        }
      }
    }

    // Deterministic Offline Grounded Investigator
    // Synthesize factual, verified answer from AST and graph
    let answer = '';
    const q = question.toLowerCase();

    if (!entity) {
      // Project-level question
      const topSymbols = this.analysis.stats.mostConnected.slice(0, 5);
      answer = `### 🔍 Repository Architecture Overview: **${this.analysis.projectName}**\n\n` +
        `- **Files Analyzed:** ${this.analysis.stats.totalFiles} files (${this.analysis.stats.totalLines} lines of code)\n` +
        `- **Identified Symbols:** ${this.analysis.stats.totalSymbols} symbols across ${this.analysis.stats.languages.join(', ')}\n` +
        `- **Discovered Relationships:** ${this.analysis.stats.totalRelationships} relationships (${this.analysis.stats.routesCount} API routes, ${this.analysis.stats.dbQueriesCount} database queries)\n\n` +
        `#### Primary Hubs & Central Functions:\n` +
        topSymbols.map((s) => `- [\`${s.name}\`](${s.filePath}) (${s.kind}) — ${s.inboundCount} inbound callers, ${s.outboundCount} outbound calls`).join('\n') +
        `\n\n*Select any function or route in the graph or explorer to inspect its exact execution path and impact.*`;

      return {
        answer,
        provider: 'deterministic_offline',
        groundedFiles: Object.keys(this.analysis.files).slice(0, 5),
        groundedLines: [],
        confidence: 'high',
        inferencesIdentified: [],
      };
    }

    // Target entity exists
    groundedFiles.push(entity.filePath);
    groundedLines.push(`${entity.location.startLine}-${entity.location.endLine}`);
    const context = this.buildGroundedContext(entity.id);

    if (q.includes('impact') || q.includes('change') || q.includes('break') || q.includes('modify')) {
      const impact = this.impactService.analyzeImpact(entity.id);
      answer = `### 💥 Change Impact Analysis for \`${entity.name}\`\n\n` +
        `**Location:** \`${entity.filePath}:${entity.location.startLine}\`\n` +
        `**Blast Radius Severity:** **${impact.overallSeverity.toUpperCase()}** (${impact.blastRadiusScore}/100)\n\n` +
        `#### Direct Callers (${impact.directImpacts.length}):\n` +
        (impact.directImpacts.length > 0
          ? impact.directImpacts.map((d) => `- \`${d.name}\` (${d.kind}) in \`${d.filePath}\` [Evidence: *${d.pathEvidence[0]}*]`).join('\n')
          : `*No direct internal callers detected (may be an entry point or top-level export).*`) +
        `\n\n#### Potentially Affected API Routes (${impact.affectedRoutes.length}):\n` +
        (impact.affectedRoutes.length > 0
          ? impact.affectedRoutes.map((r) => `- \`${r.name}\` in \`${r.filePath}\``).join('\n')
          : `*No API routes directly depend on this symbol.*`) +
        `\n\n#### Potentially Affected Tests (${impact.affectedTests.length}):\n` +
        (impact.affectedTests.length > 0
          ? impact.affectedTests.map((t) => `- \`${t.name}\` in \`${t.filePath}\``).join('\n')
          : `*No test suites directly import this symbol.*`) +
        `\n\n**Recommendation:** Verify all direct callers and update associated unit tests before altering signatures or behavior.`;
    } else if (q.includes('trace') || q.includes('execution') || q.includes('path') || q.includes('flow')) {
      const path = this.executionEngine.tracePath(entity.id, { maxDepth: 6 });
      answer = `### ⚡ Statically Inferred Execution Path from \`${entity.name}\`\n\n` +
        `**Source:** \`${entity.filePath}:${entity.location.startLine}\`\n` +
        `**Total Steps Discovered:** ${path.totalSteps} (Max Depth: ${path.maxDepth})\n\n` +
        `#### Step-by-Step Call Path:\n` +
        path.steps
          .map((s) => {
            const ind = '  '.repeat(s.depth);
            const badge = s.confidence === 'statically_resolved' ? '✓ Statically Resolved' : '⚠️ Inferred / Dynamic';
            return `${ind}**${s.order}.** \`${s.entityName}\` [${s.kind}] — \`${s.filePath}:${s.location.startLine}\` (${badge})`;
          })
          .join('\n') +
        (path.detectedCycles.length > 0
          ? `\n\n⚠️ **Recursive / Circular Calls Detected:** ${path.detectedCycles.length} cycle(s)`
          : '') +
        (path.unresolvedCount > 0
          ? `\n\nℹ️ **Unresolved Steps:** ${path.unresolvedCount} dynamic call(s) could not be resolved statically.`
          : '');
    } else if (q.includes('data') || q.includes('origin') || q.includes('value')) {
      const df = this.dataFlowEngine.traceDataFlow(entity.id);
      answer = `### 🌊 Data-Flow Analysis for \`${entity.name}\`\n\n` +
        `**Root Symbol:** \`${df.rootSymbol}\` at \`${entity.filePath}:${entity.location.startLine}\`\n\n` +
        `#### Value Propagation Chain:\n` +
        df.steps
          .map((s, idx) => `**${idx + 1}.** [${s.flowType.toUpperCase()}] \`${s.symbolName}\` at \`${s.location.filePath}:${s.location.startLine}\` — *${s.notes || s.evidenceSnippet}*`)
          .join('\n') +
        `\n\n#### Identified Sinks:\n` +
        (df.sinkEntityIds.length > 0
          ? df.sinkEntityIds.map((sid) => `- \`${this.analysis.entities[sid]?.name || sid}\` (${this.analysis.entities[sid]?.kind || 'sink'})`).join('\n')
          : `*No terminal database or return sinks identified.*`);
    } else {
      // General explanation
      answer = `### 📖 Component Analysis: \`${entity.name}\`\n\n` +
        `- **Kind:** \`${entity.kind}\`\n` +
        `- **Source Location:** [\`${entity.filePath}:${entity.location.startLine}-${entity.location.endLine}\`]\n` +
        `- **Exported:** ${entity.isExported ? 'Yes' : 'No'}\n` +
        (entity.isAsync ? `- **Async:** Yes\n` : '') +
        (entity.parameters && entity.parameters.length > 0
          ? `- **Parameters:** ${entity.parameters.map((p) => `\`${p.name}${p.type ? `: ${p.type}` : ''}\``).join(', ')}\n`
          : '') +
        (entity.returnType ? `- **Return Type:** \`${entity.returnType}\`\n` : '') +
        (entity.docstring ? `\n**Docstring / JSDoc:**\n> ${entity.docstring}\n` : '') +
        `\n#### Callers (${context.directCallers.length}):\n` +
        (context.directCallers.length > 0
          ? context.directCallers.map((c) => `- \`${c.name}\` in \`${c.file}:${c.line}\``).join('\n')
          : `*No direct internal callers detected.*`) +
        `\n\n#### Outbound Calls & Dependencies (${context.directCallees.length}):\n` +
        (context.directCallees.length > 0
          ? context.directCallees.map((c) => `- \`${c.name}\` in \`${c.file}:${c.line}\``).join('\n')
          : `*No outbound calls detected.*`) +
        (context.unresolvedNotes.length > 0
          ? `\n\n#### ⚠️ Limitations & Dynamic Dispatches:\n` +
            context.unresolvedNotes.map((n) => `- ${n}`).join('\n')
          : '');
    }

    return {
      answer,
      provider: 'deterministic_offline',
      groundedFiles,
      groundedLines,
      confidence: 'high',
      inferencesIdentified: inferences,
    };
  }
}
