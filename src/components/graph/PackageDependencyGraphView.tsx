'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  PackageDependencyGraph,
  PackageDependencyNode,
  PackageDependencyEdgeType,
  DependencyScope,
  EcosystemType,
} from '@/lib/dependencies/types';
import {
  getPackageNeighborhood,
  filterPackageGraph,
} from '@/lib/dependencies/graph';
import {
  Package,
  FileCode,
  Search,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Minus,
  X,
} from 'lucide-react';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 110;

interface PackageNodeData {
  pkgNode: PackageDependencyNode;
  isExpanded?: boolean;
  onExpandToggle?: (id: string) => void;
  neighborCount?: number;
}

// Custom Node Card Component
function PackageCustomNode({ data, selected }: { data: PackageNodeData; selected?: boolean }) {
  const node = data.pkgNode;
  const isManifest = node.id.startsWith('manifest:');
  const health = node.health;

  return (
    <div
      style={{
        width: NODE_WIDTH,
        background: selected ? 'var(--blue-selection-bg)' : 'var(--bg-card)',
        border: `1.5px solid ${
          selected
            ? 'var(--primary-blue)'
            : health.hasConflict
            ? 'var(--danger-red, #ef4444)'
            : health.isUnlocked
            ? 'var(--warning-amber)'
            : health.isUnreferenced
            ? 'rgba(59, 130, 246, 0.5)'
            : 'var(--border-color)'
        }`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        boxShadow: selected ? 'var(--shadow-md), 0 0 0 2px var(--primary-blue)' : 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'var(--primary-blue)', border: '2px solid #FFFFFF' }}
      />

      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {isManifest ? (
            <FileCode size={14} color="var(--primary-blue)" />
          ) : (
            <Package size={14} color={selected ? 'var(--primary-blue)' : 'var(--text-secondary)'} />
          )}
          <span
            className="kind-badge"
            style={{
              fontSize: 10,
              padding: '1px 5px',
              background: isManifest ? 'var(--blue-selection-bg)' : 'var(--bg-tertiary)',
              color: isManifest ? 'var(--primary-blue)' : 'var(--text-secondary)',
            }}
          >
            {node.ecosystem}
          </span>
          {!isManifest && (
            <span
              style={{
                fontSize: 9,
                padding: '1px 4px',
                borderRadius: 3,
                textTransform: 'uppercase',
                fontWeight: 600,
                background:
                  node.scope === 'runtime'
                    ? 'rgba(59, 130, 246, 0.12)'
                    : node.scope === 'dev'
                    ? 'rgba(107, 114, 128, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                color:
                  node.scope === 'runtime'
                    ? 'var(--primary-blue)'
                    : node.scope === 'dev'
                    ? 'var(--text-muted)'
                    : 'var(--warning-amber)',
              }}
            >
              {node.scope}
            </span>
          )}
        </div>

        {/* Health status icon */}
        {health.hasConflict ? (
          <span title="Version Conflict Detected">
            <AlertTriangle size={13} color="var(--danger-red, #ef4444)" />
          </span>
        ) : health.isUnlocked ? (
          <span title="Unlocked (Missing lockfile pin)">
            <AlertCircle size={13} color="var(--warning-amber)" />
          </span>
        ) : health.status === 'healthy' ? (
          <span title="Verified Lockfile Resolution">
            <CheckCircle2 size={13} color="var(--success-teal)" />
          </span>
        ) : null}
      </div>

      {/* Package Name */}
      <div
        style={{
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={node.name}
      >
        {node.name}
      </div>

      {/* Version and Usages Bottom Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {isManifest
            ? 'manifest'
            : node.versionResolved
            ? `v${node.versionResolved}`
            : node.versionDeclared
            ? node.versionDeclared
            : 'unspecified'}
        </span>

        {!isManifest && (
          <span
            style={{
              padding: '1px 5px',
              borderRadius: 3,
              background: node.sourceUsagesCount > 0 ? 'var(--blue-selection-bg)' : 'rgba(245, 158, 11, 0.12)',
              color: node.sourceUsagesCount > 0 ? 'var(--primary-blue)' : 'var(--warning-amber)',
              fontWeight: 600,
            }}
          >
            {node.sourceUsagesCount} usage{node.sourceUsagesCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Neighborhood expansion toggle if neighbors exist */}
      {data.neighborCount && data.neighborCount > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onExpandToggle?.(node.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--primary-blue)',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '2px 4px',
            }}
          >
            {data.isExpanded ? <Minus size={10} /> : <Plus size={10} />}
            {data.isExpanded ? 'Collapse' : `Expand (${data.neighborCount})`}
          </button>
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'var(--primary-blue)', border: '2px solid #FFFFFF' }}
      />
    </div>
  );
}

const nodeTypes = {
  packageNode: PackageCustomNode,
};

// Dagre Layout Calculator
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 70,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Edge Color & Dash by Type
function getEdgeStyle(type: PackageDependencyEdgeType): { stroke: string; strokeDasharray?: string; strokeWidth: number } {
  switch (type) {
    case 'runtime':
      return { stroke: '#3b82f6', strokeWidth: 1.8 };
    case 'dev':
      return { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1.4 };
    case 'peer':
      return { stroke: '#f59e0b', strokeDasharray: '3 3', strokeWidth: 1.6 };
    case 'optional':
      return { stroke: '#a855f7', strokeDasharray: '2 2', strokeWidth: 1.4 };
    case 'transitive':
      return { stroke: '#64748b', strokeDasharray: '2 4', strokeWidth: 1.2 };
    case 'workspace':
      return { stroke: '#10b981', strokeWidth: 2 };
    default:
      return { stroke: '#64748b', strokeWidth: 1.4 };
  }
}

export interface PackageDependencyGraphViewProps {
  graph: PackageDependencyGraph;
  selectedPackageId?: string | null;
  onSelectPackage?: (id: string) => void;
  onExpandNeighborhood?: (id: string, depth: number) => void;
}

export const PackageDependencyGraphView: React.FC<PackageDependencyGraphViewProps> = ({
  graph,
  selectedPackageId,
  onSelectPackage,
}) => {
  // State for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [scopeFilter, setScopeFilter] = useState<DependencyScope | 'all'>('all');
  const [ecosystemFilter, setEcosystemFilter] = useState<EcosystemType | 'all'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'warning' | 'error'>('all');

  // State for neighborhood expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusSelected, setFocusSelected] = useState(false);

  // Available ecosystems in graph
  const availableEcosystems = useMemo(() => {
    const set = new Set<EcosystemType>();
    for (const node of Object.values(graph.nodes)) {
      if (node.ecosystem && node.ecosystem !== 'unknown') {
        set.add(node.ecosystem);
      }
    }
    return Array.from(set);
  }, [graph]);

  // Toggle node neighborhood expansion
  const handleExpandToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Compute active filtered graph
  const activeGraph = useMemo(() => {
    let result = filterPackageGraph(graph, {
      scope: scopeFilter,
      ecosystem: ecosystemFilter,
      searchTerm,
      healthStatus: healthFilter,
    });

    // If focusSelected is on and a package is selected, keep its 1st/2nd degree neighborhood
    if (focusSelected && selectedPackageId) {
      const { nodeIds, edgeIds } = getPackageNeighborhood(graph, selectedPackageId, 1);
      const filteredNodes: Record<string, PackageDependencyNode> = {};
      for (const id of nodeIds) {
        if (graph.nodes[id]) filteredNodes[id] = graph.nodes[id];
      }
      const filteredEdges = graph.edges.filter((e) => edgeIds.has(e.id));
      result = {
        nodes: filteredNodes,
        edges: filteredEdges,
        rootNodeIds: graph.rootNodeIds.filter((id) => nodeIds.has(id)),
        stats: {
          totalNodes: Object.keys(filteredNodes).length,
          totalEdges: filteredEdges.length,
          directCount: Object.values(filteredNodes).filter((n) => n.isDirect).length,
          transitiveCount: Object.values(filteredNodes).filter((n) => n.isTransitive).length,
          multiVersionCount: 0,
        },
      };
    }

    return result;
  }, [graph, scopeFilter, ecosystemFilter, searchTerm, healthFilter, focusSelected, selectedPackageId]);

  // Convert to ReactFlow Nodes and Edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const rawNodes: Node[] = Object.values(activeGraph.nodes).map((pkg) => {
      // Calculate neighbor count in full graph
      const neighborCount = graph.edges.filter(
        (e) => e.source === pkg.id || e.target === pkg.id
      ).length;

      return {
        id: pkg.id,
        type: 'packageNode',
        data: {
          pkgNode: pkg,
          isExpanded: expandedIds.has(pkg.id),
          onExpandToggle: handleExpandToggle,
          neighborCount,
        },
        position: { x: 0, y: 0 },
        selected: selectedPackageId === pkg.id,
      };
    });

    const rawEdges: Edge[] = activeGraph.edges.map((e) => {
      const style = getEdgeStyle(e.type);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: e.type === 'runtime',
        style,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.stroke,
          width: 14,
          height: 14,
        },
        label: e.type !== 'runtime' ? e.type : undefined,
        labelStyle: { fill: 'var(--text-muted)', fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: 'var(--bg-card)', fillOpacity: 0.8 },
      };
    });

    const layouted = getLayoutedElements(rawNodes, rawEdges, 'LR');
    return { flowNodes: layouted.nodes, flowEdges: layouted.edges };
  }, [activeGraph, expandedIds, handleExpandToggle, selectedPackageId, graph.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectPackage?.(node.id);
    },
    [onSelectPackage]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--bg-primary)',
      }}
    >
      {/* 1. Graph Filter & Control Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '10px 16px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
          zIndex: 10,
        }}
        role="toolbar"
        aria-label="Package Dependency Graph Controls"
      >
        {/* Left: Search & Ecosystem */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filter graph packages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--text-primary)',
                width: 150,
              }}
              aria-label="Filter packages in graph"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                aria-label="Clear filter"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Ecosystem Dropdown */}
          {availableEcosystems.length > 1 && (
            <select
              value={ecosystemFilter}
              onChange={(e) => setEcosystemFilter(e.target.value as EcosystemType | 'all')}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                outline: 'none',
              }}
              aria-label="Filter graph by ecosystem"
            >
              <option value="all">All Ecosystems</option>
              {availableEcosystems.map((eco) => (
                <option key={eco} value={eco}>
                  {eco}
                </option>
              ))}
            </select>
          )}

          {/* Scope Filters */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'runtime', 'dev', 'peer'] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => setScopeFilter(sc)}
                className={`tool-btn ${scopeFilter === sc ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                {sc === 'all' ? 'All Scopes' : sc}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Health Filters & Focus Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Health status filter */}
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as 'all' | 'healthy' | 'warning' | 'error')}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              outline: 'none',
            }}
            aria-label="Filter graph by health status"
          >
            <option value="all">All Health States</option>
            <option value="healthy">Healthy Only</option>
            <option value="warning">Warnings / Unlocked</option>
            <option value="error">Conflicts</option>
          </select>

          {/* Focus mode toggle */}
          {selectedPackageId && (
            <button
              onClick={() => setFocusSelected(!focusSelected)}
              className={`tool-btn ${focusSelected ? 'active' : ''}`}
              style={{ fontSize: 11 }}
              title="Focus graph on selected package and 1-hop neighborhood"
            >
              <Eye size={13} /> {focusSelected ? 'Focus ON' : 'Focus 1-Hop'}
            </button>
          )}

          {/* Stats Badge */}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Showing {Object.keys(activeGraph.nodes).length} nodes, {activeGraph.edges.length} edges
          </span>
        </div>
      </div>

      {/* 2. ReactFlow Interactive Canvas */}
      <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
        {Object.keys(activeGraph.nodes).length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No package nodes match the selected filters.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.8}
            attributionPosition="bottom-left"
          >
            <Background color="var(--border-color)" gap={20} size={1} variant={BackgroundVariant.Dots} />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              nodeColor={(n) => {
                const pkg = (n.data as unknown as PackageNodeData)?.pkgNode;
                if (!pkg) return 'var(--text-muted)';
                if (pkg.id.startsWith('manifest:')) return 'var(--primary-blue)';
                if (pkg.health.hasConflict) return 'var(--danger-red, #ef4444)';
                if (pkg.health.isUnlocked) return 'var(--warning-amber)';
                return 'var(--success-teal)';
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
              }}
              position="bottom-left"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};
