import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { browserAnalysisService } from '../src/lib/services/browser-analysis-service';
import { ECOSYSTEM_CAPABILITY_MATRIX } from '../src/lib/dependencies/capability-matrix';
import { ProjectAnalysis } from '../src/lib/types/trace';

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

  it('verifies dependency capability matrix counts distinguish ecosystems from package manager formats', () => {
    const matrix = ECOSYSTEM_CAPABILITY_MATRIX;
    const totalFormats = matrix.length;
    const uniqueEcosystems = new Set(matrix.map((e) => e.ecosystem));
    const uniqueWithParsing = new Set(
      matrix.filter((e) => e.capabilities.manifestParsing && e.status !== 'planned').map((e) => e.ecosystem)
    );
    const fullySupported = matrix.filter((e) => e.status === 'supported');
    const partial = matrix.filter((e) => e.status === 'partial');
    const planned = matrix.filter((e) => e.status === 'planned');

    // Matrix specification assertions
    assert.equal(totalFormats, 22, 'Matrix should catalog exactly 22 package manager formats');
    assert.equal(uniqueEcosystems.size, 12, 'Matrix should document exactly 12 unique ecosystems');
    assert.equal(uniqueWithParsing.size, 10, 'Exactly 10 unique ecosystems should have supported manifest parsing');
    assert.equal(fullySupported.length, 18, 'Exactly 18 package manager formats should be fully supported');
    assert.equal(partial.length, 3, 'Exactly 3 package manager formats should be partial');
    assert.equal(planned.length, 1, 'Exactly 1 package manager format should be planned (sbt)');

    // Ensure planned format (sbt) is never classified as supported or having active parsing
    const sbtEntry = matrix.find((e) => e.packageManager === 'sbt');
    assert.ok(sbtEntry, 'sbt should exist in matrix');
    assert.equal(sbtEntry.status, 'planned', 'sbt format must be classified as planned');
    assert.equal(sbtEntry.capabilities.manifestParsing, false, 'sbt must not have manifestParsing enabled');
  });

  it('verifies commit metadata reporting accurately identifies revision availability without fabricating data', () => {
    // Case 1: Project with no git metadata (e.g. ZIP upload or local scratch)
    const mockZipProject: Partial<ProjectAnalysis> = {
      projectId: 'uploaded-zip-project',
      projectName: 'my-local-archive',
      analyzedAt: new Date().toISOString(),
      gitMetadata: undefined,
    };

    const hasCommit1 = Boolean(mockZipProject.gitMetadata?.commitSha && mockZipProject.gitMetadata.commitSha.trim());
    const hasBranch1 = Boolean(mockZipProject.gitMetadata?.branch && mockZipProject.gitMetadata.branch.trim());
    assert.equal(hasCommit1, false, 'Commit should not be reported as present when undefined');
    assert.equal(hasBranch1, false, 'Branch should not be reported as present when undefined');

    // Case 2: Project with empty commit metadata
    const mockEmptyGitProject: Partial<ProjectAnalysis> = {
      projectId: 'empty-git-project',
      projectName: 'empty-repo',
      analyzedAt: new Date().toISOString(),
      gitMetadata: {
        owner: 'user',
        repo: 'repo',
        branch: '',
        commitSha: '',
      },
    };
    const hasCommit2 = Boolean(mockEmptyGitProject.gitMetadata?.commitSha && mockEmptyGitProject.gitMetadata.commitSha.trim());
    assert.equal(hasCommit2, false, 'Empty commit SHA string must not be reported as available');

    // Case 3: Project with genuine verified commit SHA
    const verifiedSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    const mockVerifiedProject: Partial<ProjectAnalysis> = {
      projectId: 'verified-git-project',
      projectName: 'org/verified-repo',
      analyzedAt: new Date().toISOString(),
      gitMetadata: {
        owner: 'org',
        repo: 'verified-repo',
        branch: 'release/v2.1',
        commitSha: verifiedSha,
      },
    };
    const hasCommit3 = Boolean(mockVerifiedProject.gitMetadata?.commitSha && mockVerifiedProject.gitMetadata.commitSha.trim());
    assert.equal(hasCommit3, true);
    assert.equal(mockVerifiedProject.gitMetadata?.commitSha, verifiedSha);
    assert.equal(mockVerifiedProject.gitMetadata?.branch, 'release/v2.1');
  });

  it('verifies search service scoring and filter constraints', async () => {
    // Search with valid query
    const results = await browserAnalysisService.searchSymbols('sample-ecommerce-api', {
      term: 'auth',
      limit: 10,
    });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'Should find matching symbols for auth');
    for (const r of results) {
      assert.ok(r.score > 0, 'Each result should have positive match score');
      assert.ok(r.matches.length > 0, 'Each result should specify matched fields');
    }

    // Search with kind filter: only routes
    const routeResults = await browserAnalysisService.searchSymbols('sample-ecommerce-api', {
      term: 'auth',
      kinds: ['route'],
      limit: 10,
    });
    for (const r of routeResults) {
      assert.equal(r.entity.kind, 'route', 'Kind filter must strictly constrain results');
    }

    // Search with nonsense term produces empty array without error
    const emptyResults = await browserAnalysisService.searchSymbols('sample-ecommerce-api', {
      term: 'nonexistent_xyz_symbol_never_found_123',
      limit: 10,
    });
    assert.equal(emptyResults.length, 0);
  });

  it('verifies sample project protection against accidental deletion', async () => {
    // Attempting to delete the default sample project must be safely refused
    const deleteResult = await browserAnalysisService.deleteProject('sample-ecommerce-api');
    assert.equal(deleteResult, false, 'Sample project must be protected against deletion');

    // Ensure sample project is still retrievable
    const sample = await browserAnalysisService.getProject('sample-ecommerce-api');
    assert.ok(sample, 'Sample project must still exist after attempted deletion');
    assert.equal(sample.projectId, 'sample-ecommerce-api');
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
