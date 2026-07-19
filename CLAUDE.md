# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Edamame Legal Flow** is an AI-powered case and task management platform for Australian/NZ immigration lawyers and study abroad agencies. It replaces fragmented, rule-based tools with intelligent automation — users describe a case, select a workflow template, and Gemini AI generates a structured task schedule.

The product targets a gap in the AU immigration SaaS market: no incumbent offers AI-powered document processing, applicant self-service, or multi-jurisdiction support. See `EDAMAME BIG DECK.pptx` for competitive analysis, feature gap analysis, and phased roadmap.

## Strategic Context (from Pitch Deck)

- **Target market:** AU/NZ immigration practitioners (sole agents to enterprise firms)
- **Key competitors:** Migration Manager (AU incumbent), Officio (CA+AU), Clio (legal platform), Smokeball (general legal PM)
- **Differentiation pillars:** AI-first workflow engine, client self-service portal, regulatory intelligence, multi-jurisdiction support
- **Pricing model:** $65–$135/user/mo tiered (Essentials/Professional/Enterprise) + usage-based AI credits
- **Phased roadmap:** Phase 1 (0–6mo) foundation + VEVO/ImmiAccount integration, Phase 2 (6–12mo) AI layer + NZ expansion, Phase 3 (12–18mo) scale + marketplace

## Development Commands

All commands run from `src/` directory:

```bash
cd src
npm install
npm run dev       # Vite dev server on port 3000
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # TypeScript type check (tsc --noEmit)
```

Requires `GEMINI_API_KEY` in `src/.env.local`.

Auth requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `src/.env.local` (get these from your Supabase project's Settings → API page). Without them, the app still loads but `signUp`/`signIn` calls fail with a network error — `src/lib/supabaseClient.ts` falls back to a placeholder URL rather than crashing on load, and logs a console error.

## Architecture

### Dual Runtime Model

- **Frontend:** React 19 + TypeScript SPA, built with Vite 6. Tailwind CSS via CDN (config inline in `src/index.html`).
- **Backend:** Vercel serverless functions in root `api/` directory (not `src/api/`):
  - `/api/generate-tasks.ts` — generates task schedules from case descriptions using Gemini 2.5 Flash
  - `/api/scan-passport-gemini.ts` — extracts passport data from images using Gemini Vision API
  - `/api/check-eligibility.ts` — assesses visa eligibility using Gemini 2.5 Flash with structured JSON schema

### State Management

All app state (tasks, cases, clients, templates, theme) lives in `src/App.tsx` as React `useState` hooks. Pages receive data and mutation callbacks as props — no state library. Theme persists to `localStorage`.

### Navigation

`ViewMode` union type (`'dashboard' | 'clients' | 'cases' | 'case-details' | 'templates' | 'settings'`) drives which page renders. `Sidebar.tsx` controls view switching.

### AI Task Generation Flow

1. User opens case in CaseDetails, clicks "Generate Tasks"
2. `geminiService.ts` POSTs case description + workflow guide + start date to `/api/generate-tasks`
3. Vercel function sends prompt to Gemini with structured JSON schema (title, description, daysOffset)
4. Response parsed into `Task[]` with computed dates and added to app state

### Passport Scanner (OCR) Flow

1. User clicks "Scan Passport" in NewCase/Clients form
2. `PassportScanner.tsx` component opens modal, accepts drag-drop or file upload
3. Image converted to base64 and POSTed to `/api/scan-passport-gemini` via `ocrService.ts`
4. Vercel function calls Gemini Vision API with inline image data
5. Extracted fields (firstName, lastName, dateOfBirth, nationality, passportNumber, expiryDate, gender) returned
6. User can edit fields before confirming to populate form
7. Error state offers "Continue with Manual Entry" fallback

### Authentication Flow

Registration/login gates the **entire app** (not just cloud storage mode) via Supabase Auth (email/password).

1. `AuthProvider` (`src/contexts/AuthContext.tsx`) wraps the whole router in `App.tsx`, resolving `supabase.auth.getSession()` on mount and subscribing to `onAuthStateChange`.
2. `ProtectedRoute` (`src/components/ProtectedRoute.tsx`) reads `useAuth()` — redirects to `/login` if no session, shows a spinner while `loading` is true. It gates `/onboarding` and the `/*` app-shell route; `/`, `/login`, `/register` stay public.
3. `pages/Register.tsx` calls `signUp(email, password, fullName)` — full name is stored in Supabase's `user_metadata.full_name` (no separate `profiles` table). If Supabase requires email confirmation, the page shows a "check your email" state instead of navigating away.
4. `pages/Login.tsx` calls `signIn(email, password)`, with a "Forgot password?" link that calls `resetPassword(email)`.
5. Sign-out is available both in `pages/Settings.tsx` (Account section) and as a link in `components/Sidebar.tsx` — both call `signOut()` then navigate to `/login`.

**Important:** Auth (who you are) and `StorageMode` (`'local' | 'cloud'`, where your data lives) are independent axes. Logging in does not imply cloud storage — a logged-in user can still choose "Local" at `/onboarding` and have their case/client/task data stay in IndexedDB. Cloud storage mode itself is still a stub (`repositories/cloud/` falls back to local) — implementing real Supabase Postgres-backed repositories is a separate, not-yet-done piece of work.

`currentUserId` in `App.tsx` is the authenticated Supabase `user.id` (via `useAuth()`) — used for `assignedTo`/`actorId` on tasks and activity events, and as the id of the "you" entry seeded into Team Members. Team-member identity is now unified with auth identity (see "Per-User Data Isolation" below).

### Per-User Data Isolation

Every logged-in user only ever sees Clients, Cases, Tasks, Case Notes, Documents, Notifications, custom Workflow Templates, Team Members, and the Activity Feed that **they** created — enforced at the repository layer, not in page components, so no call site has to remember to filter.

- **Repositories** (`repositories/local/index.ts`): `createLocalRepositories(userId)` constructs every `Local*Repository` with the authenticated user's id. Reads (`getAll`, `getByCaseId`, etc.) filter to `row.userId === userId`; `create()` stamps `userId` on the item only if the caller left it unset; `update()`/`delete()` look up the existing row first and throw an `OwnershipError` if it belongs to someone else.
- **Workflow Templates** are the one exception with a shared tier: the 5 system defaults have `userId: null` and remain visible to everyone; custom templates a user creates are private, same as everything else.
- **Wiring**: `contexts/RepositoryContext.tsx` calls `useAuth()` internally and passes `user.id` into `repositories/factory.ts`'s `createRepositories(mode, userId)` — isolation is on for both `local` and the cloud-fallback path.
- **Dexie schema** (`lib/dexieDb.ts`) is at `version(2)`, adding a `userId` index to `caseNotes`, `documents`, `notifications` (the three tables that didn't have one in `version(1)`).
- **Team Members / Activity Feed** don't go through Dexie — they're localStorage-backed in `App.tsx`, now namespaced per user (`` edamame_team_members_${userId} ``, `` edamame_team_activity_${userId} ``) instead of one shared global key. `lib/seedData.ts`'s `seedDefaultTeam(currentUser)` seeds the authenticated user as the first "you" entry (real name/email/id) ahead of the 3 synthetic demo colleagues (Eliza/Marcus/Priya).
- **Known accepted gap**: local IndexedDB/localStorage rows created before this feature landed have no `userId` and are invisible post-upgrade — there's no principled way to attribute pre-existing orphaned rows to a specific account. Not an issue for anyone who signed up after this shipped.

**Production:** Supabase project `edamame-legal-flow` (wandering-pork's Org) backs both dev and prod. Its Auth → URL Configuration Site URL is `https://edemame.vercel.app`, with `https://edemame.vercel.app/**` and `http://localhost:3000/**` allow-listed as redirect URLs. The Vercel project `edemame` has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set for Production + Preview.

### Visa Eligibility Advisor Flow

1. User navigates to Visa Advisor page (sidebar or "Check Eligibility" button on client card)
2. 4-step wizard collects: personal info → immigration goal → conditional details → supporting factors
3. On submit, POSTs collected data to `/api/check-eligibility` via `VisaAdvisor.tsx`
4. Vercel function calls Gemini 2.5 Flash with visa assessment prompt
5. Returns JSON with visa verdict cards: 9 Australian visa subclasses (189, 190, 482, 186, 500, 820, 485, 600, 417)
6. Each card shows verdict (qualifies/possibly/unlikely/needs_more_info), reasons, and gaps
7. "Open New Case" button on qualified visas navigates to CaseManager with template pre-selected via URL state

### Key Conventions

- `src/components/` — reusable brand/layout pieces (Logo, Sidebar, PassportScanner, ProtectedRoute)
- `src/pages/` — page-level views (Dashboard, CaseManager, CaseDetails, NewCase, Clients, VisaAdvisor, Templates, Settings, Login, Register, Onboarding, LandingPage)
- `src/services/` — external API client functions (geminiService, ocrService)
- `src/contexts/` — React context providers (`AuthContext`, `RepositoryContext`, `SidebarContext`)
- `src/repositories/` — storage abstraction (`local/` = Dexie/IndexedDB, `cloud/` = Supabase stub, `factory.ts` picks based on `StorageMode`)
- `src/lib/supabaseClient.ts` — Supabase client singleton, used by `AuthContext` (and eventually `repositories/cloud/`)
- `api/` — **root-level** Vercel serverless functions (not `src/api/`) — server-side, runs on Node
- `src/types.ts` — all TypeScript type definitions (Task, Case, Client, WorkflowTemplate, ViewMode, Theme, StorageMode)
- Path alias `@/` resolves to `src/` root

### Styling

- Brand color: `#29B767` (edamame green), aliased as `edamame-*` in Tailwind config
- Dark mode: class-based (`dark:` prefix), toggled via `Theme` type
- Brand fonts: Sniglet (logo), Fredoka (headings)
- Dependencies loaded via import maps from `aistudiocdn.com` (Google AI Studio origin)

### Seed Data

Hardcoded in `App.tsx`: 5 clients, 4 cases, 8 tasks, 5 Australian visa workflow templates (Student 500, Skilled 190, Partner 820/801, Visitor 600, Graduate 485). No persistence layer yet — state resets on reload.
