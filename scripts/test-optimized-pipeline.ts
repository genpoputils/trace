import { githubClient } from '../src/lib/github/github-client';
import JSZip from 'jszip';
import path from 'path';

async function testExtraction() {
  console.log('Downloading immich archive...');
  const { buffer, commitSha } = await githubClient.downloadRepoArchive('immich-app', 'immich', 'main');
  console.log(`Downloaded ${buffer.length / 1024 / 1024} MB. Commit: ${commitSha}`);

  const zip = await JSZip.loadAsync(buffer);
  const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  console.log(`Total files in zip: ${allPaths.length}`);

  // Categorize paths
  const categorized: Record<string, number> = {};
  for (const p of allPaths) {
    const ext = path.extname(p).toLowerCase();
    categorized[ext] = (categorized[ext] || 0) + 1;
  }
  console.log('File extensions distribution:', Object.entries(categorized).sort((a, b) => b[1] - a[1]).slice(0, 15));

  // Count TS/JS files in test vs app
  let testCount = 0;
  let dtsCount = 0;
  let appTsCount = 0;
  for (const p of allPaths) {
    const lower = p.toLowerCase();
    if (lower.endsWith('.d.ts')) {
      dtsCount++;
    } else if (
      lower.includes('.spec.') ||
      lower.includes('.test.') ||
      lower.includes('__tests__') ||
      lower.includes('e2e') ||
      lower.includes('cypress')
    ) {
      testCount++;
    } else if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx')) {
      appTsCount++;
    }
  }

  console.log(`TypeScript declarations (.d.ts): ${dtsCount}`);
  console.log(`Test/Spec/E2E files: ${testCount}`);
  console.log(`App Source TS/JS files: ${appTsCount}`);
}

testExtraction().catch(console.error);
