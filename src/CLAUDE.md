# Edamame Legal Flow — CLAUDE.md

## Project Overview

**Edamame Legal Flow** is a React + TypeScript web app for immigration lawyers and study abroad agencies to manage legal cases and AI-generated task workflows.

Built with [Google AI Studio](https://ai.studio/apps/1c0e5b8b-4436-4c66-8cf8-e735e0184e98). Uses Google Gemini to auto-generate task schedules from case descriptions and workflow templates.

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | React 19 + TypeScript 5.8 |
| Build | Vite 6 |
| Styling | Tailwind CSS (CDN) with custom theme |
| AI | Google Gemini (`@google/genai`) |
| Icons | `lucide-react` |
| Dates | `date-fns` |
| IDs | `uuid` |

## Dev Setup

```bash
npm install
# Add GEMINI_API_KEY to .env.local
npm run dev       # dev server on port 3000
npm run build     # production build
npm run lint      # TypeScript type check (tsc --noEmit)
```

Requires a valid `GEMINI_API_KEY` in `.env.local`. The Vite config injects it at build time via `process.env.GEMINI_API_KEY`.

## Architecture

**State management:** All app state lives in `App.tsx` (tasks, cases, clients, templates, theme). Pages receive data and mutation callbacks as props — no Redux/Zustand.

**Navigation:** `ViewMode` type drives which page renders. `Sidebar.tsx` controls view switching.

**Data flow:**
```
App.tsx (state) → props → pages/ components
                       ↑
              geminiService.ts (AI task generation)
```

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Root component, all state, navigation logic |
| `types.ts` | All TypeScript type definitions |
| `services/geminiService.ts` | Gemini AI integration — `generateTasksFromCase()` |
| `pages/Dashboard.tsx` | Task calendar view (main screen) |
| `pages/CaseManager.tsx` | Case list + actions |
| `pages/CaseDetails.tsx` | Per-case task view + AI generation trigger |
| `pages/NewCase.tsx` | Case intake form |
| `pages/Clients.tsx` | Client CRUD |
| `pages/Templates.tsx` | Workflow template management |
| `vite.config.ts` | Build config, API key injection, path alias `@/*` |

## Data Models (types.ts)

- `Task` — workflow task with date, priority, completion status, case linkage
- `Case` — immigration case tied to a `Client` and `WorkflowTemplate`
- `Client` — client personal info
- `WorkflowTemplate` — named procedure with description/guide text
- `ViewMode` — union of navigation states
- `Theme` — `'classic'` | `'dark'`

Default seed data (hardcoded in `App.tsx`): 5 clients, 4 cases, 8 tasks, 5 visa workflow templates (Australian: Student 500, Skilled 190, Partner 820/801, Visitor 600, Graduate 485).

## AI Integration

`geminiService.ts` → `generateTasksFromCase(caseDescription, workflowGuide, startDate)`

- Model: Gemini 2.5 Flash Preview
- Output: structured JSON array of tasks with date offsets
- Called from `CaseDetails.tsx` when user triggers task generation

## Styling Notes

- Tailwind config is inline in `index.html` (CDN usage)
- Brand color: `#29B767` (edamame green), aliased as `edamame-*` in Tailwind config
- Dark mode class-based (`dark:` prefix)
- Theme stored in `localStorage`

## Conventions

- Components in `components/` are reusable branding/layout pieces
- Page-level views go in `pages/`
- Services (external API calls) go in `services/`
- All types centralized in `types.ts`
- Path alias `@/` resolves to project root
