# GenPopUtils Trace — Codebase Intelligence & Execution Tracing

> **Website / Concept:** `trace.genpoputils.com`  
> A professional, AI-assisted codebase intelligence and execution tracing platform built for software engineers, technical leads, and code investigators.

---

## 🚀 Overview

**GenPopUtils Trace** is a developer tool that provides a searchable, interactive map of a software system. It parses real source code ASTs, maps component relationships, traces function calls and data flow, calculates change blast radius, and provides grounded AI explanations with exact file and line citations.

### Key Capabilities

- **Interactive Dependency Graph:** React Flow canvas powered by Dagre hierarchical layouts, custom node cards, electric blue trace paths, and neighborhood focus modes.
- **Statically Inferred Execution Paths:** Forward call path tracing ("What could this function call?") and backward trigger exploration ("What leads to this function?") with branch and recursion cycle detection.
- **Data-Flow Explorer:** Parameter origin tracking, variable assignments, interprocedural argument passing, and database query sinks.
- **Change Impact Analysis:** Blast radius score (0–100), affected HTTP routes, affected test suites, and expandable dependency evidence chains.
- **Real GitHub Integration:** OAuth authorization, repository listing, branch selection, and server-side archive extraction tied to exact commit SHAs.
- **ZIP Archive Ingestion:** Secure zip decompression with Zip-Slip path traversal defense, decompression bomb size limits, and `.gitignore` exclusions.
- **Lower Source Panel:** Integrated IDE-style code viewer with line numbers, active range highlighting, execution context, and AI explanations.
- **Grounded AI Investigator:** 100% functional offline without external API keys via a deterministic AST intelligence engine, with optional support for OpenAI, Anthropic, or Gemini.
- **Local Analysis CLI:** Run `npm run trace <path>` in the terminal to analyze any local folder.

---

## 🛠️ Technology Stack

- **Framework:** Next.js (App Router, Turbopack) & React 19
- **Language:** TypeScript 5
- **AST Parsing Engine:** TypeScript Compiler API (`typescript`)
- **Graph Visualization:** `@xyflow/react` (React Flow) & `dagre`
- **Security & Extraction:** `jszip` with path traversal defense
- **Icons:** `lucide-react`
- **Design System:** Bespoke developer workspace theme with light theme default, electric blue primary accents, and dark theme support

---

## 📦 Quick Start & Installation

```bash
# Clone the repository
cd traces

# Install dependencies
npm install

# Run the automated test suite (12 tests across 3 suites)
npm test

# Build for production
npm run build

# Start the local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the GenPopUtils Trace workspace.

---

## 🖥️ Local Terminal CLI

Analyze any local directory directly from the command line:

```bash
# Analyze a directory
npm run trace ./src

# Analyze and print the execution path for a symbol
npm run trace ./src --trace CodebaseAnalyzer.analyzeProject

# Analyze and calculate the change impact blast radius
npm run trace ./src --impact getLocation

# Export full analysis result to a JSON file
npm run trace ./src --json ./analysis.json
```

---

## 🔑 GitHub Integration Configuration

To enable GitHub OAuth for connecting private repositories:

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) and create a **New OAuth App**.
2. Set:
   - **Application name:** `GenPopUtils Trace`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/github/callback`
3. Create a `.env.local` file using [.env.example](file:///c:/Users/Prasun%20Bhattacharyya/Desktop/Projects/genpoputils/traces/.env.example):

```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here

# Optional: Personal Access Token (PAT) with 'repo' scope for local testing
GITHUB_TOKEN=
```

> **Note:** You can also analyze **any public GitHub repository** (e.g. `expressjs/express`, `facebook/react`) directly from the UI without configuring OAuth keys!

---

## 🧪 Automated Test Suite

Run all tests with:

```bash
npm test
```

Test coverage includes:
1. `TypeScriptAdapter`: Parsing functions, arrow functions, React components, custom hooks, Prisma database queries, routes, parameters, and JSDoc.
2. `CodebaseAnalyzer`: Cross-module import resolution, route-to-handler linking, and degree centrality.
3. `ExecutionPathEngine`: Forward and backward traversal, branch handling, and circular recursion prevention.
4. `DataFlowEngine`: Value propagation tracking from parameters to database sinks with transparent limitations.
5. `ImpactAnalysisService`: Blast radius calculations, affected routes, and affected test suites.
6. `ZipIngestionService`: Path traversal (Zip-Slip) security, decompression bomb protections, and exclusion filters.
7. `GitHubClient`: Structured auth states, OAuth URL generators, and error handling.
8. `AIInvestigatorService`: Grounded offline explanations with exact file and line citations.
9. `SearchService`: Fast scoring and filtering across symbols and files.

---

## 🔒 Security & Privacy Guarantees

- **No Code Execution:** Static analysis parses AST tokens without ever executing user or uploaded code.
- **Zip-Slip Defense:** All file paths are strictly normalized; entries with `..`, absolute paths, or null bytes are rejected.
- **Resource Limits:** Decompression bombs are mitigated by 50MB total extracted size and 3,000 file caps.
- **Credential Safety:** GitHub client secrets, OAuth tokens, and API keys are strictly kept server-side in environment variables and never logged or exposed to the client.
