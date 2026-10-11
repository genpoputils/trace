import {
  ProjectAnalysis,
  ImpactReport,
  ImpactItem,
} from '../types/trace';

export class ImpactAnalysisService {
  constructor(private analysis: ProjectAnalysis) {}

  /**
   * Analyze the change impact blast radius for an entity
   */
  public analyzeImpact(targetEntityId: string): ImpactReport {
    const target = this.analysis.entities[targetEntityId];
    if (!target) {
      return {
        targetEntityId,
        targetName: 'Unknown Symbol',
        targetKind: 'function',
        blastRadiusScore: 0,
        overallSeverity: 'low',
        directImpacts: [],
        transitiveImpacts: [],
        affectedRoutes: [],
        affectedTests: [],
        affectedDbQueries: [],
        summary: `Target entity '${targetEntityId}' could not be found.`,
      };
    }

    const directImpacts: ImpactItem[] = [];
    const transitiveImpacts: ImpactItem[] = [];
    const affectedRoutes: ImpactItem[] = [];
    const affectedTests: ImpactItem[] = [];
    const affectedDbQueries: ImpactItem[] = [];

    const visited = new Set<string>();
    visited.add(target.id);

    // Queue for BFS traversal: [entityId, currentDistance, evidencePath]
    const queue: { id: string; distance: number; path: string[] }[] = [];

    // Find direct callers and referencers
    const directInbound = this.analysis.relationships.filter(
      (r) =>
        r.targetId === target.id &&
        (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'references' || r.kind === 'imports')
    );

    for (const rel of directInbound) {
      const caller = this.analysis.entities[rel.sourceId];
      if (!caller || visited.has(caller.id)) continue;
      visited.add(caller.id);

      const pathEvidence = [`${caller.name} directly ${rel.kind} ${target.name}`];
      const isTest = this.isTestFile(caller.filePath);

      const impactItem: ImpactItem = {
        entityId: caller.id,
        name: caller.name,
        kind: caller.kind,
        filePath: caller.filePath,
        impactType: isTest ? 'affected_test' : caller.kind === 'route' ? 'affected_route' : 'direct_caller',
        distance: 1,
        pathEvidence,
        severity: caller.kind === 'route' ? 'high' : 'medium',
      };

      directImpacts.push(impactItem);
      if (caller.kind === 'route') affectedRoutes.push(impactItem);
      if (isTest) affectedTests.push(impactItem);

      queue.push({ id: caller.id, distance: 1, path: pathEvidence });
    }

    // Traverse transitive callers up to distance 6
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.distance >= 6) continue;

      const inbound = this.analysis.relationships.filter(
        (r) =>
          r.targetId === current.id &&
          (r.kind === 'calls' || r.kind === 'routes_to' || r.kind === 'references')
      );

      for (const rel of inbound) {
        const caller = this.analysis.entities[rel.sourceId];
        if (!caller || visited.has(caller.id)) continue;
        visited.add(caller.id);

        const newPath = [...current.path, `${caller.name} ${rel.kind} ${this.analysis.entities[current.id]?.name || 'callee'}`];
        const isTest = this.isTestFile(caller.filePath);

        const impactItem: ImpactItem = {
          entityId: caller.id,
          name: caller.name,
          kind: caller.kind,
          filePath: caller.filePath,
          impactType: isTest ? 'affected_test' : caller.kind === 'route' ? 'affected_route' : 'transitive_caller',
          distance: current.distance + 1,
          pathEvidence: newPath,
          severity: caller.kind === 'route' ? 'high' : 'low',
        };

        transitiveImpacts.push(impactItem);
        if (caller.kind === 'route') affectedRoutes.push(impactItem);
        if (isTest) affectedTests.push(impactItem);

        queue.push({ id: caller.id, distance: current.distance + 1, path: newPath });
      }
    }

    // Check downstream DB queries or services that target might call
    const downstream = this.analysis.relationships.filter(
      (r) => r.sourceId === target.id && r.kind === 'calls'
    );
    for (const rel of downstream) {
      const callee = this.analysis.entities[rel.targetId];
      if (callee && callee.kind === 'db_query') {
        affectedDbQueries.push({
          entityId: callee.id,
          name: callee.name,
          kind: callee.kind,
          filePath: callee.filePath,
          impactType: 'affected_db',
          distance: 1,
          pathEvidence: [`${target.name} invokes DB query ${callee.name}`],
          severity: 'medium',
        });
      }
    }

    // Compute Blast Radius Score (0 - 100)
    const directWeight = directImpacts.length * 12;
    const transitiveWeight = transitiveImpacts.length * 5;
    const routeWeight = affectedRoutes.length * 20;
    const dbWeight = affectedDbQueries.length * 10;
    const rawScore = directWeight + transitiveWeight + routeWeight + dbWeight;
    const blastRadiusScore = Math.min(100, Math.max(5, rawScore));

    let overallSeverity: ImpactReport['overallSeverity'] = 'low';
    if (blastRadiusScore >= 70 || affectedRoutes.length > 2) {
      overallSeverity = 'critical';
    } else if (blastRadiusScore >= 45 || affectedRoutes.length > 0) {
      overallSeverity = 'high';
    } else if (blastRadiusScore >= 20) {
      overallSeverity = 'medium';
    }

    const summary = `Modifying '${target.name}' potentially affects ${directImpacts.length} direct caller(s), ${transitiveImpacts.length} indirect dependency(ies), ${affectedRoutes.length} API route(s), and ${affectedTests.length} test suite(s). Blast radius is evaluated as ${overallSeverity.toUpperCase()} (${blastRadiusScore}/100).`;

    return {
      targetEntityId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      blastRadiusScore,
      overallSeverity,
      directImpacts,
      transitiveImpacts,
      affectedRoutes,
      affectedTests,
      affectedDbQueries,
      summary,
    };
  }

  private isTestFile(filePath: string): boolean {
    const f = filePath.toLowerCase();
    return (
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('__tests__') ||
      f.includes('/tests/') ||
      f.includes('\\tests\\')
    );
  }
}
