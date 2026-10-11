/**
 * Safe, dependency-free parsers for TOML, YAML, XML, and line-based formats.
 * Designed to execute cleanly in browser Web Workers and Node.js without external packages.
 */

export function getDirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  return normalized.substring(0, lastSlash) || '.';
}

export function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
}

/**
 * Lightweight, resilient TOML parser for Cargo, Poetry, uv, and pyproject.
 */
export function parseSimpleToml(content: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentSection: Record<string, unknown> = root;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const commentIdx = rawLine.indexOf('#');
    const line = (commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine).trim();
    if (!line) continue;

    // Array of Tables: [[package]]
    const arrayTableMatch = line.match(/^\[\[\s*([a-zA-Z0-9_.-]+)\s*\]\]$/);
    if (arrayTableMatch) {
      const sectionName = arrayTableMatch[1];
      if (!Array.isArray(root[sectionName])) {
        root[sectionName] = [];
      }
      const newEntry: Record<string, unknown> = {};
      (root[sectionName] as Record<string, unknown>[]).push(newEntry);
      currentSection = newEntry;
      continue;
    }

    // Standard Table: [tool.poetry.dependencies] or [dependencies]
    const tableMatch = line.match(/^\[\s*([a-zA-Z0-9_.-]+)\s*\]$/);
    if (tableMatch) {
      const fullPath = tableMatch[1];
      const parts = fullPath.split('.');
      let target: Record<string, unknown> = root;
      for (const part of parts) {
        if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) {
          target[part] = {};
        }
        target = target[part] as Record<string, unknown>;
      }
      currentSection = target;
      continue;
    }

    // Key-Value pair: key = "value" or key = { ... } or key = 123
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const rawKey = line.substring(0, eqIdx).trim().replace(/^["']|["']$/g, '');
      const rawVal = line.substring(eqIdx + 1).trim();

      currentSection[rawKey] = parseTomlValue(rawVal);
    }
  }

  return root;
}

function parseTomlValue(valStr: string): unknown {
  const trimmed = valStr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Inline array: ["a", "b"]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((item) => parseTomlValue(item.trim()))
      .filter((v) => v !== undefined);
  }

  // Inline table: { version = "^1.0", optional = true }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const result: Record<string, unknown> = {};
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const k = pair.substring(0, idx).trim().replace(/^["']|["']$/g, '');
        const v = pair.substring(idx + 1).trim();
        result[k] = parseTomlValue(v);
      }
    }
    return result;
  }

  return trimmed;
}

/**
 * Lightweight, resilient YAML parser for pnpm-workspace, pubspec, and basic lockfiles.
 */
export function parseSimpleYaml(content: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const lines = content.split('\n');

  interface StackEntry {
    indent: number;
    obj: Record<string, unknown> | unknown[];
    key?: string;
  }

  const stack: StackEntry[] = [{ indent: -1, obj: root }];

  for (const rawLine of lines) {
    const commentIdx = rawLine.indexOf('#');
    const lineWithoutComment = commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine;
    if (!lineWithoutComment.trim()) continue;

    const indent = rawLine.search(/\S/);
    const line = lineWithoutComment.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentParent = stack[stack.length - 1].obj;

    // List item: - "value" or - item: val
    if (line.startsWith('- ')) {
      const itemContent = line.substring(2).trim();
      let parentList: unknown[];

      if (Array.isArray(currentParent)) {
        parentList = currentParent;
      } else {
        const parentKey = stack[stack.length - 1].key;
        if (parentKey && Array.isArray((currentParent as Record<string, unknown>)[parentKey])) {
          parentList = (currentParent as Record<string, unknown>)[parentKey] as unknown[];
        } else {
          continue;
        }
      }

      if (itemContent.includes(':')) {
        const colonIdx = itemContent.indexOf(':');
        const k = itemContent.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
        const v = itemContent.substring(colonIdx + 1).trim();
        const objItem: Record<string, unknown> = { [k]: v ? parseYamlScalar(v) : {} };
        parentList.push(objItem);
        stack.push({ indent, obj: objItem, key: k });
      } else {
        parentList.push(parseYamlScalar(itemContent));
      }
      continue;
    }

    // Key-Value: key: value or key:
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
      const rawVal = line.substring(colonIdx + 1).trim();

      if (Array.isArray(currentParent)) {
        continue;
      }

      if (!rawVal) {
        // Child block or list next
        const child: Record<string, unknown> = {};
        (currentParent as Record<string, unknown>)[key] = child;
        stack.push({ indent, obj: child, key });
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const inner = rawVal.slice(1, -1).trim();
        (currentParent as Record<string, unknown>)[key] = inner
          ? inner.split(',').map((s) => parseYamlScalar(s.trim()))
          : [];
      } else {
        (currentParent as Record<string, unknown>)[key] = parseYamlScalar(rawVal);
      }
    }
  }

  return root;
}

function parseYamlScalar(val: string): unknown {
  const trimmed = val.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Lightweight, resilient XML tag extractor for pom.xml, csproj, packages.config.
 */
export interface XmlTagMatch {
  name: string;
  attributes: Record<string, string>;
  content: string;
}

export function extractXmlTags(xml: string, tagName: string): XmlTagMatch[] {
  const results: XmlTagMatch[] = [];
  const regex = new RegExp(`<${tagName}\\b([^>]*)>(.*?)</${tagName}>|<${tagName}\\b([^>]*)/?>`, 'gis');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const rawAttrs = match[1] || match[3] || '';
    const content = match[2] || '';
    const attributes: Record<string, string> = {};

    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*["']([^"']*)["']/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    results.push({
      name: tagName,
      attributes,
      content: content.trim(),
    });
  }

  return results;
}

export function extractXmlValue(content: string, childTag: string): string | undefined {
  const match = new RegExp(`<${childTag}\\b[^>]*>(.*?)</${childTag}>`, 'is').exec(content);
  return match ? match[1].trim() : undefined;
}
