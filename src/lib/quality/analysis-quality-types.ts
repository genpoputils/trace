/**
 * Analysis Quality, Coverage & Trust Layer Types
 * GenPopUtils Trace — Visual Codebase Intelligence Platform
 */

import { WorkspaceTabId } from '@/components/layout/AppNavigationRail';
import { ProjectAnalysis, AnalysisWarning } from '../types/trace';

export type ProjectAnalysisQualityInput = Omit<ProjectAnalysis, 'warnings'> & {
  warnings?: AnalysisWarning[];
};

export type QualityStatus = 'complete' | 'partial' | 'degraded' | 'unknown';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCategory =
  | 'unsupported_files'
  | 'parse_errors'
  | 'unresolved_relationships'
  | 'dynamic_patterns'
  | 'partial_analysis'
  | 'dependency_diagnostics'
  | 'analyzer_limitations';

export interface QualityNavigationTarget {
  entityId?: string;
  filePath?: string;
  line?: number;
  tab?: WorkspaceTabId;
  actionLabel: string;
}

export interface AnalysisDiagnostic {
  id: string; // Stable deterministic ID
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  description: string;
  affectedTarget?: string; // e.g. "src/routes/order.ts:42" or symbol/rel name
  reason: string;
  evidence: string;
  nextAction?: string;
  navigationTarget?: QualityNavigationTarget;
}

export interface MetricValue<T> {
  value: T;
  isKnown: boolean;
  explanation: string;
}

export interface CoverageMetrics {
  totalDiscovered: MetricValue<number | null>;
  filesAnalyzed: MetricValue<number>;
  filesSkipped: MetricValue<number>;
  filesWithErrors: MetricValue<number>;
  detectedLanguages: string[];
  coveragePercentage: MetricValue<number | null> & { label: string };
  warningsCount: MetricValue<number>;
}

export interface ResolutionQualityMetrics {
  totalRelationships: number;
  staticallyResolved: number;
  locallyEstablished: number;
  inferred: number;
  dynamicUnresolved: number;
  unresolvedImports: number;
  unlinkedRoutes: number;
  routesCount: number;
  resolutionRate: MetricValue<number | null>;
}

export interface AnalysisQualityReport {
  status: QualityStatus;
  statusHeadline: string;
  statusExplanation: string;
  statusCaveats: string[];
  coverage: CoverageMetrics;
  resolution: ResolutionQualityMetrics;
  diagnostics: AnalysisDiagnostic[];
  limitations: string[];
  isCompleteDiagnosticSet: boolean;
  generatedAt: string;
}
