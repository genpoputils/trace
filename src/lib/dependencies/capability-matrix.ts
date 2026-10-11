/**
 * Multi-Ecosystem Dependency Intelligence Capability Matrix
 * Exhaustive documentation of formats, evidence supplied, known limitations, and implementation status.
 */

import { EcosystemCapability, EcosystemType, PackageManagerType } from './types';

export const ECOSYSTEM_CAPABILITY_MATRIX: EcosystemCapability[] = [
  // 1. JavaScript / TypeScript - npm
  {
    ecosystem: 'javascript',
    packageManager: 'npm',
    displayName: 'JavaScript / TypeScript (npm)',
    status: 'supported',
    manifestFiles: ['package.json'],
    lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    workspaceConfigFiles: ['package.json'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'integrity-sha512-sha1',
      'resolved-registry-url',
      'dependency-scope-runtime-dev-peer-optional',
      'workspace-packages-topology',
      'lockfile-version-v1-v2-v3',
    ],
    knownLimitations: [
      'Private npm registry authentication tokens are not resolved in browser-only mode',
      'npm shrinkwrap legacy v1 format normalizes only top-level dependencies',
      'Lifecycle install scripts (preinstall/postinstall) are not executed',
    ],
  },

  // 2. JavaScript / TypeScript - pnpm
  {
    ecosystem: 'javascript',
    packageManager: 'pnpm',
    displayName: 'JavaScript / TypeScript (pnpm)',
    status: 'supported',
    manifestFiles: ['package.json'],
    lockfiles: ['pnpm-lock.yaml'],
    workspaceConfigFiles: ['pnpm-workspace.yaml'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'pnpm-workspace-topology',
      'dependency-scope-runtime-dev',
      'content-addressable-specifier',
    ],
    knownLimitations: [
      'pnpm-lock.yaml v9+ patched dependencies capture raw patch specifier',
      'pnpm virtual store symlinks are not simulated in virtual tree',
    ],
  },

  // 3. JavaScript / TypeScript - Yarn
  {
    ecosystem: 'javascript',
    packageManager: 'yarn',
    displayName: 'JavaScript / TypeScript (Yarn)',
    status: 'supported',
    manifestFiles: ['package.json'],
    lockfiles: ['yarn.lock'],
    workspaceConfigFiles: ['package.json'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'integrity-hash',
      'resolved-url',
      'yarn-v1-and-v2-berry-descriptors',
    ],
    knownLimitations: [
      'Yarn Plug`n`Play (PnP) zip archives are not uncompressed in browser',
      'Yarn 2+ plugins and custom protocols (portal:, patch:) are captured as raw specifiers',
    ],
  },

  // 4. JavaScript / TypeScript - Bun
  {
    ecosystem: 'javascript',
    packageManager: 'bun',
    displayName: 'JavaScript / TypeScript (Bun)',
    status: 'partial',
    manifestFiles: ['package.json'],
    lockfiles: ['bun.lock', 'bun.lockb'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true, // bun.lock text format
      transitiveResolution: false, // bun.lockb binary format is non-trivial without bun binary
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'text-lockfile-pinned-versions',
      'dependency-scope-runtime-dev',
    ],
    knownLimitations: [
      'bun.lockb binary format cannot be decoded without the Bun binary; bun.lock text format is recommended',
      'Workspace filtering follows standard package.json workspaces',
    ],
  },

  // 5. Python - pip
  {
    ecosystem: 'python',
    packageManager: 'pip',
    displayName: 'Python (pip / requirements)',
    status: 'supported',
    manifestFiles: ['requirements.txt', 'requirements-dev.txt', 'requirements.in'],
    lockfiles: [],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: false,
      lockfileParsing: false,
      transitiveResolution: false,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-specifier',
      'pinned-equality-evidence',
      'included-requirements-references',
      'environment-markers',
    ],
    knownLimitations: [
      'pip requirements files do not standardly distinguish direct from transitive packages unless compiled with pip-tools',
      'Dynamic setup.py / setup.cfg files require Python interpreter execution and are parsed via static heuristic',
    ],
  },

  // 6. Python - Poetry
  {
    ecosystem: 'python',
    packageManager: 'poetry',
    displayName: 'Python (Poetry)',
    status: 'supported',
    manifestFiles: ['pyproject.toml'],
    lockfiles: ['poetry.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'content-hash',
      'transitive-dependency-graph',
      'python-version-constraint',
    ],
    knownLimitations: [
      'Private PyPI repository index URLs require credentials not available offline',
      'Poetry build system plugins are not evaluated',
    ],
  },

  // 7. Python - uv
  {
    ecosystem: 'python',
    packageManager: 'uv',
    displayName: 'Python (uv)',
    status: 'supported',
    manifestFiles: ['pyproject.toml', 'requirements.txt'],
    lockfiles: ['uv.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'uv-workspace-members',
      'source-hash',
    ],
    knownLimitations: [
      'Local virtual environment wheels are not inspected in browser mode',
    ],
  },

  // 8. Python - Pipenv
  {
    ecosystem: 'python',
    packageManager: 'pipenv',
    displayName: 'Python (Pipenv)',
    status: 'supported',
    manifestFiles: ['Pipfile'],
    lockfiles: ['Pipfile.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'sha256-hashes',
      'pipfile-markers',
    ],
    knownLimitations: [
      'Platform environment markers are evaluated statically without host runtime checks',
    ],
  },

  // 9. Rust - Cargo
  {
    ecosystem: 'rust',
    packageManager: 'cargo',
    displayName: 'Rust (Cargo)',
    status: 'supported',
    manifestFiles: ['Cargo.toml'],
    lockfiles: ['Cargo.lock'],
    workspaceConfigFiles: ['Cargo.toml'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-version-specifier',
      'resolved-exact-version',
      'crates-io-source-and-checksum',
      'cargo-workspace-members',
      'dependency-scope-runtime-dev-build',
    ],
    knownLimitations: [
      'Cargo feature flags and target-specific dependencies ([target....dependencies]) are parsed statically',
      'Procedural macros and build.rs dynamic code generation are not executed',
    ],
  },

  // 10. Go - Go Modules
  {
    ecosystem: 'go',
    packageManager: 'gomod',
    displayName: 'Go (Go Modules)',
    status: 'supported',
    manifestFiles: ['go.mod'],
    lockfiles: ['go.sum'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'module-path-and-version',
      'direct-vs-indirect-flag',
      'go-directive-version',
      'checksum-h1-hash',
    ],
    knownLimitations: [
      'go.work multi-module workspaces are parsed statically',
      'replace and exclude directives are captured as notes without full graph rewriting',
    ],
  },

  // 11. PHP - Composer
  {
    ecosystem: 'php',
    packageManager: 'composer',
    displayName: 'PHP (Composer)',
    status: 'supported',
    manifestFiles: ['composer.json'],
    lockfiles: ['composer.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'dist-reference-commit',
      'license-identifier',
      'dependency-scope-runtime-dev',
    ],
    knownLimitations: [
      'Composer plugins and custom installers are not executed',
      'Path repositories are resolved statically',
    ],
  },

  // 12. Ruby - Bundler
  {
    ecosystem: 'ruby',
    packageManager: 'bundler',
    displayName: 'Ruby (Bundler)',
    status: 'supported',
    manifestFiles: ['Gemfile'],
    lockfiles: ['Gemfile.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'git-sha-reference',
      'bundler-specs-dependency-hierarchy',
    ],
    knownLimitations: [
      'Ruby DSL conditional blocks (:if, :platforms) are parsed statically',
      'Gemspec files are evaluated statically without Ruby interpreter evaluation',
    ],
  },

  // 13. Dart / Flutter - pub
  {
    ecosystem: 'dart',
    packageManager: 'pub',
    displayName: 'Dart / Flutter (pub)',
    status: 'supported',
    manifestFiles: ['pubspec.yaml'],
    lockfiles: ['pubspec.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-version-constraint',
      'resolved-exact-version',
      'package-source-hosted-git-path',
      'dependency-scope-direct-dev-transitive',
    ],
    knownLimitations: [
      'Flutter SDK preinstalled packages are identified but not fetched from external SDK',
    ],
  },

  // 14. JVM - Maven
  {
    ecosystem: 'jvm',
    packageManager: 'maven',
    displayName: 'Java / JVM (Maven)',
    status: 'supported',
    manifestFiles: ['pom.xml'],
    lockfiles: [],
    workspaceConfigFiles: ['pom.xml'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: false,
      lockfileParsing: false,
      transitiveResolution: false,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'groupId-artifactId-version-triplet',
      'dependency-scope-compile-test-provided-runtime',
      'pom-modules-hierarchy',
    ],
    knownLimitations: [
      'Transitive Maven resolution requires contacting remote Maven Central / Nexus repositories',
      'POM property interpolation is performed for local POM properties only',
    ],
  },

  // 15. JVM - Gradle
  {
    ecosystem: 'jvm',
    packageManager: 'gradle',
    displayName: 'Java / Kotlin / JVM (Gradle)',
    status: 'partial',
    manifestFiles: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    lockfiles: ['gradle.lockfile'],
    workspaceConfigFiles: ['settings.gradle', 'settings.gradle.kts'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: false,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'declared-dependency-notations',
      'exact-locked-versions-from-gradle-lockfile',
      'gradle-subproject-topology',
    ],
    knownLimitations: [
      'Groovy and Kotlin DSL build scripts are parsed via static regular expression/token extraction',
      'Transitive resolution requires gradle.lockfile presence',
    ],
  },

  // 16. JVM - sbt
  {
    ecosystem: 'jvm',
    packageManager: 'sbt',
    displayName: 'Scala / JVM (sbt)',
    status: 'planned',
    manifestFiles: ['build.sbt'],
    lockfiles: [],
    capabilities: {
      manifestDetection: true,
      manifestParsing: false,
      lockfileDetection: false,
      lockfileParsing: false,
      transitiveResolution: false,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'sbt-manifest-detected',
    ],
    knownLimitations: [
      'sbt Scala DSL parser is planned for a future release; presence is detected without resolved graph',
    ],
  },

  // 17. .NET - NuGet
  {
    ecosystem: 'dotnet',
    packageManager: 'nuget',
    displayName: '.NET / C# (NuGet)',
    status: 'supported',
    manifestFiles: ['*.csproj', '*.fsproj', '*.vbproj', 'packages.config'],
    lockfiles: ['packages.lock.json'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'package-id-version',
      'target-framework',
      'packages-lock-json-resolved-graph',
    ],
    knownLimitations: [
      'Directory.Build.props and Directory.Packages.props central package management parsed statically',
      'Remote NuGet v3 index API not queried offline',
    ],
  },

  // 18. Swift - Swift Package Manager
  {
    ecosystem: 'swift',
    packageManager: 'spm',
    displayName: 'Swift (Swift Package Manager)',
    status: 'supported',
    manifestFiles: ['Package.swift'],
    lockfiles: ['Package.resolved'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: false,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'package-identity',
      'resolved-git-revision-and-version',
      'package-resolved-pins',
    ],
    knownLimitations: [
      'Package.swift is an executable Swift manifest; resolved version evidence relies on Package.resolved (v1 and v2)',
    ],
  },

  // 19. C/C++ - Conan
  {
    ecosystem: 'cpp',
    packageManager: 'conan',
    displayName: 'C / C++ (Conan)',
    status: 'supported',
    manifestFiles: ['conanfile.txt', 'conanfile.py'],
    lockfiles: ['conan.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-conan-reference-specifiers',
      'conan-lock-resolved-graph-nodes',
      'package-options-and-settings',
    ],
    knownLimitations: [
      'conanfile.py is parsed statically for requires attribute',
      'Remote Conan center recipes are not downloaded offline',
    ],
  },

  // 20. C/C++ - vcpkg
  {
    ecosystem: 'cpp',
    packageManager: 'vcpkg',
    displayName: 'C / C++ (vcpkg)',
    status: 'supported',
    manifestFiles: ['vcpkg.json'],
    lockfiles: [],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: false,
      lockfileParsing: false,
      transitiveResolution: false,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'declared-dependency-name-and-constraints',
      'vcpkg-feature-flags',
    ],
    knownLimitations: [
      'vcpkg baseline resolution requires local vcpkg Git repository database',
    ],
  },

  // 21. C/C++ - CMake
  {
    ecosystem: 'cpp',
    packageManager: 'cmake',
    displayName: 'C / C++ (CMake)',
    status: 'partial',
    manifestFiles: ['CMakeLists.txt'],
    lockfiles: [],
    workspaceConfigFiles: ['CMakeLists.txt'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: true,
      lockfileDetection: false,
      lockfileParsing: false,
      transitiveResolution: false,
      workspaceDetection: true,
    },
    evidenceSupplied: [
      'find-package-target-names',
      'fetch-content-git-repositories',
    ],
    knownLimitations: [
      'CMake is a dynamic Turing-complete language; static regex extraction provides best-effort evidence',
    ],
  },

  // 22. Elixir - Mix
  {
    ecosystem: 'elixir',
    packageManager: 'mix',
    displayName: 'Elixir (Mix)',
    status: 'supported',
    manifestFiles: ['mix.exs'],
    lockfiles: ['mix.lock'],
    capabilities: {
      manifestDetection: true,
      manifestParsing: false,
      lockfileDetection: true,
      lockfileParsing: true,
      transitiveResolution: true,
      workspaceDetection: false,
    },
    evidenceSupplied: [
      'hex-package-name-and-version',
      'git-sha-commit-reference',
    ],
    knownLimitations: [
      'mix.exs is Elixir code; lockfile provides exact pinned versions for Hex and Git dependencies',
    ],
  },
];

/**
 * Lookup capability record for a given ecosystem and package manager.
 */
export function getEcosystemCapability(
  ecosystem: EcosystemType,
  packageManager: PackageManagerType
): EcosystemCapability | undefined {
  return ECOSYSTEM_CAPABILITY_MATRIX.find(
    (c) => c.ecosystem === ecosystem && c.packageManager === packageManager
  );
}
