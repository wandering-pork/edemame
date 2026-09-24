# Deadlines

A **Deadline** is an external, consequential date your firm doesn't control — a passport or visa
expiry, an s56/s57 response window, nomination validity, an invitation window. This is different
from a **Task**, whose due date your firm sets and can move at any time. The **Deadlines** panel
sits at the top of a case's **Tasks** tab.

## Countdown chips

Each deadline shows a chip with how many days are left (or, if it's overdue, how many days past):

- **Grey** — more than 14 days away.
- **Amber** — 14 days or fewer.
- **Orange** — 7 days or fewer.
- **Red** — 2 days or fewer, or already past due.

## Adding a deadline

Click **Add deadline**, choose a kind, give it a title and a due date, and optionally a note, then
**Confirm**. Nothing is created until you confirm — there's no auto-save on the form.

### Quick-add: s56 / s57 response

Click **+ s56** or **+ s57** to quick-add a document/information request response deadline. Enter
the date the request was **received** — the due date defaults to **28 days later**, since that's
the typical response window, but it's editable right there because the actual period varies by
request. Confirm before it's saved.

## Passport expiry — auto-tracked

If the client has a passport expiry date on file, it shows in the Deadlines panel automatically,
labelled "auto-tracked from client passport" — you don't add it by hand, and it isn't a separate
record you can delete. If you'd rather track it yourself (e.g. to add a note or resolve it), adding
your own **Passport expiry** deadline for the case takes over from the auto-tracked one.

## Resolving a deadline

An open deadline shows **Mark met**, **Mark missed**, and **Dismiss**. None of this happens
automatically — even an overdue deadline stays open and shows a **"Missed?"** prompt asking you to
resolve it, rather than being marked missed on its own. Once resolved, the deadline shows its
resolved status instead of the action buttons.

## Alerts

When an open deadline crosses 14, 7, or 2 days remaining, a notification appears (see the bell icon
in the header) the next time the app loads — there's no background job, so alerts are checked on
load, not continuously. Each threshold crossed gets its own notification, so an urgent, last-minute
deadline can show all three.

## On the Dashboard

Deadlines due within 14 days also surface in the Dashboard's **Needs Attention** list, ranked above
tasks — see [Dashboard → Needs Attention](../dashboard/getting-started.md#needs-attention).
