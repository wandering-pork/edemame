# Frequently Asked Questions

General questions that apply across Edamame, not specific to one module.

## Why can't I use AI features in Edamame?

AI features (task generation, document scanning, visa eligibility checks, and the case-aware
chat) may not be enabled on your current Edamame subscription. You may need to upgrade your plan
to access AI features, or check with your firm/agency's account admin that AI credits haven't run
out for the billing period.

## Where is my data stored?

Edamame in local mode doesn't store any case data in the browser — every client, case, task, and
document is saved as a real file inside a folder on your computer that you link when you first set
up the app (see **Settings → Data Storage**). This means you can point Edamame at a folder synced
by Dropbox, OneDrive, or iCloud Drive and use it across multiple machines without a server. If the
app asks you to "reconnect" to your folder, it's just requesting browser permission again — your
data hasn't moved.

## Do I need to be online to use Edamame?

You need an internet connection for AI features (task generation, passport scanning, eligibility
checks, chat) since these call out to Gemini. Viewing and editing clients, cases, and tasks against
your linked local folder does not require a live connection once the folder is linked.

## How do I sign out?

Use **Sign Out** from the Account section in **Settings**, or the sign-out link in the sidebar.
Signing out ends your session but does not delete or disconnect your linked local folder — signing
back in and reconnecting the folder restores full access.

## Which browsers are supported?

Local-folder storage relies on the File System Access API, which is currently only available in
Chromium-based browsers (Chrome, Edge). Other browsers can't link a local folder.
