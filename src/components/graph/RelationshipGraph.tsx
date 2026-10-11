'use client';

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
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
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ProjectAnalysis, TraceEntity, EntityKind } from '@/lib/types/trace';
import {
  Zap,
  Code2,
  FileCode,
  Database,
  Layers,
  ExternalLink,
  Variable,
  Route,
  LayoutGrid,
  Anchor,
} from 'lucide-react';

interface RelationshipGraphProps {
  analysis: ProjectAnalysis;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  filterKinds?: EntityKind[];
  focusEntityId?: string | null;
}

interface CustomTraceNodeData {
  entity: TraceEntity;
  onExpand?: (entityId: string) => void;
  neighborCount?: number;
  isExpanded?: boolean;
}

// Custom Node Card Component
function CustomTraceNode({ data, selected }: { data: CustomTraceNodeData; selected?: boolean }) {
  const entity: TraceEntity = data.entity;
  const onExpand = data.onExpand;
  const neighborCount = data.neighborCount || 0;
  const isExpanded = data.isExpanded || false;

  const getIcon = () => {
    switch (entity.kind) {
      case 'route':
        return <Route size={14} color="var(--primary-blue)" />;
      case 'component':
        return <LayoutGrid size={14} color="var(--primary-blue)" />;
      case 'hook':
        return <Anchor size={14} color="var(--warning-amber)" />;
      case 'function':
      case 'method':
        return <Zap size={14} color="var(--success-teal)" />;
      case 'class':
        return <Layers size={14} color="var(--text-secondary)" />;
      case 'db_query':
        return <Database size={14} color="var(--primary-blue)" />;
      case 'variable':
        return <Variable size={14} color="var(--warning-amber)" />;
      case 'external_api':
        return <ExternalLink size={14} color="var(--error-red)" />;
      default:
        return <FileCode size={14} color="var(--text-muted)" />;
    }
  };

  return (
    <div className={`trace-node ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'var(--primary-blue)', border: '2px solid #FFFFFF' }}
      />
      <div className="trace-node-header">
        <span className={`kind-badge ${entity.kind}`}>{entity.kind}</span>
        {getIcon()}
      </div>
      <div className="trace-node-title" title={entity.name}>
        {entity.name}
      </div>
      <div className="trace-node-file" title={entity.filePath}>
        <Code2 size={11} /> {entity.filePath.split('/').slice(-2).join('/')}
      </div>
      <div
        className="trace-node-footer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>Line {entity.location.startLine}</span>
        {neighborCount > 0 && onExpand && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand(entity.id);
            }}
            style={{
              background: isExpanded ? 'var(--blue-selection-bg)' : 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 3,
              fontSize: 10,
              padding: '1px 5px',
              cursor: 'pointer',
              color: isExpanded ? 'var(--primary-blue)' : 'var(--text-secondary)',
              fontWeight: 500,
            }}
            title={isExpanded ? 'Collapse connections' : 'Expand direct connections'}
          >
            {isExpanded ? '− Collapse' : `+ Expand (${neighborCount})`}
          </button>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'var(--primary-blue)', border: '2px solid #FFFFFF' }}
      />
    </div>
  );
}

const nodeTypes = {
  traceNode: CustomTraceNode,
};

// Compute Dagre Hierarchical Layout
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 45,
    ranksep: 95,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 240, height: 95 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition ? nodeWithPosition.x - 120 : 0,
        y: nodeWithPosition ? nodeWithPosition.y - 45 : 0,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function RelationshipGraphContent({
  analysis,
  selectedEntityId,
  onSelectEntity,
  filterKinds,
  focusEntityId,
}: RelationshipGraphProps) {
  const { fitView } = useReactFlow();
  const lastTopologyKeyRef = useRef<string>('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  // Reset expanded nodes when switching projects
  const [prevProjectId, setPrevProjectId] = useState(analysis.projectId);
  if (prevProjectId !== analysis.projectId) {
    setPrevProjectId(analysis.projectId);
    setExpandedNodeIds(new Set());
  }

  const toggleExpandNode = useCallback((entityId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  }, []);

  // Compute degree connectivity for all entities
  const neighborCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rel of analysis.relationships) {
      counts.set(rel.sourceId, (counts.get(rel.sourceId) || 0) + 1);
      counts.set(rel.targetId, (counts.get(rel.targetId) || 0) + 1);
    }
    return counts;
  }, [analysis.relationships]);

  // Build topology and calculate Dagre layout WITHOUT selectedEntityId
  const { layoutedNodes, layoutedEdges, topologyKey } = useMemo(() => {
    let candidateEntities: TraceEntity[] = [];

    if (focusEntityId && analysis.entities[focusEntityId]) {
      // Focus mode: target entity + immediate 1st-degree callers/callees
      const neighborIds = new Set<string>();
      neighborIds.add(focusEntityId);
      for (const rel of analysis.relationships) {
        if (rel.sourceId === focusEntityId) neighborIds.add(rel.targetId);
        if (rel.targetId === focusEntityId) neighborIds.add(rel.sourceId);
      }
      candidateEntities = Object.values(analysis.entities).filter((e) => neighborIds.has(e.id));
    } else {
      // Scalable initial graph:
      const nonFileEntities = Object.values(analysis.entities).filter((e) => e.kind !== 'file');

      // Top hubs from centrality metrics (bounded to top 25)
      const topHubIds = new Set<string>(
        (analysis.stats?.mostConnected || []).slice(0, 25).map((m) => m.symbolId)
      );

      // Add top 5 routes
      let routeCount = 0;
      for (const e of nonFileEntities) {
        if (e.kind === 'route') {
          topHubIds.add(e.id);
          routeCount++;
          if (routeCount >= 5) break;
        }
      }

      // Add user-expanded nodes and their immediate neighbors
      for (const expId of expandedNodeIds) {
        topHubIds.add(expId);
        for (const rel of analysis.relationships) {
          if (rel.sourceId === expId) topHubIds.add(rel.targetId);
          if (rel.targetId === expId) topHubIds.add(rel.sourceId);
        }
      }

      candidateEntities = nonFileEntities.filter((e) => topHubIds.has(e.id));

      // Apply kind filter if requested
      if (filterKinds && filterKinds.length > 0) {
        candidateEntities = candidateEntities.filter((e) => filterKinds.includes(e.kind));
      }

      // Safety bounds: cap to 50 nodes max for instant Dagre layout
      if (candidateEntities.length > 50) {
        candidateEntities = candidateEntities.slice(0, 50);
      }
    }

    const entityIds = new Set(candidateEntities.map((e) => e.id));

    const rawNodes: Node[] = candidateEntities.map((entity) => ({
      id: entity.id,
      type: 'traceNode',
      data: {
        entity,
        neighborCount: neighborCounts.get(entity.id) || 0,
        isExpanded: expandedNodeIds.has(entity.id),
        onExpand: toggleExpandNode,
      },
      position: { x: 0, y: 0 },
    }));

    const rawEdges: Edge[] = [];
    const seenEdgeIds = new Set<string>();
    for (const rel of analysis.relationships) {
      if (entityIds.has(rel.sourceId) && entityIds.has(rel.targetId)) {
        let edgeId = rel.id;
        if (seenEdgeIds.has(edgeId)) {
          let counter = 2;
          while (seenEdgeIds.has(`${rel.id}_${counter}`)) {
            counter++;
          }
          edgeId = `${rel.id}_${counter}`;
        }
        seenEdgeIds.add(edgeId);
        rawEdges.push({
          id: edgeId,
          source: rel.sourceId,
          target: rel.targetId,
          label: rel.kind === 'routes_to' ? 'routes' : rel.kind === 'calls' ? 'calls' : rel.kind,
          style: { stroke: '#CBD5E1', strokeWidth: 1.2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94A3B8',
          },
        });
      }
    }

    const layoutResult = getLayoutedElements(rawNodes, rawEdges, 'LR');
    const topoKey = Array.from(entityIds).sort().join(',');

    return {
      layoutedNodes: layoutResult.nodes,
      layoutedEdges: layoutResult.edges,
      topologyKey: topoKey,
    };
  }, [analysis, filterKinds, focusEntityId, expandedNodeIds, neighborCounts, toggleExpandNode]);

  // Apply selection highlights without recalculating Dagre positions
  const styledNodes = useMemo(() => {
    return layoutedNodes.map((n) => ({
      ...n,
      selected: n.id === selectedEntityId,
      data: {
        ...n.data,
        isExpanded: expandedNodeIds.has(n.id),
        onExpand: toggleExpandNode,
      },
    }));
  }, [layoutedNodes, selectedEntityId, expandedNodeIds, toggleExpandNode]);

  const styledEdges = useMemo(() => {
    return layoutedEdges.map((e) => {
      const isFocusPath = Boolean(
        selectedEntityId && (e.source === selectedEntityId || e.target === selectedEntityId)
      );
      return {
        ...e,
        animated: isFocusPath,
        style: {
          stroke: isFocusPath ? '#2563EB' : '#CBD5E1',
          strokeWidth: isFocusPath ? 2.2 : 1.2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isFocusPath ? '#2563EB' : '#94A3B8',
        },
      };
    });
  }, [layoutedEdges, selectedEntityId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(styledNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);

  useEffect(() => {
    setNodes(styledNodes);
  }, [styledNodes, setNodes]);

  useEffect(() => {
    setEdges(styledEdges);
  }, [styledEdges, setEdges]);

  // Fit view ONLY when graph topology actually changes (not on selection clicks)
  useEffect(() => {
    if (topologyKey && topologyKey !== lastTopologyKeyRef.current) {
      lastTopologyKeyRef.current = topologyKey;
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 350 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [topologyKey, fitView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectEntity(node.id);
    },
    [onSelectEntity]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#CBD5E1" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const ent = n.data?.entity as TraceEntity | undefined;
            if (ent?.kind === 'route') return '#2563EB';
            if (ent?.kind === 'component') return '#2563EB';
            if (ent?.kind === 'hook') return '#F59E0B';
            if (ent?.kind === 'function' || ent?.kind === 'method') return '#0D9488';
            if (ent?.kind === 'db_query') return '#2563EB';
            if (ent?.kind === 'class') return '#475569';
            if (ent?.kind === 'external_api') return '#DC2626';
            return '#94A3B8';
          }}
          maskColor="rgba(241, 245, 249, 0.75)"
        />
      </ReactFlow>
    </div>
  );
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <RelationshipGraphContent {...props} />
    </ReactFlowProvider>
  );
};
