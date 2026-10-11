import {
  ProjectAnalysis,
  ExecutionPath,
  ExecutionPathStep,
} from '../types/trace';

export interface TraceOptions {
  maxDepth?: number;
  maxSteps?: number;
  direction?: 'forward' | 'backward';
}

export class ExecutionPathEngine {
  constructor(private analysis: ProjectAnalysis) {}

  /**
   * Trace execution path starting from an entry point
   */
  public tracePath(
    entryPointId: string,
    options: TraceOptions = {}
  ): ExecutionPath {
    const direction = options.direction || 'forward';
    const maxDepth = options.maxDepth || 12;
    const maxSteps = options.maxSteps || 100;

    const entryEntity = this.analysis.entities[entryPointId];
    if (!entryEntity) {
      return {
        entryPointId,
        entryPointName: 'Unknown Entry Point',
        direction,
        totalSteps: 0,
        maxDepth: 0,
        steps: [],
        unresolvedCount: 0,
        detectedCycles: [],
        limitations: [`Entry entity '${entryPointId}' not found in analyzed codebase.`],
      };
    }

    const steps: ExecutionPathStep[] = [];
    const detectedCycles: string[][] = [];
    const visitedInCurrentPath = new Set<string>();
    let stepCounter = 1;
    let unresolvedCount = 0;

    // Add root step
    steps.push({
      order: stepCounter++,
      entityId: entryEntity.id,
      entityName: entryEntity.name,
      kind: entryEntity.kind,
      filePath: entryEntity.filePath,
      location: entryEntity.location,
      confidence: 'statically_resolved',
      depth: 0,
    });

    if (direction === 'forward') {
      this.traverseForward(
        entryEntity.id,
        0,
        visitedInCurrentPath,
        [entryEntity.id],
        steps,
        detectedCycles,
        maxDepth,
        maxSteps,
        () => stepCounter++,
        (count) => { unresolvedCount += count; }
      );
    } else {
      this.traverseBackward(
        entryEntity.id,
        0,
        visitedInCurrentPath,
        [entryEntity.id],
        steps,
        detectedCycles,
        maxDepth,
        maxSteps,
        () => stepCounter++,
        (count) => { unresolvedCount += count; }
      );
    }

    const maxObservedDepth = steps.reduce((max, s) => Math.max(max, s.depth), 0);

    return {
      entryPointId: entryEntity.id,
      entryPointName: entryEntity.name,
      direction,
      totalSteps: steps.length,
      maxDepth: maxObservedDepth,
      steps,
      unresolvedCount,
      detectedCycles,
      limitations: [
        'Execution paths are statically inferred potential call chains, not runtime-recorded traces.',
        'Runtime conditional evaluations (e.g. if/else branch guards) are listed as potential alternate execution paths.',
        'Asynchronous event emissions and dynamic callbacks may terminate path resolution.',
      ],
    };
  }

  private traverseForward(
    currentId: string,
    depth: number,
    visitedInPath: Set<string>,
    currentStack: string[],
    steps: ExecutionPathStep[],
    cycles: string[][],
    maxDepth: number,
    maxSteps: number,
    nextOrder: () => number,
    addUnresolved: (n: number) => void
  ) {
    if (depth >= maxDepth || steps.length >= maxSteps) return;

    visitedInPath.add(currentId);

    // Find outgoing calls and routes_to
    const outgoingRels = this.analysis.relationships.filter(
      (r) => r.sourceId === currentId && (r.kind === 'calls' || r.kind === 'routes_to')
    );

    const isBranching = outgoingRels.length > 1;

    for (let i = 0; i < outgoingRels.length; i++) {
      if (steps.length >= maxSteps) break;

      const rel = outgoingRels[i];
      const targetEntity = this.analysis.entities[rel.targetId];

      if (!targetEntity) {
        // Unresolved callee
        addUnresolved(1);
        steps.push({
          order: nextOrder(),
          entityId: rel.targetId,
          entityName: rel.targetId.split(':').pop() || rel.targetId,
          kind: 'function',
          filePath: 'unresolved',
          location: rel.location || { filePath: 'unresolved', startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 },
          callerEntityId: currentId,
          callSiteLocation: rel.location,
          callEvidence: rel.evidenceSnippet || rel.notes,
          confidence: 'dynamic_unresolved',
          unresolvedCallees: [rel.targetId],
          isBranch: isBranching,
          depth: depth + 1,
        });
        continue;
      }

      // Check for cycle / recursion
      if (currentStack.includes(targetEntity.id)) {
        cycles.push([...currentStack, targetEntity.id]);
        steps.push({
          order: nextOrder(),
          entityId: targetEntity.id,
          entityName: `${targetEntity.name} (recursive cycle detected)`,
          kind: targetEntity.kind,
          filePath: targetEntity.filePath,
          location: targetEntity.location,
          callerEntityId: currentId,
          callSiteLocation: rel.location,
          callEvidence: rel.evidenceSnippet,
          confidence: rel.confidence,
          isBranch: isBranching,
          depth: depth + 1,
        });
        continue;
      }

      steps.push({
        order: nextOrder(),
        entityId: targetEntity.id,
        entityName: targetEntity.name,
        kind: targetEntity.kind,
        filePath: targetEntity.filePath,
        location: targetEntity.location,
        callerEntityId: currentId,
        callSiteLocation: rel.location,
        callEvidence: rel.evidenceSnippet,
        confidence: rel.confidence,
        isBranch: isBranching,
        branchCondition: isBranching ? `Branch ${i + 1} of ${outgoingRels.length}` : undefined,
        depth: depth + 1,
      });

      // Recurse down
      this.traverseForward(
        targetEntity.id,
        depth + 1,
        visitedInPath,
        [...currentStack, targetEntity.id],
        steps,
        cycles,
        maxDepth,
        maxSteps,
        nextOrder,
        addUnresolved
      );
    }
  }

  private traverseBackward(
    currentId: string,
    depth: number,
    visitedInPath: Set<string>,
    currentStack: string[],
    steps: ExecutionPathStep[],
    cycles: string[][],
    maxDepth: number,
    maxSteps: number,
    nextOrder: () => number,
    addUnresolved: (n: number) => void
  ) {
    if (depth >= maxDepth || steps.length >= maxSteps) return;

    visitedInPath.add(currentId);

    // Find incoming calls and routes_to
    const incomingRels = this.analysis.relationships.filter(
      (r) => r.targetId === currentId && (r.kind === 'calls' || r.kind === 'routes_to')
    );

    const isBranching = incomingRels.length > 1;

    for (let i = 0; i < incomingRels.length; i++) {
      if (steps.length >= maxSteps) break;

      const rel = incomingRels[i];
      const callerEntity = this.analysis.entities[rel.sourceId];

      if (!callerEntity) {
        addUnresolved(1);
        continue;
      }

      if (currentStack.includes(callerEntity.id)) {
        cycles.push([...currentStack, callerEntity.id]);
        continue;
      }

      steps.push({
        order: nextOrder(),
        entityId: callerEntity.id,
        entityName: callerEntity.name,
        kind: callerEntity.kind,
        filePath: callerEntity.filePath,
        location: callerEntity.location,
        callerEntityId: currentId,
        callSiteLocation: rel.location,
        callEvidence: rel.evidenceSnippet || rel.notes,
        confidence: rel.confidence,
        isBranch: isBranching,
        depth: depth + 1,
      });

      this.traverseBackward(
        callerEntity.id,
        depth + 1,
        visitedInPath,
        [...currentStack, callerEntity.id],
        steps,
        cycles,
        maxDepth,
        maxSteps,
        nextOrder,
        addUnresolved
      );
    }
  }
}
