'use client';

import React, { useMemo, useCallback } from 'react';
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

// Custom Node Card Component
function CustomTraceNode({ data, selected }: { data: any; selected?: boolean }) {
  const entity: TraceEntity = data.entity;

  const getIcon = () => {
    switch (entity.kind) {
      case 'route':
        return <Route size={14} color="var(--electric-blue)" />;
      case 'component':
        return <LayoutGrid size={14} color="#2563eb" />;
      case 'hook':
        return <Anchor size={14} color="#d97706" />;
      case 'function':
      case 'method':
        return <Zap size={14} color="var(--emerald-primary)" />;
      case 'class':
        return <Layers size={14} color="var(--purple-primary)" />;
      case 'db_query':
        return <Database size={14} color="var(--blue-primary)" />;
      case 'variable':
        return <Variable size={14} color="var(--amber-primary)" />;
      case 'external_api':
        return <ExternalLink size={14} color="var(--rose-primary)" />;
      default:
        return <FileCode size={14} color="var(--text-muted)" />;
    }
  };

  return (
    <div className={`trace-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--electric-blue)', border: '2px solid #fff' }} />
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
      <div className="trace-node-footer">
        <span>Line {entity.location.startLine}</span>
        {entity.isExported && <span style={{ color: 'var(--electric-blue)', fontWeight: 600 }}>Exported</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--emerald-primary)', border: '2px solid #fff' }} />
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
    nodesep: 40,
    ranksep: 90,
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

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  analysis,
  selectedEntityId,
  onSelectEntity,
  filterKinds,
  focusEntityId,
}) => {
  // Filter nodes & edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    let candidateEntities = Object.values(analysis.entities);

    // If focus mode enabled, only show neighborhood (target + immediate callers/callees)
    if (focusEntityId && analysis.entities[focusEntityId]) {
      const neighborIds = new Set<string>();
      neighborIds.add(focusEntityId);

      for (const rel of analysis.relationships) {
        if (rel.sourceId === focusEntityId) neighborIds.add(rel.targetId);
        if (rel.targetId === focusEntityId) neighborIds.add(rel.sourceId);
      }

      candidateEntities = candidateEntities.filter((e) => neighborIds.has(e.id));
    } else {
      // Exclude file nodes by default to reduce clutter unless explicitly filtered
      candidateEntities = candidateEntities.filter((e) => e.kind !== 'file');

      // Filter kinds if specified
      if (filterKinds && filterKinds.length > 0) {
        candidateEntities = candidateEntities.filter((e) => filterKinds.includes(e.kind));
      } else {
        // Cap visible nodes to top connected to keep canvas snappy and readable
        const topHubIds = new Set(analysis.stats.mostConnected.slice(0, 35).map((m) => m.symbolId));
        // Add all routes, components, and db queries
        for (const e of Object.values(analysis.entities)) {
          if (e.kind === 'route' || e.kind === 'db_query' || e.kind === 'component') topHubIds.add(e.id);
        }
        candidateEntities = candidateEntities.filter((e) => topHubIds.has(e.id));
      }
    }

    const entityIds = new Set(candidateEntities.map((e) => e.id));

    // Build React Flow nodes
    const rawNodes: Node[] = candidateEntities.map((entity) => ({
      id: entity.id,
      type: 'traceNode',
      data: { entity },
      position: { x: 0, y: 0 },
      selected: entity.id === selectedEntityId,
    }));

    // Build React Flow edges
    const rawEdges: Edge[] = [];
    for (const rel of analysis.relationships) {
      if (entityIds.has(rel.sourceId) && entityIds.has(rel.targetId)) {
        const isRoute = rel.kind === 'routes_to';
        const isCalls = rel.kind === 'calls';
        const isFocusPath = Boolean(selectedEntityId && (rel.sourceId === selectedEntityId || rel.targetId === selectedEntityId));

        rawEdges.push({
          id: rel.id,
          source: rel.sourceId,
          target: rel.targetId,
          animated: isRoute || isFocusPath,
          label: rel.kind === 'routes_to' ? 'routes' : rel.kind === 'calls' ? 'calls' : rel.kind,
          style: {
            stroke: isFocusPath ? '#0284c7' : isRoute ? '#0ea5e9' : isCalls ? '#10b981' : '#94a3b8',
            strokeWidth: isFocusPath ? 2.5 : isRoute ? 2 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isFocusPath ? '#0284c7' : isRoute ? '#0ea5e9' : isCalls ? '#10b981' : '#94a3b8',
          },
        });
      }
    }

    return getLayoutedElements(rawNodes, rawEdges, 'LR');
  }, [analysis, selectedEntityId, filterKinds, focusEntityId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state when props change
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#94a3b8" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const ent = n.data?.entity as TraceEntity | undefined;
            if (ent?.kind === 'route') return '#0284c7';
            if (ent?.kind === 'component') return '#2563eb';
            if (ent?.kind === 'hook') return '#d97706';
            if (ent?.kind === 'function') return '#059669';
            if (ent?.kind === 'db_query') return '#3b82f6';
            if (ent?.kind === 'class') return '#7c3aed';
            return '#94a3b8';
          }}
          maskColor="rgba(241, 245, 249, 0.7)"
        />
      </ReactFlow>
    </div>
  );
};
