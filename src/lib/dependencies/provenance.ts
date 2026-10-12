/**
 * Dependency Version Provenance Engine
 *
 * Implements accurate, evidence-backed tracking of:
 * - Manifest-declared ranges & exact pins
 * - Lockfile-resolved versions
 * - Installed disk environment versions (only when input evidence exists)
 * - Conflict detection across manifests, workspaces, and lockfiles
 * - Zero external runtime dependencies; browser-safe.
 */

import {
  EcosystemType,
  NormalizedDependency,
  DependencyVersionProvenance,
  VersionProvenanceDetail,
  VersionProvenanceStatus,
  VersionConflict,
  ManifestDiagnostic,
} from './types';

import { getDirname } from './utils';

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  raw: string;
}

/**
 * Parses a version string into semantic parts (major.minor.patch[-prerelease][+build]).
 * Strictly validates complete format from start ^ to end $; does not accept invalid trailing characters.
 */
export function parseSemver(versionStr: string): ParsedSemver | null {
  if (!versionStr || typeof versionStr !== 'string') return null;

  const trimmed = versionStr.trim();
  // Clean leading 'v', '=', or spaces
  const clean = trimmed.replace(/^[=vV\s]+/, '');
  if (!clean) return null;

  // Strict semantic version syntax with start (^) and end ($) anchors
  const strictRegex = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9a-zA-Z.-]+))?(?:\+([0-9a-zA-Z.-]+))?$/;
  const match = clean.match(strictRegex);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: match[2] !== undefined ? parseInt(match[2], 10) : 0,
    patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
    prerelease: match[4],
    raw: trimmed,
  };
}

/**
 * Compares two semantic version strings adhering to SemVer 2.0.0 rule 11.
 * Returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2.
 */
export function compareSemver(v1Str: string, v2Str: string): number {
  const p1 = parseSemver(v1Str);
  const p2 = parseSemver(v2Str);

  if (!p1 || !p2) {
    return v1Str.localeCompare(v2Str);
  }

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // SemVer spec 2.0.0, rule 11: Normal version has higher precedence than prerelease version
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    const id1 = p1.prerelease.split('.');
    const id2 = p2.prerelease.split('.');
    const minLen = Math.min(id1.length, id2.length);
    for (let i = 0; i < minLen; i++) {
      const a = id1[i];
      const b = id2[i];
      const aIsNum = /^\d+$/.test(a);
      const bIsNum = /^\d+$/.test(b);
      if (aIsNum && bIsNum) {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (numA !== numB) return numA > numB ? 1 : -1;
      } else if (aIsNum && !bIsNum) {
        return -1;
      } else if (!aIsNum && bIsNum) {
        return 1;
      } else {
        const cmp = a.localeCompare(b);
        if (cmp !== 0) return cmp;
      }
    }
    if (id1.length !== id2.length) {
      return id1.length > id2.length ? 1 : -1;
    }
  }

  return 0;
}

/**
 * Determines whether a version specification represents an exact pin vs a range.
 */
export function isExactVersionPin(spec: string, ecosystem?: EcosystemType): boolean {
  if (!spec || typeof spec !== 'string') return false;
  const trimmed = spec.trim();

  // Python exact pin
  if (ecosystem === 'python') {
    if (trimmed.startsWith('==') || trimmed.startsWith('===')) {
      const rest = trimmed.replace(/^={2,3}\s*/, '');
      return !rest.includes('*') && parseSemver(rest) !== null;
    }
    return false;
  }

  // Rust / Cargo: `= 1.2.3` is an exact pin; bare `1.2.3` in Cargo means `^1.2.3`
  if (ecosystem === 'rust') {
    if (trimmed.startsWith('=')) {
      const rest = trimmed.replace(/^=\s*/, '');
      return parseSemver(rest) !== null;
    }
    return false;
  }

  // Range indicators
  if (
    trimmed.startsWith('^') ||
    trimmed.startsWith('~') ||
    trimmed.startsWith('>') ||
    trimmed.startsWith('<') ||
    trimmed.startsWith('!=') ||
    trimmed.includes('||') ||
    trimmed === '*' ||
    trimmed === 'latest' ||
    trimmed === 'any' ||
    trimmed.includes('x') ||
    trimmed.includes('X')
  ) {
    return false;
  }

  // Clean leading '=' or 'v'
  const clean = trimmed.replace(/^[=vV\s]+/, '');
  const parsed = parseSemver(clean);
  // An exact pin must have full major.minor.patch specified
  return parsed !== null && /^\d+\.\d+\.\d+/.test(clean);
}

export interface VersionSatisfactionResult {
  status: 'satisfied' | 'not_satisfied' | 'unknown';
  satisfies: boolean;
  isExactPin: boolean;
  reason?: string;
}

/**
 * Checks whether a concrete resolved version satisfies a declared version range / specification.
 * Distinguishes: satisfied, not satisfied, and unknown / unable to verify.
 * Never defaults unsupported, ambiguous, or malformed constraints to satisfied.
 */
export function satisfiesVersionRange(
  resolvedVersion: string,
  declaredSpec: string,
  ecosystem?: EcosystemType
): VersionSatisfactionResult {
  const isPin = isExactVersionPin(declaredSpec, ecosystem);
  const cleanResolved = resolvedVersion.trim().replace(/^[=vV\s]+/, '');
  const pResolved = parseSemver(cleanResolved);

  if (!pResolved) {
    return {
      status: 'unknown',
      satisfies: false,
      isExactPin: isPin,
      reason: `Could not parse resolved version '${resolvedVersion}'.`,
    };
  }

  const specTrimmed = declaredSpec.trim();

  // 1. Explicitly check for non-semver specifications that cannot be statically validated via standard semver rules:
  // - Workspace protocol: workspace:*, workspace:^1.0.0
  // - Local path specifications: file:../pkg, link:../pkg, path:../pkg
  // - Git URLs: git+https://..., https://github.com/..., git@...
  // - Registry tags: latest, next, beta, alpha, canary, dev
  if (
    specTrimmed.startsWith('workspace:') ||
    specTrimmed.startsWith('file:') ||
    specTrimmed.startsWith('link:') ||
    specTrimmed.startsWith('path:') ||
    specTrimmed.startsWith('git+') ||
    specTrimmed.startsWith('git:') ||
    specTrimmed.startsWith('git@') ||
    specTrimmed.startsWith('http://') ||
    specTrimmed.startsWith('https://') ||
    ['next', 'beta', 'alpha', 'canary', 'dev'].includes(specTrimmed.toLowerCase())
  ) {
    return {
      status: 'unknown',
      satisfies: false,
      isExactPin: false,
      reason: `Specification '${declaredSpec}' is a non-standard constraint (workspace/local/URL/tag) that cannot be verified using semver rules.`,
    };
  }

  // 2. Wildcards that universally match within ecosystem conventions
  if (specTrimmed === '*' || specTrimmed === 'latest' || specTrimmed === 'any' || specTrimmed === '') {
    return { status: 'satisfied', satisfies: true, isExactPin: false };
  }

  // 3. Handle Cargo bare semver (in Cargo, "1.28" or "1.28.2" without '=' is treated as "^1.28" / "^1.28.2")
  let effectiveSpec = specTrimmed;
  if (ecosystem === 'rust') {
    if (specTrimmed.startsWith('=')) {
      effectiveSpec = specTrimmed.replace(/^=\s*/, '');
      const pPin = parseSemver(effectiveSpec);
      if (!pPin) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: true,
          reason: `Malformed Cargo pin version '${declaredSpec}'.`,
        };
      }
      const matches = compareSemver(cleanResolved, effectiveSpec) === 0;
      return {
        status: matches ? 'satisfied' : 'not_satisfied',
        satisfies: matches,
        isExactPin: true,
        reason: matches
          ? undefined
          : `Lockfile resolved '${resolvedVersion}' does not match exact Cargo pin '${declaredSpec}'.`,
      };
    } else if (!specTrimmed.startsWith('^') && !specTrimmed.startsWith('~') && !specTrimmed.startsWith('>')) {
      effectiveSpec = `^${specTrimmed}`;
    }
  }

  // 4. Python exact pin handling (== or ===)
  if (ecosystem === 'python' && (specTrimmed.startsWith('==') || specTrimmed.startsWith('==='))) {
    const pinVal = specTrimmed.replace(/^={2,3}\s*/, '');
    if (pinVal.endsWith('.*')) {
      const prefix = pinVal.slice(0, -2);
      const matches = cleanResolved.startsWith(prefix);
      return {
        status: matches ? 'satisfied' : 'not_satisfied',
        satisfies: matches,
        isExactPin: false,
        reason: matches
          ? undefined
          : `Resolved '${resolvedVersion}' does not match Python wildcard pattern '${declaredSpec}'.`,
      };
    }
    const pPin = parseSemver(pinVal);
    if (!pPin) {
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: true,
        reason: `Malformed Python pin specification '${declaredSpec}'.`,
      };
    }
    const matches = compareSemver(cleanResolved, pinVal) === 0;
    return {
      status: matches ? 'satisfied' : 'not_satisfied',
      satisfies: matches,
      isExactPin: true,
      reason: matches
        ? undefined
        : `Resolved '${resolvedVersion}' does not match exact Python pin '${declaredSpec}'.`,
    };
  }

  // 5. Python compatible release (~= 2.2 or ~= 2.2.0)
  if (effectiveSpec.startsWith('~=')) {
    const target = effectiveSpec.replace(/^~=\s*/, '');
    const pTarget = parseSemver(target);
    if (!pTarget) {
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: false,
        reason: `Malformed Python compatible release '~=${target}'.`,
      };
    }

    const parts = target.split('.');
    if (parts.length <= 2) {
      // ~= 2.2 -> >= 2.2.0, < 3.0.0
      const satisfies =
        compareSemver(cleanResolved, target) >= 0 && pResolved.major === pTarget.major;
      return {
        status: satisfies ? 'satisfied' : 'not_satisfied',
        satisfies,
        isExactPin: false,
        reason: satisfies
          ? undefined
          : `Resolved '${resolvedVersion}' does not satisfy compatible release '${declaredSpec}'.`,
      };
    } else {
      // ~= 2.2.0 -> >= 2.2.0, < 2.3.0
      const satisfies =
        compareSemver(cleanResolved, target) >= 0 &&
        pResolved.major === pTarget.major &&
        pResolved.minor === pTarget.minor;
      return {
        status: satisfies ? 'satisfied' : 'not_satisfied',
        satisfies,
        isExactPin: false,
        reason: satisfies
          ? undefined
          : `Resolved '${resolvedVersion}' does not satisfy compatible release '${declaredSpec}'.`,
      };
    }
  }

  // 6. Exact pin without prefix
  if (isPin) {
    const pinClean = specTrimmed.replace(/^[=vV\s]+/, '');
    const pPin = parseSemver(pinClean);
    if (!pPin) {
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: true,
        reason: `Malformed exact pin version '${declaredSpec}'.`,
      };
    }
    const matches = compareSemver(cleanResolved, pinClean) === 0;
    return {
      status: matches ? 'satisfied' : 'not_satisfied',
      satisfies: matches,
      isExactPin: true,
      reason: matches
        ? undefined
        : `Lockfile resolved version '${resolvedVersion}' does not match exact pin '${declaredSpec}'.`,
    };
  }

  // 7. Caret ranges: ^1.2.3, ^0.2.3, ^0.0.3
  if (effectiveSpec.startsWith('^')) {
    const baseStr = effectiveSpec.replace(/^\^\s*/, '');
    const pBase = parseSemver(baseStr);
    if (!pBase) {
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: false,
        reason: `Invalid or malformed caret range specification '${declaredSpec}'.`,
      };
    }

    if (compareSemver(cleanResolved, baseStr) < 0) {
      return {
        status: 'not_satisfied',
        satisfies: false,
        isExactPin: false,
        reason: `Resolved version '${resolvedVersion}' is below minimum declared version '${baseStr}'.`,
      };
    }

    // Prerelease guard: a range without prerelease base cannot match a prerelease resolved version
    if (pResolved.prerelease && !pBase.prerelease) {
      return {
        status: 'not_satisfied',
        satisfies: false,
        isExactPin: false,
        reason: `Resolved prerelease version '${resolvedVersion}' does not satisfy range '${declaredSpec}'.`,
      };
    }

    if (pBase.major > 0) {
      const satisfies = pResolved.major === pBase.major;
      return {
        status: satisfies ? 'satisfied' : 'not_satisfied',
        satisfies,
        isExactPin: false,
        reason: satisfies
          ? undefined
          : `Resolved version '${resolvedVersion}' has major version ${pResolved.major}, exceeding declared ^${baseStr}.`,
      };
    } else if (pBase.minor > 0) {
      const satisfies = pResolved.major === 0 && pResolved.minor === pBase.minor;
      return {
        status: satisfies ? 'satisfied' : 'not_satisfied',
        satisfies,
        isExactPin: false,
        reason: satisfies
          ? undefined
          : `Resolved version '${resolvedVersion}' differs in 0.x minor version from declared ^${baseStr}.`,
      };
    } else {
      const satisfies =
        pResolved.major === 0 && pResolved.minor === 0 && pResolved.patch === pBase.patch;
      return {
        status: satisfies ? 'satisfied' : 'not_satisfied',
        satisfies,
        isExactPin: false,
        reason: satisfies
          ? undefined
          : `Resolved version '${resolvedVersion}' differs in 0.0.x patch from declared ^${baseStr}.`,
      };
    }
  }

  // 8. Tilde ranges: ~1.2.3 -> >= 1.2.3, < 1.3.0
  if (effectiveSpec.startsWith('~')) {
    const baseStr = effectiveSpec.replace(/^~\s*/, '');
    const pBase = parseSemver(baseStr);
    if (!pBase) {
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: false,
        reason: `Invalid or malformed tilde range specification '${declaredSpec}'.`,
      };
    }

    if (compareSemver(cleanResolved, baseStr) < 0) {
      return {
        status: 'not_satisfied',
        satisfies: false,
        isExactPin: false,
        reason: `Resolved version '${resolvedVersion}' is below tilde range minimum '${baseStr}'.`,
      };
    }

    if (pResolved.prerelease && !pBase.prerelease) {
      return {
        status: 'not_satisfied',
        satisfies: false,
        isExactPin: false,
        reason: `Resolved prerelease version '${resolvedVersion}' does not satisfy range '${declaredSpec}'.`,
      };
    }

    const satisfies = pResolved.major === pBase.major && pResolved.minor === pBase.minor;
    return {
      status: satisfies ? 'satisfied' : 'not_satisfied',
      satisfies,
      isExactPin: false,
      reason: satisfies
        ? undefined
        : `Resolved version '${resolvedVersion}' exceeds minor release boundary for declared ~${baseStr}.`,
    };
  }

  // 9. Compound comparisons like ">=1.0.0, <2.0.0" or ">=1.0.0 <2.0.0"
  const compTokens = effectiveSpec.split(/[,;\s]+/).filter(Boolean);
  let allSatisfied = true;
  let failReason: string | undefined;
  let validTokensCount = 0;

  for (const token of compTokens) {
    if (token.startsWith('>=')) {
      const val = token.replace(/^>=\s*/, '');
      const pVal = parseSemver(val);
      if (!pVal) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: false,
          reason: `Malformed version '${val}' in constraint '${token}'.`,
        };
      }
      validTokensCount++;
      if (compareSemver(cleanResolved, val) < 0) {
        allSatisfied = false;
        failReason = `Resolved '${resolvedVersion}' is below required >= ${val}.`;
        break;
      }
    } else if (token.startsWith('>')) {
      const val = token.replace(/^>\s*/, '');
      const pVal = parseSemver(val);
      if (!pVal) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: false,
          reason: `Malformed version '${val}' in constraint '${token}'.`,
        };
      }
      validTokensCount++;
      if (compareSemver(cleanResolved, val) <= 0) {
        allSatisfied = false;
        failReason = `Resolved '${resolvedVersion}' is not strictly greater than > ${val}.`;
        break;
      }
    } else if (token.startsWith('<=')) {
      const val = token.replace(/^<=\s*/, '');
      const pVal = parseSemver(val);
      if (!pVal) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: false,
          reason: `Malformed version '${val}' in constraint '${token}'.`,
        };
      }
      validTokensCount++;
      if (compareSemver(cleanResolved, val) > 0) {
        allSatisfied = false;
        failReason = `Resolved '${resolvedVersion}' exceeds <= ${val}.`;
        break;
      }
    } else if (token.startsWith('<')) {
      const val = token.replace(/^<\s*/, '');
      const pVal = parseSemver(val);
      if (!pVal) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: false,
          reason: `Malformed version '${val}' in constraint '${token}'.`,
        };
      }
      validTokensCount++;
      if (compareSemver(cleanResolved, val) >= 0) {
        allSatisfied = false;
        failReason = `Resolved '${resolvedVersion}' is not strictly less than < ${val}.`;
        break;
      }
    } else if (token.startsWith('!=')) {
      const val = token.replace(/^!=\s*/, '');
      const pVal = parseSemver(val);
      if (!pVal) {
        return {
          status: 'unknown',
          satisfies: false,
          isExactPin: false,
          reason: `Malformed version '${val}' in constraint '${token}'.`,
        };
      }
      validTokensCount++;
      if (compareSemver(cleanResolved, val) === 0) {
        allSatisfied = false;
        failReason = `Resolved '${resolvedVersion}' matches excluded version != ${val}.`;
        break;
      }
    } else {
      // Unrecognized syntax or unsupported construct (e.g. malformed string)
      return {
        status: 'unknown',
        satisfies: false,
        isExactPin: false,
        reason: `Unsupported, malformed, or ambiguous specification token '${token}'.`,
      };
    }
  }

  if (validTokensCount === 0) {
    return {
      status: 'unknown',
      satisfies: false,
      isExactPin: false,
      reason: `Unsupported or ambiguous specification '${declaredSpec}'.`,
    };
  }

  return {
    status: allSatisfied ? 'satisfied' : 'not_satisfied',
    satisfies: allSatisfied,
    isExactPin: false,
    reason: failReason,
  };
}

/**
 * Checks for actual installed disk evidence in the analyzed repository files.
 * Returns the detected version and source file path, or undefined if not present.
 */
export function detectInstalledVersion(
  packageName: string,
  ecosystem: EcosystemType,
  manifestDir: string,
  getFile?: (p: string) => { path: string; content: string } | undefined,
  findFile?: (predicate: (path: string) => boolean) => { path: string; content: string } | undefined
): { version: string; sourceFilePath: string } | undefined {
  if (!getFile && !findFile) return undefined;


  if (ecosystem === 'javascript') {
    // Check candidate node_modules package.json locations
    const candidatePaths = [
      manifestDir !== '.' ? `${manifestDir}/node_modules/${packageName}/package.json` : null,
      `node_modules/${packageName}/package.json`,
    ].filter(Boolean) as string[];

    if (getFile) {
      for (const candPath of candidatePaths) {
        const f = getFile(candPath);
        if (f) {
          try {
            const parsed = JSON.parse(f.content);
            if (parsed && typeof parsed.version === 'string') {
              return {
                version: parsed.version,
                sourceFilePath: f.path,
              };
            }
          } catch {
            // Ignore malformed installed json
          }
        }
      }
    }

    if (findFile) {
      const f = findFile((p) => p.endsWith(`node_modules/${packageName}/package.json`));
      if (f) {
        try {
          const parsed = JSON.parse(f.content);
          if (parsed && typeof parsed.version === 'string') {
            return {
              version: parsed.version,
              sourceFilePath: f.path,
            };
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (ecosystem === 'python') {
    // Look for site-packages / dist-info metadata
    const norm = packageName.toLowerCase().replace(/[-_.]+/g, '_');
    const possiblePaths = [
      `site-packages/${norm}.dist-info/METADATA`,
      `.venv/lib/site-packages/${norm}.dist-info/METADATA`,
      `venv/lib/site-packages/${norm}.dist-info/METADATA`,
    ];

    if (getFile) {
      for (const cand of possiblePaths) {
        const f = getFile(cand);
        if (f) {
          const match = f.content.match(/^Version:\s*([0-9a-zA-Z_.-]+)/m);
          if (match) {
            return {
              version: match[1].trim(),
              sourceFilePath: f.path,
            };
          }
        }
      }
    }

    if (findFile) {
      const f = findFile((p) => {
        const lower = p.toLowerCase();
        return (
          lower.endsWith('/metadata') &&
          (lower.includes(`/${norm}.dist-info/`) ||
            lower.includes(`/${norm}-`) ||
            lower.includes(`${norm}.dist-info`) ||
            lower.includes(`${norm}-`))
        );
      });
      if (f) {
        const match = f.content.match(/^Version:\s*([0-9a-zA-Z_.-]+)/m);
        if (match) {
          return {
            version: match[1].trim(),
            sourceFilePath: f.path,
          };
        }
      }
    }
  }

  return undefined;
}

export interface BuildProvenanceParams {
  name: string;
  ecosystem: EcosystemType;
  packageManager: string;
  manifestPath: string;
  lockfilePath?: string;
  declaredSpecifier?: string;
  resolvedVersion?: string;
  integrity?: string;
  resolvedUrl?: string;
  isDirect: boolean;
  alias?: string;
  getFile?: (p: string) => { path: string; content: string } | undefined;
  findFile?: (predicate: (path: string) => boolean) => { path: string; content: string } | undefined;
}

/**
 * Builds a complete DependencyVersionProvenance record linking declared, resolved,
 * and installed evidence, and checking for range discrepancies or conflicts.
 */
export function buildDependencyProvenance(
  params: BuildProvenanceParams
): DependencyVersionProvenance {
  const {
    name,
    ecosystem,
    manifestPath,
    lockfilePath,
    declaredSpecifier,
    resolvedVersion,
    isDirect,
    getFile,
    findFile,
  } = params;

  const conflicts: VersionConflict[] = [];

  // 1. Declared version detail
  let declared: VersionProvenanceDetail;
  if (isDirect && declaredSpecifier) {
    const isPin = isExactVersionPin(declaredSpecifier, ecosystem);
    declared = {
      version: declaredSpecifier,
      status: 'established',
      sourceFilePath: manifestPath,
      sourcePath: manifestPath,
      sourceKind: 'manifest',
      evidenceKind: 'declared_only',
      rawSpecifier: declaredSpecifier,
      isExactPin: isPin,
      isRange: !isPin,
    };
  } else if (!isDirect) {
    declared = {
      version: undefined,
      status: 'unavailable',
      details: 'Transitive dependency (not declared directly in manifest)',
    };
  } else {
    declared = {
      version: undefined,
      status: 'unavailable',
      details: 'No version specified in manifest declaration',
    };
  }

  // 2. Resolved version detail
  let resolved: VersionProvenanceDetail;
  if (resolvedVersion && lockfilePath) {
    let resolvedStatus: VersionProvenanceDetail['status'] = 'established';

    // Verify satisfaction if direct dependency with declared range
    if (isDirect && declaredSpecifier) {
      const check = satisfiesVersionRange(resolvedVersion, declaredSpecifier, ecosystem);
      if (check.status === 'not_satisfied') {
        resolvedStatus = 'conflicting';
        conflicts.push({
          kind: 'range_mismatch',
          severity: 'error',
          message:
            check.reason ||
            `Lockfile resolved version '${resolvedVersion}' does not satisfy declared range '${declaredSpecifier}'.`,
          expectedRange: declaredSpecifier,
          actualVersion: resolvedVersion,
          conflictingSourcePaths: [manifestPath, lockfilePath],
        });
      } else if (check.status === 'unknown') {
        resolvedStatus = 'incomplete';
      }
    }

    resolved = {
      version: resolvedVersion,
      status: resolvedStatus,
      sourceFilePath: lockfilePath,
      sourcePath: lockfilePath,
      sourceKind: 'lockfile',
      evidenceKind: 'resolved_lockfile',
      rawSpecifier: declaredSpecifier,
      isExactPin: true,
      isRange: false,
      integrity: params.integrity,
      resolvedUrl: params.resolvedUrl,
      details: resolvedStatus === 'conflicting' ? 'Resolved version conflicts with manifest range' : undefined,
    };
  } else if (lockfilePath && !resolvedVersion && isDirect) {
    // Lockfile exists for this project, but entry for this declared package is missing!
    resolved = {
      version: undefined,
      status: 'unavailable',
      details: 'Package is declared in manifest but omitted from lockfile resolution.',
    };
    conflicts.push({
      kind: 'missing_lockfile_resolution',
      severity: 'warning',
      message: `Package '${name}' is declared in '${manifestPath}' but omitted from lockfile '${lockfilePath}'.`,
      expectedRange: declaredSpecifier,
      conflictingSourcePaths: [manifestPath, lockfilePath],
    });
  } else {
    // Missing lockfile entirely
    resolved = {
      version: undefined,
      status: 'unavailable',
      details: 'No lockfile detected; resolved version cannot be established.',
    };
  }

  // 3. Installed version detail (DISK ONLY)
  const dir = getDirname(manifestPath);
  const installedDisk = detectInstalledVersion(name, ecosystem, dir, getFile, findFile);

  let installed: VersionProvenanceDetail;
  if (installedDisk) {
    let installedStatus: VersionProvenanceDetail['status'] = 'established';

    // Check if installed disk version disagrees with lockfile
    if (resolvedVersion && compareSemver(installedDisk.version, resolvedVersion) !== 0) {
      installedStatus = 'conflicting';
      conflicts.push({
        kind: 'stale_installed_disk',
        severity: 'warning',
        message: `Installed disk version '${installedDisk.version}' does not match lockfile resolved version '${resolvedVersion}'.`,
        expectedRange: resolvedVersion,
        actualVersion: installedDisk.version,
        conflictingSourcePaths: [installedDisk.sourceFilePath, lockfilePath || manifestPath],
      });
    }

    installed = {
      version: installedDisk.version,
      status: installedStatus,
      sourceFilePath: installedDisk.sourceFilePath,
      sourcePath: installedDisk.sourceFilePath,
      sourceKind: 'installed',
      evidenceKind: 'installed_disk',
      rawSpecifier: installedDisk.version,
      isExactPin: true,
      isRange: false,
    };
  } else {
    installed = {
      version: undefined,
      status: 'unavailable',
      details: 'No installed environment detected in repository input.',
    };
  }

  let satisfiesRange: boolean | undefined = undefined;
  if (resolvedVersion && declaredSpecifier) {
    const check = satisfiesVersionRange(resolvedVersion, declaredSpecifier, ecosystem);
    if (check.status === 'satisfied') {
      satisfiesRange = true;
    } else if (check.status === 'not_satisfied') {
      satisfiesRange = false;
    } else {
      satisfiesRange = undefined;
    }
  }

  let overallStatus: VersionProvenanceStatus = 'established';
  const hasConflict = conflicts.length > 0;

  if (hasConflict) {
    if (conflicts.some((c) => c.kind === 'range_mismatch' || c.kind === 'workspace_version_conflict')) {
      overallStatus = 'conflicting';
    } else {
      overallStatus = 'incomplete';
    }
  } else if (resolved.status === 'incomplete' || (satisfiesRange === undefined && declaredSpecifier && isDirect)) {
    overallStatus = 'incomplete';
  } else if (resolved.status === 'established' && (satisfiesRange === true || (!declaredSpecifier && !isDirect))) {
    overallStatus = 'established';
  } else if (declared.status === 'established' && resolved.status === 'unavailable') {
    overallStatus = 'incomplete';
  } else if (declared.status === 'unavailable' && resolved.status === 'unavailable') {
    overallStatus = 'unavailable';
  } else {
    overallStatus = 'incomplete';
  }

  return {
    status: overallStatus,
    satisfiesRange,
    declared,
    resolved,
    installed,
    hasConflict,
    conflicts,
  };
}

/**
 * Reconciles dependencies across workspaces and duplicate packages to identify
 * monorepo version discrepancies and cross-manifest conflicts.
 */
export function reconcileWorkspaceProvenance(
  dependencies: NormalizedDependency[]
): { updatedDependencies: NormalizedDependency[]; diagnostics: ManifestDiagnostic[] } {
  const diagnostics: ManifestDiagnostic[] = [];

  // Group direct dependencies by ecosystem:name
  const directGroups = new Map<string, NormalizedDependency[]>();
  for (const dep of dependencies) {
    if (dep.isDirect && dep.versionDeclared) {
      const key = `${dep.ecosystem}:${dep.name}`;
      const list = directGroups.get(key) || [];
      list.push(dep);
      directGroups.set(key, list);
    }
  }

  // Group all dependencies to find duplicate resolved versions
  const resolvedGroups = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    if (dep.versionResolved) {
      const key = `${dep.ecosystem}:${dep.name}`;
      const set = resolvedGroups.get(key) || new Set<string>();
      set.add(dep.versionResolved);
      resolvedGroups.set(key, set);
    }
  }

  // Detect cross-workspace conflicting declarations & duplicate declarations
  for (const [, group] of directGroups.entries()) {
    if (group.length > 1) {
      const declaredSpecs = new Set(group.map((d) => d.versionDeclared).filter(Boolean));
      if (declaredSpecs.size > 1) {
        // Disagreement across workspace packages!
        const specSummary = group
          .map((d) => `${d.workspacePath || d.manifestPath} (${d.versionDeclared})`)
          .join(' vs ');

        const conflictMsg = `Workspace version conflict for "${group[0].name}" across workspace manifests: ${specSummary}`;

        for (const dep of group) {
          if (!dep.provenance) {
            dep.provenance = buildDependencyProvenance({
              name: dep.name,
              ecosystem: dep.ecosystem,
              packageManager: dep.packageManager,
              manifestPath: dep.manifestPath,
              lockfilePath: dep.lockfilePath,
              declaredSpecifier: dep.versionDeclared,
              resolvedVersion: dep.versionResolved,
              isDirect: dep.isDirect,
            });
          }
          dep.provenance.status = 'conflicting';
          dep.provenance.hasConflict = true;
          dep.provenance.conflicts.push({
            kind: 'workspace_version_conflict',
            severity: 'error',
            message: conflictMsg,
            expectedRange: dep.versionDeclared,
            conflictingSourcePaths: group.map((d) => d.manifestPath),
          });
        }

        diagnostics.push({
          filePath: group[0].manifestPath,
          severity: 'error',
          code: 'version_conflict',
          message: conflictMsg,
        });
      } else {
        // Identical version declared in multiple workspaces: duplicate_version_in_workspace
        const paths = group.map((d) => d.manifestPath).join(', ');
        const dupMsg = `Duplicate version declaration for package "${group[0].name}" in multiple workspace manifests (${paths}).`;
        for (const dep of group) {
          if (!dep.provenance) {
            dep.provenance = buildDependencyProvenance({
              name: dep.name,
              ecosystem: dep.ecosystem,
              packageManager: dep.packageManager,
              manifestPath: dep.manifestPath,
              lockfilePath: dep.lockfilePath,
              declaredSpecifier: dep.versionDeclared,
              resolvedVersion: dep.versionResolved,
              isDirect: dep.isDirect,
            });
          }
          dep.provenance.hasConflict = true;
          if (dep.provenance.status === 'established') {
            dep.provenance.status = 'incomplete';
          }
          dep.provenance.conflicts.push({
            kind: 'duplicate_version_in_workspace',
            severity: 'warning',
            message: dupMsg,
            actualVersion: dep.versionDeclared,
            conflictingSourcePaths: group.map((d) => d.manifestPath),
          });
        }
      }
    }
  }

  // Detect duplicate resolved versions across repository
  for (const dep of dependencies) {
    const key = `${dep.ecosystem}:${dep.name}`;
    const versions = resolvedGroups.get(key);
    if (versions && versions.size > 1) {
      const verList = Array.from(versions).join(', ');
      const msg = `Multiple resolved versions detected for package "${dep.name}": [${verList}].`;
      if (!dep.notes) dep.notes = [];
      if (!dep.notes.includes(msg)) {
        dep.notes.push(msg);
      }
      if (!dep.provenance) {
        dep.provenance = buildDependencyProvenance({
          name: dep.name,
          ecosystem: dep.ecosystem,
          packageManager: dep.packageManager,
          manifestPath: dep.manifestPath,
          lockfilePath: dep.lockfilePath,
          declaredSpecifier: dep.versionDeclared,
          resolvedVersion: dep.versionResolved,
          isDirect: dep.isDirect,
        });
      }
      dep.provenance.hasConflict = true;
      if (dep.provenance.status === 'established') {
        dep.provenance.status = 'incomplete';
      }
      dep.provenance.conflicts.push({
        kind: 'duplicate_version_in_workspace',
        severity: 'warning',
        message: msg,
        actualVersion: dep.versionResolved,
      });
    }
  }

  return {
    updatedDependencies: dependencies,
    diagnostics,
  };
}

