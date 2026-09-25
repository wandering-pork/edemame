# Getting Started with Case Manager

Case Manager is where you track a client's visa application from intake through to lodgement and
decision.

## My cases / All cases (cloud/firm accounts only)

In cloud mode, the Case Manager header shows a **My cases / All cases** toggle next to
**Configurations**, filtering the list by case owner. It defaults to **All cases** for firm Owners
and Admins, and to **My cases** for plain Members — since a Member typically only needs to see
their own book, while an Owner or Admin usually needs the whole firm's view. Whichever you pick is
remembered for the rest of your browser session. This toggle is hidden in local mode, where every
case is by definition yours.

## Creating a case

1. From the sidebar, open **Cases** and click **New Case**.
2. Select an existing client or create a new one, then choose a visa subclass and a workflow
   template (e.g. Student 500, Skilled 190, Partner 820/801).
3. Set the application start date. This is used to calculate due dates for every generated task.

Each new case is automatically given a **case number** in the form `EDM-2026-0001` (the year, plus
a running number for that year). It's the reference to quote when discussing a file, and you can
type it straight into the search bar at the top of the screen to jump to the case. Cases created
before case numbers were introduced show a reference derived from their internal id instead.

## The case summary strip

Directly under the case title sits a row of four chips that answer "where is this case at" without
opening anything: **Stage**, **Risk**, **Next deadline**, and **On hold**. The case header itself
now only keeps one primary button, **Add Task**, plus a single **Case actions** menu for everything
else (see "The Case actions menu" below).

### Case stage, on hold, and At Risk

Every case moves through a **stage**, shown in the summary strip as "Stage N of 8 · Label" and
grouped on the Case Manager list into three boards: **Pre-lodgement** (Draft → Assessment → Engaged
→ Preparing → Ready to lodge), **With Department** (Lodged, Info requested, Decision), and
**Closed**. A new case always starts at **Draft**.

Click the Stage chip to open a picker grouped the same way — Pre-lodgement / With Department /
Closed — with the current stage marked. There's no fixed one-way path, since a real case can go
backward (a decision gets reopened, a lodgement is withdrawn and re-prepared); moving a case to an
earlier stage asks for a quick confirm first. **Lodged** and **Info requested** are treated as the
same step, since a case toggles between the two rather than progressing through both — no confirm
is needed either way, and they share one position in "Stage N of 8".

Moving a case to **Closed** requires picking an **outcome** first: Granted, Refused, Withdrawn, or
Lapsed. If a case is already closed with no outcome on file (this can happen to cases closed before
outcomes existed), an amber banner appears at the top of the case asking you to set one.

**On hold** is its own chip in the strip, labelled for the action it takes — **Put on hold** when
the case is active, or **On hold · Resume** once it is. A case can be on hold at any pre-lodgement
or with-department stage; it doesn't change the stage itself.

**At Risk** is never set manually — it's computed live from the case's own data and shown as the
Risk chip in the summary strip ("At risk" with its reasons spelled out right there, not hidden in a
tooltip, or a quiet "On track" when none apply), as well as a red badge on the Case Manager list
(hover or focus it there to see the specific reasons) and a red edge on the row. A case is flagged
At Risk when any of the following is true:
- it has an open deadline due within 14 days,
- it has an overdue task generated from a template step marked **Gate** — or, for a task with no
  such step behind it (a manually added task, or a plan from a template with no timing set), any
  overdue task,
- it's at **Ready to lodge** and a document checklist item is still outstanding, or
- it has an s56/s57 statutory response deadline due within 7 days.

Use the **At Risk** chip on the Case Manager list to filter down to just those cases, alongside (not
instead of) the Pre-lodgement/With Department/Closed board filters.

### Next deadline

The **Next deadline** chip shows the soonest open deadline on the case (including a client's
passport expiry, even if nobody has entered it as a deadline directly) with a countdown — "3d
left", "Due today", "5d overdue" — coloured by how urgent it is. Click it to jump straight to the
Deadlines panel at the top of the Tasks tab, where you can add, resolve, or review every deadline on
the case. A case with no open deadlines shows a quiet "No deadlines · Add" link to the same panel
instead.

### The Case actions menu

Everything that isn't **Add Task** now lives in one **Case actions** menu, named for what each item
actually does:
- **Draft cover letter with Agent** (previously an unlabelled "Draft" button) — opens the Agent
  chat panel with a cover-letter drafting prompt already typed in; nothing is sent until you do.
- **Re-check eligibility** (previously "Eligibility") — opens the Visa Advisor pre-filled with this
  client.
- **View eligibility assessment** (previously "Eligibility assessment", still only shown when this
  case has a saved assessment behind it — either opened directly from a Visa Advisor pathway, or
  matched up after the fact) — opens a read-only view of the full report (inputs summary and every
  assessed pathway with its verdict, reasons, and gaps) without leaving the case. See
  [Visa Eligibility Advisor](../visa-advisor/getting-started.md) for how that report is produced.
- **Open/Close Agent panel** (previously a separate "Agent" toggle button) — shows or hides the
  case-aware chat panel on the right.
- **Document checklist**, **Workspace**, **Auto-Packager**, **Run Crusher** (supported subclasses
  only), **820 bundle builder** (subclass 820 only), **Edit case**, and **Delete case** — unchanged
  from the old **⋯** menu, just folded into the same menu as everything above.

## Landing on the Workspace tab

Every time you open a case, you land on the **Workspace** tab. This is the AI-assisted entry point
for the case — it doesn't hold case data itself, it's a launcher for the case's Views (Tasks,
Document Checklist, Case Files, Notes) and Tools (Document Checklist Generator, Auto-Packager, and
the 820 Bundle Builder where applicable). See
[Workspace, tabs, and pinning](./workspace-and-tabs.md) for how the Workspace tab, tab opening, and
tab pinning work, and [Document Checklist](./document-checklist.md) for the renamed/upgraded
Documents tab and the Document Checklist Generator tool.

The left-hand rail on a case also has a compact **Case Files** panel — every file attached to the
case, which you can drag directly onto a Document Checklist item to link it (see Document Checklist
doc above). For a bigger, easier-to-work-with view of the same files — upload, preview, download,
and delete, with full-size thumbnails rather than the rail's condensed list — click **Open in tab**
next to the rail's Case Files heading, or open **Case Files** from the Workspace tab's View section.

When you drop files into any Case Files upload area, they wait in a short list until you give each
one a **Document Type** — this is required, and nothing is uploaded until every file has one. Type
to search the list by code or description; pick `OTH — Other` if nothing fits. The document type is
what lets a file link itself to a Document Checklist item automatically — see
[Configurations & Document Types](./configurations.md).

## Generating tasks

How a case's plan is built depends on whether its workflow template has **timing** set on its
steps (see [Templates](../templates/getting-started.md)):

- **Template with timing** — New Case and the Visa Advisor's Open Case panel build the plan
  deterministically: one task per step, dated by the template's own anchors (case start, another
  step's completion, or a deadline like invitation received) rather than asked of the AI. The
  button reads **Generate plan from template**. A date the scheduler can't yet pin down exactly
  (an anchor that hasn't happened yet) is marked **Estimated** and firms up automatically once that
  anchor becomes known — see "Rescheduling" below. If a case somehow reaches Case Details with no
  tasks yet (its template's steps changed after the case was created, for example), a banner in the
  Tasks tab offers the same **Generate plan from template** button.
- **Template with no timing set yet, or no template** — the button reads **Generate Plan with
  AI**. The agent reads the case description, the selected workflow template's steps, and the start
  date, then produces a whole chronological task list with realistic due dates based on typical
  Australian processing timeframes. Review the generated tasks — you can edit titles,
  descriptions, and due dates, or delete tasks that don't apply — before saving them to the case.

### Suggesting extra tasks with AI

Once a case has a deterministic plan from a timed template, the Tasks tab shows an **AI
suggestions** section with a **Suggest extra tasks with AI** button. This asks the agent for a
small number of tasks specific to this client's circumstances that the template's own steps don't
already cover — each with a one-line reason. Nothing is added automatically: review each
suggestion and click **Accept** (it's added as a task, dated relative to the step it's anchored
to, or the case start date if none) or **Reject** (it's dismissed).

### Rescheduling and locking a date

A task generated from a template step keeps recalculating automatically until you or an event
pins it down:

- Marking a step's task **done** gives the rest of the plan a real date to count from instead of
  an estimate — any of that case's still-**Estimated** tasks that count from it firm up
  immediately.
- Adding or updating a case **deadline** does the same for any step anchored on it.
- **Editing a task's date by hand** — in the task's detail view, the inline date field on its row,
  the "set today" quick action, or dragging it on the Dashboard calendar — locks that date. A
  locked task is never recalculated again, even if its anchor later changes; you're always free to
  change it again yourself.

## Using the case-aware chat (Focus Mode Agent)

Every case has a chat panel on the right-hand side of Case Details. This agent already knows the
case's client, visa subclass, stage, task progress, and document checklist — you don't need to
repeat that context.

You can ask it to:
- Answer questions about visa requirements, processes, and timelines.
- Draft correspondence or a document checklist for the client.
- Summarise the case's eligibility position or flag risks.
- Explain how to use any Edamame feature — it answers "how do I…" questions from this User Manual.

Use **New** to start a fresh conversation thread for the case, and switch between existing threads
using the tabs above the message list.

## Reporting a bug or requesting a feature from the chat

If you describe something that doesn't match how Edamame is documented to work, or ask for a
capability that doesn't exist yet, the agent will check whether it's already been reported. If it
finds a match, it tells you and links the existing GitHub issue instead of creating a duplicate. If
it's new, it drafts a GitHub issue and shows it in the chat with **Confirm** and **Cancel** buttons
— nothing is filed until you click **Confirm**. Each conversation thread can file up to 3 issues
this way (also capped at 5 per day per account, enforced server-side); after that, file further
reports manually. This only happens in the Case Manager Focus Mode chat, not elsewhere in the app.

**Filing an issue posts it to the public `wandering-pork/edemame` GitHub repository** — visible to
anyone on the internet. The draft card says so before you confirm; review the title and body for
any client-identifying details first. The app also strips obvious patterns (emails, phone numbers,
passport-number-like strings) before filing as a backstop, but this is not a substitute for
checking the draft yourself.
