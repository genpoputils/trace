/**
 * Typed Package Dependency Graph Engine (GT-013)
 *
 * Constructs a typed package dependency graph with stable package identities,
 * typed dependency edges (runtime, dev, peer, optional, transitive, workspace),
 * multi-version disambiguation, and on-demand neighborhood expansion.
 */

import {
  NormalizedDependency,
  PackageDependencyNode,
  PackageDependencyEdge,
  PackageDependencyEdgeType,
  PackageDependencyGraph,
  PackageSourceUsage,
  WorkspaceDescriptor,
  DependencyScope,
  EcosystemType,
} from './types';
import { evaluateDependencyHealth } from './health';

/**
 * Builds a deterministic, stable package identity identifier.
 */
export function getStablePackageId(dep: NormalizedDependency): string {
  const versionPart = dep.versionResolved || dep.versionDeclared || 'unspecified';
  const cleanManifest = dep.manifestPath.replace(/\\/g, '/');
  return `pkg:${dep.ecosystem}:${dep.name.toLowerCase()}@${versionPart}:${cleanManifest}`;
}

export interface BuildGraphOptions {
  dependencies: NormalizedDependency[];
  sourceUsages?: Record<string, PackageSourceUsage[]>;
  workspaces?: WorkspaceDescriptor[];
}

/**
 * Builds the complete typed PackageDependencyGraph from normalized dependencies.
 */
export function buildPackageDependencyGraph(
  options: BuildGraphOptions
): PackageDependencyGraph {
  const { dependencies, sourceUsages = {}, workspaces = [] } = options;

  const nodes: Record<string, PackageDependencyNode> = {};
  const edges: PackageDependencyEdge[] = [];
  const rootNodeIds: string[] = [];

  // 1. Create nodes for all dependencies
  for (const dep of dependencies) {
    const stableId = getStablePackageId(dep);
    const usages = sourceUsages[dep.id] || sourceUsages[stableId] || [];
    const health = evaluateDependencyHealth(dep, usages);

    const node: PackageDependencyNode = {
      id: stableId,
      name: dep.name,
      ecosystem: dep.ecosystem,
      packageManager: dep.packageManager,
      versionDeclared: dep.versionDeclared,
      versionResolved: dep.versionResolved,
      versionInstalled: dep.versionInstalled,
      alias: dep.alias,
      scope: dep.scope,
      isDirect: dep.isDirect,
      isTransitive: dep.isTransitive,
      manifestPath: dep.manifestPath,
      lockfilePath: dep.lockfilePath,
      workspacePath: dep.workspacePath,
      provenance: dep.provenance,
      dependenciesCount: 0,
      dependentsCount: 0,
      sourceUsagesCount: usages.length,
      health,
    };

    nodes[stableId] = node;

    if (dep.isDirect) {
      rootNodeIds.push(stableId);
    }
  }

  // 2. Identify multi-version packages
  const packagesByName = new Map<string, Set<string>>();
  for (const node of Object.values(nodes)) {
    const key = `${node.ecosystem}:${node.name}`;
    const versions = packagesByName.get(key) || new Set<string>();
    if (node.versionResolved) versions.add(node.versionResolved);
    else if (node.versionDeclared) versions.add(node.versionDeclared);
    packagesByName.set(key, versions);
  }

  let multiVersionCount = 0;
  for (const [, versions] of packagesByName.entries()) {
    if (versions.size > 1) {
      multiVersionCount++;
    }
  }

  // 3. Synthesize Manifest Root Nodes & Direct Edges
  // Group direct nodes by manifest
  const directsByManifest = new Map<string, PackageDependencyNode[]>();
  const transitivesByManifest = new Map<string, PackageDependencyNode[]>();

  for (const node of Object.values(nodes)) {
    if (node.isDirect) {
      const list = directsByManifest.get(node.manifestPath) || [];
      list.push(node);
      directsByManifest.set(node.manifestPath, list);
    } else {
      const list = transitivesByManifest.get(node.manifestPath) || [];
      list.push(node);
      transitivesByManifest.set(node.manifestPath, list);
    }
  }

  // Create workspace / root manifest nodes
  for (const [manifestPath, directNodes] of directsByManifest.entries()) {
    const rootId = `manifest:${manifestPath}`;
    const manifestName = manifestPath.split('/').pop() || manifestPath;

    // Create manifest node
    nodes[rootId] = {
      id: rootId,
      name: manifestName,
      ecosystem: directNodes[0]?.ecosystem || 'unknown',
      packageManager: directNodes[0]?.packageManager || 'npm',
      versionDeclared: undefined,
      versionResolved: undefined,
      scope: 'runtime',
      isDirect: true,
      isTransitive: false,
      manifestPath,
      dependenciesCount: directNodes.length,
      dependentsCount: 0,
      sourceUsagesCount: 0,
      health: {
        status: 'healthy',
        signals: [],
        hasConflict: false,
        isUnreferenced: false,
        isUnlocked: false,
        isDuplicate: false,
      },
    };

    // Add typed edges from Manifest Root -> Direct Dependencies
    for (const directNode of directNodes) {
      const edgeType: PackageDependencyEdgeType =
        directNode.scope === 'dev'
          ? 'dev'
          : directNode.scope === 'peer'
          ? 'peer'
          : directNode.scope === 'optional'
          ? 'optional'
          : 'runtime';
      const edgeId = `${rootId}->${directNode.id}:${edgeType}`;

      edges.push({
        id: edgeId,
        source: rootId,
        target: directNode.id,
        type: edgeType,
        isTransitive: false,
        versionRange: directNode.versionDeclared,
        resolvedVersion: directNode.versionResolved,
        sourceFilePath: manifestPath,
      });

      directNode.dependentsCount++;
    }
  }

  // 4. Connect transitive dependencies to direct nodes or manifest
  for (const [manifestPath, transNodes] of transitivesByManifest.entries()) {
    const rootId = `manifest:${manifestPath}`;
    const directNodes = directsByManifest.get(manifestPath) || [];

    for (const transNode of transNodes) {
      // Connect transitive to a direct node or root if parent lockfile tree was unindexed
      const parentTarget = directNodes.length > 0 ? directNodes[0] : null;
      const sourceId = parentTarget ? parentTarget.id : rootId;
      const edgeId = `${sourceId}->${transNode.id}:transitive`;

      edges.push({
        id: edgeId,
        source: sourceId,
        target: transNode.id,
        type: 'transitive',
        isTransitive: true,
        resolvedVersion: transNode.versionResolved,
        sourceFilePath: transNode.lockfilePath || manifestPath,
      });

      transNode.dependentsCount++;
      if (parentTarget) {
        parentTarget.dependenciesCount++;
      }
    }
  }

  // 5. Inter-workspace edges for monorepos
  for (const ws of workspaces) {
    for (const pkgName of ws.packages) {
      // Check if any direct node matches this package name
      const targetNode = Object.values(nodes).find(
        (n) => n.name.toLowerCase() === pkgName.toLowerCase() && n.manifestPath !== ws.manifestPath
      );
      if (targetNode) {
        const sourceRootId = `manifest:${ws.manifestPath}`;
        if (nodes[sourceRootId]) {
          const edgeId = `${sourceRootId}->${targetNode.id}:workspace`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: sourceRootId,
              target: targetNode.id,
              type: 'workspace',
              isTransitive: false,
              sourceFilePath: ws.manifestPath,
            });
            targetNode.dependentsCount++;
          }
        }
      }
    }
  }

  // Count direct vs transitive nodes (excluding synthesized manifest root nodes)
  let directCount = 0;
  let transitiveCount = 0;
  for (const node of Object.values(nodes)) {
    if (!node.id.startsWith('manifest:')) {
      if (node.isDirect) directCount++;
      if (node.isTransitive) transitiveCount++;
    }
  }

  return {
    nodes,
    edges,
    rootNodeIds,
    stats: {
      totalNodes: Object.keys(nodes).length,
      totalEdges: edges.length,
      directCount,
      transitiveCount,
      multiVersionCount,
    },
  };
}

/**
 * Computes on-demand neighborhood expansion for a selected package node.
 */
export function getPackageNeighborhood(
  graph: PackageDependencyGraph,
  selectedId: string,
  depth = 1
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  if (!graph.nodes[selectedId]) {
    return { nodeIds, edgeIds };
  }

  nodeIds.add(selectedId);
  let currentLayer = new Set<string>([selectedId]);

  for (let d = 0; d < depth; d++) {
    const nextLayer = new Set<string>();

    for (const edge of graph.edges) {
      if (currentLayer.has(edge.source)) {
        nodeIds.add(edge.target);
        nextLayer.add(edge.target);
        edgeIds.add(edge.id);
      }
      if (currentLayer.has(edge.target)) {
        nodeIds.add(edge.source);
        nextLayer.add(edge.source);
        edgeIds.add(edge.id);
      }
    }

    currentLayer = nextLayer;
  }

  return { nodeIds, edgeIds };
}

export interface FilterGraphOptions {
  scope?: DependencyScope | 'all';
  ecosystem?: EcosystemType | 'all';
  workspacePath?: string;
  searchTerm?: string;
  healthStatus?: 'all' | 'healthy' | 'warning' | 'error';
}

/**
 * Filters the package graph based on scope, ecosystem, workspace, search query, and health status.
 */
export function filterPackageGraph(
  graph: PackageDependencyGraph,
  options: FilterGraphOptions
): PackageDependencyGraph {
  const {
    scope = 'all',
    ecosystem = 'all',
    workspacePath,
    searchTerm,
    healthStatus = 'all',
  } = options;

  const matchedNodeIds = new Set<string>();
  const query = searchTerm?.toLowerCase().trim();

  for (const [id, node] of Object.entries(graph.nodes)) {
    // Preserve manifest nodes if any of their children match
    if (id.startsWith('manifest:')) continue;

    // 1. Ecosystem filter
    if (ecosystem !== 'all' && node.ecosystem !== ecosystem) continue;

    // 2. Scope filter
    if (scope !== 'all' && node.scope !== scope) continue;

    // 3. Workspace filter
    if (workspacePath && node.workspacePath !== workspacePath && node.manifestPath !== workspacePath) {
      continue;
    }

    // 4. Health status filter
    if (healthStatus !== 'all' && node.health.status !== healthStatus) continue;

    // 5. Search query
    if (query) {
      const matchName = node.name.toLowerCase().includes(query);
      const matchAlias = node.alias?.toLowerCase().includes(query);
      const matchManifest = node.manifestPath.toLowerCase().includes(query);
      if (!matchName && !matchAlias && !matchManifest) continue;
    }

    matchedNodeIds.add(id);
  }

  // Include manifest nodes that connect to matched children
  const filteredEdges = graph.edges.filter(
    (e) => matchedNodeIds.has(e.source) || matchedNodeIds.has(e.target)
  );

  for (const e of filteredEdges) {
    matchedNodeIds.add(e.source);
    matchedNodeIds.add(e.target);
  }

  const filteredNodes: Record<string, PackageDependencyNode> = {};
  for (const id of matchedNodeIds) {
    if (graph.nodes[id]) {
      filteredNodes[id] = graph.nodes[id];
    }
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    rootNodeIds: graph.rootNodeIds.filter((id) => matchedNodeIds.has(id)),
    stats: {
      totalNodes: Object.keys(filteredNodes).length,
      totalEdges: filteredEdges.length,
      directCount: Object.values(filteredNodes).filter((n) => n.isDirect && !n.id.startsWith('manifest:')).length,
      transitiveCount: Object.values(filteredNodes).filter((n) => n.isTransitive).length,
      multiVersionCount: graph.stats.multiVersionCount,
    },
  };
}
