# Getting Started with Dashboard

Dashboard is the home screen — it gives you a daily snapshot of what needs attention across all
your cases, and a week-at-a-glance view of scheduled tasks.

## Mine vs. All (cloud/firm accounts only)

Needs Attention and the stat cards below follow a small **Mine / All** toggle (shown in the Needs
Attention card's header, cloud mode only — local mode is always single-user, so there's nothing to
toggle). **Mine** is the default: tasks assigned to you, or unassigned, plus deadlines on cases you
own or that have no owner. **All** shows the whole firm's tasks and deadlines. The rule line under
the Needs Attention heading ("Your tasks — overdue first, then due today" / "All tasks — overdue
first, then due today") always says which one you're looking at. This is separate from the task
board's own **My Tasks / Team / All** tabs further down the page, which only affect the board.

## Stat cards

Five cards at the top summarise your workload, scoped by the Mine/All toggle above:

- **Cases in motion** — cases currently open or in progress, with how many were created this
  month.
- **Tasks due this week** — how many tasks are due in the next 7 days, and how many of those are
  due today.
- **Overdue** — open tasks whose due date has already passed, with the next one to deal with
  named underneath. Tasks whose status is "Waiting on client" or "Waiting on third party" are
  never counted here, even if their due date has passed — they're blocked on someone outside the
  firm, not sitting in your backlog. See "Task status" below.
- **Docs outstanding** — checklist items not yet linked or verified (i.e. still pending, or
  marked waived), summed across every non-closed case's document checklist — the same definition
  a case's own sidebar uses. Shows "—" only while the underlying checklist data is still loading.
- **Waiting on client** — open tasks currently in a waiting status, tracked separately from
  Overdue so "N overdue" always means work your team still owes, not work you're blocked on.

## Needs Attention

Below the stat cards, **Needs Attention** lists your most urgent items. Open deadlines (see
"Deadlines" in the Case Manager manual) that are due within 14 days rank **above** tasks, most
consequential first — an s56/s57 response window outranks an invitation window, which outranks
nomination validity, then visa expiry, then passport expiry. Among tasks, the rule stays
**overdue first, then due today**. Each item shows the client, the case, and the due date.
Clicking a task item opens that task (use its **Go to Case** button from there if you need the
case itself); clicking a deadline item goes straight to its case, or to the client's page for a
deadline with no case (e.g. a bare passport expiry). Every task item also has a small **Done**
button so you can close it without opening the task window at all — the item drops off the list
as soon as the task closes, and the confirmation toast that follows has an **Undo** if you tapped
it by mistake. When there are more than five items, a **View all N** link expands the full list
in place.

## Task status

Every task has one of six statuses: **Not started**, **In progress**, **Waiting on client**,
**Waiting on third party**, **Not applicable**, or **Done**. A task's status shows as a small
coloured chip wherever tasks are listed — on the week board's cards below and in Needs Attention —
so you can tell a task is blocked or in progress without opening it; **Not started** shows no chip
(it's the quiet default) and **Done** keeps its own tick + strikethrough treatment instead of a
chip. Each status gets its own colour (blue for In progress, amber for Waiting on client, orange
for Waiting on third party, grey for Not applicable) so they read apart from one another at a
glance.

Click a task to open it. In the task window, a row of status buttons is the single control for a
task's status — clicking one applies immediately, there's no separate Save step for status. Above
that, one-click buttons cover the most common changes without hunting through the status row:
**Mark done** (or **Reopen**, once done), **Waiting on client**, and **Move date** (a small menu
with +1 day, +1 week, or pick a date — moving the date this way locks it exactly like editing the
Due Date field by hand does, so it's never silently recalculated again). A line under the title
shows context when it's relevant — how overdue the task is, "Due today", a note that an estimated
date will firm up once the step it depends on is done, and who it's assigned to. Below that, an
**Assignee** field lets you change who the task is assigned to (or make it **Unassigned**) — it
opens the same searchable person picker used everywhere someone is assigned in Edamame (search by
name, email, or job title; an availability dot and open case/task count on each row), and applies
the moment you pick someone, with no separate Save step. If the person you assign it to isn't you,
they get an "assigned to you" notification (cloud/firm accounts only). Choosing **Not
applicable**, from either the row menu on a case's task list or the task window's status row, asks
for a short reason before it's applied; the reason is shown afterwards, and hovering or
keyboard-focusing the chip on a task row shows it as a tooltip. Save at the bottom of the task
window only applies edits to the title, description, or a hand-typed Due Date — everything else
above it already took effect the moment you clicked it.

## Recent activity

The **Recent activity** panel shows a feed of what's happened lately across your cases — new cases,
task plans, deadline and stage changes, and so on. A new case's task plan entry says exactly how the
plan was produced: "Created a 12-task plan from the *Subclass 189* template" for a template with
timing set (no AI involved — see "How timing affects task generation" in
[Templates](../templates/getting-started.md)), or "Generated a 12-task plan with AI" when Gemini
actually wrote the plan, so the wording never implies AI did something it didn't.

## This week's task board

The board shows **five days at a time**, grouped by day, with each task card showing the client and
case it belongs to. Five days rather than seven keeps the columns wide enough to read at a glance.
Each card is tagged **Overdue** or **Due today** when its own due date has passed or is today, and
**Task** otherwise (or **Filing** for a lodgement-sounding task title) — these describe the *task's*
due date only. A **Deadline** (visa/passport expiry, an s56/s57 response window, and so on) is a
separate, external date tracked on the case page's Deadlines panel and in Needs Attention above; it
is never shown on a task card.

Which five days you see depends on what day it is today:

- **Monday, Tuesday or Wednesday** — the board is anchored to the working week: Monday, Tuesday,
  Wednesday, Thursday, Friday, with Monday always in the leftmost column. Today sits wherever it
  falls in that run.
- **Thursday, Friday, Saturday or Sunday** — the board rolls so that **today is always the middle
  column**, showing the two days before and the two days after. This is what brings weekend due
  dates into view: on Thursday you can see Saturday, on Friday you can see Saturday and Sunday, and
  on the weekend you can already see into next week.

As soon as it's Monday again, the board snaps back to the Monday–Friday anchor.

Use the scope tabs to change whose tasks you see:

- **My Tasks** — only tasks assigned to you.
- **Team** — tasks assigned to your team.
- **All** — every task across the firm/agency.

### Moving around the calendar

Four buttons sit next to the date range, arranged as `|◀  ◀  ▶  ▶|`:

- The inner **single arrows** move the board **one day** at a time.
- The outer **skip buttons** (like the previous/next track buttons on a music player) jump a **full
  week** at a time, and always land with Monday in the leftmost column.

As soon as you use any of these buttons you're driving the board manually, and a **Today** button
appears. The automatic today-centring described above stops applying until you click **Today** (or
navigate away and come back to Dashboard), which returns the board to today's default view.

You can also drag a task card from one day to another to reschedule it, and click any card to open
the task for viewing or editing.

## Creating a task from the Dashboard

Click **New Task** in the top-right corner, fill in a title, description, and due date, link it to
a case, and save. It starts out **Not started** and immediately appears on the week board and
counts towards the stat cards and Needs Attention if it's overdue or due today.
