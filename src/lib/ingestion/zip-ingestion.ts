import JSZip from 'jszip';
import path from 'path';
import { FileRecord } from '../types/trace';

export interface IngestionOptions {
  maxTotalSize?: number; // default: 50MB
  maxFileSize?: number;  // default: 5MB
  maxFileCount?: number; // default: 3000
}

export interface IngestionResult {
  projectName: string;
  files: Record<string, FileRecord>;
  skippedFiles: { path: string; reason: string }[];
  totalExtractedBytes: number;
  warnings: string[];
}

const DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  'vendor',
  '.venv',
  '__pycache__',
  '__tests__',
  'tests',
  'test',
  'e2e',
  'spec',
  'specs',
  'cypress',
  'fixtures',
  'mocks',
  '__mocks__',
  'android',
  'ios',
  'fastlane',
  'locales',
  'i18n',
  'translations',
  'docs',
  'documentation',
  'assets',
  'static',
  'public',
  '.github',
  '.vscode',
  '.idea',
  'generated',
  'gen',
  'openapi',
  'proto',
  'swagger',
];

const DEFAULT_EXCLUDED_EXTS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.mp4', '.mp3', '.mov',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.lock', '.map', '.snap', '.min.js', '.min.css', '.bundle.js',
  '.md', '.txt', '.csv', '.tsv', '.dart', '.kt', '.swift',
];

export class ZipIngestionService {
  /**
   * Safely inspect and decompress a ZIP archive buffer
   */
  public async ingestZip(
    buffer: Buffer | ArrayBuffer | Uint8Array,
    originalFilename = 'project.zip',
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const maxTotalSize = options.maxTotalSize || 40 * 1024 * 1024; // 40MB
    const maxFileSize = options.maxFileSize || 2 * 1024 * 1024;   // 2MB (prevents minified bundle parse hangs)
    const maxFileCount = options.maxFileCount || 1500;

    const zip = await JSZip.loadAsync(buffer);
    const files: Record<string, FileRecord> = {};
    const skippedFiles: { path: string; reason: string }[] = [];
    const warnings: string[] = [];

    let totalExtractedBytes = 0;
    let fileCount = 0;

    // Detect common root directory prefix (e.g. repo-main/src -> src)
    const entryNames = Object.keys(zip.files);
    let commonPrefix = '';
    if (entryNames.length > 0) {
      const parts = entryNames[0].split(/[/\\]/);
      if (parts.length > 1 && entryNames.every((n) => n.startsWith(parts[0] + '/') || n.startsWith(parts[0] + '\\'))) {
        commonPrefix = parts[0] + '/';
      }
    }

    const projectName = path.basename(originalFilename, path.extname(originalFilename)) || 'imported_project';

    for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;

      // Clean path
      let normalizedPath = rawPath.replace(/\\/g, '/');
      if (commonPrefix && normalizedPath.startsWith(commonPrefix)) {
        normalizedPath = normalizedPath.slice(commonPrefix.length);
      }
      normalizedPath = normalizedPath.replace(/^\/+/, '');

      // Path Traversal Security Check
      if (!this.isPathSafe(rawPath) || !this.isPathSafe(normalizedPath)) {
        skippedFiles.push({
          path: rawPath,
          reason: 'Security violation: Path traversal or invalid character detected',
        });
        continue;
      }

      // Check excluded directory
      const pathSegments = normalizedPath.split('/');
      const isExcludedDir = pathSegments.some((seg) => DEFAULT_EXCLUDED_DIRS.includes(seg.toLowerCase()));
      if (isExcludedDir) {
        skippedFiles.push({ path: normalizedPath, reason: 'Excluded build or dependency directory (test, build, or generated)' });
        continue;
      }

      // Check excluded file extension
      const ext = path.extname(normalizedPath).toLowerCase();
      const lowerPath = normalizedPath.toLowerCase();

      // Skip test/spec/e2e files, declaration files, and lockfiles
      if (
        DEFAULT_EXCLUDED_EXTS.includes(ext) ||
        normalizedPath.endsWith('.d.ts') ||
        lowerPath.includes('.spec.') ||
        lowerPath.includes('.test.') ||
        lowerPath.includes('.e2e-spec.') ||
        lowerPath.includes('.mock.') ||
        normalizedPath.endsWith('package-lock.json') ||
        normalizedPath.endsWith('yarn.lock') ||
        normalizedPath.endsWith('pnpm-lock.yaml')
      ) {
        skippedFiles.push({ path: normalizedPath, reason: 'Non-source, test spec, declaration, or lockfile asset' });
        continue;
      }

      // Decompression bomb check: total file count
      if (++fileCount > maxFileCount) {
        warnings.push(`File count reached maximum limit (${maxFileCount}). Remaining secondary files were skipped.`);
        break;
      }

      // Read text content
      try {
        const textContent = await zipEntry.async('string');
        const byteLength = Buffer.byteLength(textContent, 'utf8');

        if (byteLength > maxFileSize) {
          skippedFiles.push({
            path: normalizedPath,
            reason: `File size (${(byteLength / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`,
          });
          continue;
        }

        totalExtractedBytes += byteLength;
        if (totalExtractedBytes > maxTotalSize) {
          warnings.push(`Total decompressed size exceeded safety limit (${(maxTotalSize / 1024 / 1024).toFixed(0)}MB). Stopping further extraction.`);
          break;
        }

        const lines = textContent.split('\n').length;
        const language = this.detectLanguage(normalizedPath);

        files[normalizedPath] = {
          path: normalizedPath,
          content: textContent,
          lines,
          size: byteLength,
          language,
        };
      } catch (err) {
        skippedFiles.push({
          path: normalizedPath,
          reason: `Failed to decompress or decode file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return {
      projectName,
      files,
      skippedFiles,
      totalExtractedBytes,
      warnings,
    };
  }

  public isPathSafe(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    if (filePath.includes('\0')) return false;
    if (filePath.includes('..')) return false;
    if (path.isAbsolute(filePath)) return false;
    if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
    // Check path normalization
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    if (normalized.startsWith('../') || normalized === '..' || path.isAbsolute(normalized)) {
      return false;
    }
    return true;
  }

  private detectLanguage(filePath: string): FileRecord['language'] {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts') return 'typescript';
    if (ext === '.tsx') return 'tsx';
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
    if (ext === '.jsx') return 'jsx';
    if (ext === '.json') return 'json';
    return 'unknown';
  }
}
