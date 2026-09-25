# Step 1 · 1G — Team Experience: Implementation Plan

Source: review of the shipped 1F firm accounts (#60, #61) on 2026-09-25, against `main` @ `975419f`.
Goal: finish everything related to firms, teams and members before starting Step 2, so the team
experience isn't left half-done.

1F built the foundation: firms, roles, access rules, invite by link, and the Team page. Using it end
to end shows gaps in six areas:
- The roles mix up *what you're allowed to do* with *what your job is*.
- Joining is confusing for both new and existing users.
- Nothing checks the firm before inviting.
- A person in two firms can't switch between them.
- Removing someone leaves their work orphaned.
- The day-to-day screens still act as if there's one user.

One of these gaps is a **data-loss bug** (1G.1), and it ships first on its own.

| # | Work | Size (rough) | Depends on |
|---|------|--------------|-----------|
| 1G.1 | Fix: switching Local → Cloud can wipe a shared firm | S · ½ day | — |
| 1G.2 | Roles: Owner / Admin / Member + job title | M · 2 days | — |
| 1G.3 | Invite: check the firm first, one pending invite per person | S · 1 day | 1G.2 |
| 1G.4 | Joining a firm: new users, existing users, in-app invitations | M · 3 days | 1G.3 |
| 1G.5 | Several firms: firm name, switcher, lost access, Settings → Firm | M · 2–3 days | 1G.4 |
| 1G.6 | Member lifecycle: disable, remove, reassign work, former members | M · 2 days | 1G.5 |
| 1G.7 | Working as a team: "mine" views, assignment notifications | M · 2 days | 1G.6 |
| 1G.8 | Email provider: send our own emails (**waiting on a domain** — see below) | M · 2 days + owner setup | 1G.4, a domain |

Sizes are guesses for ordering, not estimates. Each row is one PR.

**Migrations.** 1G.2 has its own migration (`20260927000000_firm_roles.sql`), because it changes
the role values that every access rule checks. It must be applied *together with* the 1G.2
deploy. 1G.3–1G.7 share one more migration (`20260927000100_team_experience.sql`), applied before
1G.3 deploys. Every migration is dry-run in a rolled-back transaction first, as before.

---

## Cross-cutting rules

- Same rules as `step-1-foundations.md`: RLS is the real enforcement and UI checks only hide
  things. No `window.prompt`/`confirm` in new UI; use inline confirms. Update `docs/user-manual/`
  (team pages) in the same PR. Dry-run migrations, then run `get_advisors`. New functions grant
  `EXECUTE` to `authenticated` only, never `anon` (see #61).
- **Never look outside your own firm.** No screen or endpoint may reveal whether an email address
  has an Edamame account, unless that person is already in the caller's firm or has invited the
  caller. Otherwise any owner could probe who uses the product.
- **Matching an invite to a person by email requires a confirmed email** (`auth.users.email_confirmed_at is not null`).
  Otherwise someone could sign up with a colleague's address and pick up their invitation.

---

## 1G.1 · Fix: switching Local → Cloud can wipe a shared firm (do first)

**Bug.** `pages/Settings.tsx`'s `handleSwitchToCloud()` takes `profile.currentFirmId` as the
destination, then runs `clearAll()` on that firm before copying the local folder in. A local-mode
user whose `current_firm_id` points at a *shared* firm (easiest route: they accept an invite while
in local mode, and `api/accept-invite.ts` sets `current_firm_id`) would then delete everything that
firm's access rules let them delete: tasks, notes, checklists, deadlines, and, as an agent, clients,
cases and documents.

**Fix**
- The destination is only ever a firm where the user is the **sole active member and an owner**.
  Otherwise, create a new personal firm (as the code already does when there's no firm) and use
  that.
- `repositories/migrate.ts`'s `clearAll()` gains a guard. Before clearing cloud repositories, it
  fetches the firm's active member count and refuses when it's more than 1. This is a second
  safety net, in case another caller ever makes the same mistake.
- Unit test: a local → cloud switch with `currentFirmId` set to a two-member firm creates a new
  firm and never calls `clearAll` on the shared one.

No migration. Ship as a hotfix PR before the rest of 1G.

---

## 1G.2 · Roles: Owner / Admin / Member + job title

**Today.** The three roles (`owner`, `agent`, `paralegal`) mix two different things. "Owner" is a
permission. "Agent" and "paralegal" are job titles that also carry permissions (paralegals can't
delete). So there's no way to let a trusted office manager invite people without making them an
owner, and a registered agent who runs the firm has to be labelled "Owner" rather than "Agent".
This replaces Step 1 Decision #4 ("no `admin` role for MVP"). That decision's other half, **no
platform-level access for the app operator**, is unchanged: "admin" here means an admin *of one
firm*.

**Model (Trello-style, confirmed, see Decision 5).** Two separate fields:

**1. Access role (what you can do):**

| Can… | Owner | Admin | Member |
|---|:-:|:-:|:-:|
| Work on clients, cases, tasks, documents, deadlines | ✓ | ✓ | ✓ |
| Delete clients, cases, documents | ✓ | ✓ | — |
| Invite people, resend or revoke invites | ✓ | ✓ | — |
| Disable, re-enable or remove Members | ✓ | ✓ | — |
| Make someone an Admin, remove or demote Admins | ✓ | — | — |
| Make someone an Owner, rename the firm | ✓ | — | — |
| Delete activity and usage history (storage-mode switch) | ✓ | — | — |

- A firm always keeps at least one active Owner (the existing trigger, updated for the new
  values).
- An Admin can manage Members but not other Admins or Owners. That keeps a demoted admin from
  locking the owner out.
- Members can't delete clients, cases or documents. Closing a case is the normal path. This keeps
  today's paralegal restriction and extends it to every non-admin. *(Decision 5b, confirmed.)*

**2. Job title (who you are, display only, never used for permissions).** Chosen from a short
list: *Registered migration agent*, *Lawyer*, *Paralegal*, *Case officer*, *Office staff*,
*Other*. It shows on the Team page, in the member directory and in pickers. It replaces the cosmetic
`TeamMember.role` mapping in `lib/firmDirectory.ts`. A registration number (MARN) field can join it
later.

**Migration (`20260927000000_firm_roles.sql`)**
- `firm_members.role` check becomes `('owner', 'admin', 'member')`. `firm_invites.role` gets the
  same change.
- New nullable column `firm_members.job_title text`, checked against the list.
- Existing rows: `owner → owner`, `agent → member` with job title *Registered migration agent*,
  `paralegal → member` with job title *Paralegal*. Pending invites get the same role mapping.
- Policies and functions that check roles by name are updated:
  - clients/cases/documents delete: `['owner','agent']` → `['owner','admin']`;
  - storage delete: the same;
  - `firm_members_guard()`: owners change anything; admins change Members only; everyone keeps
    changing their own availability and job title;
  - "owners manage members" / "owners remove members" / "owners read/revoke invites" →
    owner **or** admin, with the Admin-can't-touch-Admins rule enforced in the trigger.
- The deploy and the migration go together. Old app code sends `agent`/`paralegal`, which the new
  check rejects, so apply the migration and merge 1G.2 back to back, the same way as 1F.

**App**
- `types.ts` `FirmRole = 'owner' | 'admin' | 'member'`, plus `FirmJobTitle`.
- `lib/firmDirectory.ts`: `canDeleteFirmData(role)` → owner/admin. `canManageMembers(role)` →
  owner/admin. A new `canManageAdmins(role)` → owner only.
- `api/invite-member.ts`: the caller must be owner **or admin**; admins can only invite as Member.
- Team page: a role dropdown (offering only what the caller may grant), a job-title dropdown, and
  role badges.

---

## 1G.3 · Invite: check the firm first

**Today.** `api/invite-member.ts` creates a new invite for any email address: someone already in
the firm, a disabled member, or an address with a pending invite. "Resend" in the UI just opens the
form again and makes a second invite.

**Server (`api/invite-member.ts`)**, before creating anything, checks the address against the
caller's own firm only:

| The email belongs to… | Response | UI shows |
|---|---|---|
| An active member | `409 { code: 'already_member' }` | "Already in your firm" (no invite) |
| A disabled member | `409 { code: 'disabled_member', userId }` | **Re-enable** button (1G.6) |
| An address with a pending invite | Revoke the old invite and create a new token (this *is* resend) | "Invite re-sent" + Copy link |
| Anyone else | Create the invite as today | As today |

The lookup is a new security-definer SQL function, `firm_email_status(f uuid, email text)`. It
returns `'active' | 'disabled' | 'pending' | 'none'` and raises unless the caller is an owner or
admin of `f`. It only ever looks inside firm `f`. A person who was **removed** has no membership
row any more (1G.6), so they come back as `'none'` and are simply invited again.

**UI (`components/team/FirmTeamMembers.tsx`)**
- As the user types, the invite form checks the address against the already-loaded `members` and
  `pendingInvites` and shows the same hints straight away. The server check stays the authority.
- The "Resend" button calls the endpoint directly (rotating the token) instead of reopening the
  form.
- The result message says plainly what happened: "Email sent", or for an existing account,
  "They already have an Edamame account — they'll see the invitation when they sign in (1G.4), or
  send them this link".

**Migration (`20260927000100_team_experience.sql`, part 1)**
- `firm_invites.declined_at timestamptz`.
- A partial unique index: one open invite per firm per address,
  `unique (firm_id, lower(email)) where accepted_at is null and revoked_at is null and declined_at is null`.
  Revoke any existing duplicates first; the dry run checks for them.
- `firm_email_status()`, as above.

---

## 1G.4 · Joining a firm

**Today.**
- **New user:** Supabase's invite email signs them in, `/invite/:token` accepts, and then they're
  sent to `/onboarding` to choose a storage mode, which makes no sense for someone joining a firm.
  They're **never asked to set a password**, so once that session ends they can't sign back in
  except through "Forgot password". That doesn't work either: `resetPasswordForEmail()` has no
  `redirectTo`, and the app has no page to set a new password.
- **Existing user:** no email is sent. The inviter has to copy the link and send it themselves,
  and the UI doesn't explain why.
- **Existing local-mode user:** accepting sets `current_firm_id`, but they stay in local mode, so
  the firm never appears (and it sets up the 1G.1 bug).

**Changes**
1. **Finish your account (new users).** `/invite/:token` detects a first-time invited user. The
   server returns `needsPassword: true` when the auth user has `invited_at` set and
   `user_metadata.password_set` isn't true. The page then shows **full name + password** (and
   optionally job title) before "Go to dashboard", and calls
   `supabase.auth.updateUser({ password, data: { full_name, password_set: true } })`. The name
   fixes the member directory showing an email address in place of a name.
2. **No onboarding for invitees.** `api/accept-invite.ts` inserts the missing `profiles` row
   (`storage_mode: 'cloud'`, `current_firm_id`) when there isn't one, instead of failing silently
   on a PATCH to a row that doesn't exist. A profile row with a storage mode is what marks
   onboarding as done.
3. **Local-mode users get a warning before anything changes.** `/invite/:token` (and the in-app
   invitation's Accept, item 4) doesn't accept straight away for a local-mode user. It first shows
   an inline warning:

   > **Firms only work with cloud storage.** Joining *Smith Migration* will switch your account
   > to cloud storage now. Your local folder isn't changed, moved or deleted — it stays on this
   > computer as it is.
   >
   > **Switch to cloud and join** · Cancel

   Only on **Switch to cloud and join** does it accept the invite and set
   `storage_mode: 'cloud'`. Cancel leaves everything as it was, and the invite stays pending so
   they can come back to it. Their local data stays in the folder. They can bring it into a
   personal firm later through Settings, which after 1G.1 never targets a shared firm.
   *(Decision 1, confirmed.)*
4. **In-app invitations (existing users).** New security-definer RPCs, matched by the caller's
   confirmed email (`auth.jwt()->>'email'` plus an `email_confirmed_at` check):
   - `my_pending_invites()` returns firm name, inviter name, role and expiry. It never returns the
     token hash.
   - `accept_invite(invite_id)` does the same checks as `api/accept-invite.ts` (not expired,
     revoked, accepted or declined; email matches) in **one transaction**. That also closes the
     "not atomic" gap noted in `accept-invite.ts`.
   - `decline_invite(invite_id)` sets `declined_at`.

   The app shell shows a banner: "*Jane Smith invited you to join Smith Migration as a Member* —
   Accept / Decline". `CreateFirmGate` shows pending invitations *before* "Create your firm", so an
   invited person doesn't make an empty firm by mistake. This way an existing user needs neither
   an email nor a copied link until 1G.8 adds real emails. The link still works as a fallback.
   *(Decision 2, confirmed.)*
5. **Refactor, no behaviour change:** `api/accept-invite.ts` (the token path) calls the same
   transactional logic through the service role, so both paths share one implementation.
6. **Password reset (app-wide, needed by invitees).** `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`.
   A new public `/reset-password` page handles Supabase's `PASSWORD_RECOVERY` auth event and sets
   the new password with `updateUser`.
7. **Invite email wording.** `invite-member.ts` passes `firm_name` and `inviter_name` in the invite's
   `data`. **Manual step for the owner:** edit Supabase → Auth → Email Templates → *Invite user* to
   say "{{ .Data.inviter_name }} invited you to join {{ .Data.firm_name }} on Edamame". The template
   text goes in the PR description.

**Migration (part 2):** `my_pending_invites()`, `accept_invite()`, `decline_invite()`.

---

## 1G.5 · Several firms: firm name, switcher, lost access

**Today.** Every existing user owns a personal firm (backfill or `create_firm`). Accepting an
invite points `current_firm_id` at the new firm, and there's **no way back**: the personal firm's
cases become unreachable. The UI never shows which firm you're in. A disabled member's
`current_firm_id` still points at the firm, so they get a failed load and end up on "Create your
firm" with no explanation.

**Changes**
- **`FirmContext`** also loads `memberships`: the user's active `firm_members` rows embedded with
  `firms(name)` and their role (existing RLS already allows this; no new RPC). It exposes
  `switchFirm(firmId)`, which does `updateProfile({ currentFirmId })` and then
  `window.location.reload()`. That's the same pattern as the storage-mode switch, since cloud
  repositories are built for one firm.
- **Sidebar** shows the current firm name under the logo, with a switcher menu when there's more
  than one membership. The user's role shows next to each firm.
- **Lost access.** If `current_firm_id` isn't among the active memberships (disabled, removed, or
  firm deleted), `FirmContext` falls back to another active membership. It shows a one-time notice,
  "You no longer have access to *X*", stored in `sessionStorage` so it's shown only once. With no
  memberships left, it goes to `CreateFirmGate`, which also lists pending invitations (1G.4).
- **Settings → Firm** (cloud mode only), a new section:
  - The firm name. Owners can rename it.
  - Your role, your job title (editable), and the member count, with a link to the Team page.
  - **Leave firm.** A new `leave_firm(f)` RPC deletes the caller's own membership. The
    last-owner rule still applies, with a friendly message ("Make someone else an owner first").
    After leaving, switch to another membership or go to `CreateFirmGate`.

**Migration (part 3):** `leave_firm(f uuid)`, security definer, which enforces the last-owner rule
the same way `firm_members_guard()` does.

*Decision 3, confirmed: moving a personal firm's cases into a shared firm is not part of 1G. With
the switcher nothing is lost; it's one click away.*

---

## 1G.6 · Member lifecycle: disable, remove, reassign

**Today.** Disabling a member removes them from every picker (`mapFirmDirectoryToTeamMembers`
filters out non-active members). Their open tasks and the cases they own keep pointing at them, so
those show without a name or avatar, and nobody is prompted to pick them up. There's no "remove",
only "disable".

**Two different actions (Decision 4, confirmed: removing deletes):**
- **Disable** is a pause, for someone on leave or not yet departed. They keep their place on the
  Team page (greyed, "Disabled"), can't sign in to the firm, and can be **re-enabled** with one
  click.
- **Remove** is final. The membership row is **deleted**, so they disappear from the Team page
  entirely. To bring them back, invite them again. Because the user id doesn't change, their old
  work reconnects to them automatically.

**Changes**
- **Hand over their work first.** Disable and Remove both open an inline panel that lists the
  member's open tasks and the cases they own, and asks who should take them: another active
  member, or "leave unassigned". It bulk-updates through the existing repositories
  (`handleUpdateTask` / `handleUpdateCase`, so activity events are written as usual).
- **Remove** asks for an inline confirm ("*Jane Smith* will lose access to this firm and be
  removed from the team. Their past work keeps their name.") and deletes the membership through
  the existing delete policy, which 1G.2 extends to admins.
- **Past work keeps names.** Deleting the row would otherwise lose the name behind old
  assignments, case owners and activity-feed actors, since names live in `auth.users`, which the
  app can't read. So removal first copies the name into a small new table, `firm_former_members`
  (`firm_id`, `user_id`, `full_name`, `email`, `removed_at`, `removed_by`). A new security-definer
  RPC, `remove_member(f, user_id)`, does both in one transaction (and enforces the last-owner and
  admin rules). `FirmContext` loads these names for *display*: old items show "Jane Smith (former
  member)" instead of blank. Pickers only ever list active members. Re-inviting the same person
  deletes their `firm_former_members` row on accept.
- **Re-enable** for disabled members. 1G.3's `disabled_member` response links here.
- **Friendlier errors.** Trigger errors ("A firm must keep at least one active owner", "Only a
  firm owner can…") are mapped to plain inline messages, not a raw Postgres string.

**Migration (part 4):** the `firm_former_members` table (RLS: members of the firm can read it,
with no direct writes) and `remove_member()`.

---

## 1G.7 · Working as a team, day to day

**Today.** Everyone in a firm sees everyone's work mixed together. The Dashboard board has a
Mine / Team / All scope, but **Needs Attention** and the overdue / due-today stats count the whole
firm's tasks. Case Manager can't show only "my cases". Assigning someone a task doesn't tell them.

**Changes**
- **Needs Attention and the stats** follow the Dashboard's scope, "Mine" by default: tasks assigned
  to me, or unassigned. The card's rule text says which scope it's showing.
- **Case Manager** gains a "My cases / All cases" toggle (by `caseOwner`). It defaults to All for
  owners and admins, and to Mine for members. It's hidden in local mode.
- **"Assigned to you" notifications (in-app).** When someone *else* assigns you a task or makes
  you a case's owner, you get a notification. `notifications` is per-user under RLS, so this goes
  through a new security-definer RPC, `notify_member(f, user_id, payload)`. It checks that both
  the caller and the recipient are active members of `f`, and it's deduplicated by a deterministic
  id (`assign:{taskId|caseId}:{userId}`). It's called from `App.tsx`'s `handleUpdateTask` /
  `handleUpdateCase` when `assignedTo` / `caseOwner` changes to someone other than the current
  user. The email version comes with 1G.8.
- **Team Dashboard.** Check that it uses the real directory, with availability dots, job titles
  and workload per member, and that former and disabled members are left out of workload but still
  named on the cases they owned.

**Migration (part 5):** `notify_member()`.

---

## 1G.8 · Email provider: send our own emails

**Why.** Today the only emails come from Supabase Auth's built-in sender, and it can't send
everything the team experience needs:
- It **can't email an existing user about an invite**. Supabase refuses to "invite" an address
  that's already registered, which is why 1G.4 falls back to in-app invitations and a copied link.
- It can't send anything that isn't an auth email: "you were added to a firm", "you were assigned
  a task", and later deadline alerts and client document requests (Step 3).
- Supabase's built-in sender is meant for development. It has a very low hourly rate limit and,
  on current plans, may only deliver to the project team's own addresses. **This may already stop
  invites and password resets from reaching real users.** The testers should check early whether
  an invite to an outside address arrives. If it doesn't, move 1G.8 up to straight after 1G.4.

**Setup (Resend confirmed; waiting on a domain):**
- **Provider: Resend** (simple API, a free tier of about 3,000 emails a month, good deliverability).
  Postmark and Amazon SES are alternatives.
- **Owner's setup (by hand, secrets aren't entered by an AI agent):**
  1. Choose a sending domain. That needs **a domain we own** (e.g. `edamame.com.au`);
     `edemame.vercel.app` can't be used to send mail.
  2. Create a Resend account, add the domain, and add the DNS records it gives (SPF, DKIM, and a
     DMARC record).
  3. Add `RESEND_API_KEY` to Vercel (Production + Preview) and `src/.env.local`.
  4. In Supabase → Auth → SMTP Settings, point Supabase's own auth emails (sign-up confirmation,
     invites, password reset) at Resend's SMTP, so every email comes from the same domain without
     the built-in limits.
- **Code:**
  - `api/_lib/email.ts`: one `sendEmail({ to, subject, html, text })` wrapper around Resend's
    REST API (plain `fetch`, no new dependency, matching `api/_lib/github.ts`). It's server-only,
    reads `RESEND_API_KEY`, and fails soft: if the key isn't set, it logs and returns
    `sent: false`, so the in-app path still works.
  - Templates, plain and on-brand, in `api/_lib/emailTemplates.ts`: *Invitation (existing user)*,
    *You've been added to a firm*, *Assigned to you*.
  - `api/invite-member.ts`: for an address that's already registered, send our own invitation
    email instead of only returning a link.
  - "Assigned to you": a new `api/notify-assignment.ts` endpoint, called after `notify_member()`,
    sends the email. Later: a per-user "Email me about…" preference in Settings.
- **Not in 1G.8:** deadline-alert emails, client emails and SMS. Those are Step 3's messaging work,
  which builds on this same `sendEmail()`.

---

## Decisions

1. ✅ **Confirmed 2026-09-25:** joining a firm from local mode switches you to cloud, after a
   warning. The user sees "Firms only work with cloud storage — we'll switch you to cloud now" and
   has to confirm (see 1G.4 item 3). Their local folder is left untouched.
2. ✅ **Confirmed 2026-09-25:** existing users are invited in-app plus a copyable link for now. Our
   own email provider comes in 1G.8, which then emails existing users too.
3. ✅ **Confirmed 2026-09-25:** moving a personal firm's cases into a shared firm is **not** part of
   1G.
4. ✅ **Confirmed 2026-09-25:** **remove deletes** the membership. Disable stays as a separate,
   reversible pause. Names on past work are kept through `firm_former_members` (1G.6).
5. ✅ **Confirmed 2026-09-25, roles (1G.2):**
   - a. Access roles **Owner / Admin / Member**, plus a display-only **job title**, replace
     `owner / agent / paralegal`.
   - b. **Only Owners and Admins** can delete clients, cases and documents. Members can't; closing
     a case is the normal path.
   - c. **Admins** invite and manage Members, but not other Admins or Owners.
6. ✅ **Confirmed 2026-09-25, email provider (1G.8): Resend.** **Blocked on a domain:** we don't own
   one yet, and Resend can't send to other people's addresses without a verified domain (its
   shared test sender only delivers to the account owner). 1G.8 waits until a domain is bought
   and set up. Until then, invitations work in-app plus copied links (1G.4). If testers find that
   Supabase's built-in email isn't delivering invites or password resets, getting the domain
   becomes urgent.

## Not in 1G

- Live updates (Supabase Realtime). Refetch on focus stays; see `step-1-foundations.md`.
- Two-factor login, SSO: Step 3 (privacy and security).
- Seat-based billing: Step 3 (fees). Usage events already record `firmId`.
- Platform-level access for the app operator: still excluded by Step 1 Decision #4.
- Moving data between firms (Decision 3).
- Deadline, client and SMS messages: Step 3 (messaging), built on 1G.8's `sendEmail()`.

## Rollout

1. 1G.1 hotfix: merge and deploy. No migration.
2. 1G.2: dry-run `20260927000000_firm_roles.sql`, then apply it and merge 1G.2 back to back.
3. Dry-run and apply `20260927000100_team_experience.sql`, then merge 1G.3. Its later parts'
   functions ship in the same migration, so there's one apply.
4. 1G.4 → 1G.7 in order, each with its manual test list. The team testers use two accounts: an
   owner, plus an invitee who is (a) brand new, and (b) an existing cloud user with their own firm.
   **Check early that invite emails reach an outside address** (see 1G.8).
5. 1G.8 once the owner has the domain and Resend set up.
6. Owner's manual steps: the Supabase *Invite user* email template (1G.4), turning on leaked-password
   protection (from Step 1), and the email provider setup (1G.8).
