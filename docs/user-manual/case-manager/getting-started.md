# Getting Started with Case Manager

Case Manager is where you track a client's visa application from intake through to lodgement and
decision.

## Creating a case

1. From the sidebar, open **Cases** and click **New Case**.
2. Select an existing client or create a new one, then choose a visa subclass and a workflow
   template (e.g. Student 500, Skilled 190, Partner 820/801).
3. Set the application start date. This is used to calculate due dates for every generated task.

## Landing on the Workspace tab

Every time you open a case, you land on the **Workspace** tab. This is the AI-assisted entry point
for the case — it doesn't hold case data itself, it's a launcher for the case's Views (Tasks,
Document Checklist, Case Files, Notes) and Tools (Document Checklist Generator, Auto-Packager, the
820 Bundle Builder, and LMT Evidence where applicable — see
[LMT Evidence and the Nomination Window](./lmt-evidence.md)). See
[Workspace, tabs, and pinning](./workspace-and-tabs.md) for how the Workspace tab, tab opening, and
tab pinning work, and [Document Checklist](./document-checklist.md) for the renamed/upgraded
Documents tab and the Document Checklist Generator tool.

The left-hand rail on a case also has a compact **Case Files** panel — every file attached to the
case, which you can drag directly onto a Document Checklist item to link it (see Document Checklist
doc above). For a bigger, easier-to-work-with view of the same files — upload, preview, download,
and delete, with full-size thumbnails rather than the rail's condensed list — click **Open in tab**
next to the rail's Case Files heading, or open **Case Files** from the Workspace tab's View section.

When you drop files into any Case Files upload area, they wait in a short list until you give each
one a **Document Type** — this is required, and nothing is uploaded until every file has one. Type
to search the list by code or description; pick `OTH — Other` if nothing fits. The document type is
what lets a file link itself to a Document Checklist item automatically — see
[Configurations & Document Types](./configurations.md).

## Generating tasks with AI

1. Open the case and click **Generate Tasks**.
2. The agent reads the case description, the selected workflow template's steps, and the start
   date, then produces a chronological task list with realistic due dates based on typical
   Australian processing timeframes.
3. Review the generated tasks — you can edit titles, descriptions, and due dates, or delete tasks
   that don't apply before saving them to the case.

## Using the case-aware chat (Focus Mode Agent)

Every case has a chat panel on the right-hand side of Case Details. This agent already knows the
case's client, visa subclass, status, task progress, and document checklist — you don't need to
repeat that context.

You can ask it to:
- Answer questions about visa requirements, processes, and timelines.
- Draft correspondence or a document checklist for the client.
- Summarise the case's eligibility position or flag risks.
- Explain how to use any Edamame feature — it answers "how do I…" questions from this User Manual.

Use **New** to start a fresh conversation thread for the case, and switch between existing threads
using the tabs above the message list.

## Reporting a bug or requesting a feature from the chat

If you describe something that doesn't match how Edamame is documented to work, or ask for a
capability that doesn't exist yet, the agent will check whether it's already been reported. If it
finds a match, it tells you and links the existing GitHub issue instead of creating a duplicate. If
it's new, it drafts a GitHub issue and shows it in the chat with **Confirm** and **Cancel** buttons
— nothing is filed until you click **Confirm**. Each conversation thread can file up to 3 issues
this way (also capped at 5 per day per account, enforced server-side); after that, file further
reports manually. This only happens in the Case Manager Focus Mode chat, not elsewhere in the app.

**Filing an issue posts it to the public `wandering-pork/edemame` GitHub repository** — visible to
anyone on the internet. The draft card says so before you confirm; review the title and body for
any client-identifying details first. The app also strips obvious patterns (emails, phone numbers,
passport-number-like strings) before filing as a backstop, but this is not a substitute for
checking the draft yourself.
