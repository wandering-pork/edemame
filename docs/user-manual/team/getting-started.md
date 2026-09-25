# Team Members

Team Members lets you invite colleagues into your firm's shared workspace, so everyone sees the
same clients, cases, and tasks — that's how it works in **Cloud Storage** mode, covered below. In
**Local Storage** mode the page is much simpler, since your data lives in a folder on one device
and only ever has one real user — see "Local Storage mode" at the end of this page.

## Firms

When you first choose Cloud Storage (during onboarding, or when switching from Local Storage in
Settings), you create a **firm** — just a name for your workspace. You're automatically its
**Owner**. Everyone you invite afterwards joins that same firm and sees the same data.

## Roles

Every team member has an access role — what they can do — and a job title, which is just a label
(who they are) and never affects what they can do.

**Access roles:**

- **Owner** — full access, including inviting/removing members, promoting or demoting Admins and
  other Owners, renaming the firm, and deleting clients, cases, and documents. A firm always has
  at least one active Owner — the app won't let you remove or demote the last one.
- **Admin** — can do everything an Owner can day-to-day: work on clients/cases/tasks/documents,
  delete clients/cases/documents, invite people, and disable/re-enable/remove **Members**. An
  Admin can't manage other Admins or Owners (promote, demote, disable, or remove them), can't
  rename the firm, and can only invite new people as a Member.
- **Member** — can view and work on clients, cases, tasks, and documents, but can't delete
  clients, cases, or documents, and can't manage team members.

**Job title** (Registered migration agent, Lawyer, Paralegal, Case officer, Office staff, Other)
is just a label shown on the Team page and in pickers — it doesn't grant or restrict anything.
Everyone can set their own job title; Owners and Admins can also set it for a Member.

## Inviting someone

From **Team Members** (Owners and Admins — everyone else sees a read-only list):

1. Click **Invite**.
2. Enter their email address and choose a role. Admins can only invite as Member; Owners can
   invite at any role.
3. Click **Send invite**.

As you type the email, Edamame checks it against your firm and gives you a heads-up before you
even click Send:

- **Already in your firm** — they're an active member; Send is disabled, since inviting them again
  would do nothing.
- **Disabled** — they were disabled, not removed. A **Re-enable** button appears right there so you
  don't have to send a new invite at all.
- **An invite is already pending** — sending again replaces the old link with a fresh one (the old
  one stops working). This is the same as clicking **Resend** on the Pending Invites list below.

If they don't already have an Edamame account, they'll get an invite email with a link to create
one and join your firm automatically — the confirmation says "Invite email sent to their-address".
If they already have an account, the invite email doesn't go through (Edamame never reveals whether
an outside address has an account) — instead you'll see "…already has an Edamame account, so no
email was sent" with a copyable link to share with them directly (e.g. over Slack or email). Either
way, opening the link and signing in adds them to your firm — see "Joining a firm" below for what
that looks like on their side, including if they don't have an account yet at all.

Invites expire after 7 days. **Resend** on the Pending Invites list rotates the invite to a fresh
link (the old one stops working) without reopening the invite form — it's disabled if you can't
grant that invite's role (for example, an Admin can't resend an invite that was sent as Owner).
**Revoke** cancels a pending invite for good.

## Joining a firm

**If you're brand new to Edamame:** open the invite link. You'll be asked to sign in or create an
account with the same email address the invite was sent to (any other address won't be accepted —
Edamame checks). Once you're in, the invite is accepted automatically and you'll be asked to
**finish setting up your account** — your name and a password — so you can sign back in later
without needing another invite link. Then click **Go to dashboard**.

**If you already have an Edamame account:** open the invite link while signed in (with the same
email the invite was sent to) and it's accepted straight away — no extra setup needed. You don't
even need the link: next time you sign in, a banner appears at the top of the app —
"*Someone* invited you to join *Firm* as a *Role*" — with **Accept** and **Decline** buttons right
there. If you haven't created your own firm yet, any pending invitations show up above the
"Create your firm" screen too, so you don't accidentally create an empty firm instead of joining
the one you were invited to.

If you were invited but never actually finished setting up a password yet — for example you
accepted from the in-app banner instead of the emailed link, or joined before you'd been through
the "finish setting up your account" step — you'll see that same **Finish setting up your
account** screen the next time you open Edamame, no matter which page you land on. It only asks
once: after you set a name and password there, you won't see it again.

**If you're currently using Local Storage:** accepting an invite (either from the link or the
in-app banner) switches your account to Cloud Storage, since firms only work in Cloud Storage.
You'll see a warning explaining this before anything changes — your local folder is never touched,
moved, or deleted; it stays exactly where it is on this computer. Choosing **Switch to cloud and
join** accepts the invite and makes the switch; **Cancel** leaves the invite pending so you can
come back to it later, and your account stays in Local Storage untouched. You can bring your local
data into a firm of your own later from Settings (see "Switching storage modes with a team" below)
— it never gets mixed into the firm you joined.

## Changing roles

Owners can change any member's role (including making someone an Admin or another Owner). Admins
can do the same, but only for Members — the controls simply don't show up on an Admin's or Owner's
own row when you're an Admin.

## Disabling, removing, and handing over work

Owners and Admins (for Members only — same restriction as roles above) can **disable** or
**remove** a member from the member list.

- **Disable** is a pause — for someone on leave, or between contracts. They can't sign in to the
  firm, and they disappear from assignee/owner pickers, but they stay on the Team page (greyed,
  "Disabled") and keep all their history. One click on **Re-enable** brings them straight back.
- **Remove** is final. They lose access to the firm entirely and disappear from the Team page. To
  bring them back later, invite them again — since their account doesn't change, all their old
  work reconnects to them automatically once they rejoin.

Either action first checks whether the member has any open work — open tasks assigned to them, or
cases they own that aren't closed. If they do, a panel lists it and asks who should pick it up:
another active member, or **Leave unassigned**. Confirming hands everything over before the
disable/remove happens, the same way reassigning a task or case anywhere else in Edamame does (so
it shows up in the activity feed as usual). If there's nothing to hand over, you go straight to the
disable, or to Remove's confirmation step ("*Name* will lose access to this firm and be removed
from the team. Their past work keeps their name.").

## Former members

Removing someone (or someone leaving on their own — see "Leaving a firm" below) doesn't erase their
name from anything they already touched. Old task assignments, case ownership, and activity-feed
entries that pointed at them keep showing their name, tagged **(former member)** so it's clear
they're no longer on the team — the same way a disabled member's old work is tagged **(disabled)**.
Former/disabled members never appear in assignee or case-owner pickers going forward.

## Availability

Every member — including you — can set their own availability (Available / Busy / Offline) from
the dropdown at the top of Team Members. This is just a status signal for your colleagues; it
doesn't restrict what you can do — it also shows as a small coloured dot on your avatar in the Team
Dashboard's per-member columns.

## "Assigned to you" notifications

When a colleague assigns you a task, or makes you the owner of a case, you get an in-app
notification ("*Their name* assigned you a task: *Task title*" / "*Their name* made you the owner
of *Case title*") — check the bell icon in the top bar. Assigning something to yourself, or
re-saving something without changing who it's assigned to, never creates a notification. This is
cloud/firm-only — local mode has no one else to notify.

## Team Dashboard

**Team Dashboard** (Team View) shows one column per active team member with their open tasks, a
shared case board you can filter and search, and a recent activity feed. Each column's header shows
the member's avatar with their live availability dot, their real job title (e.g. "Registered
migration agent"), and their open task count. Disabled and former members drop out of these
columns — their open work should already have been reassigned when they were disabled or removed
(see "Disabling, removing, and handing over work" above) — but any case they still own, or older
activity-feed entries naming them, keep showing their name tagged **(disabled)** or **(former
member)** rather than going blank.

## Belonging to more than one firm

If you're a member of more than one firm — say, you have your own personal firm and also joined a
colleague's — the sidebar shows which one you're currently working in, right below the logo. Click
it to switch: a menu lists every firm you belong to and your role in each, with a checkmark on the
current one. Picking another firm reloads the app into that firm's clients, cases, and tasks —
nothing about your other firm is lost, it's just one click away whenever you need it.

If you only belong to one firm, the sidebar still shows its name, but there's nothing to click.

## Leaving a firm

From **Settings → Firm**, you can leave any firm you belong to. This removes your access to that
firm's clients, cases, and documents — someone else at the firm would need to invite you back if
you change your mind. Settings → Firm also shows the firm's name (renameable by Owners), your role,
your job title (which you can change any time), and how many active members the firm has.

You can't leave a firm if you're its only active Owner — make someone else an Owner first, or the
app will tell you to. After leaving, you're switched to another firm you belong to, or — if that
was your only one — sent to the "Create your firm" screen, the same place a brand-new user without
a firm lands.

## Lost access to a firm

If a firm you were part of removes you, disables your account there, or the firm itself is deleted
while you're signed out, you'll see a one-time notice the next time you sign in — "You no longer
have access to *that firm*" — near the top of the app. You're automatically moved to another firm
you still belong to, or to "Create your firm" if that was your last one. The notice only appears
once; dismissing it (or simply not seeing it again) doesn't change anything else.

## Switching storage modes with a team

If your firm has more than one active member, you can't switch from Cloud Storage to Local
Storage — Local Storage only supports one person. Remove the other members first if you really
need to move to a single-device local folder.

Switching from Local Storage to Cloud Storage copies your local folder into a firm that belongs to
you alone. If you're already a member of a shared firm (for example, you accepted a colleague's
invite), your local data goes into a new personal firm instead. It never replaces or mixes with a
shared firm's data.

## Local Storage mode

Local Storage is single-user by construction, so the Team Members page here is a plain list you
manage yourself rather than a firm directory — there's no invite flow, no roles, and nothing to
sign in with.

- **Add person** adds a name you can assign cases and tasks to. It doesn't send an email or create
  a login — it's just a label for "who's doing this," the same idea as writing someone's initials
  on a task. A banner at the top of the page reminds you of this and links to Settings, in case you
  actually want colleagues to sign in and share your data (switch to Cloud Storage there).
- The **Title** column (Partner / Lawyer / Assistant) is a cosmetic label too — it has no effect on
  what anyone can do, unlike the access roles (Owner / Admin / Member) in Cloud Storage mode.
- **Removing** a person clears them as the owner/assignee on any cases or tasks they had — those
  stay, just unassigned.
- If your linked folder was created by an older version of Edamame, you may see a notice about
  **sample team members** (Eliza Chen, Marcus Okafor, Priya Singh) left over from that earlier
  version. Click **Remove sample members** to confirm and delete them the same way as removing
  anyone else — their old work stays, just unassigned. You can also dismiss the notice without
  removing anything.
