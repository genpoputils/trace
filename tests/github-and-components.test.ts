import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GitHubClient } from '../src/lib/github/github-client';
import { TypeScriptAdapter } from '../src/lib/analyzer/typescript-adapter';
import { CodebaseAnalyzer } from '../src/lib/analyzer/codebase-analyzer';
import { SAMPLE_ECOMMERCE_API } from '../src/lib/fixtures/sample-codebases';

describe('GitHub Integration & Component Intelligence Test Suite', () => {
  const ghClient = new GitHubClient();
  const tsAdapter = new TypeScriptAdapter();
  const analyzer = new CodebaseAnalyzer();

  test('GitHubClient produces structured auth status and OAuth URLs', () => {
    const status = ghClient.getAuthStatus();
    assert.strictEqual(typeof status.isConfigured, 'boolean');
    assert.strictEqual(typeof status.oauthConfigured, 'boolean');

    // Test OAuth URL generation if client ID mocked
    process.env.GITHUB_CLIENT_ID = 'test_gh_client_123';
    const testClient = new GitHubClient();
    const loginUrl = testClient.getOAuthLoginUrl('http://localhost:3000/callback', 'state_abc');

    assert.ok(loginUrl.includes('https://github.com/login/oauth/authorize'));
    assert.ok(loginUrl.includes('client_id=test_gh_client_123'));
    assert.ok(loginUrl.includes('state=state_abc'));
    assert.ok(loginUrl.includes('scope=repo%2Cread%3Auser'));
  });

  test('TypeScriptAdapter classifies React Components and Custom Hooks', () => {
    const componentFile = SAMPLE_ECOMMERCE_API['src/components/OrderSummaryCard.tsx'];
    const hookFile = SAMPLE_ECOMMERCE_API['src/hooks/useOrderTrace.ts'];

    assert.ok(componentFile, 'Component fixture exists');
    assert.ok(hookFile, 'Hook fixture exists');

    const compOutput = tsAdapter.analyzeFile(componentFile);
    const hookOutput = tsAdapter.analyzeFile(hookFile);

    // Should classify OrderSummaryCard as component
    const cardEntity = compOutput.entities.find((e) => e.name === 'OrderSummaryCard');
    assert.ok(cardEntity, 'Found OrderSummaryCard entity');
    assert.strictEqual(cardEntity.kind, 'component');
    assert.strictEqual(cardEntity.framework, 'react');

    // Should classify useOrderTrace as hook
    const hookEntity = hookOutput.entities.find((e) => e.name === 'useOrderTrace');
    assert.ok(hookEntity, 'Found useOrderTrace entity');
    assert.strictEqual(hookEntity.kind, 'hook');
    assert.strictEqual(hookEntity.framework, 'react');
  });

  test('CodebaseAnalyzer links Component to Hook call across modules', () => {
    const analysis = analyzer.analyzeProject('Test E-Commerce', SAMPLE_ECOMMERCE_API);

    const compEntity = Object.values(analysis.entities).find((e) => e.name === 'OrderSummaryCard');
    const hookEntity = Object.values(analysis.entities).find((e) => e.name === 'useOrderTrace');

    assert.ok(compEntity, 'Found component in project analysis');
    assert.ok(hookEntity, 'Found hook in project analysis');

    // Verify cross-module call edge
    const callEdge = analysis.relationships.find(
      (r) => r.sourceId === compEntity.id && r.targetId === hookEntity.id
    );
    assert.ok(callEdge, 'OrderSummaryCard component calls useOrderTrace hook');
    assert.strictEqual(callEdge.kind, 'calls');
    assert.strictEqual(callEdge.confidence, 'statically_resolved');
  });
});
