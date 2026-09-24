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

Which flow runs depends on whether the case's `WorkflowTemplate` has `timing` set on its steps
(Step 1 · 1E — see "Template task timing" below).

**Template with timing (deterministic — no AI call for the plan itself):**
1. `src/lib/tasksFromTemplate.ts`'s `buildTemplateTaskDrafts()` calls `scheduleFromTemplate()` with
   the case's start date and any known anchors (deadlines, already-done steps) and returns one task
   draft per step, each carrying `stepKey`/`datePending`.
2. `pages/NewCase.tsx`, `lib/openCaseFromAdvisor.ts`, and `pages/CaseDetails.tsx`'s "Generate plan
   from template" button all call this instead of the AI for a timed template — labelled "Generate
   plan from template" rather than "Generate Plan with AI".
3. Once that plan exists, `CaseDetails.tsx`'s "Suggest extra tasks with AI" asks
   `services/geminiService.ts`'s `suggestAdditions()` (POSTs `mode: 'additions'` + the already-
   scheduled steps to `/api/generate-tasks`) for a small number of case-specific extra tasks the
   template doesn't already cover, each with a `reason`; the agent Accepts or Rejects each one
   individually rather than getting a whole plan back.
4. Marking a step's task done, or adding/updating a case deadline, re-runs
   `lib/tasksFromTemplate.ts`'s `rescheduleCaseTasks()` (via `App.tsx`'s
   `rescheduleCaseFromSnapshot`) so any still-`datePending` ("Estimated") task downstream of that
   anchor gets a firm date. A task whose date has been edited by hand (`TaskDetailModal`, the
   inline date edit/"set today" quick action in `CaseDetails.tsx`, or a Dashboard calendar drag)
   gets `dateLocked: true` and is never recalculated again.

**Template with no timing set yet, or no template (unchanged AI-only flow):**
1. User opens case in CaseDetails (or NewCase / Visa Advisor), triggers AI generation.
2. `geminiService.ts`'s `generateTasksFromCase()` POSTs case description + workflow guide + start
   date to `/api/generate-tasks` (no `mode`, the legacy request shape).
3. Vercel function sends prompt to Gemini with structured JSON schema (title, description, daysOffset)
4. Response parsed into `Task[]` with computed dates (via `lib/dates.ts`'s `addDaysISO()` — local
   calendar dates, not `toISOString()`) and added to app state.

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
- **Repositories** (`repositories/filesystem/index.ts`): `createFilesystemRepositories(rootHandle)` implements the same `Repositories` interface as before (`repositories/types.ts`), backed by `lib/fsStorage.ts` (a File System Access API wrapper — `writeJson`/`readJson`/`writeBlob`/`readBlob`/`listFiles`/`copyTree`, etc.) instead of Dexie/OPFS. Every entity gets one JSON file per record (`clients/{id}.json`, `cases/{id}.json`, ...), chosen deliberately over a single DB file so that if the linked folder is synced via Dropbox/OneDrive and two machines write near-simultaneously, the conflict is scoped to one record instead of the whole dataset. `activity-events/` is append-only, one file per event (`{isoTimestamp}-{eventId}.json`), for the same reason. Document file bytes live at `Document.filePath` as real files (set by `components/DocumentUpload.tsx`), replacing the old OPFS-backed blob store. The Activity Feed, per-case Document Checklists, and Focus Mode Chat now go through this same repository layer (`repos.activity`, `repos.checklist`, `repos.chat`) instead of ad hoc `localStorage`. `repos.teamMembers` also lives here, but only local mode reads/writes it now — see "Firm accounts" below for why cloud mode doesn't. Since a linked folder belongs to exactly one user by construction, there's no per-row `userId` ownership check the way the old Dexie repositories needed.
- **Settings → Data Storage** (`pages/Settings.tsx`) shows the linked folder and a "Change Folder" button (`LocalFolderContext.changeFolder()`): picking an empty target copies the existing folder's contents over via `copyTree`; picking a folder that already has Edamame data in it (e.g. a second machine linking to an already-synced folder) adopts it as-is rather than overwriting.
- **No migration path** from the old Dexie/localStorage era — this was a clean cutover with no existing users at the time.
- **Cloud repositories** (`repositories/cloud/index.ts`): `createCloudRepositories(userId, firmId)` implements the same `Repositories` interface, backed by Supabase Postgres tables (one per entity, schema at `supabase/migrations/20260802000000_create_cloud_data_tables.sql`) instead of JSON files. Since the firm accounts migration (see "Firm accounts" below), every firm-scoped table's queries filter on `.eq('firm_id', firmId)` rather than `user_id` — RLS enforces the same thing server-side, this is the second line of defense — and every insert still sets `user_id` too, kept as "created by" for audit. `notifications` stays `user_id`-scoped (per-person, not per-firm). Document blobs go to the private `documents` Supabase Storage bucket: new uploads at `{firmId}/{Document.filePath}`, with reads/deletes trying that path first and falling back to the legacy `{userId}/{Document.filePath}` prefix used before firms existed — storage RLS accepts both, so nothing needs copying. Nested filesystem layouts (`case-notes/{caseId}/`, `checklist/{caseId}.json`, etc.) are flattened into flat tables filtered by `case_id` — Postgres doesn't need per-record files to scope sync conflicts the way a Dropbox-synced folder does.
- **Switching Storage Mode**: `pages/Settings.tsx`'s "Storage Mode" section lets a user switch between local and cloud after onboarding (previously fixed for the account's lifetime). `repositories/migrate.ts`'s `copyAllData(source, dest)` copies every entity (including document blobs, via `getFileData`/`create`) from the currently active repositories into the other mode's repositories; the page then calls `updateProfile({ storageMode })` and does a full `window.location.reload()` so `StorageGate`/`RepositoryProvider` re-initialize cleanly rather than reconciling in-memory state against a swapped backend. Cloud → local requires picking an empty folder (rejects non-empty targets, unlike `changeFolder()`'s adopt-as-is behavior); local → cloud leaves the local folder untouched as a backup.
- **Usage tracking** (GitHub #39, instrumentation only — no admin/billing dashboard yet): `UsageEvent` (`types.ts`) is a sibling to `ActivityEvent`, same append-only pattern (`repos.usage`, `usage-events/` locally, `usage_events` table in cloud), attributed by `userId`, and (cloud mode only, since Step 1 · 1F) `firmId` too — gives per-firm seat counts for future pricing. `firmId` is `undefined` in local mode and on cloud rows logged before the firm accounts migration. Four event types are logged: `case_created` (with `visaSubclass`/`templateId` — `visaSubclass` prefers the case's own `Case.visaSubclass`, falling back to its workflow template's for cases created before that field existed), `client_created`, `team_member_added`, and `eligibility_check` (with Gemini `promptTokens`/`candidatesTokens`/`totalTokens` plus `estimatedCostUsd` — pricing in `api/_lib/aiPricing.ts` is a zeroed TODO placeholder, so cost reads `$0.00` until real Gemini pricing is filled in; token counts are accurate). `App.tsx`'s `pushUsageEvent` fires next to the existing `pushActivity` calls in `handleTasksConfirmed`/`handleAddClient`/`handleAddTeamMember`, plus a new `handleEligibilityChecked` threaded through `VisaAdvisorRoute` into `VisaAdvisor.tsx` (the only one of the four with no pre-existing `App.tsx` callback, since it calls `/api/check-eligibility` directly). As an interim stopgap until a real dashboard exists, `pages/Settings.tsx` has a read-only "Usage" section showing aggregated counts computed client-side from `repos.usage.getAll()` — no raw event list, no date filtering.
- **Eligibility Assessments**: `EligibilityAssessment` (`types.ts`) persists every report the Visa Advisor gets back from `/api/check-eligibility` — the wizard `inputs`, the full `options` (all assessed pathways with verdict/reasons/gaps), and optional `clientId`/`caseId`/`selectedSubclass` filled in as they become known. `repos.eligibility` (`getAll`/`getById`/`create`/`update`/`delete`/`getByCaseId`/`getByClientId`) follows the same per-entity pattern as the rest of the repository layer: one JSON file per record at `eligibility-assessments/{id}.json` locally; the `eligibility_assessments` table (RLS-scoped to `auth.uid()`, schema at `supabase/migrations/20260925000100_create_eligibility_assessments.sql`) in cloud. `pages/VisaAdvisor.tsx` (via `useRepositories()`, the same direct-access convention `pages/CaseDetails.tsx` uses) creates the record as soon as a report comes back — setting `clientId` if the advisor was opened from a client's page — and updates it with `caseId`/`clientId`/`selectedSubclass` if a case is opened from one of the pathways (`App.tsx`'s `handleOpenNewCase` returns the created case/client ids for this). `pages/CaseDetails.tsx` looks up the most recent assessment for its case and, if one exists, shows an "Eligibility assessment" header button opening `components/visa-advisor/EligibilityAssessmentModal.tsx` — a read-only view built from the same `components/visa-advisor/PathwayCard.tsx` (and shared `verdictStyles.ts`) that `VisaAdvisor.tsx`'s live report uses, so the two don't duplicate verdict/reasons/gaps rendering. `repositories/migrate.ts`'s `copyAllData`/`clearAll` include this entity like every other.
- **Task status** (Step 1 · Foundations 1B): `Task.status` (`TaskStatus` in `types.ts`: `not_started` | `in_progress` | `waiting_client` | `waiting_third_party` | `not_applicable` | `done`) replaces the old boolean `isCompleted` as the source of truth for a task's lifecycle — `isCompleted` is kept for one release as a derived mirror (`status === 'done' || status === 'not_applicable'`) so any remaining reader keeps working, but new code should use `lib/taskStatus.ts`'s `isTaskClosed()`/`isWaiting()` instead. `withStatus(task, status, reason?)` is the one place a status change is applied — it throws if `status` is `not_applicable` without a non-empty `reason`, which the UI always collects via an inline field (never `window.prompt`). Old rows/local JSON files that predate `status` are normalized on every read by both repositories' `normalizeTask()` call (`lib/taskStatus.ts`), which derives `not_started`/`done` from `isCompleted`. The cloud `tasks` table gained `status`/`status_reason` columns via `supabase/migrations/20260926000000_add_task_status.sql` (see "Production" below for the apply-before-deploy rule). Overdue counts (`Dashboard.tsx`, `lib/attention.ts`) exclude waiting tasks — the Dashboard shows a separate "Waiting on client" stat — and the Needs Attention list (`lib/attention.ts`'s `buildAttentionItems()`) always opens `TaskDetailModal` rather than navigating to the case (use the modal's "Go to Case" link for that), showing the rule "Overdue first, then due today" and a "View all N" in-place expansion past 5 items.
- **Template task timing** (Step 1 · Foundations 1E): `WorkflowStep` (`types.ts`) carries a stable `key`, an optional `timing` (`StepTiming` — an anchor: `case_start` | `previous_step` | another step's start/done | a `DeadlineKind` deadline, plus `offsetDays`, an optional `durationDays` min–max estimate, and `fixed` for a legally-set window), and `isGate`. `lib/scheduleFromTemplate.ts`'s pure `scheduleFromTemplate()`/`reschedule()`/`typicalLength()` turn a template's steps into dated items (see its own doc comments for the "no day-0 by default" and provisional-date rules); `lib/templateTiming.ts`'s `normalizeTemplate()` assigns stable keys to any step missing one (legacy/custom templates) and is called on every template read by both `repositories/filesystem/index.ts` and `repositories/cloud/index.ts`. `lib/describeTiming.ts` turns a step's `timing` into the Templates page's plain-words line (e.g. "2 days after Skills assessment is done · takes 28–84 days", or "Within 60 days of invitation received" for a `fixed` step) and formats `typicalLength()`'s output as "Typical length: X–Y days/weeks/months". `pages/Templates.tsx`'s card view renders this as a per-step timeline with a "Set by law"/"Estimate" chip and a Gate marker, and shows a "Timing not yet reviewed by a registered agent" notice while `WorkflowTemplate.timingVerified` is `false` (every system template in `lib/seedData.ts` ships `false` until a registered agent signs off). Custom templates get a full step editor (add/remove/reorder, per-step title/description/anchor/offset/duration/fixed/gate) that validates with `scheduleFromTemplate()` before allowing Save — cycles and missing-anchor errors block saving. System templates stay read-only; "Duplicate to customise" copies one into a new custom template (new id, `userId` set, title suffixed "(copy)", `version: 1`, `timingVerified: false`). Editing a custom template increments `WorkflowTemplate.version` and resets `timingVerified` to `false`. The cloud `workflow_templates` table gains `version`/`timing_verified` columns via `supabase/migrations/20260926000200_template_version.sql` (not yet applied — see "Production" below). **Task-generation integration**: `Task` (`types.ts`) gained `stepKey` (the `WorkflowStep.key` it was generated from), `dateLocked` (set on any manual date edit — never recalculated again), and `datePending` (a provisional, duration-estimated date shown as "Estimated" in the UI); `Case` gained `templateVersion` (which template version last generated/rescheduled this case's tasks). `lib/tasksFromTemplate.ts` is the pure orchestration layer `pages/NewCase.tsx`, `lib/openCaseFromAdvisor.ts`, and `pages/CaseDetails.tsx` all share: `templateHasTiming()` decides whether a template gets the deterministic scheduler or the old AI-only flow; `buildTemplateTaskDrafts()` wraps `scheduleFromTemplate()`; `knownAnchorsFromDeadlines()` builds the scheduler's `KnownAnchors.deadlineDates` from a case's own `Deadline` rows; `rescheduleCaseTasks()` wraps `reschedule()` and returns only the tasks whose date actually changed, ready to persist. `App.tsx`'s `rescheduleCaseFromSnapshot()` calls it from `handleUpdateTask()` (when a `stepKey`-carrying task closes) and `handleAddDeadline()`/`handleUpdateDeadline()` (when a case deadline is added/updated), persisting and applying only the changed tasks. `api/generate-tasks.ts` gained a second mode: `mode: 'additions'` (with the case's already-scheduled steps) returns `{ additions: [{ title, description, reason, anchorStepKey?, offsetDays }] }` instead of a whole plan — `services/geminiService.ts`'s `suggestAdditions()` calls it, and `CaseDetails.tsx`'s "Suggest extra tasks with AI" renders each with Accept/Reject; the legacy (no `mode`) request/response shape is unchanged for templates with no timing. `NewCase.tsx`/`openCaseFromAdvisor.ts` only ever create a timed template's tasks deterministically (labelled "Generate plan from template" instead of "Generate Plan with AI") — they don't call the AI-suggestions endpoint themselves, on the theory that a case's specific circumstances are better judged once the case (and its description) actually exists; both surfaces say so with a hint pointing at the case page. The cloud `tasks`/`cases` tables gain `step_key`/`date_locked`/`date_pending` and `template_version` columns via `supabase/migrations/20260926000250_task_step_fields.sql` (not yet applied — see "Production" below).
- **Deadlines** (Step 1 · Foundations 1D): `Deadline` (`types.ts`) is an external, consequential date the agent doesn't control (visa/passport expiry, s56/s57 response, nomination validity, invitation window) — separate from a `Task`, whose date the agent sets. `repos.deadlines` (`getAll`/`getById`/`create`/`update`/`delete`/`getByCaseId`/`getByClientId`) follows the same per-entity pattern as the rest of the repository layer: one JSON file per record at `deadlines/{id}.json` locally; the `deadlines` table (RLS-scoped to `auth.uid()`, schema at `supabase/migrations/20260926000100_create_deadlines.sql`, with a nullable `firm_id` column and no FK yet — 1F adds the constraint + backfill) in cloud. Passport expiry is *derived, not stored*: `lib/deadlines.ts`'s `allDeadlines(stored, clients)` computes a virtual deadline (`id: passport:{clientId}`) from `Client.passportExpiry` at display time — the same display-time-recalculation pattern as auto-link — unless the agent already has a stored, open `passport_expiry` deadline for that client, in which case theirs wins. `lib/deadlines.ts` also has `urgency()` (`none` >14 days · `soon` ≤14 · `urgent` ≤7 · `critical` ≤2 or past) and `consequenceWeight()` (s56/s57 > invitation window > nomination validity > visa expiry > passport expiry > other), used to rank deadlines "by consequence, not age". `pages/CaseDetails.tsx`'s Deadlines panel (top of the Tasks tab) shows a countdown chip per deadline, an Add deadline form, s56/s57 quick-add presets (asks for the received date, defaults the due date to +28 days via `lib/dates.ts`'s `addDaysISO()`, editable since periods vary by request), and Mark met/Mark missed/Dismiss on open deadlines — an overdue open deadline shows a "Missed?" prompt but is never auto-resolved. `lib/attention.ts`'s `deadlineAttentionItemsFor()`/`mergeAttentionItems()` rank deadlines at urgency ≥ `soon` above tasks in the Dashboard's Needs Attention list; clicking one navigates to its case, or to the client's page (via the same `location.state.focusClientId` pattern `pages/Clients.tsx` already reads) for a deadline with no case. `lib/deadlineAlerts.ts`'s `buildDeadlineAlerts()` creates a `Notification` (via `repos.notifications`) when an open deadline crosses the 14/7/2-day thresholds, deduplicated by the deterministic id `deadline:{id}:{threshold}`; `App.tsx` runs this on every data load (there's no background job). `ActivityEvent.type` gained `deadline_added`/`deadline_resolved`, pushed from `App.tsx`'s `handleAddDeadline`/`handleUpdateDeadline`. `repositories/migrate.ts`'s `copyAllData`/`clearAll` include this entity like every other.

- **Case lifecycle stages + derived At Risk** (Step 1 · Foundations 1C): `Case.stage` (`CaseStage` in `types.ts`: `draft` | `assessment` | `engaged` | `preparing` | `ready_to_lodge` | `lodged` | `info_requested` | `decision` | `closed`) replaces the old `CaseStatus` (`open` | `in_progress` | `on_hold` | `closed`) as the source of truth for a case's progress — `status` is kept for one release as a read-only fallback and, on the cloud row, a derived mirror (`lib/caseStage.ts`'s `deriveLegacyStatus()`: closed→closed, onHold→on_hold, draft/assessment→open, else in_progress). `Case.outcome` (`CaseOutcome`: `granted` | `refused` | `withdrawn` | `lapsed`) is required once `stage` is `closed`; `Case.onHold` is a pause flag orthogonal to `stage`. New cases start at `draft` (`pages/NewCase.tsx`, `lib/openCaseFromAdvisor.ts`), not `engaged`. `lib/caseStage.ts`'s `normalizeCase()` fills in `stage`/`onHold` for a case that predates this field — legacy `open`/`in_progress` → `preparing`; `on_hold` → `preparing` + `onHold: true`; `closed` → `closed` with no outcome (the UI prompts for one the next time the case is opened) — called by both repositories' `getAll`/`getById`/`create`/`update` on every read/write, the same normalize-at-the-boundary pattern as `lib/taskStatus.ts`'s `normalizeTask()`. `lib/caseStage.ts`'s `evaluateTransition(from, to)` allows every stage-to-stage move (a real case can go backward) but flags `isBackward` (asks for an inline confirm) and `requiresOutcome` (moving to `closed` — asks for an outcome pick first); `lodged`/`info_requested` share a rank so toggling between them is never flagged backward. `caseStageGroup()` buckets a stage into `pre_lodgement` (draft→ready_to_lodge) / `with_department` (lodged, info_requested, decision) / `closed`, driving the Case Manager's board filters. The cloud `cases` table gained `stage`/`outcome`/`on_hold` columns via `supabase/migrations/20260926000050_add_case_stage.sql`. **At Risk is derived, never stored** — `lib/risk.ts`'s `computeCaseRisk(caseItem, tasks, deadlines, checklist?)` returns `{ atRisk, reasons[] }`, true when any of: an open deadline on the case is ≤14 days away; an overdue, non-waiting task exists, restricted to gate tasks (`WorkflowStep.isGate`, resolved via a task's `stepKey`) once the task carries one — a task with no `stepKey`, or one whose step isn't found, falls back to "any overdue task" (Step 1 · 1E resolved this TODO — see "Template task timing" above); the case is at `ready_to_lodge` and a checklist item is still `pending` (the `checklist` param is optional and only fetched by callers for cases at that stage, since there are few); or an s56/s57 deadline has ≤7 days left. `pages/CaseManager.tsx` replaced its old computed Active/Pending/At Risk/Completed filters (derived from task-completion %) with the three stage-group chips plus an At Risk chip that overlays any group (not a group itself), fetching checklists only for `ready_to_lodge` cases; each row shows a compact stage stepper (`lib/caseStage.ts`'s `CASE_STAGE_STEPPER`, task count secondary) and, when at risk, a red badge whose reasons are visible on hover *and* keyboard focus (not only a `title` attribute). `pages/CaseDetails.tsx`'s header replaced the old status dropdown with a stage-chip control built on `evaluateTransition()` (inline backward-move confirm, inline outcome picker before closing — no `window.prompt`/`confirm`) plus a standalone On hold toggle; a closed case with no `outcome` shows an amber banner prompting for one every time it's opened. Every stage change writes a `case_stage_changed` `ActivityEvent` via `App.tsx`'s `handleUpdateCase()` (the same `pushActivity` pattern as `handleAddDeadline`/`handleUpdateTask`), threaded down through `CaseDetailsRoute`'s `onUpdateCase` prop. Other stage/status consumers updated to the new model: `pages/Dashboard.tsx`'s `activeCases`, `pages/Clients.tsx`'s open-case count, `pages/TeamDashboard.tsx`'s case row label, and `lib/findOpenCaseForSubclass.ts` (+ its test) all use `lib/caseStage.ts`'s `isCaseClosed()` instead of comparing `status` directly.

**Production:** Supabase project `edamame-legal-flow` (wandering-pork's Org) backs both dev and prod. Its Auth → URL Configuration Site URL is `https://edemame.vercel.app`, with `https://edemame.vercel.app/**` and `http://localhost:3000/**` allow-listed as redirect URLs. The Vercel project `edemame` has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set for Production + Preview. The `profiles` table migration, the cloud data tables migration (`20260802000000_create_cloud_data_tables.sql`), the agent issue filings migration (`20260807000000_create_agent_issue_filings.sql`), the case number migration (`20260810000000_add_case_number.sql` — must be applied *before* deploying the frontend that writes `case_number`, or PostgREST rejects every case insert/update), the document types migration (`20260829000000_create_document_types.sql`), the usage events migration (`20260901000000_create_usage_events.sql`), the case visa subclass migration (`20260925000000_add_case_visa_subclass.sql` — like `case_number`, must be applied *before* deploying the frontend that writes `visa_subclass`), the eligibility assessments migration (`20260925000100_create_eligibility_assessments.sql`), the task status migration (`20260926000000_add_task_status.sql` — like `case_number`/`visa_subclass`, must be applied *before* deploying the frontend that writes `status`/`status_reason`), the case stage migration (`20260926000050_add_case_stage.sql` — adds `stage`/`outcome`/`on_hold` to `cases`, backfilled from the legacy `status` column, which is kept for one release as a derived mirror; must be applied *before* deploying the frontend that writes `stage`/`outcome`/`on_hold`, and its timestamp deliberately sits before the deadlines migration below), the deadlines migration (`20260926000100_create_deadlines.sql` — must be applied *before* deploying the frontend that writes to the `deadlines` table), the template version migration (`20260926000200_template_version.sql` — like the others, must be applied *before* deploying the frontend that writes `version`/`timing_verified` on custom templates), the task step fields migration (`20260926000250_task_step_fields.sql` — adds `step_key`/`date_locked`/`date_pending` to `tasks` and `template_version` to `cases`; must be applied *before* deploying the frontend that writes them), the firm accounts migration (`20260926000300_create_firms.sql` — adds firms/firm_members/firm_invites, `firm_id` on every data table, and replaces "own rows" RLS with firm-scoped RLS; depends on the deadlines migration, test on a Supabase branch first, and apply *before* deploying the frontend that sends `firm_id`), and the case number uniqueness migration (`20260926000400_case_number_unique.sql` — a partial unique index on `(firm_id, case_number)`, depends on the firm accounts migration) must all be applied manually (Supabase SQL editor, or `supabase db push` once the CLI is linked to the project) — migrations are not applied automatically.

### Firm accounts (Step 1 · Foundations 1F)

Cloud mode is multi-user: every account belongs to a **firm**, and every firm-scoped table's rows
are shared with — and RLS-restricted to — that firm's active members. **Firms are cloud-only** — a
linked local folder belongs to one person by construction, so local mode stays single-user and has
no firm concept at all (`useFirm()` returns `firm: null` there and the app behaves exactly as
before this feature).

- **Schema** (`supabase/migrations/20260926000300_create_firms.sql`): `firms` (id, name,
  `created_by`), `firm_members` (`firm_id`, `user_id`, `role`, `status` `active`/`disabled`,
  `availability` `available`/`busy`/`offline` — replaces the old `TeamMember.status`), and
  `firm_invites` (`token_hash` — sha256 of a random token; the raw token only ever exists in the
  invite link/email, never stored). `profiles.current_firm_id` tracks which firm a user is
  currently acting as. Every data table (clients, cases, tasks, workflow_templates, case_notes,
  documents, team_members, activity_events, checklist_items, focus_conversations,
  document_types, usage_events, eligibility_assessments, deadlines) gained a `firm_id uuid not
  null` column, backfilled with one personal firm per pre-existing user (nobody's data moved or
  became visible to anyone new). `notifications`, `profiles`, and `agent_issue_filings` stay
  per-user, not firm-scoped — see the migration's own comment for why.
- **Roles**: `owner`, `agent` (registered migration agent), `paralegal`. No `admin` role for MVP
  (see `docs/plans/step-1-foundations.md`'s Decisions). Owners manage members (invite, change
  role, disable) and can delete clients/cases/documents; agents can delete clients/cases/documents
  but not manage members; paralegals can't do either — see `lib/firmDirectory.ts`'s
  `canDeleteFirmData()`/`canManageMembers()`, used only to hide UI (RLS is the real enforcement). A
  firm always keeps at least one active owner — a Postgres trigger
  (`firm_members_guard()`) rejects demoting/disabling the last one.
- **RLS**: `is_firm_member(firmId)` / `has_firm_role(firmId, roles[])` (security-definer SQL
  functions, so policies that call them don't recurse into `firm_members`' own RLS) replace every
  "own rows" (`user_id = auth.uid()`) policy with "firm rows" (`is_firm_member(firm_id)`). No
  platform-level access exists — there is no role that lets the app operator read a firm's data;
  only the service role (server-side `api/` functions) bypasses RLS, and it's used only for
  invites (see below). Storage RLS accepts both the current `{firmId}/...` prefix and the legacy
  `{userId}/...` prefix for documents, so nothing needs copying (see "Cloud repositories" above).
- **`FirmContext`** (`contexts/FirmContext.tsx`, `useFirm()`): after login in cloud mode, loads the
  current firm (`profiles.current_firm_id` → `firms` row) and the member directory via the
  `firm_member_directory(firmId)` RPC (a function rather than a view, since member names/emails
  live in `auth.users`, which the client can't query directly). Exposes `firm`, `role` (this user's
  own role, or `null`), `members` (the raw directory), `teamMembers` (mapped to the existing
  `TeamMember` shape via `lib/firmDirectory.ts`'s `mapFirmDirectoryToTeamMembers()` — so case-owner
  and task-assignee pickers, the Team Dashboard, etc. all keep working unchanged), and
  `createFirm(name)` (the `create_firm` RPC). Self-heals `current_firm_id` from an existing active
  membership if it's ever unset (e.g. a user accepted an invite before finishing onboarding).
- **Onboarding / firm creation**: choosing Cloud Storage no longer drops straight into the app —
  `App.tsx`'s `CloudAppGate` requires a firm before any cloud repository can be constructed (every
  cloud table is firm-scoped), so a cloud user with no firm yet sees
  `components/CreateFirmGate.tsx` ("Create your firm": just a name, calls `create_firm`) instead of
  the app shell. A user following an invite link instead never sees this gate — see below.
- **Invites**: `api/invite-member.ts` (POST, Bearer-authed, caller must be an active owner of the
  target firm — checked via a normal RLS-scoped read of their own `firm_members` row, not the
  service role) generates a random token, stores its sha256 hash in `firm_invites`, and sends a
  Supabase Auth admin invite email (`POST {SUPABASE_URL}/auth/v1/invite`) with
  `redirect_to: {origin}/invite/{token}`. If the address already belongs to a registered user, that
  call fails in an expected, non-fatal way (Supabase reports "already registered") and the endpoint
  falls back to returning the invite link for the owner to copy and send directly — either way the
  response reports `sent`/`inviteLink` so the UI can show the right thing. `api/accept-invite.ts`
  (POST `{token}`, Bearer-authed) verifies the token hash, checks not expired/revoked/accepted and
  that the invite's email matches the signed-in user's (case-insensitively), then writes the
  `firm_members` row, sets `profiles.current_firm_id`, and marks the invite accepted. Both
  endpoints need `SUPABASE_SERVICE_ROLE_KEY` (server-only env var, read only inside `api/_lib/firms.ts`,
  **never** sent to the client or logged — add it to `src/.env.local` for local dev and as a Vercel
  project env var for production; the owner adds it by hand, it's not entered by an AI agent) because
  `firm_invites`/`firm_members` have no insert policy for `authenticated` by design, and only the
  service role can call the Auth admin invite endpoint. Without it configured, both endpoints return
  500 "Invites aren't configured yet" rather than silently failing. Known gap: neither endpoint's
  multi-step write is one atomic transaction over plain PostgREST calls — documented in each file's
  top comment, acceptable for this one-time, user-initiated action.
- **Frontend**: `/invite/:token` (`pages/InviteAccept.tsx`) sits behind `ProtectedRoute` (so a
  signed-out visitor is bounced to `/login` and back via the existing `location.state.from`
  mechanism `pages/LandingPage.tsx` already honors) but outside the normal
  `ProfileProvider`/`FirmProvider` app-shell tree, so it works before a user has ever onboarded.
  `pages/TeamMembers.tsx` branches on storage mode: cloud renders
  `components/team/FirmTeamMembers.tsx` (the real member list, invite/pending-invites/revoke,
  role change and disable for owners, and a self-service availability picker for everyone); local
  mode keeps the pre-1F simple CRUD list (now just "you" — see below).
- **No more fake team**: `lib/seedData.ts`'s `seedDefaultTeam()` and `App.tsx`'s first-launch
  round-robin backfill (which used to spread real cases/tasks across fictional seeded members like
  `tm-eliza-chen`) are gone. In cloud mode, `TeamMember` is purely a read model derived from the
  firm directory (`lib/firmDirectory.ts`) — `repos.teamMembers`/the `team_members` table are never
  read or written. In local mode, the team is just the signed-in user, seeded once if
  `repos.teamMembers` is empty; `team_members` keeps working there exactly as before. Assignee/case
  owner pickers therefore only ever list real people.
- **Refetch on focus**: `App.tsx`'s `AppShell` refetches `cases`/`tasks`/`deadlines` (not
  everything — the highest-churn, most collaborative entities) whenever the window regains focus in
  cloud mode, debounced to at most once per 30s. There's no realtime subscription yet — this is a
  manual pull, and conflicting concurrent edits are last-write-wins (documented, not solved).
- **Case numbering race** (`lib/caseNumber.ts`'s `generateCaseNumber()` scans in-memory state, so
  two firm members creating cases in the same instant can compute the same "next" number): a
  partial unique index on `(firm_id, case_number)`
  (`supabase/migrations/20260926000400_case_number_unique.sql`) turns that into a rejected insert
  instead of a silent collision, and `CloudCaseRepository.create()`
  (`repositories/cloud/index.ts`) catches it and retries once with a freshly regenerated number.
  Document types seeding (`lib/documentTypes.ts`'s `ensureSystemDocumentTypes()`) needed no code
  change to become per-firm — it's per-firm automatically now that its repository is.
- **Storage Mode switching**: `pages/Settings.tsx` blocks Cloud → Local when the firm has more than
  one active member (Local Storage is single-user by construction) — the button is disabled with an
  inline explanation rather than failing after the fact. Local → Cloud auto-creates a personal firm
  first if the user doesn't have one yet (e.g. their very first switch to cloud), since cloud
  repositories can't be constructed without a `firmId`.

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
5. Returns JSON with visa verdict cards: 10 Australian visa subclasses (189, 190, 482, 186, 500, 820, 485, 600, 417, 491). Every subclass the Advisor can return has a matching system workflow template (`src/lib/seedData.ts`) and document checklist (`CHECKLIST_CATEGORIES` in `src/lib/checklistTemplates.ts`), so "Open Case" always gets a real template and generated checklist rather than falling back to a bare/empty one.
6. Each card shows verdict (qualifies/possibly/unlikely/needs_more_info), reasons, and gaps, rendered by the shared `components/visa-advisor/PathwayCard.tsx` (styling dictionaries in `components/visa-advisor/verdictStyles.ts`)
7. As soon as a report comes back, `VisaAdvisor.tsx` saves it as an `EligibilityAssessment` via `repos.eligibility.create()` — see "Eligibility Assessments" under "Local-First Storage" above — whether or not a case is ever opened from it.
8. "Open Case" button (same label on both the hero card and each pathway card; a "Possible match" badge appears next to it for `possibly_qualifies` verdicts) on qualified visas opens `components/visa-advisor/OpenCasePanel.tsx`, a confirmation panel — nothing is created until the user reviews and clicks Confirm. The panel pre-resolves the client via `lib/resolveAdvisorClient.ts` (preferring the client the page was opened for via `?clientId=` over name/DOB matching), lets the user override it (pick any existing client, quick-pick a same-name candidate, or switch to creating a new client, with optional email/phone for a new one), pre-selects a workflow template via the shared `lib/matchTemplate.ts` exact-subclass-match helper (required explicit choice, including a "No template (general case)" option, if nothing matches), prefills an editable case title, defaults "Generate AI task plan" to on, and — only when the pathway has gaps — shows an "Add a task for each gap (N)" checkbox, default off. Confirming passes an explicit `OpenCaseParams` (the exact client choice, `templateId`, `title`, `generateTasks`, `gapTasks`, `gaps`) to `App.tsx`'s `VisaAdvisorRoute.handleOpenNewCase`, which delegates to `lib/openCaseFromAdvisor.ts`'s `openCaseFromAdvisor()` (pure orchestration with injected deps, unit-tested in `openCaseFromAdvisor.test.ts`; navigation and toasts stay in App.tsx) and executes it as confirmed — no re-resolution — drafting the task plan first if requested (skipped entirely otherwise) — deterministically from `lib/tasksFromTemplate.ts` for a template with `timing` set, or from the AI as before otherwise (when `gapTasks` is on and the AI path is used, the gaps are also sent to the AI prompt as `excludeItems` so it doesn't generate duplicate tasks for them — see `api/generate-tasks.ts`; the deterministic path never calls the AI for the plan, see "AI Task Generation Flow" above), then creating/reusing the client, then the case (with `visaSubclass` set to the assessed pathway's subclass — see `Case.visaSubclass` under "Local-First Storage"), building one fixed (non-AI) task per gap via `lib/gapTasks.ts`'s `buildGapTasks()` when `gapTasks` was checked (dated a week out, ordered ahead of the AI plan), then navigating to the case's detail page (Confirm button shows staged progress: plan → client → finalizing; the panel can't be closed and Start Over is disabled while creating). The case description is now a short summary (`lib/eligibilitySummary.ts`'s `buildEligibilitySummary()` — pathway + verdict + primary purpose + a pointer to "Eligibility assessment" on the case) rather than a full dump of the wizard answers, since the full report is preserved separately as the `EligibilityAssessment`; `handleOpenNewCase` returns the created `{ caseId, clientId }`, which `VisaAdvisor.tsx` uses to update that assessment's `caseId`/`clientId`/`selectedSubclass`. If case creation fails after a new client was created, that client is rolled back and the panel stays open with the user's choices intact for retry. If the AI plan fails, the case is still created (with a toast saying tasks can be generated from the case page) rather than blocking case creation. If the user has navigated away from Visa Advisor by the time creation finishes, a toast with a "View case" action is shown instead of navigating out from under them.
9. If the chosen existing client already has a non-closed case for the same visa subclass (`lib/findOpenCaseForSubclass.ts`, which prefers a case's own `visaSubclass` over its template's), a warning with a link to that case must be explicitly acknowledged before Confirm is enabled.

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

Client/case/task seed data is hardcoded in `App.tsx`; state resets on reload as there's no persistence layer for it. System default workflow templates are a separate, always-on set from `src/lib/seedData.ts`'s `seedDefaultTemplates()` (merged into app state on every load — see "Local-First Storage"), covering all 10 visa subclasses the Visa Eligibility Advisor can return: Skilled Independent 189, Skilled Nominated 190, Skills in Demand 482 (rebranded from TSS, Dec 2024), ENS 186, Student 500, Skilled Work Regional (Provisional) 491 (not "490" — that is not a current subclass; the system template's `id` stays `tpl-490` for backward compatibility, see the comment above `seedDefaultTemplates()`), Partner 820/801, Temporary Graduate 485, Visitor 600, Working Holiday 417.

## Keeping the User Manual in Sync

`docs/user-manual/` (see `docs/user-manual/README.md`) is the Case Manager Agent's (Focus Mode chat) source of truth for "how do I…" answers — it is loaded verbatim into the Gemini system prompt by `api/_lib/userManual.ts`, so stale pages make the agent actively wrong, not just outdated.

**Whenever you change user-facing behavior** (a page's flow, a button/label, a new feature, a removed feature, a changed field, a renamed module), check whether any file under `docs/user-manual/` describes the old behavior and update it in the same change. Conversely, when adding a new module/page, add a corresponding module folder under `docs/user-manual/` (mirroring `case-manager/`, `dashboard/`, `clients/`, `templates/`) with at least a `getting-started.md`. Pure internal/refactor changes with no user-visible effect don't require a manual update.
