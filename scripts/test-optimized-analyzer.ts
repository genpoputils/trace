import ts from 'typescript';
import { githubClient } from '../src/lib/github/github-client';
import JSZip from 'jszip';
import path from 'path';

// Optimized file filter
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'out',
  'coverage', '.cache', 'vendor', '.venv', '__pycache__',
  '__tests__', 'tests', 'test', 'e2e', 'spec', 'specs', 'cypress',
  'fixtures', 'mocks', '__mocks__', 'android', 'ios', 'fastlane',
  'locales', 'i18n', 'docs', 'assets', 'static', 'public', '.github', '.vscode'
]);

const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

async function testOptimized() {
  console.log('Downloading immich archive...');
  const t0 = performance.now();
  const { buffer, commitSha } = await githubClient.downloadRepoArchive('immich-app', 'immich', 'main');
  console.log(`Downloaded in ${((performance.now() - t0) / 1000).toFixed(2)}s.`);

  console.log('Decompressing and filtering source files...');
  const t1 = performance.now();
  const zip = await JSZip.loadAsync(buffer);

  // Common prefix
  const entryNames = Object.keys(zip.files);
  let commonPrefix = '';
  if (entryNames.length > 0) {
    const parts = entryNames[0].split(/[/\\]/);
    if (parts.length > 1 && entryNames.every((n) => n.startsWith(parts[0] + '/') || n.startsWith(parts[0] + '\\'))) {
      commonPrefix = parts[0] + '/';
    }
  }

  const sourceFiles: Record<string, { path: string; content: string; lines: number; size: number }> = {};
  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    let norm = rawPath.replace(/\\/g, '/');
    if (commonPrefix && norm.startsWith(commonPrefix)) norm = norm.slice(commonPrefix.length);
    norm = norm.replace(/^\/+/, '');

    const segments = norm.split('/');
    if (segments.some((s) => EXCLUDED_DIRS.has(s.toLowerCase()))) continue;

    const ext = path.extname(norm).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    if (norm.endsWith('.d.ts') || norm.includes('.spec.') || norm.includes('.test.')) continue;

    const content = await entry.async('string');
    sourceFiles[norm] = {
      path: norm,
      content,
      lines: content.split('\n').length,
      size: Buffer.byteLength(content, 'utf8'),
    };
  }

  console.log(`Discovered ${Object.keys(sourceFiles).length} application source files in ${((performance.now() - t1) / 1000).toFixed(2)}s.`);

  // Now measure AST parsing speed with an optimized scope-tracking visitor
  console.log('Parsing AST across all files...');
  const t2 = performance.now();
  let totalEntities = 0;
  let totalCalls = 0;

  for (const file of Object.values(sourceFiles)) {
    const sourceFile = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    
    // Test single-pass traversal with scope stack
    const scopeStack: string[] = [file.path];
    
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        totalEntities++;
        scopeStack.push(node.name.text);
        ts.forEachChild(node, visit);
        scopeStack.pop();
        return;
      }
      if (ts.isMethodDeclaration(node) && node.name) {
        totalEntities++;
        scopeStack.push(node.name.getText(sourceFile));
        ts.forEachChild(node, visit);
        scopeStack.pop();
        return;
      }
      if (ts.isCallExpression(node)) {
        totalCalls++;
        // Enclosing entity is O(1) scopeStack[scopeStack.length - 1]!
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  const t3 = performance.now();
  console.log(`Parsed all ${Object.keys(sourceFiles).length} files in ${((t3 - t2) / 1000).toFixed(2)}s!`);
  console.log(`Extracted: ${totalEntities} functions/methods, ${totalCalls} calls.`);
}

testOptimized().catch(console.error);
