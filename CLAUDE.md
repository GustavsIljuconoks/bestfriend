# Bestfriend — Claude Code Project Instructions

## Project at a Glance

**Bestfriend** is a personal file-aware macOS desktop agent.
- **Stack:** Electron 27+, TypeScript (strict), React 18, electron-vite, electron-builder, pnpm workspaces monorepo
- **AI:** OpenAI (chat streaming + embeddings + Whisper transcription) + Pinecone (vector DB, serverless)
- **Local DB:** SQLite via `better-sqlite3`
- **State:** TanStack Query (IPC-backed server state) + Zustand (local UI state)
- **Design:** macOS-native feel; `titleBarStyle: 'hiddenInset'`, vibrancy sidebar, Instrument Serif for assistant prose, Geist Mono for citations, Phosphor Icons

**Monorepo layout:**
```
apps/desktop/src/
  main/        ← Electron main process (Node, FS, net, secrets)
  preload/     ← contextBridge bridge only
  renderer/    ← React UI (sandboxed, no Node)
packages/core/ ← pure TypeScript logic (no Electron imports)
  domain/      ← canonical types
  ingest/      ← file parsers + chunker
  rag/         ← retrieval, context assembly
  providers/   ← OpenAI + Pinecone wrappers
  util/        ← hashing, token estimation, mime
```

---

## Subagent Roster

| Agent | File | Owns |
|---|---|---|
| `electron-pro` | `.claude/agents/electron-pro.md` | `apps/desktop/src/main/`, `apps/desktop/src/preload/`, window management, tray, global hotkeys, native notifications, safeStorage, electron-builder config |
| `react-specialist` | `.claude/agents/react-specialist.md` | `apps/desktop/src/renderer/` components — streaming chat, proposal cards, sources drawer, push-to-talk, TanStack Query hooks, Zustand stores |
| `frontend-developer` | `.claude/agents/frontend-developer.md` | Renderer routing, layout architecture, code splitting, error boundaries, cross-cutting frontend patterns |
| `ui-designer` | `.claude/agents/ui-designer.md` | Design tokens, component visual specs, design system, dark/light mode, motion, accessibility specs |
| `ipc-designer` | `.claude/agents/ipc-designer.md` | `window.api.*` IPC contract, preload bridge typing, streaming channel design, IPC security |
| `typescript-pro` | `.claude/agents/typescript-pro.md` | `packages/core/domain/` types, monorepo tsconfig, branded IDs, discriminated unions, `WindowApi` interface |
| `llm-architect` | `.claude/agents/llm-architect.md` | `packages/core/rag/`, `packages/core/providers/`, RAG pipeline, OpenAI tool calls, proposal extraction, spend guardrails, Pinecone index design |
| `main-process-developer` | `.claude/agents/main-process-developer.md` | `apps/desktop/src/main/jobs/`, `apps/desktop/src/main/scheduler/`, SQLite repositories, ingestion job runner, reminder scheduler, spend-cap enforcement |

---

## Swarm Spawning Rules

### Rule 1 — Default to parallel

**Always** spawn independent subagents in parallel. Never queue agents serially unless output of one is direct input to the next.

```
WRONG:  design → implement → review  (serial when they could overlap)
RIGHT:  [ui-designer + ipc-designer] in parallel → [react-specialist + main-process-developer] in parallel → typescript-pro review
```

### Rule 2 — Spawn eagerly, not conservatively

If a task touches more than one owned area, spawn the owning agents simultaneously. Each agent sees the full task description and works on its slice.

### Rule 3 — File ownership determines who leads

Never have two agents write to the same file concurrently. The ownership table above is authoritative. When unclear, ask `ipc-designer` to arbitrate on shared boundaries.

### Rule 4 — Types first, then implementation

`typescript-pro` always defines or reviews shared domain types in `packages/core/domain/` **before** implementation agents start writing code that depends on those types. This is the one mandatory serial step.

### Rule 5 — Design-then-build for new UI surfaces

For brand-new UI surfaces (new routes, significant new components): `ui-designer` runs first to produce specs. Then `react-specialist` + `frontend-developer` implement in parallel.

### Rule 6 — The orchestrator agent decides, not the user

When the user asks for a feature, invoke the `orchestrator` agent first. It maps the work to a spawn plan, then you execute that plan. Don't ask the user which agents to use.

### Rule 7 — Report blockers immediately

If an agent is blocked waiting on another agent's output (e.g. IPC types not yet defined), stop that agent, unblock the dependency agent, then resume. Don't let blocked agents spin.

---

## Pre-Defined Swarm Patterns

Use these patterns when the user asks to implement a milestone or feature.

### Pattern: New full-stack feature (new IPC + UI + main logic)

```
Step 1 (parallel):
  - typescript-pro     → define domain types + IPC contract types
  - ui-designer        → produce component visual specs

Step 2 (parallel, after Step 1):
  - ipc-designer       → design window.api.* endpoints using the types
  - react-specialist   → scaffold components using specs
  - main-process-developer → implement main-side logic + DB

Step 3 (parallel, after Step 2):
  - electron-pro       → wire IPC handlers in preload + main
  - react-specialist   → connect components to TanStack Query hooks

Step 4:
  - typescript-pro     → final type review, tsc --noEmit check
```

### Pattern: AI pipeline change (RAG, tools, embeddings)

```
Step 1:
  - llm-architect      → design the pipeline change

Step 2 (parallel):
  - main-process-developer → integrate into job runner + DB
  - typescript-pro         → update domain types + tool schemas
  - ipc-designer           → update streaming IPC if needed

Step 3:
  - react-specialist   → update UI (proposals, sources drawer, etc.)
```

### Pattern: UI-only change (visual, interaction, design system)

```
Step 1:
  - ui-designer        → produce updated specs / tokens

Step 2 (parallel):
  - react-specialist   → implement components
  - frontend-developer → update layout / routing if affected
```

### Pattern: Electron shell change (window, tray, hotkey, notification)

```
Spawn: electron-pro (sole owner)
Consult: react-specialist if renderer-side IPC handler changes needed
```

### Pattern: Type system refactor

```
Spawn: typescript-pro (leads)
Notify: all other agents of type changes via updated domain files
```

---

## Milestone → Agent Mapping

From `personal-agent-plan.md`:

| Milestone | Lead agents | Supporting |
|---|---|---|
| M0: Bootstrap + navigation | `electron-pro` | `frontend-developer`, `typescript-pro` |
| M1: Settings + secrets | `electron-pro`, `main-process-developer` | `react-specialist`, `typescript-pro` |
| M2: Indexing + collections | `main-process-developer`, `llm-architect` | `ipc-designer`, `react-specialist` |
| M3: RAG chat + streaming | `llm-architect`, `main-process-developer` | `react-specialist`, `ipc-designer`, `electron-pro` |
| M4: Proposals + memories | `llm-architect` | `react-specialist`, `typescript-pro`, `ui-designer` |
| M5: Reminder scheduler + notifications | `electron-pro`, `main-process-developer` | `react-specialist` |
| M6: Folder indexing + spend cap | `main-process-developer` | `llm-architect` |
| M7: PDF/DOCX + audio + voice | `llm-architect`, `main-process-developer` | `react-specialist` |
| M8: Quick-capture + Inbox | `electron-pro` | `react-specialist`, `ui-designer`, `main-process-developer` |
| M9: macOS Reminders mirroring | `electron-pro`, `main-process-developer` | |
| M10: Onboarding + polish | `ui-designer`, `react-specialist` | `frontend-developer` |

---

## Coordination Patterns

### Handoff format between agents

When one agent produces output that another needs, summarize handoffs explicitly:

```
[electron-pro → ipc-designer]
  "IPC channel 'library:dropFiles' registered in main/ipc/library.ts.
   Accepts: paths: string[]. Returns: { jobId: string }.
   Ready for preload exposure."

[typescript-pro → all]
  "Domain types updated in packages/core/domain/ipc.ts.
   New: TriageAction discriminated union. Updated: InboxItem interface.
   Run: pnpm --filter @bestfriend/core tsc --noEmit"
```

### Conflict resolution

- Two agents want to modify the same file → the file-owning agent takes the edit; the other agent submits a spec/PR comment instead
- Type mismatch between main and renderer → `typescript-pro` arbitrates
- IPC shape disagreement → `ipc-designer` arbitrates

### When to involve `llm-architect`

Any change to:
- Pinecone queries or namespaces
- OpenAI tool definitions (name, schema, `strict` flag)
- Chunking algorithm or token budgets
- System prompt content (memories, user profile injection)
- Spend tracking or cost estimation

---

## Non-Negotiable Security Rules

These apply to ALL agents, always:

1. **Renderer never holds API keys** — keys live only in `safeStorage` in main process
2. **contextBridge only** — preload never exposes `ipcRenderer` directly
3. **IPC input validation** — main-process handlers validate every argument
4. **No raw file paths to renderer** — return display names + IDs; main resolves paths
5. **Tool-call gate for proposals** — proposals only from OpenAI tool-call payloads, never from free-form text parsing
6. **Soft-delete memories** — deleted memories get `deleted_at` set, never hard-deleted, so model is instructed not to re-add them
7. **packages/core has zero Electron imports** — enforced by CI; keep pure

---

## Skills Reference

Project-specific skills live in `.claude/skills/`. Agents should consult them when relevant:

| Skill | When to use |
|---|---|
| `electron-security` | Any IPC handler, preload code, BrowserWindow config, safeStorage — security review checklist |
| `rag-patterns` | Pinecone queries, OpenAI streaming, chunking, context assembly, tool call processing |
| `react-electron` | TanStack Query hooks, Zustand stores, streaming UI, optimistic updates, code splitting |
| `macos-design` | CSS tokens, component styles, BrowserWindow config, motion, typography, accessibility |
| `openai-docs` | OpenAI API questions, model selection, tool call schemas, Whisper transcription |

External skills (install via `./install-skills.sh`):
- `garrytan/review` — pre-PR security/quality review
- `trailofbits/insecure-defaults` — detect hardcoded secrets + fail-open patterns
- `vercel-labs/react-best-practices` — 64 React performance rules
- `addyosmani/accessibility` — WCAG compliance audit

---

## Running the Project

```bash
# Install
corepack enable && pnpm install

# Dev (HMR)
pnpm --filter @bestfriend/desktop dev

# Type check all packages
pnpm tsc --noEmit

# Build
pnpm --filter @bestfriend/desktop build
```

---

## Design System Quick Reference

From `personal-agent-design.md` (full details in that file):

- **Window chrome:** `titleBarStyle: 'hiddenInset'`, vibrancy on sidebar only
- **Quick-capture:** 480×240 frameless, `vibrancy: 'hud'`, always-on-top, center-top 96px from screen top
- **Fonts:** SF Pro (UI), Instrument Serif (assistant prose), Geist Mono (citations/code) — bundled, no runtime fetch
- **Accent:** sparse — focus rings, active sidebar item, primary button, streaming caret, unread pill only
- **Motion:** Motion (`motion/react`), spring `{ stiffness: 320, damping: 32 }`, respect `prefers-reduced-motion`
- **Icons:** Phosphor Icons `@phosphor-icons/react`, `regular` weight default, `duotone` for active sidebar items
- **Layout:** 3-pane (sidebar 220px | list 280px | detail flex), all splits resizable

---

## Key Design Decisions (locked — don't re-litigate)

- pnpm workspaces monorepo, corepack-managed
- electron-vite (not webpack/CRA)
- SQLite (`better-sqlite3`) as authoritative local store; Pinecone is derived and rebuildable
- TanStack Query for all IPC-backed data; Zustand for purely local UI state
- OpenAI tool calls (strict JSON schemas) for proposals/memories — never text parsing
- Pinecone: one serverless index, two namespaces: `docs` + `chat_history`
- Confidence threshold gate (default 0.6) before showing proposals to user
- macOS Reminders mirroring is push-only (Bestfriend → Reminders); no two-way sync
- Reminders soft-delete only; feed items always written even if notification is missed
