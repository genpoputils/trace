/**
 * JVM Ecosystem Adapters: Maven, Gradle, sbt
 */

import {
  EcosystemAdapter,
  DiscoveredDependencyFile,
  AdapterParseContext,
  AdapterParseResult,
  NormalizedDependency,
  WorkspaceDescriptor,
  ManifestDiagnostic,
  DependencyEvidence,
  DependencyScope,
  PackageManagerType,
} from '../types';
import { getEcosystemCapability } from '../capability-matrix';
import { getDirname, getBasename, extractXmlTags, extractXmlValue } from '../utils';

export class JvmAdapter implements EcosystemAdapter {
  public readonly ecosystem = 'jvm' as const;
  public readonly packageManager: PackageManagerType;
  public readonly displayName: string;

  constructor(packageManager: 'maven' | 'gradle' | 'sbt' = 'maven') {
    this.packageManager = packageManager;
    this.displayName = `Java / JVM (${packageManager})`;
  }

  public get capability() {
    return getEcosystemCapability('jvm', this.packageManager)!;
  }

  public matches(filePath: string): boolean {
    const base = getBasename(filePath);
    if (this.packageManager === 'maven') {
      return base === 'pom.xml';
    }
    if (this.packageManager === 'gradle') {
      return (
        base === 'build.gradle' ||
        base === 'build.gradle.kts' ||
        base === 'settings.gradle' ||
        base === 'settings.gradle.kts' ||
        base === 'gradle.lockfile'
      );
    }
    if (this.packageManager === 'sbt') {
      return base === 'build.sbt';
    }
    return false;
  }

  public classifyFile(filePath: string): DiscoveredDependencyFile | null {
    const base = getBasename(filePath);
    const dir = getDirname(filePath);
    const workspacePath = dir === '.' ? undefined : dir;

    if (base === 'pom.xml') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'jvm',
        packageManager: 'maven',
        workspacePath,
      };
    }

    if (base === 'build.gradle' || base === 'build.gradle.kts') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'jvm',
        packageManager: 'gradle',
        workspacePath,
      };
    }

    if (base === 'settings.gradle' || base === 'settings.gradle.kts') {
      return {
        path: filePath,
        kind: 'workspace_config',
        ecosystem: 'jvm',
        packageManager: 'gradle',
        workspacePath,
      };
    }

    if (base === 'gradle.lockfile') {
      return {
        path: filePath,
        kind: 'lockfile',
        ecosystem: 'jvm',
        packageManager: 'gradle',
        workspacePath,
      };
    }

    if (base === 'build.sbt') {
      return {
        path: filePath,
        kind: 'manifest',
        ecosystem: 'jvm',
        packageManager: 'sbt',
        workspacePath,
      };
    }

    return null;
  }

  public parse(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const base = getBasename(manifestFile.path);

    if (base === 'pom.xml') {
      return this.parseMaven(manifestFile);
    }
    if (base.startsWith('build.gradle')) {
      return this.parseGradle(manifestFile, context);
    }
    if (base === 'build.sbt') {
      return {
        dependencies: [],
        workspaces: [],
        diagnostics: [
          {
            filePath: manifestFile.path,
            severity: 'info',
            code: 'unsupported_feature',
            message:
              'sbt build definition detected. AST evaluation is planned for a future release; presence detected without graph extraction.',
          },
        ],
        isComplete: false,
      };
    }

    return {
      dependencies: [],
      workspaces: [],
      diagnostics: [],
      isComplete: false,
    };
  }

  private parseMaven(
    manifestFile: { path: string; content: string }
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const workspaces: WorkspaceDescriptor[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    // Detect multi-module POM: <modules><module>child</module></modules>
    const moduleTags = extractXmlTags(manifestFile.content, 'module');
    if (moduleTags.length > 0) {
      workspaces.push({
        id: `workspace:${manifestFile.path}`,
        name: extractXmlValue(manifestFile.content, 'artifactId') || 'maven-root-pom',
        rootPath: dir,
        manifestPath: manifestFile.path,
        ecosystem: 'jvm',
        packageManager: 'maven',
        packages: moduleTags.map((m) => m.content),
        isRootWorkspace: dir === '.',
      });
    }

    // Extract dependencies: <dependency> ... </dependency>
    const depTags = extractXmlTags(manifestFile.content, 'dependency');
    for (const depTag of depTags) {
      const groupId = extractXmlValue(depTag.content, 'groupId');
      const artifactId = extractXmlValue(depTag.content, 'artifactId');
      const version = extractXmlValue(depTag.content, 'version');
      const scopeVal = extractXmlValue(depTag.content, 'scope')?.toLowerCase();

      if (!groupId || !artifactId) continue;

      const fullName = `${groupId}:${artifactId}`;
      let scope: DependencyScope = 'runtime';
      if (scopeVal === 'test') scope = 'test';
      else if (scopeVal === 'provided' || scopeVal === 'system') scope = 'dev';

      const evidence: DependencyEvidence[] = [
        {
          sourceFilePath: manifestFile.path,
          sourceKind: 'manifest',
          evidenceKind: version ? 'declared_only' : 'unresolved_missing',
          rawSpecifier: version,
          resolvedVersion: version?.startsWith('${') ? undefined : version,
          snippet: `<dependency><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId></dependency>`,
        },
      ];

      dependencies.push({
        id: `jvm:maven:${fullName}@${manifestFile.path}`,
        ecosystem: 'jvm',
        packageManager: 'maven',
        name: fullName,
        versionDeclared: version,
        versionResolved: version?.startsWith('${') ? undefined : version,
        scope,
        isDirect: true,
        isTransitive: false,
        manifestPath: manifestFile.path,
        workspacePath,
        evidence,
        notes: version?.startsWith('${') ? [`Version resolved via POM property: ${version}`] : undefined,
      });
    }

    diagnostics.push({
      filePath: manifestFile.path,
      severity: 'info',
      code: 'missing_lockfile',
      message: 'Maven projects resolve dependencies against remote Maven repositories dynamically without a local lockfile.',
    });

    return {
      dependencies,
      workspaces,
      diagnostics,
      isComplete: true,
    };
  }

  private parseGradle(
    manifestFile: { path: string; content: string },
    context: AdapterParseContext
  ): AdapterParseResult {
    const dependencies: NormalizedDependency[] = [];
    const diagnostics: ManifestDiagnostic[] = [];
    const dir = getDirname(manifestFile.path);
    const workspacePath = dir === '.' ? undefined : dir;

    // Check gradle.lockfile
    const lockPath = dir === '.' ? 'gradle.lockfile' : `${dir}/gradle.lockfile`;
    const lockFile = context.getFile(lockPath) || (dir !== '.' ? context.getFile('gradle.lockfile') : undefined);
    const resolvedMap = new Map<string, string>();

    if (lockFile) {
      const lockLines = lockFile.content.split('\n');
      for (const line of lockLines) {
        // format: org.springframework:spring-core:6.0.0=compileClasspath
        const match = line.match(/^([^:]+:[^:]+):([^=]+)=/);
        if (match) {
          resolvedMap.set(match[1], match[2]);
        }
      }
    }

    const lines = manifestFile.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      // Match: implementation 'groupId:artifactId:version' or api("groupId:artifactId:version")
      const depMatch = line.match(
        /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly)\s*\(?['"]([^:]+:[^:]+)(?::([^'"]+))?['"]\)?/
      );

      if (depMatch) {
        const configType = depMatch[1];
        const groupAndArtifact = depMatch[2];
        const declaredVersion = depMatch[3];

        const isTest = configType.startsWith('test');
        const scope: DependencyScope = isTest ? 'test' : 'runtime';

        const resolved = resolvedMap.get(groupAndArtifact) || declaredVersion;

        const evidence: DependencyEvidence[] = [
          {
            sourceFilePath: manifestFile.path,
            sourceKind: 'manifest',
            evidenceKind: 'declared_only',
            rawSpecifier: declaredVersion,
            line: i + 1,
            snippet: line,
          },
        ];

        if (lockFile && resolvedMap.has(groupAndArtifact)) {
          evidence.push({
            sourceFilePath: lockFile.path,
            sourceKind: 'lockfile',
            evidenceKind: 'resolved_lockfile',
            resolvedVersion: resolved,
          });
        }

        dependencies.push({
          id: `jvm:gradle:${groupAndArtifact}@${manifestFile.path}`,
          ecosystem: 'jvm',
          packageManager: 'gradle',
          name: groupAndArtifact,
          versionDeclared: declaredVersion,
          versionResolved: resolved,
          scope,
          isDirect: true,
          isTransitive: false,
          manifestPath: manifestFile.path,
          lockfilePath: lockFile?.path,
          workspacePath,
          evidence,
        });
      }
    }

    return {
      dependencies,
      workspaces: [],
      diagnostics,
      detectedLockfile: lockFile?.path,
      isComplete: true,
    };
  }
}
