# Getting Started with the Visa Eligibility Advisor

The Visa Eligibility Advisor is a short wizard that turns what you know about a prospect into an
AI-assessed shortlist of Australian visa pathways — and, for a pathway you want to pursue, opens a
new case for them with one confirmation step in between.

## Running the wizard

1. From the sidebar, open **Visa Advisor**, or click **Visa Check** on a client's row in **Clients**
   to pre-fill their name, date of birth, and nationality.
2. **Step 1 — Prospect**: full name (required), date of birth, country of citizenship, and whether
   they're currently in Australia (and on what visa, if so).
3. **Step 2 — Intent**: primary purpose (work, study, family, permanent residence, visit) and
   intended duration of stay, plus a handful of purpose-specific questions (occupation, course
   level, relationship type, points score, etc.) that appear once you pick a purpose.
4. **Step 3 — Background**: English proficiency, and whether there are any health conditions or
   prior criminal history/visa refusals to flag.
5. Click **Get Assessment** to submit. Gemini assesses the prospect against 10 Australian visa
   subclasses (189, 190, 482, 186, 500, 820, 485, 600, 417, 491).

## Reading the report

The report opens with a **recommended pathway** hero card (the strongest-verdict subclass) and a
plain-language client summary you can walk the client through, followed by a full breakdown of
every assessed pathway.

Each pathway shows a **verdict** — Strong match, Possible, Unlikely, or Needs more info — plus the
reasons behind it and any gaps to address before lodgement. Verdicts of Strong match or Possible
show an **Open Case** button; a **Possible match** badge appears next to it as a reminder that the
match is not certain. Click **Show the other N pathways assessed** to see pathways beyond the top 3.

**Start Over** clears the report and returns to Step 1. It's disabled while a case is being opened.

The report is saved as soon as it comes back — whether or not you ever open a case from it — so
nothing is lost if you close the tab. If you do open a case from one of the pathways, that saved
assessment is linked to the case and you can reopen it later from the case page (see "Opening a
case" below).

## Opening a case

Clicking **Open Case** on a pathway opens a confirmation panel — nothing is created until you
review it and click **Confirm**. The panel shows:

- **Client** — pre-resolved from the name and date of birth you entered: either an existing client
  (matched by exact name + DOB, or the client you arrived from via **Visa Check**) or a note that a
  new client will be created. Use the dropdown under it to pick a different existing client or
  switch to "Create new client". If a client with the same name already exists but didn't match on
  DOB, quick-pick buttons for those candidates appear so you don't accidentally create a duplicate.
- **Email / Phone** — optional contact details, shown only when a new client will be created.
- **Workflow Template** — pre-selected when a template's subclass exactly matches the pathway's
  subclass. If nothing matches, you must explicitly pick a template or choose **No template
  (general case)** before you can confirm.
- **Case Title** — prefilled from the template and client name; edit it freely, and it keeps
  updating to match your client/template choice until you type in it yourself.
- **Generate AI task plan** — on by default. Turn it off to create the case without an AI-drafted
  task schedule (you can still generate one later from the case page).
- **Add a task for each gap (N)** — shown only when the pathway has gaps to address; off by
  default. Turn it on to create one fixed task per gap (due a week out, listed ahead of any
  AI-generated tasks) instead of just noting the gaps in the report. When this is on, the AI task
  plan is told about the gaps so it doesn't draft duplicate tasks for them.
- **Existing-case warning** — if the client you've chosen already has an open case for the same
  visa subclass, a warning appears with a link to it; you must explicitly check "Create anyway"
  before Confirm is enabled.

Click **Confirm** to create the case — the button shows staged progress (drafting the AI task
plan, setting up the client, finalizing the case) while it works, and the panel can't be closed
mid-creation. **Cancel** closes the panel without creating anything.

Once the case is created you're taken straight to its detail page. If the AI task plan failed to
generate, the case is still created (without tasks) and a toast lets you know you can generate them
from the case page. If you navigate away from Visa Advisor before creation finishes, a toast with a
**View case** action appears instead of navigating out from under you.

The case's notes get a short summary of the assessed pathway (not the full report) with a pointer
to **View eligibility assessment** in the case's **Case actions** menu — see
`case-manager/getting-started.md` — which opens the full report you saw here, read-only.

This assessment is general information about visa pathways, not immigration advice — eligibility is
ultimately assessed by the Department of Home Affairs at lodgement.
