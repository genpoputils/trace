/**
 * Browser-compatible path utilities for POSIX-style repository paths.
 * Replaces Node.js 'path' module in browser and Web Worker environments.
 */

export const browserPath = {
  /**
   * Normalizes a path string, resolving '..' and '.' segments,
   * standardizing backslashes to forward slashes, and removing duplicate slashes.
   */
  normalize(p: string): string {
    if (!p) return '.';
    // Convert backslashes
    const normalized = p.replace(/\\/g, '/');
    const isAbs = normalized.startsWith('/');
    const trailingSlash = normalized.endsWith('/') && normalized.length > 1;

    const segments = normalized.split('/');
    const resolvedSegments: string[] = [];

    for (const segment of segments) {
      if (!segment || segment === '.') {
        continue;
      }
      if (segment === '..') {
        if (resolvedSegments.length > 0 && resolvedSegments[resolvedSegments.length - 1] !== '..') {
          resolvedSegments.pop();
        } else if (!isAbs) {
          resolvedSegments.push('..');
        }
      } else {
        resolvedSegments.push(segment);
      }
    }

    let result = resolvedSegments.join('/');
    if (isAbs) {
      result = '/' + result;
    }
    if (!result) {
      return isAbs ? '/' : '.';
    }
    if (trailingSlash && !result.endsWith('/')) {
      result += '/';
    }
    return result;
  },

  /**
   * Returns the directory name of a path.
   */
  dirname(p: string): string {
    if (!p) return '.';
    const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) {
      return '.';
    }
    if (lastSlash === 0) {
      return '/';
    }
    return normalized.substring(0, lastSlash);
  },

  /**
   * Returns the last portion of a path.
   */
  basename(p: string, ext?: string): string {
    if (!p) return '';
    const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    let base = lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
    if (ext && base.endsWith(ext)) {
      base = base.substring(0, base.length - ext.length);
    }
    return base;
  },

  /**
   * Returns the extension of the path.
   */
  extname(p: string): string {
    if (!p) return '';
    const base = this.basename(p);
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) {
      // No dot or dot is the first char (hidden file like .gitignore)
      return '';
    }
    return base.substring(lastDot);
  },

  /**
   * Joins all given path segments together.
   */
  join(...paths: string[]): string {
    if (paths.length === 0) return '.';
    const joined = paths.filter(Boolean).join('/');
    return this.normalize(joined);
  },

  /**
   * Checks whether the path is absolute.
   */
  isAbsolute(p: string): boolean {
    if (!p) return false;
    const normalized = p.replace(/\\/g, '/');
    return normalized.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(p);
  },
};
