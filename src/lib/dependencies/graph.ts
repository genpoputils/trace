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
  SourceScanCoverage,
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
  coverage?: SourceScanCoverage;
}

/**
 * Builds the complete typed PackageDependencyGraph from normalized dependencies.
 */
export function buildPackageDependencyGraph(
  options: BuildGraphOptions
): PackageDependencyGraph {
  const { dependencies, sourceUsages = {}, workspaces = [], coverage } = options;

  const nodes: Record<string, PackageDependencyNode> = {};
  const edges: PackageDependencyEdge[] = [];
  const rootNodeIds: string[] = [];
  const edgeIdSet = new Set<string>();

  // Map package name (lowercase) to nodes for parent resolution
  const nodesByName = new Map<string, PackageDependencyNode[]>();
  // Map dep.id to stableId for explicit parent ID resolution
  const nodesByDepId = new Map<string, string>();
  // Map ecosystem:name to nodes to strictly prevent cross-ecosystem candidate matching
  const nodesByEcosystemAndName = new Map<string, PackageDependencyNode[]>();

  // 1. Create nodes for all dependencies
  for (const dep of dependencies) {
    const stableId = getStablePackageId(dep);
    const usages = sourceUsages[dep.id] || sourceUsages[stableId] || [];
    const health = evaluateDependencyHealth(dep, usages, coverage);

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
      isWorkspace: dep.isWorkspace,
      parentPackages: dep.parentPackages,
      dependencies: dep.dependencies,
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

    const nameKey = dep.name.toLowerCase();
    const list = nodesByName.get(nameKey) || [];
    list.push(node);
    nodesByName.set(nameKey, list);

    nodesByDepId.set(dep.id, stableId);

    const ecoNameKey = `${dep.ecosystem}:${nameKey}`;
    const ecoList = nodesByEcosystemAndName.get(ecoNameKey) || [];
    ecoList.push(node);
    nodesByEcosystemAndName.set(ecoNameKey, ecoList);

    if (dep.isDirect) {
      rootNodeIds.push(stableId);
    }
  }

  // 2. Identify multi-version packages
  const packagesByName = new Map<string, Set<string>>();
  for (const node of Object.values(nodes)) {
    const key = `${node.ecosystem}:${node.name.toLowerCase()}`;
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

  // 3. Synthesize Manifest Root Nodes for ALL manifests (including manifests with zero direct dependencies)
  const allManifestPaths = new Set<string>();
  for (const dep of dependencies) {
    allManifestPaths.add(dep.manifestPath);
  }
  for (const ws of workspaces) {
    allManifestPaths.add(ws.manifestPath);
  }

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

  // Create manifest root nodes for all discovered manifest paths
  for (const manifestPath of allManifestPaths) {
    const rootId = `manifest:${manifestPath}`;
    const directNodes = directsByManifest.get(manifestPath) || [];
    const manifestName = manifestPath.split('/').pop() || manifestPath;

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
        isClean: true,
        coverageStatus: 'covered',
      },
    };

    // Add typed edges from Manifest Root -> Direct Dependencies
    for (const directNode of directNodes) {
      const edgeType: PackageDependencyEdgeType =
        directNode.isWorkspace
          ? 'workspace'
          : directNode.scope === 'dev'
          ? 'dev'
          : directNode.scope === 'peer'
          ? 'peer'
          : directNode.scope === 'optional'
          ? 'optional'
          : 'runtime';
      const edgeId = `${rootId}->${directNode.id}:${edgeType}`;

      if (!edgeIdSet.has(edgeId)) {
        edgeIdSet.add(edgeId);
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
  }

  // 4. Connect transitive dependencies using VALIDATED parent-child evidence
  // Never attach all transitive dependencies to the first direct dependency as a guessed parent.
  // Never fall back to arbitrary candidates[0] across manifests or ecosystems.
  // If an adapter identifies a package and its resolved version, but not its parent dependency,
  // or if parent identity is ambiguous, represent the relationship as unknown/incomplete without manufacturing a guessed edge.
  for (const [, transNodes] of transitivesByManifest.entries()) {
    for (const transNode of transNodes) {
      if (transNode.parentPackages && transNode.parentPackages.length > 0) {
        for (const parentRef of transNode.parentPackages) {
          let matchedParent: PackageDependencyNode | undefined;

          // 1. Direct ID match: Check if parentRef is a known stable ID or dep.id
          if (
            nodes[parentRef] &&
            !nodes[parentRef].id.startsWith('manifest:') &&
            nodes[parentRef].id !== transNode.id &&
            nodes[parentRef].ecosystem === transNode.ecosystem
          ) {
            matchedParent = nodes[parentRef];
          } else if (nodesByDepId.has(parentRef)) {
            const stableId = nodesByDepId.get(parentRef)!;
            const cand = nodes[stableId];
            if (
              cand &&
              !cand.id.startsWith('manifest:') &&
              cand.id !== transNode.id &&
              cand.ecosystem === transNode.ecosystem
            ) {
              matchedParent = cand;
            }
          }

          // 2. Name-based match within the SAME ecosystem only
          if (!matchedParent) {
            const ecoNameKey = `${transNode.ecosystem}:${parentRef.toLowerCase()}`;
            const candidates = (nodesByEcosystemAndName.get(ecoNameKey) || []).filter(
              (p) => !p.id.startsWith('manifest:') && p.id !== transNode.id
            );

            if (candidates.length > 0) {
              // Narrow down candidates by exact context: same manifest first, then same workspace/lockfile
              const sameManifestCandidates = candidates.filter((p) => p.manifestPath === transNode.manifestPath);
              const sameWorkspaceCandidates = candidates.filter(
                (p) => p.workspacePath && transNode.workspacePath && p.workspacePath === transNode.workspacePath
              );
              const sameLockCandidates = candidates.filter(
                (p) => p.lockfilePath && transNode.lockfilePath && p.lockfilePath === transNode.lockfilePath
              );

              const contextualCandidates =
                sameManifestCandidates.length > 0
                  ? sameManifestCandidates
                  : sameWorkspaceCandidates.length > 0
                  ? sameWorkspaceCandidates
                  : sameLockCandidates.length > 0
                  ? sameLockCandidates
                  : [];

              if (contextualCandidates.length === 1) {
                // Exactly one plausible candidate in the same context
                matchedParent = contextualCandidates[0];
              } else if (contextualCandidates.length > 1) {
                // Multiple candidates exist in the same context (e.g. multi-version parent packages).
                // Check if child dependency evidence (p.dependencies) disambiguates:
                const verified = contextualCandidates.filter(
                  (p) => p.dependencies && p.dependencies.some((d) => d.toLowerCase() === transNode.name.toLowerCase())
                );
                if (verified.length === 1) {
                  matchedParent = verified[0];
                }
                // If still ambiguous (0 or >1 verified), do NOT guess! Leave unresolved.
              }
            }
          }

          // Emit edge only if matched parent exists and both nodes exist in the graph
          if (matchedParent && nodes[matchedParent.id] && nodes[transNode.id]) {
            const edgeId = `${matchedParent.id}->${transNode.id}:transitive`;
            if (!edgeIdSet.has(edgeId)) {
              edgeIdSet.add(edgeId);
              edges.push({
                id: edgeId,
                source: matchedParent.id,
                target: transNode.id,
                type: 'transitive',
                isTransitive: true,
                resolvedVersion: transNode.versionResolved,
                sourceFilePath: transNode.lockfilePath || transNode.manifestPath,
              });

              matchedParent.dependenciesCount++;
              transNode.dependentsCount++;
            }
          }
        }
      }
      // If parentPackages is empty or unknown, do not manufacture a guessed edge to directNodes[0] or manifest!
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
        if (nodes[sourceRootId] && nodes[targetNode.id]) {
          const edgeId = `${sourceRootId}->${targetNode.id}:workspace`;
          if (!edgeIdSet.has(edgeId)) {
            edgeIdSet.add(edgeId);
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

  // Final verification: Assert that every graph edge references existing nodes
  const validatedEdges = edges.filter((e) => nodes[e.source] !== undefined && nodes[e.target] !== undefined);

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
    edges: validatedEdges,
    rootNodeIds,
    stats: {
      totalNodes: Object.keys(nodes).length,
      totalEdges: validatedEdges.length,
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
