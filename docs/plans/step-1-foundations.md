# Step 1 · Foundations — Implementation Plan

Source: `docs/edamame-gap-map.html` (Step 1), Figma "Core User Journeys" F0/F5/F6/F7, Trello "Configurable Task Due Date".
Written 2026-09-24 against `main` @ `08b3a01`.

Step 1 has five pieces of work. They're listed in the order to build them. Each is one PR unless noted.

| # | Work | Size (rough) | Depends on |
|---|------|--------------|-----------|
| 1A | Needs Attention opens the task | S · ½ day | — |
| 1B | Task status (replace `isCompleted`) | M · 2–3 days | — |
| 1C | Case lifecycle stages + derived At Risk | M · 3–4 days | 1B, 1D for risk rules |
| 1D | Deadline entity | M · 3–4 days | — |
| 1E | Template task timing + Templates page timeline | L · 1–1½ weeks | 1B |
| 1F | Firm accounts and team logins | L · 2–3 weeks | Design first, build last |

Sizes are guesses for ordering, not estimates.

**Sequencing.** Do 1A immediately. Write the 1F *schema design* (section 1F.1) before 1B–1E ship, so every new column and table (`deadlines`, task `status`, case `stage`) is created with a `firm_id` in mind and doesn't need a second migration. Then 1B → 1D → 1C → 1E, with 1F built last as its own track.

---

## Cross-cutting rules for every PR

- **Both storage modes.** Every entity change touches `types.ts`, `repositories/filesystem/index.ts`, `repositories/cloud/index.ts` (row mappers), `repositories/migrate.ts` (`copyAllData`/`clearAll`), and a Supabase migration.
- **Old data must keep loading.** Local-mode JSON files and existing cloud rows will have the old shape. Normalize at the repository boundary (a `normalizeX()` in `lib/` called by both repos on read), never in components.
- **Migrations before frontend.** Like `case_number` and `visa_subclass`, each migration must be applied to `edamame-legal-flow` *before* the frontend that writes the new columns is deployed. Add each to the list in root `CLAUDE.md`.
- **No staging environment.** Test migrations on a Supabase branch (`create_branch`) or a throwaway project first; production is the only shared DB.
- **Pure logic in `lib/` with Vitest tests**, following `openCaseFromAdvisor.ts`/`.test.ts`.
- **User manual.** Update `docs/user-manual/` (dashboard, case-manager, templates, and a new `team/` folder for 1F) in the same PR as the user-visible change. The Focus Mode agent reads it verbatim.

---

## 1A · Needs Attention opens the task

**Problem.** `pages/Dashboard.tsx:411` navigates to the case whenever the item has a `caseId`, which is almost always, so `TaskDetailModal` is bypassed. The list is `slice(0, 5)` with no stated rule and no "view all" (`Dashboard.tsx:275`).

**Changes**
- `Dashboard.tsx:411` → always `setSelectedTaskId(item.id)`. Keep an "Open case" link inside `TaskDetailModal` (add it if missing).
- Show the rule under the heading: "Overdue first, then due today".
- When there are more than 5, show "View all N" that expands the list in place.
- After 1D, deadline items join this list ranked above tasks (see 1D).

**Tests.** None needed beyond a manual check. Optionally extract the list builder to `lib/attention.ts` now, since 1B and 1D will extend it.

---

## 1B · Task status

**Model** (`types.ts`)
```ts
export type TaskStatus =
  | 'not_started' | 'in_progress'
  | 'waiting_client' | 'waiting_third_party'
  | 'not_applicable' | 'done';

interface Task {
  // ...existing
  status: TaskStatus;
  /** Required when status is 'not_applicable'. */
  statusReason?: string;
  /** @deprecated derived: status === 'done' || status === 'not_applicable'. Kept one release for old rows/tabs. */
  isCompleted: boolean;
}
```

**New `lib/taskStatus.ts`** (+ tests)
- `normalizeTask(raw)`: missing `status` → `isCompleted ? 'done' : 'not_started'`.
- `isTaskClosed(t)`: done or not_applicable.
- `isWaiting(t)`: waiting_client or waiting_third_party.
- `withStatus(t, status, reason?)`: sets `status`, keeps `isCompleted` in sync, rejects N/A without a reason.

**Storage**
- Migration `add_task_status.sql`: `alter table tasks add column status text, add column status_reason text;` then backfill `status = case when is_completed then 'done' else 'not_started' end;` then `not null` with a check constraint on the six values.
- Cloud mapper: read/write `status`, `status_reason`, and keep writing `is_completed` (derived).
- Filesystem repo: call `normalizeTask` on read.

**Call sites** (18 files use `isCompleted`; the heavy ones are `CaseDetails.tsx` ×18, `Dashboard.tsx` ×5, `TaskDetailModal.tsx` ×4, `CaseCard.tsx`, `CaseManager.tsx`, `TeamDashboard.tsx`)
- Replace `!t.isCompleted` checks with `!isTaskClosed(t)`.
- **Overdue excludes waiting tasks.** Dashboard gets a separate "Waiting on client (N)" count so "14 overdue" means the team's own backlog.
- Task creators (`geminiService.ts`, `gapTasks.ts`, `openCaseFromAdvisor.ts`, `NewCase.tsx`, `CaseDetails.tsx:537`, `Dashboard.tsx:165`) set `status: 'not_started'`.

**UI**
- Replace the done checkbox toggle (`CaseDetails.tsx:832`, `TaskDetailModal.tsx:106`) with a status menu. Keep one-click "Mark done" as the primary action.
- N/A opens a short reason field. Show the reason on the task row.
- Waiting states get a distinct chip (not red, even when past the date).

**Activity.** Add `task_status_changed` to `ActivityEvent.type`, with from/to in the summary.

---

## 1D · Deadline entity

A Deadline is an external, consequential date the agent doesn't control. It is separate from a Task, whose date the agent sets.

**Model**
```ts
export type DeadlineKind =
  | 'visa_expiry' | 'passport_expiry'
  | 's56_response' | 's57_response'
  | 'nomination_validity' | 'invitation_window'
  | 'other';

export interface Deadline {
  id: string;
  kind: DeadlineKind;
  title: string;
  dueDate: string;          // YYYY-MM-DD
  caseId?: string;
  clientId?: string;
  /** When the triggering event happened (e.g. s56 letter received, invitation date). */
  triggeredOn?: string;
  status: 'open' | 'met' | 'missed' | 'dismissed';
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
  userId?: string;
}
```

**Storage.** `repos.deadlines` (`getAll`, `getByCaseId`, `getByClientId`, CRUD):
- local: `deadlines/{id}.json`
- cloud: `deadlines` table with RLS, `firm_id` column nullable until 1F
- add to `migrate.ts`

**Derived, not stored: passport expiry.** Compute virtual deadlines from `Client.passportExpiry` at display time, the same way auto-link is a display-time recalculation. This avoids keeping two copies in sync. Visa expiry becomes derived once Step 2 records grants on the client.

**New `lib/deadlines.ts`** (+ tests)
- `daysLeft(d, today)`.
- `urgency(d)`: `none` (>14 days) · `soon` (≤14) · `urgent` (≤7) · `critical` (≤2 or past).
- `allDeadlines(stored, clients)`: merges stored and derived.
- `consequenceWeight(kind)`: `s56/s57` > `invitation_window` > `nomination_validity` > `visa_expiry` > `passport_expiry` > `other`. Used for ranking.

**UI**
- **CaseDetails:** a Deadlines panel with a countdown chip per deadline, plus "Mark met", "Add deadline", and quick-add presets. The s56 preset asks for the received date and defaults the response period to 28 days, editable because periods vary by request. The agent must confirm the date.
- **Dashboard Needs Attention:** deadlines with urgency ≥ `soon` rank above tasks by `consequenceWeight`, then days left. This is the board's "rank by consequence, not age".
- **Alerts:** when a deadline crosses 14, 7 or 2 days, create a `Notification` through the existing `repos.notifications`, deduplicated with id `deadline:{id}:{threshold}`. Checked on app load; there's no background job. Email alerts are Step 3.
- **Overdue open deadline:** shows as "Missed?" and asks the agent to mark it met or missed. It is never auto-resolved.

---

## 1C · Case lifecycle stages + derived At Risk

**Problem.** `CaseStatus` (`open | in_progress | on_hold | closed`) and the Case Manager filters (`Active | Pending | At Risk | Completed`, computed from task % in `CaseManager.tsx:95-98`) don't map to each other. Neither can say "Lodged".

**Model**
```ts
export type CaseStage =
  | 'draft' | 'assessment' | 'engaged' | 'preparing' | 'ready_to_lodge'
  | 'lodged' | 'info_requested' | 'decision' | 'closed';
export type CaseOutcome = 'granted' | 'refused' | 'withdrawn' | 'lapsed';

interface Case {
  stage: CaseStage;
  outcome?: CaseOutcome;   // required when stage === 'closed'
  onHold?: boolean;        // pause flag, orthogonal to stage
  /** @deprecated legacy; read-only fallback for normalizeCase */
  status?: CaseStatus;
}
```

- **Legacy mapping** (`normalizeCase`): `open`/`in_progress` → `preparing`; `on_hold` → `preparing` + `onHold: true`; `closed` → `closed` with no outcome, and the UI asks for one when the case is next opened.
- **New cases** start at `draft` (NewCase and Visa Advisor Open Case). `draft`/`assessment` stay available for manual use. Step 2 turns Engaged into a real gate (Form 956, agreement).
- **Transitions** (`lib/caseStage.ts` + tests): an allowed-transition map. `lodged ⇄ info_requested` is allowed. Moving backwards is allowed with a confirm. `closed` requires an outcome. Every change writes a `case_stage_changed` ActivityEvent.
- **Lodgement details** (TRN, date, stream) are Step 2 (F6). For now, moving to `lodged` only records the date in the activity event.
- **Storage:** migration adds `stage`, `outcome`, `on_hold`, backfilled from `status`, then `stage not null` with a check. Keep the `status` column for one release.

**At Risk: derived, never stored.** `lib/risk.ts` → `computeCaseRisk(case, tasks, deadlines, checklist?) → { atRisk, reasons[] }`. At Risk is true when any of these hold:
1. an open deadline on the case is ≤14 days away
2. a gate task is overdue (gate comes from 1E; before 1E, any overdue non-waiting task)
3. the stage is `ready_to_lodge` and a checklist item is still `pending`
4. an s56/s57 deadline has ≤7 days left

The checklist is loaded per case, so rule 3 only fetches checklists for cases at `ready_to_lodge`, which are few.

**Case Manager** (`CaseManager.tsx`)
- Replace the four computed filters with stage groups: **Pre-lodgement** (draft → ready_to_lodge) · **With Department** (lodged, info_requested, decision) · **Closed** · plus an **At Risk** chip that overlays any group.
- Row progress becomes stage-first: a small stage stepper, with task count secondary. The board flagged "Progress = task count. No stage."
- Hovering the At Risk badge lists the `reasons`.
- Update `CaseDetails.tsx:969` (status dropdown → stage control), `Dashboard.tsx:180` (`activeCases`), `Clients.tsx:85`, and `findOpenCaseForSubclass.ts:26`. These last two only check "not closed" and keep working through `stage !== 'closed'`.

---

## 1E · Template task timing + Templates page timeline

**Problem.** `WorkflowStep` is `{ title, description }`. All due dates come from the AI's `daysOffset` counted from the case start (`api/generate-tasks.ts:104`, `geminiService.ts:37`), so plans aren't repeatable and new cases often open with an overdue task.

**Model**
```ts
export type StepAnchor =
  | { type: 'case_start' }
  | { type: 'previous_step' }
  | { type: 'step'; stepKey: string; edge: 'start' | 'done' }
  | { type: 'deadline'; kind: DeadlineKind };      // e.g. invitation received

export interface StepTiming {
  anchor: StepAnchor;
  offsetDays: number;                       // from the anchor
  durationDays?: { min: number; max: number }; // how long the step itself takes
  /** Set by law: agent can't move it (e.g. lodge ≤60 days after invitation). */
  fixed: boolean;
}

export interface WorkflowStep {
  key: string;            // stable id, so anchors survive reordering
  title: string;
  description: string;
  timing?: StepTiming;    // absent = old template; falls back to today's AI behaviour
  isGate?: boolean;       // must be done before the case can advance (feeds At Risk rule 2)
}

interface WorkflowTemplate { /* ... */ version: number; timingVerified?: boolean; }
interface Case { /* ... */ templateVersion?: number; }
interface Task { /* ... */ stepKey?: string; dateLocked?: boolean; datePending?: boolean; }
```

**Scheduler: `lib/scheduleFromTemplate.ts`** (pure, heavily tested)
- Input: steps, case start date, known anchor dates (deadlines, completed-step dates). Output: one dated task per step.
- If an anchor isn't known yet (e.g. no invitation), the scheduler uses the estimated durations to make a provisional date and sets `datePending: true`. The task shows "Estimated".
- `reschedule(tasks, …)`: recalculates only open tasks where `dateLocked` is false. Any manual date edit sets `dateLocked`. It runs when an anchor becomes known, i.e. a step is marked done or a deadline is added.
- No task lands on day 0 unless the step's offset is 0. This fixes the "overdue on creation" Trello item.
- Detects anchor cycles and missing `stepKey`s. The Templates page shows these as errors.

**Generation flow**
1. The template creates the task list deterministically: one task per step, dated by the scheduler.
2. "Suggest additions with AI" (optional) asks `/api/generate-tasks` for proposals only: extra tasks with a reason and a suggested anchor. The agent accepts or rejects each one. Accepted tasks keep `generatedByAi: true`.
3. Change `api/generate-tasks.ts` to take the scheduled steps and return `{ additions: [...] }` instead of a whole plan. Keep the old response behind a flag until CaseDetails is switched over.
4. Record `case.templateVersion`. This is the start of Figma F7's "which template, which version".
5. Templates with no `timing` keep today's AI-only flow, so nothing breaks while data is filled in.

**System template data** (`lib/seedData.ts`, all 10 templates)
- Add `key`, `timing`, `isGate` to every step, and `version`.
- **Ship with `timingVerified: false`.** The Templates page shows "Timing not yet reviewed by a registered agent" until someone signs it off (see the existing *Visa Content Review* note: BAs validate in testing).
- Fixed legal windows to encode first: 189/190/491 lodge ≤60 days after invitation; nomination validity for 482/186. Everything else is an estimate.

**Templates page** (`pages/Templates.tsx`)
- **View:** the steps list becomes a timeline. Each step shows its offset label ("2 days after Skills assessment · takes 28–84 days"), a Set by law / Estimate chip, and a gate marker. The header shows "Typical length: X–Y months", computed by running the scheduler with min and max durations.
- **Edit (custom templates):** today a custom template is only a title and a description, with no steps at all. Add a step editor with title, description, "counts from" (a select), an offset, a duration range, and fixed/gate toggles. Validate with the scheduler.
- System templates stay read-only. Add "Duplicate to customise".

**Checks.** Unit tests for the scheduler: chains, anchors to other steps, deadline anchors known and unknown, cycles, `dateLocked` preserved on reschedule, no day-0 by default.

---

## 1F · Firm accounts and team logins

Today every row is owned by one `user_id`. "Team members" are records seeded by `seedDefaultTeam()` (`lib/seedData.ts:8`, fictional people such as `tm-eliza-chen`). `App.tsx:70-89` round-robins **real** cases and tasks onto those fictional members on first load. That has to go.

### 1F.1 Decisions to confirm first

1. **Firms are cloud-only.** A linked local folder belongs to one person by design. Local mode stays single-user; creating or joining a firm requires cloud mode. Switching cloud → local is only allowed for a one-person firm.
2. **Every existing cloud user becomes the owner of a one-person firm** during migration. Nobody's data moves.
3. **Roles:** `owner`, `agent` (registered migration agent), `paralegal`. No `admin` role for MVP (see Decisions).
4. **Invites need a server secret.** `SUPABASE_SERVICE_ROLE_KEY` is needed on Vercel (server-only, in `api/`), used for `auth.admin.inviteUserByEmail`. That's a new secret for the project.

### 1F.2 Schema (one migration, applied before the frontend)
```sql
create table firms (id uuid pk default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table firm_members (
  firm_id uuid references firms on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text check (role in ('owner','agent','paralegal')),
  status text check (status in ('active','disabled')) default 'active',
  availability text default 'available',   -- replaces TeamMember.status
  joined_at timestamptz default now(),
  primary key (firm_id, user_id));
create table firm_invites (id uuid pk, firm_id uuid, email text, role text, token_hash text, expires_at timestamptz, accepted_at timestamptz);

-- helper avoids RLS recursion and is evaluated once per query
create function is_firm_member(f uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from firm_members where firm_id = f and user_id = (select auth.uid()) and status = 'active') $$;

alter table profiles add column current_firm_id uuid references firms;
```
- Add `firm_id uuid` to every data table: clients, cases, tasks, workflow_templates, case_notes, documents, notifications, activity_events, checklist_items, focus_conversations, document_types, usage_events, eligibility_assessments, deadlines.
- Backfill: one firm per distinct `user_id`, owner membership, `firm_id` set on every row. Then `not null` and an index.
- Replace every "own rows" policy with `using (is_firm_member(firm_id))`. Delete policies on clients and cases are limited to owner/agent through a second helper, `has_firm_role(firm_id, roles[])`.
- `user_id` stays as "created by" for audit.
- `notifications` stay per user: keep the `user_id` policy there.
- `team_members` table: retired. Team data comes from `firm_members` joined with a `firm_member_profiles` view (name and email from `auth.users` metadata through a security-definer view).
- **Storage:** new uploads go to `{firmId}/…`. The policy allows the first path segment to be the caller's firm id *or* their own user id (legacy objects), so nothing needs copying now.
- `document_types`: seeding becomes per firm instead of per user (`ensureSystemDocumentTypes`).

### 1F.3 App changes
- `ProfileContext`/new `FirmContext`: loads the current firm and the member's role after login. Onboarding offers "Create a firm" (name) or accepts a pending invite.
- `repositories/cloud/index.ts`: `createCloudRepositories(userId)` → `(userId, firmId)`. Swap every `.eq('user_id', userId)` for `.eq('firm_id', firmId)` and set `firm_id` on insert. This is mechanical but touches the whole ~1,000-line file, so do it in its own commit.
- **Remove** `seedDefaultTeam()` usage and the round-robin backfill (`App.tsx:70-89`). `TeamMember` becomes a read model built from firm members. Assignee pickers list real members only.
- `pages/TeamMembers.tsx`: "Invite member" (email + role) calls a new `api/invite-member.ts`. That endpoint verifies the caller with `verifySupabaseUser()` and checks they're owner/admin, writes `firm_invites`, and sends the Supabase invite. Also add: accept page `/invite/:token`, resend, revoke, change role, disable.
- **Seeing each other's changes:** App.tsx loads everything once on mount. Minimum: refetch on window focus and after a failed update. Later: Supabase Realtime on `cases`/`tasks` filtered by `firm_id`. Last write wins for now; document it.
- **Role-gated UI:** hide delete and settings actions by role. RLS is the real enforcement.
- Usage events (#39) gain `firmId`, which gives seat counts for pricing.
- Settings → Storage Mode: block cloud → local when the firm has more than one active member.

### 1F.4 Rollout
1. Test the migration on a Supabase branch using a copy of production data shape.
2. Apply the migration and deploy the frontend together, in a quiet window. RLS changes take effect immediately.
3. Verify with a second test account: invite → accept → both see the same case → paralegal can't delete.
4. Run `get_advisors` (security + performance) after the migration.

---

## Things deliberately not in Step 1

- TRN/lodgement record, s56 handling UI beyond the Deadline, decision write-back: Step 2 (F6).
- Engagement gate (Form 956, service agreement): Step 2 (F2).
- Email/SMS alerts: Step 3 (messaging).
- Realtime collaboration beyond refetch-on-focus.

## Decisions (confirmed 2026-09-24)

1. **Firms are cloud-only.** Local mode stays single-user.
2. **New cases start at `draft`**, not `engaged`. This overrides 1C's "New cases start at `engaged`".
3. **Template timings:** we pick sensible defaults now, and agents can change any task date after creation. Keep the "not yet reviewed" label. Per-firm template customisation comes later.
4. **No platform-level access to firm data.** The app operator has no special role that can read a firm's cases; RLS only admits firm members. Firm roles for MVP are `owner`, `agent` and `paralegal`. The `admin` role is dropped for now.
5. **`SUPABASE_SERVICE_ROLE_KEY` on Vercel: approved.** The owner adds it by hand; secrets aren't entered by the assistant.
