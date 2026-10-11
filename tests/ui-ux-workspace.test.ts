import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { browserAnalysisService } from '../src/lib/services/browser-analysis-service';
import { ECOSYSTEM_CAPABILITY_MATRIX } from '../src/lib/dependencies/capability-matrix';

describe('UI/UX Developer Workspace & View State Verification Suite', () => {
  it('retrieves sample-ecommerce-api with full stats and entities for workspace views', async () => {
    const project = await browserAnalysisService.getProject('sample-ecommerce-api');
    assert.ok(project, 'Project should exist in local store');
    assert.equal(project.projectId, 'sample-ecommerce-api');
    assert.ok(project.stats.totalFiles > 0, 'Should have positive file count');
    assert.ok(project.stats.totalSymbols > 0, 'Should have positive symbol count');
    assert.ok(project.stats.totalRelationships > 0, 'Should have relationships');
    assert.ok(project.stats.routesCount > 0, 'Should have discovered API routes');
  });

  it('verifies AI Investigator provides grounded answers with factual citations without external APIs', async () => {
    const project = await browserAnalysisService.getProject('sample-ecommerce-api');
    assert.ok(project);

    // Pick first route or function
    const firstEntity = Object.values(project.entities).find((e) => e.kind === 'route' || e.kind === 'function');
    assert.ok(firstEntity);

    const response = await browserAnalysisService.investigateQuestion(
      project.projectId,
      'Explain how this function works',
      firstEntity.id
    );

    assert.ok(response, 'Should return investigation response');
    assert.equal(response.provider, 'deterministic_offline');
    assert.ok(response.answer.length > 20, 'Answer should contain detailed explanation');
    assert.ok(Array.isArray(response.groundedFiles), 'Should provide groundedFiles array');
    assert.ok(response.groundedFiles.includes(firstEntity.filePath), 'Should cite the entity source file');
  });

  it('verifies multi-ecosystem capability matrix contains all 12 planned ecosystems', () => {
    const matrix = ECOSYSTEM_CAPABILITY_MATRIX;
    const ecosystems = matrix.map((e) => e.ecosystem);
    assert.ok(ecosystems.includes('javascript'));
    assert.ok(ecosystems.includes('python'));
    assert.ok(ecosystems.includes('rust'));
    assert.ok(ecosystems.includes('go'));
    assert.ok(ecosystems.includes('jvm'));
    assert.ok(ecosystems.includes('dotnet'));
    assert.ok(matrix.length >= 12, 'Should document at least 12 ecosystems');
  });

  it('verifies search modal backend returns matching entities with scored matches', async () => {
    const results = await browserAnalysisService.searchSymbols('sample-ecommerce-api', {
      term: 'auth',
      limit: 10,
    });
    assert.ok(Array.isArray(results), 'Results should be an array');
    assert.ok(results.length > 0, 'Should find matching symbols for auth');
    for (const r of results) {
      assert.ok(r.score > 0, 'Each result should have positive match score');
      assert.ok(r.matches.length > 0, 'Each result should specify matched fields');
    }
  });

  it('verifies selection synchronization preserves entity across relationship queries', async () => {
    const project = await browserAnalysisService.getProject('sample-ecommerce-api');
    assert.ok(project);

    const firstRoute = Object.values(project.entities).find((e) => e.kind === 'route');
    assert.ok(firstRoute);

    // Trace path
    const path = await browserAnalysisService.traceExecutionPath(project.projectId, firstRoute.id, {
      direction: 'forward',
      maxDepth: 5,
    });
    assert.ok(path);
    assert.equal(path.entryPointId, firstRoute.id);

    // Blast radius impact
    const impact = await browserAnalysisService.analyzeImpact(project.projectId, firstRoute.id);
    assert.ok(impact);
    assert.equal(impact.targetEntityId, firstRoute.id);
    assert.ok(impact.blastRadiusScore >= 0 && impact.blastRadiusScore <= 100);
  });
});
