# Team Members

Team Members lets you invite colleagues into your firm's shared workspace, so everyone sees the
same clients, cases, and tasks. It's only available in **Cloud Storage** mode — Local Storage keeps
your data in a folder on one device, so it only ever has one user.

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
way, opening the link and signing in adds them to your firm.

Invites expire after 7 days. **Resend** on the Pending Invites list rotates the invite to a fresh
link (the old one stops working) without reopening the invite form — it's disabled if you can't
grant that invite's role (for example, an Admin can't resend an invite that was sent as Owner).
**Revoke** cancels a pending invite for good.

## Changing roles and disabling members

Owners can change any member's role (including making someone an Admin or another Owner), or
disable a member's access, from the member list. Admins can do the same, but only for Members —
the controls simply don't show up on an Admin's or Owner's own row when you're an Admin. Disabling
someone keeps their history (past cases, activity) intact but removes them from the active member
list and assignee pickers — it doesn't delete their account.

## Availability

Every member — including you — can set their own availability (Available / Busy / Offline) from
the dropdown at the top of Team Members. This is just a status signal for your colleagues; it
doesn't restrict what you can do.

## Switching storage modes with a team

If your firm has more than one active member, you can't switch from Cloud Storage to Local
Storage — Local Storage only supports one person. Remove the other members first if you really
need to move to a single-device local folder.

Switching from Local Storage to Cloud Storage copies your local folder into a firm that belongs to
you alone. If you're already a member of a shared firm (for example, you accepted a colleague's
invite), your local data goes into a new personal firm instead. It never replaces or mixes with a
shared firm's data.
