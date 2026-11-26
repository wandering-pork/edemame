# Overview, Edie, and Tabs

## The Overview tab

Opening a case lands you on the **Overview** tab — a one-screen summary of where the case is up to:

- **Top row: two rings and Case info.** The **Task progress** ring shows how many of the case's
  tasks are done. Next to it is **Next up**, the case's next task, with its stage (for example
  "Ready to lodge, stage 3 of 5", counted the same way as the Stage chip under the case title) and
  its date, and **Open task**. With no open tasks it says so and links to the Tasks tab instead.
  The **Document checklist** ring shows how many documents are in and how many are still to
  collect, and once any are in, how many are verified and how many are linked but not yet verified.
  **Open Document Checklist** opens the Document Checklist tab (or **Generate checklist** if the
  case has none yet).
- **Progress path** — under the rings, one chevron per **stage** of the case's journey
  (Consultation, Prerequisites, Preparing for lodgement, …; see Configuration → Stages), in stage
  order. Finished stages are pale green with a tick, the **current stage** (the stage of the current
  task) is solid green, stages still to come are grey, and stages with no tasks yet are faded but
  still shown, so you can see the whole journey. Each chevron shows how many of its tasks are done.
  A case on hold shows a pause sign on the current stage; a closed case shows its outcome (Granted,
  Refused, …) at the end.
  **Click a stage to see its tasks** in the panel underneath: the stage name and its date range
  ("(estimated)" if the dates are estimates), then the tasks themselves (finished ones struck
  through, waiting ones in amber). Clicking a stage never changes anything. Use the left and right arrow keys to move
  between stages. On a narrow window the chevrons become a **Stage** picker.
  For the current stage the next task is highlighted in the list, and the panel has a
  **Mark stage complete** button. It asks you to confirm first, listing the open tasks it will
  mark done. Tasks waiting on the client or a third party stay open unless you tick **Mark these
  done too**; tasks already done or not applicable aren't touched. After **Mark N tasks done**, the
  next stage becomes current and any estimated dates after it are recalculated. **Undo** on the
  confirmation message (for about 10 seconds) puts the tasks back as they were.
  Older cases whose tasks have no stage at all show the case lifecycle stages instead (display only)
  with the case's task list underneath.
- **Case info** (top right) — client (and applicant, if different), visa subclass (with substream,
  if set), case owner, and the date the case was opened. The stage and the next deadline aren't
  repeated here; they're in the summary strip under the case title.
  **Edit** opens the Edit case form, where you can change the title, description, **Visa Subclass**
  and **Substream** (or set the subclass to **Not Confirmed** while the visa is still undecided).
  Changing the subclass to a real one — from blank, Not Confirmed, or a different subclass — opens
  **Set up tasks for this visa**: pick a **Work Plan** (plans for that subclass are listed first;
  required) and choose what happens to the current tasks: **Do nothing** (default), **Delete** (asks
  you to confirm), or **Mark all as complete**. On **Confirm** the choice is applied, the plan's tasks
  are added (dated from today, each in its stage) and the new subclass is saved; the plan becomes
  the case's work plan. **Cancel** changes nothing. Changing the subclass back to blank or Not
  Confirmed just saves, with no window.
  To close or reopen a case, use **Case actions**.
- **Checklist by category** — across the bottom, one bar per checklist category showing how many
  items are verified (dark green), linked (lighter green), pending, or waived (grey). The counts
  under a bar appear once something in that category is in. Click a category to open the Document
  Checklist tab. This card only appears once the case has a checklist.

Case files aren't listed on the Overview; they're all on the **Case files** tab.

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
**Document Checklist**, and **Notes**. Tasks, Case files, and Document Checklist show a count. Click a tab to switch to
it.

Document tools sit on the tab whose documents they work on, and open in their own window over the
case:

- **Case files** tab: **Compress documents** (the Document Compressor), **Run Crusher** (supported
  subclasses only) and **820 Bundle Builder** (subclass 820 only).
- **Document Checklist** tab: **Generate** (the Document Checklist Generator).
 When you come back to a case, it reopens on the tab you
were last using.

## Tasks by stage

When a case's tasks have stages, the **Tasks** tab groups them by the same stages as the Overview's progress path:
one section per stage in stage order, only the current stage open, the current task highlighted
and bold, finished tasks struck through, finished stages ticked and folded. Every row keeps its
usual actions (mark done, change status, edit the date, the **⋮** menu).

Tasks get their stage from the Work Plan step they came from. When you add a task yourself (**Add
task** in the case, or **New Task** on the Dashboard with a case linked) you're asked which
**Stage** to put it in — the choices are the stages this case already uses, defaulting to its
current stage. A **Not Confirmed** case only uses Consultation. You can change a task's stage later
from its edit form. AI-suggested extra tasks go into the stage of the step they're anchored to, or
the current stage.
