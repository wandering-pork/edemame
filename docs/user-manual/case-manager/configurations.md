# Case Manager Configurations & Document Types

**Configurations** is the Case Manager's own settings area, separate from the global **Settings**
page in the sidebar (which covers your account, theme, and where your data is stored). Open it with
the **Configurations** button at the top-right of the Cases list, next to **New Case**.

The panel has a list of setting types on the left and the selected setting's detail on the right.
Today it holds one setting type: **Document Type**.

## What a Document Type is

A Document Type is a short code plus a description — for example `PPT — Passport (all pages)` or
`AFPCHK — AFP National Police Check`. It's the shared vocabulary your firm uses to say *what kind of
document this is*, and it's what makes files and checklist items able to find each other:

- Every file you upload to **Case Files** is tagged with a Document Type (this is required).
- Every **Document Checklist** item can carry a Document Type too.
- When both sides agree, and the type has **Auto-link** turned on, the file links itself to the
  checklist item — no dragging required.

## The list

The list is long (roughly ninety types), so it's grouped by category — Identity, Civil Status,
Sponsor & Employer, Skills & Qualifications, Health & Character, State Nomination & Points, the
partner-visa evidence groups, Children & Dependants, Secondary Applicants, and Other. Type in the
search box to filter by code, description, or category as you type; collapse a category header you
don't need.

Types shipped with Edamame show a **padlock**: they can't be renamed, recoded, or deleted, so a
code always means the same thing across every case and every colleague. `OTH — Other` is the
deliberate escape hatch for anything that doesn't fit a specific type.

## Adding your own type

Click **Add type**, then give it:

- a **code** — up to 6 characters, uppercase letters and digits only, and unique within your firm;
- a **description** — up to 100 characters;
- a **category** to file it under.

Firm-added types can be deleted later (the trash icon). Deleting one doesn't touch any file or
checklist item already tagged with it — those keep showing the code, highlighted in amber to say
it's no longer configured.

## The Auto-link column

Every row has an **Auto-link** checkbox on the right. Hovering the column header explains it:

> When ticked, a Case File tagged with this Document Type will automatically link itself to any
> matching Document Checklist item once uploaded.

Auto-link is **off by default on every type**, including the ones shipped with Edamame — you decide
which types are safe to link without a human looking first. A firm might happily auto-link `PSP`
police checks while insisting on reviewing `PHOTO` submissions by hand.

You can tick or untick Auto-link on any row, including the padlocked system types — the lock only
protects the code and description, not this preference.

### When a change takes effect

Turning Auto-link on or off doesn't rewrite existing checklists there and then. It applies the next
time someone opens (or presses **Refresh** on) a case's Document Checklist tab. Items already marked
**Verified** or **Waived** are never changed by auto-link at all — those record a decision a person
made, and a later upload or settings change must not quietly overwrite it.
