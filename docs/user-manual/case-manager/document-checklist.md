# Document Checklist & the Document Checklist Generator

The **Document Checklist** tab (opened as a View from the Workspace tab — this is the renamed and
upgraded version of the old "Documents" tab) tracks every document a case needs, grouped into
collapsible categories such as "482 — Sponsor & Nomination Documents" or "820/801 — Relationship
Evidence: Financial Aspects".

## Generating a checklist

Open the **Document Checklist Generator** tool from the Workspace tab's Tools section:

1. **Select categories** — pick one or more document categories relevant to the case (categories
   are the per-visa-subclass subsections of the system default checklist, e.g. "186 — Applicant:
   Skills & Work Experience"). Click **Next**.
2. **Review the generated checklist** — the generator merges the system default checklist for your
   selected categories with any steps from the case's workflow template (your firm's customisation
   on top of the system default), skipping duplicates. Each generated item arrives with a
   **Document Type** already suggested from your firm's list (see
   [Configurations & Document Types](./configurations.md)); change any that were guessed wrong
   using the picker on the item's row.
   - Use the **+ Add** button on a category header to add a missing item to *that* category,
     giving it a document name and a document type.
   - Use the **Additional Documents** box at the bottom for anything that doesn't belong to one of
     the generated categories.
3. Click **Generate Checklist** — the items are added to the Document Checklist tab, each category
   rendered as its own collapsible section.

You can also add a single item directly from the Document Checklist tab at any time with **Add
item**, without going through the generator.

## Document Type on a checklist item

Each item shows its Document Type as a short code badge next to its name, with a picker on the row
for changing it. You can change it at any time, including on items the generator created. Changing
it immediately re-checks whether a Case File should link to that item.

Leaving an item without a Document Type is allowed — it just means the item can only ever be linked
by hand.

## Linking a file to a checklist item

There are three ways a file ends up on a checklist item.

### Auto-link

If a Case File's Document Type matches a checklist item's Document Type, and that type has
**Auto-link** ticked in Case Manager → Configurations, the file links itself and the item flips to
**Linked**. If several files share the same type, the **most recently uploaded** one wins.

Auto-link is a check that runs when you open the Document Checklist tab — plus whenever you press
**Refresh** at the top of the tab, and immediately after you change a single item's Document Type.
It never touches items marked **Verified** or **Waived**, and it leaves a link you made by hand
alone unless that link has gone stale (the file was deleted, or its Document Type no longer
matches).

An auto-link is only ever an offer: use **×** to unlink and pick a different file yourself.

### Dragging from the left rail

Every case's files are listed in the **Case Files** panel on the left-hand rail. Drag the file you
want onto the checklist item you want to link it to — items with no file show the hint *"Drag a
file from Case Files to link it here"*. Dropping the file sets it as the item's linked file and
sets the status to **Linked**.

### Side by side with Case Files

Click **Case Files** at the top of the Document Checklist tab to show the case's files in a panel
beside the checklist, so you can drag across without switching tabs. The panel includes the upload
dropzone, so you can add a file and link it in one pass. Click the button again to hide it.

Use the **×** next to a linked file to unlink it (the file itself stays in Case Files), or click the
file name to preview it.

## Status values

Each checklist item has a status dropdown: **Pending**, **Linked** (a file has been attached),
**Verified** (reviewed and confirmed by the agent), or **Waived** (not required for this
applicant's circumstances). Verified and Waived are treated as human decisions — auto-link will
never change an item in either state.
