# Getting Started with Templates

Templates define the standard procedure a case follows — both the steps a case manager walks
through and, for templates with **timing** set, exactly when each step's task falls due. There are
two kinds: **built-in templates** covering every visa subclass the Visa Eligibility Advisor can
assess — Skilled Independent 189, Skilled Nominated 190, TSS 482, ENS 186, Student 500, Skilled
Work Regional (Provisional) 491, Partner 820/801, Temporary Graduate 485, Visitor 600, and Working Holiday 417 —
and **custom templates** you create yourself.

## Browsing templates

Templates are shown as cards, grouped into **Built-in Templates** and **Custom Templates**. Each
card shows the visa subclass (if set), a short description, a **Typical length** line (the
shortest-to-longest span from the first step to the last, worked out from every step's timing), and
— if the template has predefined steps — a **N steps** toggle you can expand into a timeline.

Each step in the expanded timeline shows:

- a plain-words **timing line**, e.g. "2 days after Skills assessment is done · takes 28–84 days"
  or "Within 60 days of invitation received" — steps with no timing data yet show "No timing set"
  and fall back to the AI's own judgement when tasks are generated;
- a **Set by law** chip on steps whose window is fixed by legislation (the case manager can't move
  that task's date). A step with no chip uses an estimate instead — that's the default for most
  steps, so it isn't called out on every one; the agent can always change any task's date after
  it's created either way. Hover or focus (keyboard-accessible) the chip for a reminder of what it
  means;
- a **Gate** marker on steps that must be completed before the case can be considered ready to
  advance — an overdue gate step is one of the reasons a case shows as At Risk on the Case Manager
  board. Hover or focus the marker for this explanation.

If any built-in or custom template on the page hasn't had its timing signed off yet, a single note
above the grid explains: "Timing not yet reviewed by a registered agent — dates can be changed on
each task," and also recaps what **Set by law** and **Gate** mean. Each affected card additionally
shows a small **Not yet reviewed** chip (hover/focus for the same explanation) rather than
repeating the full notice on every card. The note and chip clear once someone verifies that
template's step timing is correct for current legislation and processing times.

## Creating or editing a custom template

1. From the sidebar, open **Templates** and click **New Template** (or the pencil icon on one of
   your own templates to edit it).
2. Give it a **Template Title** (e.g. "190 Visa Application — Standard") and a **Process
   Description** — the AI reads this when suggesting extra tasks for a case using this template.
3. Optionally set a **Visa Subclass**.
4. Under **Steps & Timing**, click **Add step** for each step in the procedure. For each step, set:
   - **Title** and **Description**.
   - **Counts from** — what the step's date is measured against: case start, the previous step,
     another step's start or completion, or a deadline (e.g. invitation received, nomination
     approval).
   - **Offset** — how many days after that anchor the step falls due.
   - **Takes** (optional) — a min–max day range for how long the step itself usually takes, used
     to estimate other steps that count from this one before it's actually done, and to compute the
     card's Typical length.
   - **Set by law** — check this for a legally fixed window (the agent won't be offered a quick way
     to move it).
   - **Gate** — check this if the step must be done before the case can be considered ready to
     advance.
   - Use the up/down arrows to reorder steps, or the trash icon to remove one.
5. Click **Save Template**. Saving validates the steps — a step counting from another step in a
   loop, or from a step that no longer exists, is flagged inline and blocks saving until fixed.

Your new template then appears under **Custom Templates** and is selectable from **New Case** the
same way a built-in template is. Editing an existing custom template bumps its internal version
number and resets its "reviewed by a registered agent" flag, since the timing just changed.

## Duplicating a built-in template

Built-in templates are read-only — they're maintained centrally so every user starts from the same
set of Australian visa workflows. Click the copy icon on a built-in template's card to **duplicate
it to customise**: this creates a new custom template ("… (copy)") with the same steps and timing,
which you can then edit freely.

## Deleting a template

Custom templates have a delete (trash) icon on their card. Built-in templates are marked
**System** and can't be deleted.

## How timing affects task generation

Once a template has timing set on its steps, New Case and the Visa Advisor's Open Case panel stop
asking the AI for a whole plan and instead build one task per step deterministically from that
timing — see "Generating tasks" in [Case Manager](../case-manager/getting-started.md). Templates
with no timing set yet keep the old AI-only behaviour. Either way, case-specific extra tasks can
still be suggested by AI from the case page once the plan exists.
