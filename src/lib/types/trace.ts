/**
 * Core Data Models for GenPopUtils Trace
 * Codebase Intelligence & Execution Tracing Engine
 */

export type EntityKind =
  | 'file'
  | 'module'
  | 'function'
  | 'method'
  | 'component'
  | 'hook'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'route'
  | 'middleware'
  | 'service'
  | 'db_query'
  | 'event_handler'
  | 'external_api';

export type RelationshipKind =
  | 'calls'
  | 'imports'
  | 'defines'
  | 'inherits'
  | 'implements'
  | 'references'
  | 'reads_from'
  | 'writes_to'
  | 'routes_to'
  | 'data_flow';

export type ConfidenceLevel =
  | 'statically_resolved'
  | 'locally_established'
  | 'inferred'
  | 'dynamic_unresolved';

export interface SourceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface TraceEntity {
  id: string; // Stable ID: filePath#kind#name#line
  name: string;
  kind: EntityKind;
  filePath: string;
  location: SourceLocation;
  snippet?: string;
  docstring?: string;
  parameters?: { name: string; type?: string; defaultValue?: string }[];
  returnType?: string;
  isExported: boolean;
  isAsync?: boolean;
  framework?: 'express' | 'nextjs' | 'react' | 'prisma' | 'mongoose' | 'node' | 'vanilla';
  metadata?: {
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL' | 'USE';
    routePath?: string;
    dbModel?: string;
    dbOperation?: string;
    envVarName?: string;
    eventTopic?: string;
    className?: string;
    isTest?: boolean;
    cyclomaticComplexity?: number;
    [key: string]: unknown;
  };
}

export interface TraceRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  kind: RelationshipKind;
  confidence: ConfidenceLevel;
  location?: SourceLocation;
  evidenceSnippet?: string;
  notes?: string;
}

export interface DataFlowStep {
  id: string;
  symbolName: string;
  sourceEntityId: string;
  targetEntityId: string;
  flowType: 'parameter' | 'argument' | 'assignment' | 'return_value' | 'property_access' | 'db_io';
  location: SourceLocation;
  evidenceSnippet: string;
  confidence: ConfidenceLevel;
  notes?: string;
}

export interface DataFlowTrace {
  rootSymbol: string;
  originEntityId: string;
  steps: DataFlowStep[];
  sinkEntityIds: string[];
  limitations: string[];
}

export interface ExecutionPathStep {
  order: number;
  entityId: string;
  entityName: string;
  kind: EntityKind;
  filePath: string;
  location: SourceLocation;
  callerEntityId?: string;
  callSiteLocation?: SourceLocation;
  callEvidence?: string;
  confidence: ConfidenceLevel;
  isBranch?: boolean;
  branchCondition?: string;
  unresolvedCallees?: string[];
  depth: number;
}

export interface ExecutionPath {
  entryPointId: string;
  entryPointName: string;
  direction: 'forward' | 'backward';
  totalSteps: number;
  maxDepth: number;
  steps: ExecutionPathStep[];
  unresolvedCount: number;
  detectedCycles: string[][];
  limitations: string[];
}

export interface ImpactItem {
  entityId: string;
  name: string;
  kind: EntityKind;
  filePath: string;
  impactType: 'direct_caller' | 'transitive_caller' | 'dependent_module' | 'affected_route' | 'affected_test' | 'affected_db';
  distance: number;
  pathEvidence: string[]; // e.g. ["A calls B", "B calls C"]
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ImpactReport {
  targetEntityId: string;
  targetName: string;
  targetKind: EntityKind;
  blastRadiusScore: number; // 0 to 100
  overallSeverity: 'low' | 'medium' | 'high' | 'critical';
  directImpacts: ImpactItem[];
  transitiveImpacts: ImpactItem[];
  affectedRoutes: ImpactItem[];
  affectedTests: ImpactItem[];
  affectedDbQueries: ImpactItem[];
  summary: string;
}

export interface FileRecord {
  path: string;
  content: string;
  lines: number;
  size: number;
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'json' | 'unknown';
}

export interface AnalysisWarning {
  filePath?: string;
  line?: number;
  message: string;
  severity: 'info' | 'warning' | 'error';
  construct?: string;
}

export interface ProjectAnalysis {
  projectId: string;
  projectName: string;
  analyzedAt: string;
  version: string;
  stats: {
    totalFiles: number;
    totalLines: number;
    languages: string[];
    totalSymbols: number;
    totalRelationships: number;
    unresolvedCalls: number;
    routesCount: number;
    dbQueriesCount: number;
    mostConnected: {
      symbolId: string;
      name: string;
      kind: EntityKind;
      filePath: string;
      inboundCount: number;
      outboundCount: number;
      totalDegree: number;
    }[];
  };
  gitMetadata?: {
    owner?: string;
    repo?: string;
    branch: string;
    commitSha: string;
    commitUrl?: string;
    repoUrl?: string;
  };
  entities: Record<string, TraceEntity>;
  relationships: TraceRelationship[];
  files: Record<string, FileRecord>;
  warnings: AnalysisWarning[];
  limitations: string[];
  dependencies?: import('../dependencies/types').DependencyScanResult;
}

export * from '../dependencies/types';

export interface SearchQuery {
  term: string;
  kinds?: EntityKind[];
  filePattern?: string;
  limit?: number;
}

export interface SearchResult {
  entity: TraceEntity;
  matches: { field: string; snippet: string }[];
  score: number;
}
