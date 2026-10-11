import {
  ProjectAnalysis,
  DataFlowTrace,
  DataFlowStep,
  TraceEntity,
} from '../types/trace';

export class DataFlowEngine {
  constructor(private analysis: ProjectAnalysis) {}

  /**
   * Trace the flow of data originating from a symbol or entity
   */
  public traceDataFlow(
    symbolNameOrId: string,
    originEntityId?: string
  ): DataFlowTrace {
    const steps: DataFlowStep[] = [];
    const sinkEntityIds: string[] = [];
    const limitations: string[] = [
      'Static data-flow tracking does not account for runtime mutation or complex object aliasing across asynchronous boundaries.',
      'Object destructuring and dynamic property access are tracked heuristically.',
      'Database I/O flows are inferred from identified ORM/SQL client query parameters.',
    ];

    // Find origin entity
    let rootEntity: TraceEntity | undefined;
    if (originEntityId && this.analysis.entities[originEntityId]) {
      rootEntity = this.analysis.entities[originEntityId];
    } else {
      rootEntity = Object.values(this.analysis.entities).find(
        (e) => e.id === symbolNameOrId || e.name === symbolNameOrId
      );
    }

    if (!rootEntity) {
      return {
        rootSymbol: symbolNameOrId,
        originEntityId: 'unknown',
        steps: [],
        sinkEntityIds: [],
        limitations: [`Symbol '${symbolNameOrId}' could not be located in project index.`],
      };
    }

    // Determine candidate variable / parameter name
    const targetSymbol = rootEntity.parameters && rootEntity.parameters.length > 0
      ? rootEntity.parameters[0].name
      : rootEntity.name;

    // Step 1: Origin step
    steps.push({
      id: `df_step_1`,
      symbolName: targetSymbol,
      sourceEntityId: rootEntity.id,
      targetEntityId: rootEntity.id,
      flowType: rootEntity.parameters ? 'parameter' : 'assignment',
      location: rootEntity.location,
      evidenceSnippet: rootEntity.snippet?.split('\n')[0] || rootEntity.name,
      confidence: 'statically_resolved',
      notes: `Data value enters at ${rootEntity.kind} '${rootEntity.name}'`,
    });

    // Step 2: Find calls made by this entity where arguments are passed
    const callsMade = this.analysis.relationships.filter(
      (r) => r.sourceId === rootEntity!.id && r.kind === 'calls'
    );

    let stepIndex = 2;

    for (const call of callsMade) {
      const callee = this.analysis.entities[call.targetId];
      if (!callee) continue;

      if (callee.kind === 'db_query') {
        // Data sinks into database
        steps.push({
          id: `df_step_${stepIndex++}`,
          symbolName: targetSymbol,
          sourceEntityId: rootEntity.id,
          targetEntityId: callee.id,
          flowType: 'db_io',
          location: call.location || callee.location,
          evidenceSnippet: call.evidenceSnippet || callee.snippet || callee.name,
          confidence: 'statically_resolved',
          notes: `Data value is passed to database operation '${callee.name}'`,
        });
        sinkEntityIds.push(callee.id);
      } else if (callee.kind === 'function' || callee.kind === 'method') {
        // Interprocedural flow into callee
        const matchingParam = callee.parameters && callee.parameters.length > 0
          ? callee.parameters[0].name
          : targetSymbol;

        steps.push({
          id: `df_step_${stepIndex++}`,
          symbolName: matchingParam,
          sourceEntityId: rootEntity.id,
          targetEntityId: callee.id,
          flowType: 'argument',
          location: call.location || callee.location,
          evidenceSnippet: call.evidenceSnippet || `${callee.name}(${targetSymbol})`,
          confidence: 'inferred',
          notes: `Passed as argument from ${rootEntity.name} to ${callee.name}`,
        });

        // Check if callee itself has DB calls or returns
        const calleeDbCalls = this.analysis.relationships.filter(
          (r) => r.sourceId === callee.id && r.kind === 'calls'
        );

        for (const subCall of calleeDbCalls) {
          const subTarget = this.analysis.entities[subCall.targetId];
          if (subTarget && subTarget.kind === 'db_query') {
            steps.push({
              id: `df_step_${stepIndex++}`,
              symbolName: matchingParam,
              sourceEntityId: callee.id,
              targetEntityId: subTarget.id,
              flowType: 'db_io',
              location: subCall.location || subTarget.location,
              evidenceSnippet: subCall.evidenceSnippet || subTarget.name,
              confidence: 'inferred',
              notes: `Transitive flow: ${callee.name} passes value to database query ${subTarget.name}`,
            });
            sinkEntityIds.push(subTarget.id);
          }
        }
      }
    }

    // Step 3: Check return value sink
    if (rootEntity.returnType || (rootEntity.snippet && rootEntity.snippet.includes('return '))) {
      steps.push({
        id: `df_step_${stepIndex++}`,
        symbolName: `${targetSymbol} (returned)`,
        sourceEntityId: rootEntity.id,
        targetEntityId: rootEntity.id,
        flowType: 'return_value',
        location: rootEntity.location,
        evidenceSnippet: 'return ...',
        confidence: 'locally_established',
        notes: `Value or transformed derivative is returned to caller`,
      });
      sinkEntityIds.push(rootEntity.id);
    }

    return {
      rootSymbol: targetSymbol,
      originEntityId: rootEntity.id,
      steps,
      sinkEntityIds: Array.from(new Set(sinkEntityIds)),
      limitations,
    };
  }
}
