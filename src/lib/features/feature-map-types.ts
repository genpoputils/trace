import { EntityKind, ConfidenceLevel, TraceEntity } from '../types/trace';

export type AudienceMode = 'stakeholder' | 'developer';

export type FeatureCategory =
  | 'routes_api'
  | 'components_ui'
  | 'services_logic'
  | 'data_persistence'
  | 'general';

export type FeatureConfidence = 'high' | 'medium' | 'low';

export interface FeatureEvidence {
  entityId: string;
  entityKind: EntityKind;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  relationshipIds: string[];
  reason: string;
  confidence?: ConfidenceLevel;
}

export interface FeatureFlowStep {
  stepIndex: number;
  entityId: string;
  name: string;
  kind: EntityKind;
  filePath: string;
  startLine?: number;
  relationKind?: string;
  confidence: ConfidenceLevel;
  role: 'entry_point' | 'handler' | 'service' | 'data_access' | 'external_api' | 'step';
}

export interface CodebaseFeature {
  id: string;
  name: string;
  summary: string;
  stakeholderSummary: string;
  category: FeatureCategory;
  confidence: FeatureConfidence;
  evidence: FeatureEvidence[];
  relatedFeatureIds: string[];
  entryPoint?: {
    entityId: string;
    name: string;
    kind: EntityKind;
    filePath: string;
    startLine?: number;
    endLine?: number;
    method?: string;
    routePath?: string;
  };
  flowSteps: FeatureFlowStep[];
  isInferred: boolean;
  sharedResources?: string[];
  caveats?: string[];
  trustExplanation?: {
    directEvidenceCount: number;
    staticallyResolvedCount: number;
    inferredCount: number;
    hasIncompleteAnalysis: boolean;
    limitations: string[];
  };
}

export interface OverviewAnalysisSummary {
  applicationPurpose: string;
  stakeholderDescription: string;
  evidencePoints: {
    label: string;
    detail: string;
    count?: number;
  }[];
  caveats: string[];
  isLowEvidence: boolean;
}

export interface ArchitectureCategoryGroup {
  id: string;
  name: string;
  description: string;
  count: number;
  topEntities: TraceEntity[];
}
