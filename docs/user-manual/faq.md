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

## I forgot my password. How do I reset it?

On the sign-in screen, click **Send reset link** next to the password field and enter your email.
You'll get an email with a link that opens a "Set a new password" page — choose a new password
there and you'll be signed in with it right away. If the link says it has expired or was already
used, go back to the sign-in screen and request a new one; each link works once.

## I got an error about an email limit / rate limit when signing up, resetting my password, or sending an invite

Edamame's own email sender can only send a small number of emails per hour across the whole
project. If you (or your firm) triggered several sign-ups, password resets, or invite emails in a
short window, you'll see: "We couldn't send the email right now — too many emails were sent
recently. Please try again in about an hour." There's nothing wrong with your account — just wait
and try again. If it happened while an owner or admin was inviting you to a firm, ask them to copy
the invite link instead of resending the email (the invite screen shows a copyable link whenever
the email itself couldn't go out) rather than waiting on another email.

If you see a shorter message like "Please wait a few seconds and try again," that's a different,
much shorter cooldown Supabase applies between individual requests — just retry after a moment.

## I was invited to a firm but sign-up says the email limit was hit

Don't create a brand-new account — use the link from your invite email (or the in-app banner, if
you're already signed in) instead. Creating a separate account with **Create account** doesn't join
you to the firm; it just makes an unrelated personal account.

## How do I sign out?

Use **Sign Out** from the Account section in **Settings**, or the sign-out link in the sidebar.
Signing out ends your session but does not delete or disconnect your linked local folder — signing
back in and reconnecting the folder restores full access.

## Which browsers are supported?

Local-folder storage relies on the File System Access API, which is currently only available in
Chromium-based browsers (Chrome, Edge). Other browsers can't link a local folder.
