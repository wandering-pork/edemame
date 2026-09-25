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
deadline with no case (e.g. a bare passport expiry). When there are more than five items, a
**View all N** link expands the full list in place.

## Task status

Every task has one of six statuses: **Not started**, **In progress**, **Waiting on client**,
**Waiting on third party**, **Not applicable**, or **Done**. Click a task to open it, then use the
status menu to change it — or click the circular checkbox for a one-click **Mark done** (click it
again to reopen the task). Choosing **Not applicable** asks for a short reason before it's applied;
the reason is shown on the task afterwards. Waiting statuses show as a distinct amber chip, never
red, even past their due date, since the delay isn't the firm's.

## Agent activity

The **Agent activity** panel shows a recent feed of what the AI has done on your behalf, such as
generating a task plan for a case, so you can see at a glance where automation has already done
work for you.

## This week's task board

The board shows **five days at a time**, grouped by day, with each task card showing the client and
case it belongs to. Five days rather than seven keeps the columns wide enough to read at a glance.

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
