# Getting Started with Case Manager

Case Manager is where you track a client's visa application from intake through to lodgement and
decision.

## My cases / All cases (cloud/firm accounts only)

In cloud mode, the Case Manager header shows a **My cases / All cases** toggle next to
**New Case**, filtering the list by case owner. It defaults to **All cases** for firm Owners
and Admins, and to **My cases** for plain Members — since a Member typically only needs to see
their own book, while an Owner or Admin usually needs the whole firm's view. Whichever you pick is
remembered for the rest of your browser session. This toggle is hidden in local mode, where every
case is by definition yours.

## Assigning a case owner

An unowned case shows a dashed circle with a **+** next to it in the case list — click it to open
**Assign Case**. It uses the same searchable person picker as task assignment (search by name,
email, or job title; an availability dot and open case/task count per row), plus an optional note
that's added to the case's assignment history (visible further down the same dialog). The
**Confirm assignment** button stays disabled until you pick someone other than the case's current
owner. The Team Dashboard's Shared Case Board opens the identical dialog for reassigning an
already-owned case.

## Creating a case

1. From the sidebar, open **Cases** and click **New Case**.
2. Select an existing client or create a new one, then choose a work
   plan (e.g. Student 500, Skilled 190, Partner 820/801). The **Visa Subclass** and **Substream**
   follow the plan you pick; change them before creating if this case is different (or set the
   subclass to **Not Confirmed** for a consultation-only case).
3. Set the application start date. This is used to calculate due dates for every generated task.

Each new case is automatically given a **case number** in the form `EDM-2026-0001` (the year, plus
a running number for that year). It's the reference to quote when discussing a file, and you can
type it straight into the search bar at the top of the screen to jump to the case. Cases created
before case numbers were introduced show a reference derived from their internal id instead.

## The case summary strip

Directly under the case title sits a row of four chips that answer "where is this case at" without
opening anything: **Stage**, **Risk**, **Next deadline**, and **On hold**. The case header itself
has one primary button, **Add Task**, and a small **Case actions** menu (see below). **Edie**, the AI
assistant, is the button at the top right of the top bar.

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
- it has an overdue task generated from a work plan step marked **Gate** — or, for a task with no
  such step behind it (a manually added task, or a plan from a work plan with no timing set), any
  overdue task,
- it's at **Ready to lodge** and a document checklist item is still outstanding, or
- it has an s56/s57 statutory response deadline due within 7 days.

Use the **At Risk** chip on the Case Manager list to filter down to just those cases, alongside (not
instead of) the Pre-lodgement/With Department/Closed board filters.

### Stage and phase on each row

Each case row shows two kinds of progress side by side:

- the **stage** stepper (Draft → Closed) — the case's lifecycle, which you set yourself on the case;
- underneath it, a **phase** bar — one segment per phase the case's tasks use, each filled by how
  many of its tasks are done — with the current phase's name and the overall task count. Hover or
  focus the bar to see each phase's count. Cases whose tasks have no phases just show the task count.

If a case's tasks have reached **Lodged**, **Decision** or **Post-decision** but its stage is still
before lodgement, the row shows **Phase is ahead of stage** — a reminder to update the stage. The
stage is never changed for you.

### Visa and phase filters

Next to the board filters and **At Risk**, use **All visas** to show only one subclass (then
optionally one substream), **Not Confirmed** cases, or cases with **No subclass**; and **Any phase**
to show only cases currently in a given phase (e.g. "In Prerequisites"). They combine with every
other filter and the search box.

### Next deadline

The **Next deadline** chip shows the soonest open deadline on the case (including a client's
passport expiry, even if nobody has entered it as a deadline directly) with a countdown — "3d
left", "Due today", "5d overdue" — coloured by how urgent it is. Click it to jump straight to the
Deadlines panel at the top of the Tasks tab, where you can add, resolve, or review every deadline on
the case. A case with no open deadlines shows a quiet "No deadlines · Add" link to the same panel
instead.

### The Case actions menu

**Case actions** holds case admin only:
- **Edit case**: change the title, description, visa subclass and substream.
- **View eligibility assessment**: only shown when the case has a saved assessment behind it. That
  happens when the case was opened from a Visa Advisor pathway, or matched up afterwards. It opens a
  read-only view of the full report (inputs summary, and every assessed pathway with its verdict,
  reasons and gaps) without leaving the case. See
  [Visa Eligibility Advisor](../visa-advisor/getting-started.md) for how that report is produced.
- **Delete case**: owners and admins only.

Everything that used to be in this menu now has one home elsewhere:
- **Draft cover letter** and **Re-check eligibility** are skills in **Edie**.
- **Overview** and **Document checklist** are tabs.
- **Document Compressor**, **Run Crusher** and **820 Bundle Builder** are on the **Case files** tab.

## Landing on the Overview tab

Every time you open a case, you land on the **Overview** tab: a "You are here" card with the
current task across the top, then case info and the case's progress on the left and the document
checklist (an overall donut plus a bar per category) and recent case files on the right. Click **Edie** at the top right
of the top bar (or press **Ctrl+J**) for suggested next steps, AI skills and the case chat. See
[Overview, Edie, and tabs](./workspace-and-tabs.md) for how the Overview, Edie and the case's tabs
work, and [Document Checklist](./document-checklist.md) for the renamed/upgraded
Documents tab and the Document Checklist Generator tool.

Every file attached to the case is on the **Case files** tab, where you can upload, preview,
download, and delete them (also reachable from **View all files** on the Overview). The **Case files** tab also has the
document tools: **Compress documents**, **Run Crusher** (supported subclasses) and **820 Bundle
Builder** (subclass 820). To link files to checklist items, open the **Checklist** tab and click
**Case Files** to show the files beside the checklist, then drag a file onto an item (see Document
Checklist doc above).

When you drop files into any Case Files upload area, they wait in a short list until you give each
one a **Document Type** — this is required, and nothing is uploaded until every file has one. Type
to search the list by code or description; pick `OTH — Other` if nothing fits. The document type is
what lets a file link itself to a Document Checklist item automatically — see
[Configuration & Document Types](../configuration/getting-started.md).

## Generating tasks

How a case's plan is built depends on whether its work plan has **timing** set on its
steps (see [Work Plans](../work-plans/getting-started.md)):

On New Case, **Case Notes** are optional. You can generate the plan with just a client and a work
plan, and add notes later from **Edit case**. Notes help most for a work plan with no timing, where
the AI uses them to tailor the tasks.

- **Work plan with timing** — New Case and the Visa Advisor's Open Case panel build the plan
  deterministically: one task per step, dated by the plan's own anchors (case start, another
  step's completion, or a deadline like invitation received) rather than asked of the AI. The
  button reads **Generate tasks from work plan**. A date the scheduler can't yet pin down exactly
  (an anchor that hasn't happened yet) is marked **Estimated** and firms up automatically once that
  anchor becomes known — see "Rescheduling" below. If a case somehow reaches Case Details with no
  tasks yet (its plan's steps changed after the case was created, for example), a banner in the
  Tasks tab offers the same **Generate tasks from work plan** button.
- **Work plan with no timing set yet, or no work plan** — the button reads **Generate Plan with
  AI**. The agent reads the case description, the selected work plan's steps, and the start
  date, then produces a whole chronological task list with realistic due dates based on typical
  Australian processing timeframes. Review the generated tasks — you can edit titles,
  descriptions, and due dates, or delete tasks that don't apply — before saving them to the case.

### Suggesting extra tasks with AI

Once a case has a deterministic plan from a timed work plan, the Tasks tab shows an **AI
suggestions** section with a **Suggest extra tasks with AI** button. This asks the agent for a
small number of tasks specific to this client's circumstances that the work plan's own steps don't
already cover — each with a one-line reason. Nothing is added automatically: review each
suggestion and click **Accept** (it's added as a task, dated relative to the step it's anchored
to, or the case start date if none) or **Reject** (it's dismissed).

### Task status

Each task row has a small tick to toggle **Done** (click again to reopen), and a status menu — the
**⋮** button that appears on hover — offering **Not started**, **In progress**, **Waiting on
client**, **Waiting on third party**, and **Not applicable**. The menu also has **Set to today**,
**Assign to…**, and **Edit** shortcuts. Choosing **Not applicable** asks for a short reason inline
before it's applied. Any status other than Not started/Done shows as a small coloured chip next to
the task's title (Not applicable's chip shows its reason as a tooltip on hover or keyboard focus),
so you can scan a case's task list and see what's blocked or in progress without opening anything.
Opening a task (via **Edit**, or from the Dashboard/global search) gives you the same statuses as a
one-click segmented control that applies immediately, plus **Mark done**/**Waiting on client**
one-click buttons and a **Move date** menu (+1 day, +1 week, or pick a date) — see "Task status" in
the Dashboard manual for the full task window walkthrough.

Every task row also shows the assignee's initials (a dashed circle when unassigned) — hover or
keyboard-focus it to see the full name. **Assign to…** in the row's **⋮** menu opens a searchable
person picker (search by name, email, or job title, with an availability dot and open case/task
count per person, plus an **Unassigned** option) and applies the moment you pick someone — no
separate Save. New tasks still default to the case owner. The same picker backs the task window's
**Assignee** field (see the Dashboard manual) and the **Assign Case** action described next.

### Rescheduling and locking a date

A task generated from a work plan step keeps recalculating automatically until you or an event
pins it down:

- Marking a step's task **done** gives the rest of the plan a real date to count from instead of
  an estimate — any of that case's still-**Estimated** tasks that count from it firm up
  immediately.
- Adding or updating a case **deadline** does the same for any step anchored on it.
- **Editing a task's date by hand** — in the task's detail view, the inline date field on its row,
  the "set today" quick action, or dragging it on the Dashboard calendar — locks that date. A
  locked task is never recalculated again, even if its anchor later changes; you're always free to
  change it again yourself.

## Chatting with Edie

Open a case, then click **Edie** at the top right of the top bar (or press **Ctrl+J**) to chat about the case. Edie
already knows the case's client, visa subclass, stage, task progress and document checklist, so you
don't need to repeat that context.

You can ask it to:
- Answer questions about visa requirements, processes, and timelines.
- Draft correspondence or a document checklist for the client.
- Summarise the case's eligibility position or flag risks.
- Explain how to use any Edamame feature — it answers "how do I…" questions from this User Manual.

Use **New chat** to start a fresh conversation thread for the case, and switch between existing threads
using the tabs above the message list.

## Reporting a bug or requesting a feature from the chat

If you describe something that doesn't match how Edamame is documented to work, or ask for a
capability that doesn't exist yet, Edie will check whether it's already been reported. If it
finds a match, it tells you and links the existing GitHub issue instead of creating a duplicate. If
it's new, it drafts a GitHub issue and shows it in the chat with **Confirm** and **Cancel** buttons
— nothing is filed until you click **Confirm**. Each conversation thread can file up to 3 issues
this way (also capped at 5 per day per account, enforced server-side); after that, file further
reports manually. This works in any Edie chat, on a case or on any other page.

**Filing an issue posts it to the public `wandering-pork/edemame` GitHub repository** — visible to
anyone on the internet. The draft card says so before you confirm; review the title and body for
any client-identifying details first. The app also strips obvious patterns (emails, phone numbers,
passport-number-like strings) before filing as a backstop, but this is not a substitute for
checking the draft yourself.
