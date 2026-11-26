# Case Overview: Progress Path: Implementation Plan

Source: Trello card "Redesign of Case Manager 'Overview' tab" (Edamame Board → Pending,
https://trello.com/c/gMYzvKxS), reviewed 2026-11-23 against `main` @ `a43ade9`.

**Goal.** Make the Overview tab show a case's end-to-end progress the way Salesforce's "Path" does:
a row of stages across the top, the current one highlighted, and a clear way to see what's in each
stage and finish the current one.

The card asks three things:
1. Recreate the Progress block as an end-to-end stage display (Salesforce-style).
2. Decide what clicking a stage does: show its tasks, or complete them all? Do we add a "Mark all
   as completed" button?
3. Minor renaming (shown only in a screenshot on the card, see Decision 5).

| # | Work | Size (rough) | Migration | Status |
|---|------|--------------|-----------|--------|
| OV.1 | Progress path + selected-stage panel (view only) | M · 2 days | No | Built (one PR with OV.2) |
| OV.2 | "Mark stage complete" for the current stage, with confirm and undo | S · 1 day | No | Built (one PR with OV.1) |
| OV.3 | Renaming from the card's screenshot | S · ½ day | No | Blocked on Decision 5 |

Each row is one PR, shipped in order.

---

## Decisions

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | What does clicking a stage do? | **Show that stage's tasks.** Clicking never changes data. Completing work is a separate, explicit button (OV.2). One misclick shouldn't close a dozen tasks on a legal file. |
| 2 | Add a "Mark all as completed" button? | **Yes, as "Mark stage complete", on the current stage only,** with an inline confirm listing what will close, and an Undo. |
| 3 | Waiting tasks ("Waiting on client/third party") when completing a stage | **Listed separately in the confirm, left open by default,** with a checkbox to close them too. They're waiting for a reason. |
| 4 | Show stages that have no tasks? | **Yes, dimmed, so the path shows the whole journey** (e.g. Decision even before any decision tasks exist). They can be selected but have nothing to complete. |
| 5 | The "minor renaming" | **Open.** It's only in a screenshot on the card, which I can't read. Needs a sentence on the card or here. |
| 6 | Skip ahead ("Mark as current stage", as Salesforce allows)? | **No.** The case's stage follows its tasks (#93). Moving the stage by hand would break that. To move on, complete the current stage. |

---

## How it works today

- **Phases already exist.** #92 groups tasks into phases. `lib/phaseGrouping.ts`'s
  `buildCasePhaseView()` returns `groups` (each `done` | `current` | `upcoming`, with tasks and
  done count), `currentTask` and `currentPhaseName`. The UI calls a phase a "Stage".
- **Stage follows the tasks.** Since #93, `Case.stage` is read-only and synced from the current
  phase (`lib/caseStageSync.ts`'s `syncedCaseStage()`).
- **The Overview** (`components/case-details/CaseOverview.tsx`) has:
  - a "You are here" bar (the current task and its phase), then
  - a two-column grid: Case info + **Progress** on the left, Checklist + Case files on the right.
  - Progress renders `PhaseTaskGroups` in compact mode: a stacked accordion of phases, not an
    at-a-glance path.
- **Older cases** without phase info fall back to a flat task timeline (`lib/caseOverview.ts`'s
  `taskTimeline()`) and the stored stage.
- **There's no bulk-complete action anywhere** in Case Details.

---

## OV.1 · Progress path + selected-stage panel

**Layout (Overview tab, top to bottom)**
1. **Path:** a full-width row of chevrons, one per stage, replacing the "You are here" bar at the
   top of the Overview.
   - **Done:** green with a tick.
   - **Current:** solid edamame green, with "3 of 7" underneath.
   - **Upcoming:** grey.
   - **Empty:** dimmed outline (Decision 4).
   - **On hold:** a small pause badge on the current chevron.
2. **Selected-stage panel**, directly under the path. It opens on the current stage and shows:
   - the stage name, "N of M tasks done", and its date range (first to last task date, with
     "estimated" if any are `datePending`);
   - the stage's tasks: current task bold, done tasks struck through, waiting tasks with their
     status. Clicking a task opens `TaskDetailModal`, as today;
   - for the current stage, the current task's **Open task** button (what "You are here" did
     before) and, from OV.2, **Mark stage complete**.
   - Selecting another chevron swaps the panel's contents. Nothing else changes.
3. The existing grid below, **without the Progress card**, which the path replaces. Case info,
   Checklist and Case files are unchanged.

**Data**
- New pure helper `pathStages(view, phases, steps, visaSubclass)` in `lib/phaseGrouping.ts`. It
  returns every phase for the case's work plan in order, including empty ones (Decision 4), each
  with `{ ref, name, state, done, total, startDate, endDate, estimated }`.
  `buildCasePhaseView()` stays as it is (it omits empty phases on purpose for the Tasks tab).
- **Older cases without phase info** show the lifecycle stages instead (`CASE_STAGE_STEPPER`,
  as Case Manager rows already do) with the flat task list in the panel. Same component, different
  data.
- **Closed cases** show every stage done and an outcome chip (Granted/Refused/…) at the end of the
  path.

**Behaviour and accessibility**
- The path is a list of buttons. The current one has `aria-current="step"`, and the selected one
  `aria-pressed`. Left/right arrow keys move between stages.
- **Narrow screens** (under ~720px): the path collapses into "Stage 3 of 7: Lodgement ▾", which
  opens a list of stages. No horizontal scrolling of chevrons.
- When the current stage moves on (a task completes elsewhere), the panel follows it unless the
  user has selected another stage in the meantime.
- Long stage names truncate inside the chevron, with the full name on hover and keyboard focus.

**Done when:** the path shows every work-plan stage with the right state for new and old cases;
clicking a stage shows its tasks without changing anything; it works by keyboard and on a narrow
window; `pathStages()` is unit-tested (ordering, empty phases, closed case, no-phase fallback);
`docs/user-manual/case-manager/` describes the path.

---

## OV.2 · Mark stage complete

**Where:** a **Mark stage complete** button in the selected-stage panel, shown **only for the
current stage** while it has open tasks, and only on cases that aren't closed.

**Confirm (inline, no `window.confirm`)**
- "Complete **Lodgement**? 4 open tasks will be marked done:" followed by the task titles.
- Waiting tasks are listed separately: "2 are waiting on the client. Leave them open." There's
  an unticked checkbox, **Also mark these done** (Decision 3).
- Tasks already *Not applicable* or *Done* aren't touched.
- Buttons: **Mark 4 tasks done** / **Cancel**.

**Applying it**
- Each task goes through `withStatus(task, 'done')` and the existing `onUpdateTask` path, so the
  usual side effects still happen: template rescheduling of downstream estimated dates, case
  stage sync, assignment rules.
- Batch it so the case reschedules **once** at the end, not once per task. `App.tsx`'s
  `rescheduleCaseFromSnapshot()` is called after the last update. This needs a small
  `onUpdateTasks(tasks[])` alongside `onUpdateTask`, which writes all tasks and then reschedules
  and syncs the stage once.
- **Activity:** one `stage_completed` `ActivityEvent` ("Marked Lodgement complete: 4 tasks done")
  instead of four separate task events, so the feed stays readable. The individual tasks still
  carry their new status.
- **Undo:** a toast, "Lodgement completed · Undo", for ~10 seconds. Undo restores each task's
  previous status and dates from a snapshot taken before applying, through the same batch path.
  It also writes a matching activity event.

**Done when:** completing a stage closes only the listed tasks, the path and stage move to the
next stage, and downstream estimated dates update once; Undo restores everything; waiting tasks
stay open unless ticked; a unit-tested pure helper `stageCompletionPlan(group)` returns
`{ toClose, waiting, untouched }`; the manual is updated.

---

## OV.3 · Renaming

Blocked on Decision 5. Once the names are known, it's a copy change across `CaseOverview.tsx`,
the Tasks tab and `docs/user-manual/case-manager/`. Check the Case Manager list and Edie's case
context (`CaseDetails.tsx`) use the same words.

---

## Out of scope

- Per-stage "key fields" and "guidance for success" panels (Salesforce has these). A good later
  addition, e.g. what documents a stage needs. That would need content per work plan, which BAs
  would have to write.
- Moving the stage by hand (Decision 6).
- Bulk actions on stages that aren't current.
