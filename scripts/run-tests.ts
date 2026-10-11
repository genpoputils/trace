/**
 * Trace Automated Test Runner
 *
 * Ensures all test files matching tests/*.test.ts are explicitly discovered
 * across both Windows, macOS, and Linux/Ubuntu CI environments.
 * Fails if zero test files are found or any test fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testsDir = path.resolve(process.cwd(), 'tests');

if (!fs.existsSync(testsDir)) {
  console.error(`Fatal: Tests directory does not exist at ${testsDir}`);
  process.exit(1);
}

const testFiles = fs
  .readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => path.join('tests', file))
  .sort();

if (testFiles.length === 0) {
  console.error('Fatal: Zero test files discovered in tests/ directory.');
  process.exit(1);
}

console.log(`Discovered ${testFiles.length} test suite file(s):`);
testFiles.forEach((file) => console.log(`  - ${file}`));
console.log('');

// Execute tests with tsx --test passing explicit files
const tsxCli = require.resolve('tsx/cli');
const result = spawnSync(process.execPath, [tsxCli, '--test', ...testFiles], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error('Failed to run test process:', result.error);
  process.exit(1);
}

process.exit(result.status ?? (result.signal ? 1 : 0));
