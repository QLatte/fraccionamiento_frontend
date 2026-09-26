# Graph Report - fraccionamiento_frontend  (2026-09-25)

## Corpus Check
- 53 files · ~27,660 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 18 file(s) not represented in the graph (top: .css 14, (none) 2, .webmanifest 2)

## Summary
- 339 nodes · 697 edges · 20 communities (15 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dc5167f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- Passes.tsx
- e2e-server.mts
- package.json
- Gate.tsx
- What You Must Do When Invoked
- Login.tsx
- compilerOptions
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- SICA PWA
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- CreatePass
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `react` - 27 edges
2. `errorText()` - 21 edges
3. `useQuery()` - 16 edges
4. `useMutation()` - 16 edges
5. `api()` - 15 edges
6. `dateText()` - 15 edges
7. `lucide-react` - 14 edges
8. `useAuth()` - 12 edges
9. `compilerOptions` - 12 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `CreatePass()` --indirect_call--> `AnimatedRefresh()`  [INFERRED]
  src/pages/Passes.tsx → src/components/icons/AnimatedRefresh.tsx
- `Router()` --calls--> `useOnline()`  [EXTRACTED]
  src/App.tsx → src/hooks.ts
- `Shell()` --indirect_call--> `AnimatedHome()`  [INFERRED]
  src/App.tsx → src/components/icons/AnimatedHome.tsx
- `Shell()` --indirect_call--> `AnimatedQr()`  [INFERRED]
  src/App.tsx → src/components/icons/AnimatedQr.tsx
- `Shell()` --indirect_call--> `AnimatedSlidersHorizontal()`  [INFERRED]
  src/App.tsx → src/components/icons/AnimatedSlidersHorizontal.tsx

## Import Cycles
- None detected.

## Communities (20 total, 5 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.08
Nodes (37): react, ErrorBoundary, GateStationPage(), initialPath(), Router(), Shell(), usePath(), logout() (+29 more)

### Community 1 - "Passes.tsx"
Cohesion: 0.10
Nodes (39): lucide-react, AnimatedTrash(), lockPageScroll(), preserve(), Badge(), Button(), Empty(), ErrorBox() (+31 more)

### Community 2 - "e2e-server.mts"
Cohesion: 0.05
Nodes (37): ../../sica-qr-backend/src/app.js, ../../sica-qr-backend/src/auth/webauthn.js, ../../sica-qr-backend/src/lib/crypto.js, ../../sica-qr-backend/src/lib/prisma.js, ../../sica-qr-backend/src/lib/redis.js, ../../sica-qr-backend/src/services/passes.js, ref_node_child_process, ref_node_crypto (+29 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (38): dependencies, jsqr, lucide-react, qrcode, react, react-dom, @simplewebauthn/browser, devDependencies (+30 more)

### Community 4 - "Gate.tsx"
Cohesion: 0.12
Nodes (27): api(), ApiError, base, codeText(), errorText(), messages, PublicPass(), SharePass() (+19 more)

### Community 5 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 6 - "Login.tsx"
Cohesion: 0.16
Nodes (13): @simplewebauthn/browser, setToken(), Auth, AuthProvider(), accept(), Context, CommunityArt(), Brand() (+5 more)

### Community 7 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule (+5 more)

### Community 8 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 9 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 10 - "SICA PWA"
Cohesion: 0.33
Nodes (5): Caseta compartida, Desarrollo, Producción, Pruebas, SICA PWA

### Community 11 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 12 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 13 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 16 - "CreatePass"
Cohesion: 0.24
Nodes (8): AnimatedClock(), Props, AnimatedHistoryCircle(), Props, localInput(), CreatePass(), check(), submit()

## Knowledge Gaps
- **129 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 163 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@playwright/test` connect `e2e-server.mts` to `package.json`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `react` connect `App.tsx` to `Passes.tsx`, `package.json`, `Gate.tsx`, `Login.tsx`, `CreatePass`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Passes.tsx` to `App.tsx`, `package.json`, `Gate.tsx`, `Login.tsx`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07982583454281568 - nodes in this community are weakly interconnected._
- **Should `Passes.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10062893081761007 - nodes in this community are weakly interconnected._
- **Should `e2e-server.mts` be split into smaller, more focused modules?**
  _Cohesion score 0.05204872646733112 - nodes in this community are weakly interconnected._