# Overview, Edie, and Tabs

## The Overview tab

Opening a case lands you on the **Overview** tab — a one-screen summary of where the case is up to:

- **You are here** — the current task (the earliest task that isn't done yet), how many of the
  case's tasks are done, its due date and status. Click **Open task** to edit it.
- **Case info** — client (and applicant, if different), visa subclass (with substream, if set) and work plan, case owner,
  stage, next deadline (click it to jump to the Deadlines panel), and the date the case was opened.
  **Edit** opens the Edit case form, where you can change the title, description, **Visa Subclass**
  and **Substream** (or set the subclass to **Not Confirmed** while the visa is still undecided).
  Changing the subclass to a real one — from blank, Not Confirmed, or a different subclass — opens
  **Set up tasks for this visa**: pick a **Work Plan** (plans for that subclass are listed first;
  required) and choose what happens to the current tasks: **Do nothing** (default), **Delete** (asks
  you to confirm), or **Mark all as complete**. On **Confirm** the choice is applied, the plan's tasks
  are added (dated from today, each in its stage) and the new subclass is saved; the plan becomes
  the case's work plan. **Cancel** changes nothing. Changing the subclass back to blank or Not
  Confirmed just saves, with no window.
  The **Stage** here is read-only: it's the stage of the current task (see below), the same as the
  Stage chip in the summary strip under the case title. To close or reopen a case, use **Case actions**.
- **Progress** — the case's tasks grouped by **stage** (Consultation, Prerequisites, Preparing for
  lodgement, …; see Configuration → Stages), in stage order. Only the **current stage** — the stage
  of the current task — is open and highlighted: in it the current task is bold and finished tasks
  are struck through. Finished stages are folded with a green tick and a struck-through name;
  stages still to come are folded and grey. Click any stage to open or fold it, click a task to
  open it, or **View all** to open the Tasks tab. Stages with no tasks are hidden. Older cases whose
  tasks have no stage at all show the previous simple list (last done, current, next few).
- **Stage** (in Case info) — read-only; the stage of the current task, so it always matches the
  groups on the Tasks tab and the Stage chip in the summary strip. It moves on its own as tasks are
  done. A closed case shows **Closed**.
- **Document checklist** — a donut showing how many of the case's documents are in overall, then
  one progress bar per checklist category showing how many items are verified, linked, pending, or
  waived. Click a category (or **Open**) to open the Document Checklist tab. If the case has no
  checklist yet, use **Generate one**.
- **Recent case files** — the five most recently uploaded files, plus an upload area. Click a file
  to preview it, or **View all files** to open the Case Files tab.

The tabs and the layout around them stay the same on every tab; switching tabs only changes the
content below the tab row. To drag files onto checklist items, use the **Case Files** button on the
Checklist tab.

## Edie, the case assistant

**Edie** is Edamame's AI assistant; see [Edie](../edie/getting-started.md) for opening and closing it
(**Ask Edie** in the case header, next to **Case actions**, or **Ctrl+J**). On a case, Edie becomes
that case's assistant, and the button shows how many suggestions Edie has while it's closed.

Edie only holds AI help. Everything else has one home on the page: the tab row for moving between
views, **Case actions** for editing or deleting the case, and each document tool on its own tab.

The panel has three parts:

- **Suggested for "*current task*"**: up to three next steps worked out from the case's tasks and
  checklist (not an AI call). For example: *Chase client* (when the current task is waiting on the
  client), *Request N missing documents*, *Verify N documents*, *Create a task plan* or *Generate
  checklist*. Steps that need writing, like an email to the client, ask Edie straight away and the
  draft appears in the chat. Nothing is sent to the client: Edie only writes the draft for you to
  copy. Once a chat has started, this section
  folds into one row so the chat has room; click it to open it again.
- **Skills**: *Summarise case*, *Draft cover letter* and *Draft consultation checklist* ask Edie
  straight away and the answer appears in the chat. *Re-check eligibility* opens the Visa Advisor for this client.
- **Chat**: ask Edie anything about the case. Edie already knows the client, the tasks and the
  checklist, and can answer "how do I…" questions about Edamame. **New chat** starts a fresh
  conversation; earlier chats on the case are listed above the messages.

## Tabs

A row of tabs under the case header is always visible: **Overview**, **Tasks**, **Case files**,
**Checklist**, and **Notes**. Tasks, Case files, and Checklist show a count. Click a tab to switch to
it.

Document tools sit on the tab whose documents they work on, and open in their own window over the
case:

- **Case files** tab: **Compress documents** (the Document Compressor), **Run Crusher** (supported
  subclasses only) and **820 Bundle Builder** (subclass 820 only).
- **Checklist** tab: **Generate** (the Document Checklist Generator).
 When you come back to a case, it reopens on the tab you
were last using.

## Tasks by stage

When a case's tasks have stages, the **Tasks** tab groups them the same way as Overview → Progress:
one section per stage in stage order, only the current stage open, the current task highlighted
and bold, finished tasks struck through, finished stages ticked and folded. Every row keeps its
usual actions (mark done, change status, edit the date, the **⋮** menu).

Tasks get their stage from the Work Plan step they came from. When you add a task yourself (**Add
task** in the case, or **New Task** on the Dashboard with a case linked) you're asked which
**Stage** to put it in — the choices are the stages this case already uses, defaulting to its
current stage. A **Not Confirmed** case only uses Consultation. You can change a task's stage later
from its edit form. AI-suggested extra tasks go into the stage of the step they're anchored to, or
the current stage.
