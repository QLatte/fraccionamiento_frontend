# Graph Report - fraccionamiento_frontend  (2026-09-25)

## Corpus Check
- 53 files · ~27,287 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 18 file(s) not represented in the graph (top: .css 14, (none) 2, .webmanifest 2)

## Summary
- 333 nodes · 683 edges · 20 communities (14 shown, 6 thin omitted)
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
- types.ts
- compilerOptions
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- SICA PWA
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- AnimatedHistoryCircle.tsx
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `react` - 27 edges
2. `errorText()` - 20 edges
3. `useQuery()` - 16 edges
4. `useMutation()` - 16 edges
5. `api()` - 15 edges
6. `lucide-react` - 14 edges
7. `dateText()` - 13 edges
8. `useAuth()` - 12 edges
9. `compilerOptions` - 12 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `more()` --calls--> `errorText()`  [EXTRACTED]
  src/pages/Passes.tsx → src/api.ts
- `CreatePass()` --indirect_call--> `AnimatedClock()`  [INFERRED]
  src/pages/Passes.tsx → src/components/icons/AnimatedClock.tsx
- `CreatePass()` --indirect_call--> `AnimatedHistoryCircle()`  [INFERRED]
  src/pages/Passes.tsx → src/components/icons/AnimatedHistoryCircle.tsx
- `CreatePass()` --indirect_call--> `AnimatedRefresh()`  [INFERRED]
  src/pages/Passes.tsx → src/components/icons/AnimatedRefresh.tsx
- `Router()` --calls--> `useOnline()`  [EXTRACTED]
  src/App.tsx → src/hooks.ts

## Import Cycles
- None detected.

## Communities (20 total, 6 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.08
Nodes (34): react, ErrorBoundary, Help(), initialPath(), Router(), Shell(), usePath(), useAuth() (+26 more)

### Community 1 - "Passes.tsx"
Cohesion: 0.12
Nodes (33): lucide-react, AnimatedClock(), Props, AnimatedTrash(), lockPageScroll(), preserve(), Badge(), Button() (+25 more)

### Community 2 - "e2e-server.mts"
Cohesion: 0.05
Nodes (37): ../../sica-qr-backend/src/app.js, ../../sica-qr-backend/src/auth/webauthn.js, ../../sica-qr-backend/src/lib/crypto.js, ../../sica-qr-backend/src/lib/prisma.js, ../../sica-qr-backend/src/lib/redis.js, ../../sica-qr-backend/src/services/passes.js, ref_node_child_process, ref_node_crypto (+29 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (38): dependencies, jsqr, lucide-react, qrcode, react, react-dom, @simplewebauthn/browser, devDependencies (+30 more)

### Community 4 - "Gate.tsx"
Cohesion: 0.12
Nodes (26): @simplewebauthn/browser, api(), ApiError, base, errorText(), messages, CommunityArt(), PublicPass() (+18 more)

### Community 5 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 6 - "types.ts"
Cohesion: 0.10
Nodes (24): setToken(), Auth, AuthProvider(), accept(), logout(), Context, confirm(), AdminUser (+16 more)

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

## Knowledge Gaps
- **128 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 161 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@playwright/test` connect `e2e-server.mts` to `package.json`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `react` connect `App.tsx` to `Passes.tsx`, `package.json`, `Gate.tsx`, `types.ts`, `AnimatedHistoryCircle.tsx`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Passes.tsx` to `App.tsx`, `package.json`, `Gate.tsx`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _128 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08489795918367347 - nodes in this community are weakly interconnected._
- **Should `Passes.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12056737588652482 - nodes in this community are weakly interconnected._
- **Should `e2e-server.mts` be split into smaller, more focused modules?**
  _Cohesion score 0.05204872646733112 - nodes in this community are weakly interconnected._