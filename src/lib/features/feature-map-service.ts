import {
  ProjectAnalysis,
  TraceEntity,
  TraceRelationship,
} from '../types/trace';
import {
  CodebaseFeature,
  FeatureEvidence,
  FeatureFlowStep,
  FeatureConfidence,
  OverviewAnalysisSummary,
  ArchitectureCategoryGroup,
} from './feature-map-types';

/**
 * Cache container to prevent redundant inference runs across tab switches
 */
interface CacheEntry {
  cacheKey: string;
  features: CodebaseFeature[];
  overview: OverviewAnalysisSummary;
  architecture: ArchitectureCategoryGroup[];
}

let activeCache: CacheEntry | null = null;

export function clearFeatureCache(): void {
  activeCache = null;
}

function getCacheKey(analysis: ProjectAnalysis): string {
  const commit = analysis.gitMetadata?.commitSha || 'local';
  const analyzedAt = analysis.analyzedAt || '0';
  const entityIds = Object.keys(analysis.entities || {});
  const entityCount = entityIds.length;
  const rels = (analysis.relationships || []).length;
  const sample = entityIds.slice(0, 5).join('|');
  return `${analysis.projectId}_${commit}_${analyzedAt}_${entityCount}_${rels}_${sample}`;
}

/**
 * Helper to humanize slug / token names (e.g. "orderController" -> "Order Controller")
 */
function humanizeToken(token: string): string {
  return token
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Extract clean resource name from route path (e.g. "/api/orders/:id" -> "orders")
 */
function extractRouteResource(routePath: string, filePath?: string): string {
  const clean = routePath.split('?')[0].trim();
  const segments = clean
    .split('/')
    .filter((s) => s.length > 0 && !s.startsWith(':') && !s.startsWith('[') && s !== 'api' && s !== 'v1' && s !== 'v2');
  let raw = '';
  if (segments.length > 0) {
    raw = segments[0].toLowerCase();
  } else if (filePath) {
    const fileBase = filePath.split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase() || '';
    const cleanBase = fileBase.replace(/routes?|router|controller|handler|service/g, '').trim();
    if (cleanBase.length > 0) {
      raw = cleanBase;
    } else if (fileBase.length > 0) {
      raw = fileBase;
    }
  }

  if (raw) {
    if (raw.endsWith('s') && raw.length > 3) {
      return raw.slice(0, -1);
    }
    return raw;
  }
  return 'root';
}

/**
 * Map resource name to a business-level capability name
 */
function mapResourceToCapabilityName(resource: string): string {
  const map: Record<string, string> = {
    orders: 'Order Processing',
    order: 'Order Processing',
    auth: 'Authentication & Access',
    login: 'Authentication & Access',
    users: 'User Management',
    user: 'User Management',
    products: 'Product Catalogue',
    product: 'Product Catalogue',
    items: 'Product Catalogue',
    payments: 'Payment Processing',
    payment: 'Payment Processing',
    checkout: 'Checkout & Payments',
    notifications: 'Notifications & Alerts',
    notification: 'Notifications & Alerts',
    analytics: 'Analytics & Reporting',
    settings: 'Configuration & Settings',
    health: 'Health & Diagnostics',
    search: 'Search & Discovery',
    webhooks: 'Webhook Integration',
  };

  if (map[resource]) return map[resource];
  return `${humanizeToken(resource)} Management`;
}

/**
 * 1. Generate Deterministic Application Overview Summary
 */
export function generateCodebaseOverview(analysis: ProjectAnalysis): OverviewAnalysisSummary {
  const entities = Object.values(analysis.entities || {});
  const totalEntities = entities.length;
  const totalFiles = analysis.stats?.totalFiles ?? Object.keys(analysis.files || {}).length;
  const languages = analysis.stats?.languages?.length
    ? analysis.stats.languages.join(', ')
    : 'TypeScript / JavaScript';

  if (totalEntities === 0 && totalFiles === 0) {
    return {
      applicationPurpose: 'Trace has not found enough evidence to summarise this application yet.',
      stakeholderDescription: 'Trace has not found enough evidence to summarise this application yet.',
      evidencePoints: [],
      caveats: [
        'No source files or code entities were detected in the selected repository analysis.',
      ],
      isLowEvidence: true,
    };
  }

  const routes = entities.filter((e) => e.kind === 'route');
  const components = entities.filter((e) => e.kind === 'component');
  const hooks = entities.filter((e) => e.kind === 'hook');
  const dbQueries = entities.filter((e) => e.kind === 'db_query');
  const services = entities.filter((e) => e.kind === 'service' || (e.kind === 'function' && e.isExported));

  // Collect unique frameworks
  const frameworks: string[] = Array.from(
    new Set(
      entities
        .map((e) => e.framework)
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
    )
  );

  // Collect distinct route resources
  const routeResources = Array.from(
    new Set(routes.map((r) => extractRouteResource(r.metadata?.routePath || r.name, r.filePath)))
  ).filter((r) => r !== 'root');

  // Collect DB models
  const dbModels = Array.from(
    new Set(dbQueries.map((q) => q.metadata?.dbModel).filter((m): m is string => Boolean(m)))
  );

  // Evidence points
  const evidencePoints: OverviewAnalysisSummary['evidencePoints'] = [];

  if (routes.length > 0) {
    evidencePoints.push({
      label: 'Discovered Entry Points',
      detail: `${routes.length} HTTP route declaration(s) covering ${routeResources.map((r) => mapResourceToCapabilityName(r)).slice(0, 3).join(', ')}${routeResources.length > 3 ? ' and more' : ''}.`,
      count: routes.length,
    });
  }

  if (components.length > 0 || hooks.length > 0) {
    evidencePoints.push({
      label: 'UI Components & Custom Hooks',
      detail: `${components.length} React component(s) and ${hooks.length} custom hook(s) managing presentation workflows.`,
      count: components.length + hooks.length,
    });
  }

  if (services.length > 0) {
    evidencePoints.push({
      label: 'Business Logic & Services',
      detail: `${services.length} modular function(s) and service handlers implementing core algorithms.`,
      count: services.length,
    });
  }

  if (dbQueries.length > 0) {
    evidencePoints.push({
      label: 'Data Persistence Layer',
      detail: `${dbQueries.length} database query point(s)${dbModels.length > 0 ? ` operating on models (${dbModels.join(', ')})` : ''}.`,
      count: dbQueries.length,
    });
  }

  if (evidencePoints.length === 0) {
    evidencePoints.push({
      label: 'General Codebase Structure',
      detail: `${totalFiles} file(s) containing ${analysis.stats?.totalSymbols || totalEntities} parsed symbol(s).`,
      count: totalFiles,
    });
  }

  // Caveats
  const caveats: string[] = [
    'Summary is deterministically derived from static AST entity declarations and cross-module relationships.',
    'Runtime behaviors such as dynamic dispatches, network configurations, or external microservices are unverified.',
  ];

  if (analysis.isPartial) {
    caveats.push(
      analysis.partialReason ||
        'Analysis was recorded as partial. Some source files or relationships may have unresolved linkages.'
    );
  }

  // Build Purpose Sentences
  let applicationPurpose = '';
  let stakeholderDescription = '';

  const frameworkLabel = frameworks.length > 0 ? frameworks.map((f) => humanizeToken(f)).join('/') : 'TypeScript';

  if (routes.length > 0) {
    const domainNames = routeResources.map((r) => mapResourceToCapabilityName(r)).slice(0, 3).join(', ');
    applicationPurpose = `This application appears to be a ${frameworkLabel} backend service exposing ${routes.length} HTTP endpoint(s) across ${domainNames || 'declared routes'}.`;

    if (dbQueries.length > 0) {
      applicationPurpose += ` It handles domain requests through structured service handlers connected to persistent data storage${dbModels.length > 0 ? ` (${dbModels.join(', ')})` : ''}.`;
    } else {
      applicationPurpose += ` It handles incoming requests through statically resolved service handlers and utility modules.`;
    }

    applicationPurpose += ` Discovered code relationships indicate a modular architecture spanning ${totalFiles} file(s) in ${languages}.`;

    stakeholderDescription = `This system provides backend capabilities for ${domainNames || 'the application'}. It enables client applications to submit requests, process core business operations, and manage data records.`;
  } else if (components.length > 0) {
    applicationPurpose = `This application appears to be a ${frameworkLabel} frontend application comprising ${components.length} component(s) and ${hooks.length} custom hook(s).`;
    applicationPurpose += ` It structures interactive views and state handling across ${totalFiles} file(s).`;

    stakeholderDescription = `This application provides interactive user interface screens and presentation views for end users.`;
  } else if (services.length > 0) {
    applicationPurpose = `This codebase appears to be a ${frameworkLabel} utility or domain logic library containing ${services.length} modular function(s) across ${totalFiles} file(s).`;
    stakeholderDescription = `This library provides reusable business logic and operational utilities for other services.`;
  } else {
    applicationPurpose = 'Trace has not found enough evidence to summarise this application yet.';
    stakeholderDescription = 'Trace has not found enough evidence to summarise this application yet.';
  }

  return {
    applicationPurpose,
    stakeholderDescription,
    evidencePoints,
    caveats,
    isLowEvidence: totalEntities < 3,
  };
}

/**
 * 2. Extract Architecture Category Groups (Application Structure)
 */
export function extractArchitectureGroups(analysis: ProjectAnalysis): ArchitectureCategoryGroup[] {
  const entities = Object.values(analysis.entities || {});
  const mostConnectedSet = new Set((analysis.stats?.mostConnected || []).map((m) => m.symbolId));

  const sortByRelevance = (list: TraceEntity[]) => {
    return [...list].sort((a, b) => {
      const aHub = mostConnectedSet.has(a.id) ? 1 : 0;
      const bHub = mostConnectedSet.has(b.id) ? 1 : 0;
      if (aHub !== bHub) return bHub - aHub;
      const aExport = a.isExported ? 1 : 0;
      const bExport = b.isExported ? 1 : 0;
      return bExport - aExport;
    });
  };

  const groups: ArchitectureCategoryGroup[] = [];

  // Group 1: Entry Points & Routes
  const routes = entities.filter((e) => e.kind === 'route');
  if (routes.length > 0) {
    groups.push({
      id: 'entry_points',
      name: 'Entry Points & Routes',
      description: 'Discovered HTTP endpoint declarations and request listeners',
      count: routes.length,
      topEntities: sortByRelevance(routes).slice(0, 6),
    });
  }

  // Group 2: UI Components
  const uiEntities = entities.filter((e) => e.kind === 'component' || e.kind === 'hook');
  if (uiEntities.length > 0) {
    groups.push({
      id: 'ui_components',
      name: 'UI Components & Hooks',
      description: 'Interactive presentation components and custom state hooks',
      count: uiEntities.length,
      topEntities: sortByRelevance(uiEntities).slice(0, 6),
    });
  }

  // Group 3: Services & Business Logic
  const serviceEntities = entities.filter(
    (e) =>
      e.kind === 'service' ||
      (e.kind === 'function' && e.isExported && !e.filePath.includes('test') && !e.filePath.includes('spec')) ||
      e.kind === 'method' ||
      e.kind === 'class'
  );
  if (serviceEntities.length > 0) {
    groups.push({
      id: 'services_logic',
      name: 'Services & Business Logic',
      description: 'Domain services, request controllers, and algorithmic functions',
      count: serviceEntities.length,
      topEntities: sortByRelevance(serviceEntities).slice(0, 6),
    });
  }

  // Group 4: Data & Persistence
  const dataEntities = entities.filter((e) => e.kind === 'db_query');
  if (dataEntities.length > 0) {
    groups.push({
      id: 'data_persistence',
      name: 'Data & Persistence',
      description: 'Database query operations, ORM models, and storage access',
      count: dataEntities.length,
      topEntities: sortByRelevance(dataEntities).slice(0, 6),
    });
  }

  // Group 5: External Boundaries
  const externalEntities = entities.filter((e) => e.kind === 'external_api');
  if (externalEntities.length > 0) {
    groups.push({
      id: 'external_boundaries',
      name: 'External Boundaries',
      description: 'Calls to third-party packages, external APIs, and cloud services',
      count: externalEntities.length,
      topEntities: sortByRelevance(externalEntities).slice(0, 6),
    });
  }

  return groups;
}

/**
 * 3. Infer Feature Map (Deterministic Capability Clustering)
 */
export function inferFeatureMap(analysis: ProjectAnalysis): CodebaseFeature[] {
  const cacheKey = getCacheKey(analysis);
  if (activeCache && activeCache.cacheKey === cacheKey) {
    return activeCache.features;
  }

  const entities = analysis.entities || {};
  const relationships = analysis.relationships || [];

  // Index relationships
  const outgoingRelMap = new Map<string, TraceRelationship[]>();
  const incomingRelMap = new Map<string, TraceRelationship[]>();

  for (const rel of relationships) {
    const outList = outgoingRelMap.get(rel.sourceId) || [];
    outList.push(rel);
    outgoingRelMap.set(rel.sourceId, outList);

    const inList = incomingRelMap.get(rel.targetId) || [];
    inList.push(rel);
    incomingRelMap.set(rel.targetId, inList);
  }

  const features: CodebaseFeature[] = [];
  const claimedEntityIds = new Set<string>();

  // =========================================================================
  // Tier A: Route Clusters
  // Group routes by resource prefix (e.g. /api/orders & /api/orders/:id)
  // =========================================================================
  const allRoutes = Object.values(entities).filter((e) => e.kind === 'route');
  const routeGroups = new Map<string, TraceEntity[]>();

  for (const route of allRoutes) {
    const resource = extractRouteResource(route.metadata?.routePath || route.name, route.filePath);
    const list = routeGroups.get(resource) || [];
    list.push(route);
    routeGroups.set(resource, list);
  }

  for (const [resource, routesInGroup] of routeGroups.entries()) {
    const featureName = mapResourceToCapabilityName(resource);
    const featureId = `feature-route-${resource}`;
    const evidenceList: FeatureEvidence[] = [];
    const evidenceEntityIds = new Set<string>();
    const flowSteps: FeatureFlowStep[] = [];
    const sharedResources = new Set<string>();

    let stepCounter = 1;
    let hasServiceLink = false;
    let hasDataLink = false;

    // Add all routes as evidence
    for (const route of routesInGroup) {
      if (!evidenceEntityIds.has(route.id)) {
        evidenceEntityIds.add(route.id);
        evidenceList.push({
          entityId: route.id,
          entityKind: 'route',
          name: route.name,
          filePath: route.filePath,
          startLine: route.location.startLine,
          endLine: route.location.endLine,
          relationshipIds: (outgoingRelMap.get(route.id) || []).map((r) => r.id),
          reason: `Exposes ${route.name} endpoint`,
          confidence: 'statically_resolved',
        });
      }

      flowSteps.push({
        stepIndex: stepCounter++,
        entityId: route.id,
        name: route.name,
        kind: 'route',
        filePath: route.filePath,
        startLine: route.location.startLine,
        confidence: 'statically_resolved',
        role: 'entry_point',
      });

      // Find handlers linked to route
      const routeOut = outgoingRelMap.get(route.id) || [];
      for (const rel of routeOut) {
        if (rel.kind === 'routes_to' || rel.kind === 'calls') {
          const handler = entities[rel.targetId];
          if (handler && !evidenceEntityIds.has(handler.id)) {
            evidenceEntityIds.add(handler.id);
            evidenceList.push({
              entityId: handler.id,
              entityKind: handler.kind,
              name: handler.name,
              filePath: handler.filePath,
              startLine: handler.location.startLine,
              endLine: handler.location.endLine,
              relationshipIds: [rel.id],
              reason: `Direct handler dispatched by ${route.name}`,
              confidence: rel.confidence,
            });

            flowSteps.push({
              stepIndex: stepCounter++,
              entityId: handler.id,
              name: handler.name,
              kind: handler.kind,
              filePath: handler.filePath,
              startLine: handler.location.startLine,
              relationKind: rel.kind,
              confidence: rel.confidence,
              role: 'handler',
            });

            // Find downstream services/functions called by handler
            const handlerOut = outgoingRelMap.get(handler.id) || [];
            for (const hRel of handlerOut) {
              if (hRel.kind === 'calls') {
                const callee = entities[hRel.targetId];
                if (callee && !evidenceEntityIds.has(callee.id)) {
                  evidenceEntityIds.add(callee.id);
                  hasServiceLink = true;

                  const isDb = callee.kind === 'db_query';
                  const isExt = callee.kind === 'external_api';
                  if (isDb) hasDataLink = true;
                  if (callee.metadata?.dbModel) {
                    sharedResources.add(`db:${callee.metadata.dbModel}`);
                  }

                  evidenceList.push({
                    entityId: callee.id,
                    entityKind: callee.kind,
                    name: callee.name,
                    filePath: callee.filePath,
                    startLine: callee.location.startLine,
                    endLine: callee.location.endLine,
                    relationshipIds: [hRel.id],
                    reason: isDb
                      ? `Database query invoked during request processing`
                      : isExt
                      ? `External API integration`
                      : `Service logic invoked by ${handler.name}`,
                    confidence: hRel.confidence,
                  });

                  flowSteps.push({
                    stepIndex: stepCounter++,
                    entityId: callee.id,
                    name: callee.name,
                    kind: callee.kind,
                    filePath: callee.filePath,
                    startLine: callee.location.startLine,
                    relationKind: hRel.kind,
                    confidence: hRel.confidence,
                    role: isDb ? 'data_access' : isExt ? 'external_api' : 'service',
                  });

                  // If callee is a service function, check if it in turn calls a db query
                  if (!isDb && !isExt) {
                    const serviceOut = outgoingRelMap.get(callee.id) || [];
                    for (const sRel of serviceOut) {
                      const dbTarget = entities[sRel.targetId];
                      if (dbTarget && dbTarget.kind === 'db_query' && !evidenceEntityIds.has(dbTarget.id)) {
                        evidenceEntityIds.add(dbTarget.id);
                        hasDataLink = true;
                        if (dbTarget.metadata?.dbModel) {
                          sharedResources.add(`db:${dbTarget.metadata.dbModel}`);
                        }

                        evidenceList.push({
                          entityId: dbTarget.id,
                          entityKind: 'db_query',
                          name: dbTarget.name,
                          filePath: dbTarget.filePath,
                          startLine: dbTarget.location.startLine,
                          endLine: dbTarget.location.endLine,
                          relationshipIds: [sRel.id],
                          reason: `Persistence layer query executed via ${callee.name}`,
                          confidence: sRel.confidence,
                        });

                        flowSteps.push({
                          stepIndex: stepCounter++,
                          entityId: dbTarget.id,
                          name: dbTarget.name,
                          kind: 'db_query',
                          filePath: dbTarget.filePath,
                          startLine: dbTarget.location.startLine,
                          relationKind: sRel.kind,
                          confidence: sRel.confidence,
                          role: 'data_access',
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Determine confidence:
    // Tier A with route + handler + service/data is high; route alone without links is medium
    const confidence: FeatureConfidence =
      hasServiceLink || hasDataLink || evidenceList.length >= 3 ? 'high' : routesInGroup.length > 0 ? 'medium' : 'low';

    // Summary description
    const methods = Array.from(new Set(routesInGroup.map((r) => r.metadata?.httpMethod || 'HTTP'))).join(', ');
    const primaryRoute =
      routesInGroup.find((r) => r.metadata?.httpMethod && r.metadata.httpMethod !== 'USE') ||
      routesInGroup[0];

    const summary = `Manages ${resource} operations via ${routesInGroup.length} endpoint(s) (${methods}) with ${evidenceList.length} supporting code entity/entities.`;
    const stakeholderSummary = `Enables users and clients to interact with ${humanizeToken(resource).toLowerCase()} through established application operations.`;

    // Mark claimed entities
    evidenceEntityIds.forEach((id) => claimedEntityIds.add(id));

    features.push({
      id: featureId,
      name: featureName,
      summary,
      stakeholderSummary,
      category: 'routes_api',
      confidence,
      evidence: evidenceList,
      relatedFeatureIds: [],
      entryPoint: {
        entityId: primaryRoute.id,
        name: primaryRoute.name,
        kind: 'route',
        filePath: primaryRoute.filePath,
        startLine: primaryRoute.location.startLine,
        endLine: primaryRoute.location.endLine,
        method: primaryRoute.metadata?.httpMethod,
        routePath: primaryRoute.metadata?.routePath,
      },
      flowSteps,
      isInferred: true,
      sharedResources: Array.from(sharedResources),
    });
  }

  // =========================================================================
  // Tier B: UI Component Clusters
  // Group components and custom hooks by file/directory cluster
  // =========================================================================
  const unclaimedUI = Object.values(entities).filter(
    (e) => !claimedEntityIds.has(e.id) && (e.kind === 'component' || e.kind === 'hook')
  );

  // Group by directory
  const uiByDir = new Map<string, TraceEntity[]>();
  for (const ui of unclaimedUI) {
    const dir = ui.filePath.split('/').slice(0, -1).join('/') || 'components';
    const list = uiByDir.get(dir) || [];
    list.push(ui);
    uiByDir.set(dir, list);
  }

  for (const [dir, dirEntities] of uiByDir.entries()) {
    if (dirEntities.length === 0) continue;

    const dirName = dir.split('/').pop() || 'ui';
    const featureName = `${humanizeToken(dirName)} Interface`;
    const featureId = `feature-ui-${dir.replace(/[/\\.]/g, '-')}`;

    const evidenceList: FeatureEvidence[] = [];
    const flowSteps: FeatureFlowStep[] = [];
    let stepCount = 1;

    for (const ent of dirEntities) {
      claimedEntityIds.add(ent.id);
      evidenceList.push({
        entityId: ent.id,
        entityKind: ent.kind,
        name: ent.name,
        filePath: ent.filePath,
        startLine: ent.location.startLine,
        endLine: ent.location.endLine,
        relationshipIds: (outgoingRelMap.get(ent.id) || []).map((r) => r.id),
        reason: `${ent.kind === 'component' ? 'Renders UI element' : 'Manages component state hook'} in ${ent.filePath}`,
        confidence: 'locally_established',
      });

      flowSteps.push({
        stepIndex: stepCount++,
        entityId: ent.id,
        name: ent.name,
        kind: ent.kind,
        filePath: ent.filePath,
        startLine: ent.location.startLine,
        confidence: 'locally_established',
        role: ent.kind === 'component' ? 'entry_point' : 'step',
      });
    }

    const primaryComponent = dirEntities.find((e) => e.kind === 'component') || dirEntities[0];
    const confidence: FeatureConfidence = dirEntities.length >= 2 ? 'medium' : 'low';

    features.push({
      id: featureId,
      name: featureName,
      summary: `Renders ${dirEntities.length} UI component(s) and hook(s) located in ${dir}.`,
      stakeholderSummary: `Provides interactive screen elements and presentation controls for ${humanizeToken(dirName).toLowerCase()}.`,
      category: 'components_ui',
      confidence,
      evidence: evidenceList,
      relatedFeatureIds: [],
      entryPoint: primaryComponent
        ? {
            entityId: primaryComponent.id,
            name: primaryComponent.name,
            kind: primaryComponent.kind,
            filePath: primaryComponent.filePath,
            startLine: primaryComponent.location.startLine,
            endLine: primaryComponent.location.endLine,
          }
        : undefined,
      flowSteps,
      isInferred: true,
    });
  }

  // =========================================================================
  // Tier B / C: Standalone Services & Logic Modules
  // Group exported functions / services that were not attached to routes
  // =========================================================================
  const unclaimedServices = Object.values(entities).filter(
    (e) =>
      !claimedEntityIds.has(e.id) &&
      (e.kind === 'service' || (e.kind === 'function' && e.isExported)) &&
      !e.filePath.includes('test') &&
      !e.filePath.includes('spec')
  );

  // Group by file
  const servicesByFile = new Map<string, TraceEntity[]>();
  for (const s of unclaimedServices) {
    const list = servicesByFile.get(s.filePath) || [];
    list.push(s);
    servicesByFile.set(s.filePath, list);
  }

  for (const [filePath, fileEntities] of servicesByFile.entries()) {
    if (fileEntities.length === 0) continue;

    const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'service';
    const featureName = `${humanizeToken(baseName)} Service`;
    const featureId = `feature-service-${baseName.replace(/[^a-zA-Z0-9]/g, '-')}`;

    const evidenceList: FeatureEvidence[] = [];
    const flowSteps: FeatureFlowStep[] = [];
    let stepCount = 1;

    for (const ent of fileEntities) {
      claimedEntityIds.add(ent.id);
      evidenceList.push({
        entityId: ent.id,
        entityKind: ent.kind,
        name: ent.name,
        filePath: ent.filePath,
        startLine: ent.location.startLine,
        endLine: ent.location.endLine,
        relationshipIds: (outgoingRelMap.get(ent.id) || []).map((r) => r.id),
        reason: `Exported business service function in ${ent.filePath}`,
        confidence: 'locally_established',
      });

      flowSteps.push({
        stepIndex: stepCount++,
        entityId: ent.id,
        name: ent.name,
        kind: ent.kind,
        filePath: ent.filePath,
        startLine: ent.location.startLine,
        confidence: 'locally_established',
        role: 'service',
      });
    }

    const primaryFn = fileEntities[0];
    const hasOutgoingCalls = fileEntities.some((e) => (outgoingRelMap.get(e.id) || []).length > 0);
    const confidence: FeatureConfidence = hasOutgoingCalls || fileEntities.length >= 2 ? 'medium' : 'low';

    features.push({
      id: featureId,
      name: featureName,
      summary: `Provides ${fileEntities.length} domain calculation and logic function(s) in ${filePath}.`,
      stakeholderSummary: `Executes calculations and utility services for ${humanizeToken(baseName).toLowerCase()}.`,
      category: 'services_logic',
      confidence,
      evidence: evidenceList,
      relatedFeatureIds: [],
      entryPoint: primaryFn
        ? {
            entityId: primaryFn.id,
            name: primaryFn.name,
            kind: primaryFn.kind,
            filePath: primaryFn.filePath,
            startLine: primaryFn.location.startLine,
            endLine: primaryFn.location.endLine,
          }
        : undefined,
      flowSteps,
      isInferred: true,
    });
  }

  // =========================================================================
  // Unclaimed DB Queries: Data Persistence Feature
  // =========================================================================
  const unclaimedDb = Object.values(entities).filter(
    (e) => !claimedEntityIds.has(e.id) && e.kind === 'db_query'
  );

  if (unclaimedDb.length > 0) {
    const featureId = 'feature-data-persistence';
    const evidenceList: FeatureEvidence[] = [];
    const flowSteps: FeatureFlowStep[] = [];
    let stepCount = 1;

    for (const q of unclaimedDb) {
      claimedEntityIds.add(q.id);
      evidenceList.push({
        entityId: q.id,
        entityKind: 'db_query',
        name: q.name,
        filePath: q.filePath,
        startLine: q.location.startLine,
        endLine: q.location.endLine,
        relationshipIds: (incomingRelMap.get(q.id) || []).map((r) => r.id),
        reason: `Direct persistence operation on ${q.metadata?.dbModel || 'database'}`,
        confidence: 'statically_resolved',
      });

      flowSteps.push({
        stepIndex: stepCount++,
        entityId: q.id,
        name: q.name,
        kind: 'db_query',
        filePath: q.filePath,
        startLine: q.location.startLine,
        confidence: 'statically_resolved',
        role: 'data_access',
      });
    }

    features.push({
      id: featureId,
      name: 'Data Persistence Layer',
      summary: `Manages database operations across ${unclaimedDb.length} query point(s).`,
      stakeholderSummary: `Persists and retrieves records from the database.`,
      category: 'data_persistence',
      confidence: 'medium',
      evidence: evidenceList,
      relatedFeatureIds: [],
      flowSteps,
      isInferred: true,
    });
  }

  // =========================================================================
  // Cross-Feature Relationship Linking
  // Detect if two features share a service or data model
  // =========================================================================
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const featA = features[i];
      const featB = features[j];

      // Check shared files or shared resources
      const filesA = new Set(featA.evidence.map((e) => e.filePath));
      const filesB = new Set(featB.evidence.map((e) => e.filePath));
      const sharedFiles = Array.from(filesA).filter((f) => filesB.has(f));

      const resA = new Set(featA.sharedResources || []);
      const resB = new Set(featB.sharedResources || []);
      const sharedRes = Array.from(resA).filter((r) => resB.has(r));

      // Check cross relationships: if any entity in A calls an entity in B
      const idsA = new Set(featA.evidence.map((e) => e.entityId));
      const idsB = new Set(featB.evidence.map((e) => e.entityId));
      let callsAcross = false;

      for (const eId of idsA) {
        const outRels = outgoingRelMap.get(eId) || [];
        if (outRels.some((r) => idsB.has(r.targetId))) {
          callsAcross = true;
          break;
        }
      }

      if (sharedFiles.length > 0 || sharedRes.length > 0 || callsAcross) {
        if (!featA.relatedFeatureIds.includes(featB.id)) {
          featA.relatedFeatureIds.push(featB.id);
        }
        if (!featB.relatedFeatureIds.includes(featA.id)) {
          featB.relatedFeatureIds.push(featA.id);
        }
      }
    }
  }

  // Update Cache
  activeCache = {
    cacheKey,
    features,
    overview: generateCodebaseOverview(analysis),
    architecture: extractArchitectureGroups(analysis),
  };

  return features;
}

/**
 * Filter feature map items based on search term, category, and confidence
 */
export function filterFeatures(
  features: CodebaseFeature[],
  query: string,
  category: string,
  confidence: string
): CodebaseFeature[] {
  const q = query.trim().toLowerCase();

  return features.filter((feat) => {
    // 1. Category Filter
    if (category !== 'all' && feat.category !== category) {
      return false;
    }

    // 2. Confidence Filter
    if (confidence !== 'all' && feat.confidence !== confidence) {
      return false;
    }

    // 3. Search Query Filter
    if (!q) return true;

    if (feat.name.toLowerCase().includes(q)) return true;
    if (feat.summary.toLowerCase().includes(q)) return true;
    if (feat.stakeholderSummary.toLowerCase().includes(q)) return true;
    if (feat.entryPoint?.name.toLowerCase().includes(q)) return true;
    if (feat.entryPoint?.routePath?.toLowerCase().includes(q)) return true;

    // Check evidence files & symbols
    return feat.evidence.some(
      (ev) => ev.name.toLowerCase().includes(q) || ev.filePath.toLowerCase().includes(q)
    );
  });
}
