import test, { describe } from 'node:test';
import assert from 'node:assert';
import { browserPath } from '../src/lib/utils/browser-path';

describe('BrowserPath Utility Suite', () => {
  test('normalizes relative and absolute paths correctly', () => {
    assert.strictEqual(browserPath.normalize('a/b/../c'), 'a/c');
    assert.strictEqual(browserPath.normalize('./a/b/./c'), 'a/b/c');
    assert.strictEqual(browserPath.normalize('/a/b/../../c'), '/c');
    assert.strictEqual(browserPath.normalize('a\\b\\c'), 'a/b/c');
    assert.strictEqual(browserPath.normalize(''), '.');
    assert.strictEqual(browserPath.normalize('a/b/'), 'a/b/');
  });

  test('extracts dirname accurately', () => {
    assert.strictEqual(browserPath.dirname('src/lib/analyzer.ts'), 'src/lib');
    assert.strictEqual(browserPath.dirname('src/index.ts'), 'src');
    assert.strictEqual(browserPath.dirname('index.ts'), '.');
    assert.strictEqual(browserPath.dirname('/root/file.txt'), '/root');
    assert.strictEqual(browserPath.dirname('/file.txt'), '/');
  });

  test('extracts basename with and without ext', () => {
    assert.strictEqual(browserPath.basename('src/lib/analyzer.ts'), 'analyzer.ts');
    assert.strictEqual(browserPath.basename('src/lib/analyzer.ts', '.ts'), 'analyzer');
    assert.strictEqual(browserPath.basename('archive.tar.gz', '.gz'), 'archive.tar');
    assert.strictEqual(browserPath.basename('index.ts'), 'index.ts');
  });

  test('extracts extname properly', () => {
    assert.strictEqual(browserPath.extname('file.ts'), '.ts');
    assert.strictEqual(browserPath.extname('file.test.tsx'), '.tsx');
    assert.strictEqual(browserPath.extname('.gitignore'), '');
    assert.strictEqual(browserPath.extname('Makefile'), '');
  });

  test('joins paths seamlessly', () => {
    assert.strictEqual(browserPath.join('src', 'lib', 'analyzer.ts'), 'src/lib/analyzer.ts');
    assert.strictEqual(browserPath.join('src/controllers', '../services', 'orderService.ts'), 'src/services/orderService.ts');
    assert.strictEqual(browserPath.join('', 'foo'), 'foo');
  });

  test('identifies absolute paths', () => {
    assert.strictEqual(browserPath.isAbsolute('/usr/local/bin'), true);
    assert.strictEqual(browserPath.isAbsolute('C:\\Users\\test'), true);
    assert.strictEqual(browserPath.isAbsolute('src/lib'), false);
    assert.strictEqual(browserPath.isAbsolute('./src'), false);
  });
});
