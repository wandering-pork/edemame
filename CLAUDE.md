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

Agentic GitHub issue filing from Case Manager Focus Mode chat (see "Agentic Issue Filing" below) requires `GITHUB_ISSUES_TOKEN` — a fine-grained GitHub Personal Access Token scoped to Issues Read/Write only on `wandering-pork/edemame` — in `src/.env.local` for local dev, and as an environment variable on the Vercel project for production. This token is read only inside the `api/` serverless functions and is never bundled into client-side code.

Auth requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `src/.env.local` (get these from your Supabase project's Settings → API page). Without them, the app still loads but `signUp`/`signIn` calls fail with a network error — `src/lib/supabaseClient.ts` falls back to a placeholder URL rather than crashing on load, and logs a console error.

## Architecture

### Dual Runtime Model

- **Frontend:** React 19 + TypeScript SPA, built with Vite 6. Tailwind CSS via CDN (config inline in `src/index.html`).
- **Backend:** Vercel serverless functions in root `api/` directory (not `src/api/`):
  - `/api/generate-tasks.ts` — generates task schedules from case descriptions using Gemini 3.5 Flash
  - `/api/scan-passport-gemini.ts` — extracts passport data from images using Gemini Vision API
  - `/api/check-eligibility.ts` — assesses visa eligibility using Gemini 3.5 Flash with structured JSON schema

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

**Important:** Auth (who you are) and `StorageMode` (`'local' | 'cloud'`, where your data lives) are independent axes, chosen at `/onboarding` and persisted in the `profiles` table (see "Local-First Storage" below). Both modes are fully implemented; the mode can also be changed later from `pages/Settings.tsx`'s "Storage Mode" section (see "Switching Storage Mode" below).

`currentUserId` in `App.tsx` is the authenticated Supabase `user.id` (via `useAuth()`) — used for `assignedTo`/`actorId` on tasks and activity events, and as the id of the "you" entry seeded into Team Members.

### Local-First Storage

**No app data lives in the browser.** Local mode stores every record as a JSON file in a real folder on disk that the user links via the File System Access API (Chrome/Edge only) — not IndexedDB, not `localStorage`, not OPFS. The intent: a lawyer with multiple machines points the app at a folder inside Dropbox/OneDrive/iCloud Drive and that folder *is* their data, portable across devices without a server. Cloud mode (Supabase Postgres tables + Storage) is the other half of this same split, for practitioners who want any-device access without managing a linked folder.

- **`profiles` table** (Supabase, migration at `supabase/migrations/20260722000000_create_profiles.sql`, RLS-scoped to `auth.uid()`) holds account-level settings that must follow the user regardless of device: `storage_mode`, `theme`, `sidebar_collapsed`, plus `linked_folder_name`/`linked_at` for display. `services/profileService.ts` wraps reads/writes; `contexts/ProfileContext.tsx` fetches it right after login and exposes `useProfile()`.
- **The one sanctioned browser-side exception**: a `FileSystemDirectoryHandle` is a browser-native object that can't be serialized to Supabase or a file, so the permission handle to reconnect to the linked folder is persisted client-side in a dedicated IndexedDB store, `lib/folderHandleStore.ts` (one record per `userId`, holds no case data). `contexts/LocalFolderContext.tsx` owns the link/reconnect/redirect lifecycle (`linkFolder`, `reconnect`, `changeFolder`) and exposes a `status` (`'unlinked' | 'needs-permission' | 'ready'` etc.) that `App.tsx`'s `StorageGate` uses to show `components/LinkFolderGate.tsx` instead of the app shell until access is granted.
- **Repositories** (`repositories/filesystem/index.ts`): `createFilesystemRepositories(rootHandle)` implements the same `Repositories` interface as before (`repositories/types.ts`), backed by `lib/fsStorage.ts` (a File System Access API wrapper — `writeJson`/`readJson`/`writeBlob`/`readBlob`/`listFiles`/`copyTree`, etc.) instead of Dexie/OPFS. Every entity gets one JSON file per record (`clients/{id}.json`, `cases/{id}.json`, ...), chosen deliberately over a single DB file so that if the linked folder is synced via Dropbox/OneDrive and two machines write near-simultaneously, the conflict is scoped to one record instead of the whole dataset. `activity-events/` is append-only, one file per event (`{isoTimestamp}-{eventId}.json`), for the same reason. Document file bytes live at `Document.filePath` as real files (set by `components/DocumentUpload.tsx`), replacing the old OPFS-backed blob store. Team Members, the Activity Feed, per-case Document Checklists, and Focus Mode Chat now go through this same repository layer (`repos.teamMembers`, `repos.activity`, `repos.checklist`, `repos.chat`) instead of ad hoc `localStorage`. Since a linked folder belongs to exactly one user by construction, there's no per-row `userId` ownership check the way the old Dexie repositories needed.
- **Settings → Data Storage** (`pages/Settings.tsx`) shows the linked folder and a "Change Folder" button (`LocalFolderContext.changeFolder()`): picking an empty target copies the existing folder's contents over via `copyTree`; picking a folder that already has Edamame data in it (e.g. a second machine linking to an already-synced folder) adopts it as-is rather than overwriting.
- **No migration path** from the old Dexie/localStorage era — this was a clean cutover with no existing users at the time.
- **Cloud repositories** (`repositories/cloud/index.ts`): `createCloudRepositories(userId)` implements the same `Repositories` interface, backed by Supabase Postgres tables (one per entity, schema at `supabase/migrations/20260802000000_create_cloud_data_tables.sql`) instead of JSON files. Every table has a `user_id` column, RLS-scoped to `auth.uid()` (same "own rows" pattern as `profiles`), plus an explicit `.eq('user_id', userId)` on every query as a second line of defense. Document blobs go to the private `documents` Supabase Storage bucket at `{userId}/{Document.filePath}`, with storage RLS scoping access by the first path segment. Nested filesystem layouts (`case-notes/{caseId}/`, `checklist/{caseId}.json`, etc.) are flattened into flat tables filtered by `case_id` — Postgres doesn't need per-record files to scope sync conflicts the way a Dropbox-synced folder does.
- **Switching Storage Mode**: `pages/Settings.tsx`'s "Storage Mode" section lets a user switch between local and cloud after onboarding (previously fixed for the account's lifetime). `repositories/migrate.ts`'s `copyAllData(source, dest)` copies every entity (including document blobs, via `getFileData`/`create`) from the currently active repositories into the other mode's repositories; the page then calls `updateProfile({ storageMode })` and does a full `window.location.reload()` so `StorageGate`/`RepositoryProvider` re-initialize cleanly rather than reconciling in-memory state against a swapped backend. Cloud → local requires picking an empty folder (rejects non-empty targets, unlike `changeFolder()`'s adopt-as-is behavior); local → cloud leaves the local folder untouched as a backup.

**Production:** Supabase project `edamame-legal-flow` (wandering-pork's Org) backs both dev and prod. Its Auth → URL Configuration Site URL is `https://edemame.vercel.app`, with `https://edemame.vercel.app/**` and `http://localhost:3000/**` allow-listed as redirect URLs. The Vercel project `edemame` has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set for Production + Preview. The `profiles` table migration, the cloud data tables migration (`20260802000000_create_cloud_data_tables.sql`), the agent issue filings migration (`20260807000000_create_agent_issue_filings.sql`), and the document types migration (`20260829000000_create_document_types.sql`) must all be applied manually (Supabase SQL editor, or `supabase db push` once the CLI is linked to the project) — migrations are not applied automatically.

### Agentic Issue Filing (Case Manager Focus Mode chat only)

Focus Mode chat (`api/focus-chat.ts`, rendered by `AgentPanel.tsx`) can recognize when a user's message describes a product defect or feature request and offer to file a GitHub issue — scoped only to this chat surface, per GitHub issue #15.

1. On every turn, the Gemini system prompt asks the model to silently classify the message against the loaded User Manual context (`api/_lib/userManual.ts`) into Normal Question / Defect / Feature Request / None.
2. For Defect or Feature Request, the model uses Gemini function-calling (`tools` on the `generateContent` request) to call `search_github_issues(query)`, which `api/focus-chat.ts` executes server-side via the GitHub Search API (`api/_lib/github.ts`, using `GITHUB_ISSUES_TOKEN`).
3. If a likely duplicate is found, the model replies in plain text with a link to the existing issue instead of drafting a new one.
4. If not, the model calls `draft_github_issue(title, body)`. The backend does **not** file anything at this point — it returns `{ kind: 'issue-draft', draft }` to the frontend, which `AgentPanel.tsx` renders as a message with `kind: 'issue-draft'` (see `FocusChatMessage` in `types.ts`) showing the drafted title/body plus **Confirm** and **Cancel** buttons.
5. Only a user's Confirm click hits the separate `api/file-github-issue.ts` endpoint, which performs the actual `POST /repos/wandering-pork/edemame/issues` call, labeling the issue `agent-reported`. Cancel just marks the draft discarded client-side — no API call. The `IssueDraftCard` UI (`AgentPanel.tsx`) discloses that confirming posts to the **public** `wandering-pork/edemame` repo before the user clicks Confirm.
6. **Auth**: both `api/focus-chat.ts` and `api/file-github-issue.ts` require a valid Supabase session — the frontend sends the user's access token as `Authorization: Bearer <token>`, verified server-side via `api/_lib/auth.ts`'s `verifySupabaseUser()`. It calls Supabase Auth's `GET /auth/v1/user` REST endpoint directly with plain `fetch` rather than adding `@supabase/supabase-js` as a dependency of the root-level `api/` functions (there's no root `package.json`/`node_modules` — only `src/` has one, per `vercel.json`'s `buildCommand`), matching the minimal-client convention already used by `api/_lib/github.ts`. Unauthenticated requests get a 401.
7. **Rate limiting**: the "3 per conversation" the model steers itself by (`focus-chat.ts`'s `MAX_ISSUES_PER_SESSION`) and the `issuesFiledInSession` count the frontend sends are both client-influenced and are UX niceties only, not security controls. The real, server-enforced cap is in `file-github-issue.ts`: at most 5 filings per authenticated user per rolling 24h, backed by the `agent_issue_filings` table (`supabase/migrations/20260807000000_create_agent_issue_filings.sql`, RLS-scoped to `auth.uid()` like `profiles`). Known gap: the count-then-insert check isn't atomic, so a narrow race across concurrent requests from the same user isn't fully closed — acceptable for the single-user-abuse scenario this defends against, documented in a comment at the top of `file-github-issue.ts`.
8. **PII scrub**: before calling the GitHub API, `file-github-issue.ts` runs the drafted title/body through `api/_lib/pii.ts`'s `scrubPii()` — a simple regex-based redaction of obvious email/phone/passport-number-like patterns — as a server-side backstop on top of the prompt instruction in `focus-chat.ts` telling the model not to include client-identifying details. It is not a full PII-detection system (documented false positive/negative examples in `pii.ts`).

### Document Types & Checklist Auto-Link (GitHub issue #4)

A firm/account-level **Document Type** reference list is the shared vocabulary between uploaded Case Files and Document Checklist items.

- **Data**: `DocumentType` in `types.ts` (`code` `^[A-Z0-9]{1,6}$`, `description`, `category`, `isSystemDefault`, `autoLink`), persisted through `repos.documentTypes` in both modes (`document-types/{id}.json` locally; the `document_types` table, RLS-scoped to `auth.uid()`, in cloud). The ~90 system-default rows live in `lib/documentTypes.ts` and are seeded **per account** by `ensureSystemDocumentTypes()` on first load — idempotent, so rows added in a later release appear without a migration. The rename/recode/delete lock on system rows is enforced in `contexts/DocumentTypeContext.tsx`, not the database.
- **Config UI**: `components/case-manager/ConfigurationsPanel.tsx`, opened from `pages/CaseManager.tsx`'s header. Left-nav-of-setting-types + right-detail-pane shell so future Case Manager setting types slot into `SETTING_TYPES` without restructuring.
- **Auto-link** (`lib/autoLink.ts`): a *display-time recalculation*, never a background job. It runs when the Document Checklist tab is opened, on its Refresh button, and immediately for one item when that item's Document Type changes. Verified/Waived items are never touched; the most recent `Document.uploadedAt` wins ties; an existing manual link is only re-pointed when it is stale (document deleted, or its type no longer matches).
- **Upload**: `components/DocumentUpload.tsx` stages dropped files and refuses to upload until each has a Document Type (`OTH` is the escape hatch).

### Visa Eligibility Advisor Flow

1. User navigates to Visa Advisor page (sidebar or "Check Eligibility" button on client card)
2. 4-step wizard collects: personal info → immigration goal → conditional details → supporting factors
3. On submit, POSTs collected data to `/api/check-eligibility` via `VisaAdvisor.tsx`
4. Vercel function calls Gemini 3.5 Flash with visa assessment prompt
5. Returns JSON with visa verdict cards: 9 Australian visa subclasses (189, 190, 482, 186, 500, 820, 485, 600, 417)
6. Each card shows verdict (qualifies/possibly/unlikely/needs_more_info), reasons, and gaps
7. "Open New Case" button on qualified visas navigates to CaseManager with template pre-selected via URL state

### Key Conventions

- `src/components/` — reusable brand/layout pieces (Logo, Sidebar, PassportScanner, ProtectedRoute)
- `src/pages/` — page-level views (Dashboard, CaseManager, CaseDetails, NewCase, Clients, VisaAdvisor, Templates, Settings, Login, Register, Onboarding, LandingPage)
- `src/services/` — external API client functions (geminiService, ocrService)
- `src/contexts/` — React context providers (`AuthContext`, `RepositoryContext`, `SidebarContext`)
- `src/repositories/` — storage abstraction (`filesystem/` = File System Access API-backed local mode, `cloud/` = not-yet-implemented Supabase stub, `factory.ts` picks based on `StorageMode`)
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

## Keeping the User Manual in Sync

`docs/user-manual/` (see `docs/user-manual/README.md`) is the Case Manager Agent's (Focus Mode chat) source of truth for "how do I…" answers — it is loaded verbatim into the Gemini system prompt by `api/_lib/userManual.ts`, so stale pages make the agent actively wrong, not just outdated.

**Whenever you change user-facing behavior** (a page's flow, a button/label, a new feature, a removed feature, a changed field, a renamed module), check whether any file under `docs/user-manual/` describes the old behavior and update it in the same change. Conversely, when adding a new module/page, add a corresponding module folder under `docs/user-manual/` (mirroring `case-manager/`, `dashboard/`, `clients/`, `templates/`) with at least a `getting-started.md`. Pure internal/refactor changes with no user-visible effect don't require a manual update.
