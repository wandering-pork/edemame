# Public Visa Advisor Trial: Implementation Plan

Source: Trello card "Public Visa Advisor trial: teaser results for non-subscribers" (Edamame
Board → **In Progress**, https://trello.com/c/jJDnWofd) and GitHub #46. First written 2026-11-23;
**revised 2026-11-26 against `main` @ `7ab4c05`** (after #94 shipped VA.0), and again the same day
with the owner's answers: both audiences, the trial lives in the homepage's Visa Advisor section as
"Try out our Visa Advisor", and the UX must feel like one continuous piece of the homepage.

**Goal.** Let homepage visitors try the Visa Advisor without signing up. They see only the single
best-fit visa subclass and its verdict. The full report (all 10 pathways, reasons, gaps) needs an
account. It's meant as a top-of-funnel conversion lever.

| # | Work | Size (rough) | Migration | Status |
|---|------|--------------|-----------|--------|
| VA.0 | Require sign-in on the three AI endpoints | S | No | **Done** (#94, merged 2026-11-26) |
| VA.1 | Public trial endpoint `api/try-eligibility.ts` with abuse protection | M · 2 days | **Yes** | Not started |
| VA.2a | Extract the wizard out of `VisaAdvisor.tsx`, styleable (pure refactor) | S · 1 day | No | Not started |
| VA.2b | "Try out our Visa Advisor" on the homepage: sheet, teaser, sign-up, carry-over | M · 3 days | No | Not started |
| VA.3 | Measure it: starts, completions, limit hits, conversions, referrals, by audience | S · ½ day | Yes (columns) | Not started |
| VA.4 | Agency directory for applicants (opt-in firm listings) | M · 3 days | **Yes** | Needs decisions (see VA.4) |
| VA.5 | Applicant full report behind a one-time payment | L · 1 week+ | **Yes** | Needs decisions + legal review (see VA.5) |

**Design:** https://claude.ai/artifact/QWpitkkXm2dydM3eV6a4hd (canvas: entry point, click-through
prototype, agent path, applicant path, error states, phone, and the app after sign-up).

Each row is one PR, shipped in order. VA.1 and VA.2a don't depend on each other and can be built
in parallel.

**Launch is separate from merge.** Everything ships behind `TRY_ADVISOR_ENABLED` (server) and
`VITE_TRY_ADVISOR_ENABLED` (hides the homepage button), both off unless set to `true`, so the code
can merge before the legal review (Decision 5). Launching means setting both in Vercel Production.

---

## Card's open questions → answers

| Card question | Answer |
|---|---|
| No subscription/entitlement exists: teaser-only for now? | Yes. Anonymous visitors get the teaser, every signed-in user gets the full report. One `entitlementFor(user)` seam for billing later (Decision 2). |
| Persist anonymous inputs or stateless? | Stateless on the server. The browser keeps the answers (no name, no DOB) in `localStorage` for 24 h, only to carry them over after sign-up (Decision 6). |
| Rate limiting / abuse for an unauthenticated Gemini endpoint | Turnstile + 3/IP/day + 300/day global cap, hashed IPs, kill switch (VA.1). |
| Route and upsell → signup | The homepage's Visa Advisor section, in a sheet. `/try/visa-advisor` is a deep link that opens it. Sign-up happens in the same sheet (VA.2b). |

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | **Who is the trial for?** | **Both, with different endings** (owner, 2026-11-26). Agents and lawyers see the product and sign up. Applicants get a free result showing what suits them, can pay once for the full report (VA.5), and can find agencies and lawyers who use Edamame in a directory (VA.4). The first question is "Who is this check for? *A client* · *Myself*": it switches the wording ("Your client's age" / "Your age"), the result and the ending, and it's counted (VA.3). |
| 2 | The "signed in but not subscribed" tier (how agents pay) | **Deferred until billing exists; owner unsure (2026-11-26).** Recommendation: agents never pay per report. The full report stays free with an account (it's the hook), and once subscriptions exist, each check uses AI credits, matching CLAUDE.md's pricing model ($65–$135/user/mo tiers plus usage-based AI credits). A per-report fee for agents would compete with the subscription. Every signed-in user sees the full report. `src/lib/entitlement.ts`'s `entitlementFor(user)` returns `'full'` for any user and `'teaser'` for none, so billing changes one function later. |
| 3 | What the teaser shows | **Agents ('A client'):** the top subclass, its name and verdict, nothing else. **Applicants ('Myself'):** the **best match is hidden**: its verdict shows, its name doesn't (owner, 2026-11-26, to make paying more convincing); matches 2 and 3 show name and verdict. No reasons, gaps or summary for either. The server never sends what's hidden: for applicants, the response has no subclass, name or code for match 1 (VA.1). |
| 4 | Anonymous limits | **3 checks per IP per day, 300 per day across all anonymous visitors, plus Cloudflare Turnstile.** Raise once there's conversion data. |
| 5 | **Legal wording** | **Owner is considering it; it blocks the launch flip, not the build.** Opening the trial to applicants (Decision 1) raises the risk: giving visa verdicts to members of the public may be "immigration assistance" under the Migration Act. The copy (VA.2b) is written to be general information throughout. |
| 6 | Store anonymous answers? | **Almost none.** Rate-limit counters with a daily-salted IP hash. For applicants only, the trial's **ranking** (three subclasses + verdicts, no answers, no name) is kept for 24 hours under a random token, so a paid report names the same best match (VA.5). Nothing else. The browser keeps the scenario in `localStorage` (not `sessionStorage`: the email-confirmation link opens a new tab), expiring after 24 h and cleared once used. It never holds a name or DOB. |
| 7 | Real Gemini call or something cheaper? | **Real call, smaller prompt and output:** one ranked best match. |
| 8 | Carry-over: the trial has no name field, but the full advisor requires one | **Prefill the full wizard and land on step 1 with the name field focused**: "Add your client's name to see the full report." Every other answer stays filled in. No nameless `EligibilityAssessment`s get saved. |
| 9 | Age or date of birth in the trial? | **Age, as a number field.** On carry-over, the full wizard's DOB stays blank (optional there, as now). |
| 10 | The best match is `unlikely` or `needs_more_info` | Still show it, with its verdict: "No strong match from these answers. The full report shows what's missing for each pathway." |
| 11 | What the ending offers an **applicant** | **Never a sign-up** (an applicant who signed up would land on "Create your firm"). Owner, 2026-11-26: free = **matches 2 and 3 with verdicts, and match 1's verdict with its name hidden**; the best match's name, the reasons, gaps and all 10 visas are a **one-time paid full report** (VA.5); and **Find an agent** opens a directory of firms on Edamame with their website and phone (VA.4). Nothing about the applicant is shared with firms; the applicant contacts them. Until VA.4/VA.5 ship, those two offers are hidden and the ending links to the government's public register of migration agents. |
| 12 | *(new)* **Where it lives and how it opens** | **In a sheet on the homepage**, the same pattern and styling as the existing Log in sheet (`fl-sheet`: Esc, focus trap, focus restore, reduced motion). It's opened by a **Try out our Visa Advisor** button in Chapter I. It's not a separate page, and not inline in the section: Chapter I's right column is a sticky, scroll-driven animation, and a form inside it would fight the scroll. The visitor never leaves the homepage until they're signed in. |
| 13 | *(new)* **What it looks like** | **The homepage's look, not the app's.** Fields, chips and buttons use the landing page's `fl-*` styles and type. The teaser renders as the same `fl-verdict` row the Chapter I demo shows (name, code, coloured bar, status), so the demo the visitor just scrolled past "becomes real". The questions themselves are shared with the app (VA.2a), so they never drift. |

---

## VA.0 · Require sign-in on the AI endpoints (done)

Shipped in #94. What it left behind that the trial reuses:

- `api/_lib/eligibilityInput.ts`'s `validateEligibilityInput()`: whitelisted fields, enum checks,
  200-char cap, control characters stripped, `age` not DOB, no name.
- `src/lib/eligibilityRequest.ts`'s `buildEligibilityRequest()` (unit-tested), which builds that
  payload from wizard state.
- `api/_lib/gemini.ts`'s `callGemini()`/`geminiFailure()` and `src/lib/aiErrors.ts`'s
  `throwForAiResponse()`/`aiErrorMessage()`.

Not done (lives in `edie-guardrails.md` E2): per-user limits on signed-in AI endpoints, and a global
`AI_ENABLED` switch. VA.1 does not wait for those.

---

## VA.1 · Public trial endpoint with abuse protection

**A separate endpoint, `api/try-eligibility.ts`,** not a flag on `check-eligibility`. It's smaller,
easier to lock down, and a mistake in it can never leak the full report.

1. **Kill switch first:** unless `process.env.TRY_ADVISOR_ENABLED === 'true'`, return
   `503 { code: 'trial_paused' }` before anything else.
2. **Input:** `validateEligibilityInput(req.body.answers)` (reused as is), `audience`
   (`'client' | 'self'`, used only for the prompt's wording and the VA.3 counters), and
   `turnstileToken`. Everything else is ignored.
3. **Turnstile:** new `api/_lib/turnstile.ts`, `verifyTurnstile(token, ip)` → `siteverify` with
   `TURNSTILE_SECRET_KEY`. Fails → `403 { code: 'challenge_failed' }`.
4. **Client IP:** first entry of `x-forwarded-for` (fall back to `x-real-ip`), hashed as
   `sha256(ip:day:TRY_ADVISOR_IP_SALT)`. The raw IP is never logged or stored.
5. **Limits, before Gemini:** `try_advisor_check(ip_hash, day)` via the service role. Over the
   per-IP or global limit → `429 { code: 'trial_limit' }`.
6. **Gemini:** compact prompt (same `<answers>` data block and injection warning as
   `check-eligibility.ts`) asking for the single best match among the same 10 subclasses. Schema
   `{ visaSubclass (enum), visaName, verdict (enum) }`. 40 s overall budget.
7. **Count only successes:** `try_advisor_record(ip_hash, day)` after a usable answer. A Gemini
   failure doesn't use up a check.
8. **Response,** built field by field, never by spreading Gemini's object:
   - `audience: 'client'`: `{ result: { visaSubclass, visaName, verdict }, remainingToday }`.
   - `audience: 'self'`: Gemini returns the top 3; the response is
     `{ best: { verdict }, others: [{ visaSubclass, visaName, verdict } ×2], rankingToken, remainingToday }`.
     Match 1's subclass/name never leave the server. The ranking is stored for 24 h in
     `try_advisor_rankings` (token hash, the three subclasses + verdicts, `expires_at`; RLS deny-all,
     service role only) for VA.5. Tests assert match 1's subclass appears nowhere in the response.

**Migration** `supabase/migrations/2026112xxxxxxx_try_advisor_usage.sql`:
`try_advisor_usage (ip_hash, day, count, pk (ip_hash, day))` and
`try_advisor_daily (day pk, count)`, RLS on with no policies (service role only).
`try_advisor_check` / `try_advisor_record` are security definer with EXECUTE revoked from
`anon`/`authenticated` (as in `20260926000500_firm_function_grants.sql`). `record` prunes rows
older than 7 days. Service-role calls go through a small `api/_lib/serviceRpc.ts` in
`api/_lib/firms.ts`'s plain-`fetch` style. *Known gap:* check-then-record isn't atomic. That's
bounded by single-use Turnstile tokens and documented in the file, as `file-github-issue.ts` does.

**Tests:** IP parsing/hashing, and the response builder only ever emits the three fields.

**Done when:** env var off → `503`; bad or missing Turnstile → `403`; a 4th success from one IP in
a day → `429`; a Gemini failure doesn't increment; no reasons/gaps/other pathways in the response;
no raw IP in the DB or logs; migration dry-run on a Supabase branch; `get_advisors` clean.

**Local dev needs no Cloudflare account:** Cloudflare's published test keys (site key
`1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`) always pass, so they go in
`src/.env.local` and Vercel Preview.

---

## VA.2a · Extract the wizard (refactor only)

`src/pages/VisaAdvisor.tsx` is 1,074 lines, with the three wizard steps inline (≈ lines 315–890).

- New `src/components/visa-advisor/EligibilityWizard.tsx`, **controlled** (`value`, `onChange`,
  `currentStep`, `onNext`/`onBack`, `isSubmitting`).
- **Styleable:** the page already funnels its look through `chipClass()`, `inputClass` and
  `labelClass`. Those become a `classes` prop (`{ chip, input, label, heading, sub, button, … }`)
  that defaults to today's app classes. The homepage passes its `fl-*` classes (Decision 13). One
  set of questions, two looks.
- **Variant prop:** `variant: 'app' | 'trial'`. `'trial'` drops the name, swaps DOB for **Age**,
  adds the "Who is this check for?" question, and switches pronouns by audience. Step 1 is valid
  without a name.
- The step labels/headings, `purposeLabels` and the country combobox (#97) move with it.
  `VisaAdvisor.tsx` keeps the report, saving, Open Case, and the `?clientId` prefill.
- `buildEligibilityRequest()` accepts an explicit `age` as well as `dob` (plus a test case).

**Done when:** `VisaAdvisor.tsx` looks and behaves identically (all purposes, run a check, open a
case), `npm run lint` and `npm test` pass.

---

## VA.2b · "Try out our Visa Advisor" on the homepage

**Entry points (all in `pages/LandingPage.tsx`, shown only when `VITE_TRY_ADVISOR_ENABLED`):**
- A **Try out our Visa Advisor** button in Chapter I's first prose block, under the lede, so it's
  seen before the long scroll, and again in place of/beside the CTA at the end of the chapter.
- `/try/visa-advisor` as a deep link that opens the homepage with the sheet open, the same way
  `/login` already opens the Log in sheet. A signed-in visitor goes to `/visa-advisor` instead.

**The flow, one sheet, no page changes** (`src/components/landing/TryAdvisorSheet.tsx`, built on the
existing `fl-sheet` dialog behaviour):

1. **Questions:** `EligibilityWizard variant="trial"` with homepage classes. There's a small step
   indicator ("1 of 3"). Back keeps the answers. **Closing the sheet keeps the answers too**, so
   reopening resumes where they left off. The disclaimer (one line, Decision 5) sits in the sheet's
   footer throughout.
2. **Checking:** the panel shows a single `fl-verdict` row "writing in" (the same ink/clip
   animation Chapter I uses; static under reduced motion) with "Reading your answers against 10
   visa subclasses…". Calls can take 10–40 s, so after 15 s it adds "Still working, this can take
   up to a minute." Turnstile runs invisibly; if Cloudflare forces a visible challenge it appears
   here, not on step 1.
3. **Teaser:** the real result in the `fl-verdict` style: name, subclass code, coloured bar, status.
   Under it, depending on audience:
   - **A client:** "See why, and see all 10 pathways with reasons and gaps for each. Create a free
     account; your answers are kept." with **Create free account** (primary) and **Log in**.
   - **Myself:** Decision 11's ending, a link to the register of migration agents, no sign-up.
   - "Try another scenario" (shows `remainingToday`, e.g. "2 free checks left today").
4. **Sign-up in the same sheet:** **Create free account** swaps the sheet's body to the sign-up
   form, and **Log in** to the log-in form. Both are the homepage's existing forms, extracted into
   `components/landing/SignUpForm.tsx` / `LogInForm.tsx` so `#start` and the Log in sheet keep
   using the same components. A line on top says "Your scenario is saved. You'll see the full
   report right after." "Back to your result" returns without losing anything.
5. **After sign-up/sign-in:** the existing gates run (email confirmation → "check your email";
   onboarding; create firm). Then the app lands on `/visa-advisor`, which finds the stored scenario
   (`src/lib/trialCarryOver.ts`'s `take()`) and shows Decision 8's banner on step 1. Login's
   redirect target becomes `/visa-advisor` whenever a scenario is stored, so nobody has to find
   their way there.

**Errors, inside the sheet, never as a toast over the homepage:**
- `429 trial_limit`: "You've used today's free checks" + the audience's ending (sign-up for
  clients).
- `503 trial_paused`: "The free trial is paused" + sign-up.
- `403 challenge_failed`: "We couldn't verify you're human. Try again" (resets Turnstile).
- `502` / `ai_busy`: `aiErrorMessage()` with **Try again**; the answers stay.

**Fix the Chapter I copy while we're in there.** It's what visitors read right before trying it:
"A four-step intake" → three steps; "Nine subclasses" → **ten**, with the current names
(Skills in Demand 482, adding Skilled Work Regional 491). Widen the disclaimer line, which today
says "Built for registered migration agents…", so it also reads correctly for applicants.

**Polish checklist** (part of Done): keyboard only, through the whole flow; screen reader
announces step changes and the result (`aria-live`); mobile full-height sheet with the keyboard
open; reduced motion; dark/light homepage palettes; no layout shift when the sheet opens; the
sheet's scroll is independent of the page's scroll animations (they pause while it's open).

**Carry-over** `src/lib/trialCarryOver.ts` (unit-tested): `save(scenario)` / `peek()` / `take()`
over `localStorage['try-advisor-scenario']` with a timestamp, 24 h expiry, cleared on `take()` and
on sign-out.

**User manual:** a trial and carry-over page under `docs/user-manual/visa-advisor/`.

**Done when:** a signed-out visitor goes from the button to the teaser to a new account to the
full report without a page navigation before sign-up, and without retyping anything except the
client's name; the network tab shows only the three result fields; "Myself" never offers sign-up;
all four error states render in the sheet; the polish checklist passes on desktop and mobile.

---

## VA.3 · Measure it

- Per day, **split by audience**: **started** (sheet opened), **completed** (teaser shown),
  **limit reached**, **converted** (full check run from a carried-over scenario), and for
  "Myself" **agent-register link clicks**.
- Anonymous counts: extra columns on `try_advisor_daily`, bumped by `api/try-eligibility.ts` and
  a tiny `POST /api/try-event` for started/link-click (same IP-hash limit, no other data). Drop that
  endpoint if Vercel Web Analytics custom events are enough.
- **Converted** is a `UsageEvent` (`trial_converted`) via `pushUsageEvent`.
- Owner-facing only: a documented SQL query in this file.

---

## VA.4 · Agency directory for applicants

Owner, 2026-11-26: when an applicant asks for help, show a list of agencies and lawyers signed up
with Edamame, with their website and phone. The applicant makes contact; **nothing about the
applicant is sent to firms**, so there's no consent form, lead storage or outbound email.

- **Firms opt in to being advertised** (owner confirmed, 2026-11-26) from Settings → Firm ("List us
  in the Visa Advisor directory", off by default, owners/admins only, cloud mode, can be switched
  off any time): public name, website, phone, which visa subclasses they handle, states (or
  "online"), and whether they're a registered migration agent or a law firm. A firm without the
  opt-in never appears.
- **Data:** `firm_directory_listings` (one row per opted-in firm, `listed` flag, the public fields
  above, `verified_at`, `verified_by`). Public read goes through `api/try-directory.ts` (no sign-in
  needed), which returns only listed and verified rows. No RLS read for `anon`.
- **Filter by the applicant's purpose, not the visa** (study, work, family, PR, visit) plus state.
  Filtering by their top visa would reveal the hidden best match (Decision 3). Firms therefore list
  the purposes they help with as well as subclasses.
- **Verification:** the Edamame team checks each firm's registration (the public register of
  migration agents, or a law society listing) **when signing the firm up** (owner, 2026-11-26), and
  sets `verified_at`/`verified_by`. There's no admin screen, so at first that's a documented SQL
  update; an internal admin page can come later. A listed firm that's unverified never shows.
- **Order:** rotate (shuffle per request, or a daily seed), so no firm is always first. Paid
  placement would be a separate business decision, and the legal review should see it.
- **Design:** the "Find an agent" screen in the canvas (filters for visa and state, a card per firm
  with website and phone, "Sample firms" note).
- **Measure (VA.3):** directory opened, website clicks, phone clicks per firm (counts only), so
  firms can be shown the value later.

## VA.5 · Applicant full report behind a one-time payment

Owner, 2026-11-26: some details are hidden from applicants behind a paywall, as a one-time fee.
Free: the top 3 verdicts. Paid: reasons, gaps and all 10 visas, the same content as the agent's
full report.

- **Price:** **A$10 incl. GST, a placeholder** (owner, 2026-11-26). Keep it in one env/config value
  (`TRY_REPORT_PRICE_ID`, a Stripe Price), never hard-coded in copy.
- **Payments:** Stripe Checkout (hosted page, so no card data touches Edamame), one product,
  one price. Checkout **collects the buyer's name, email and billing details** and has invoice
  creation turned on, so **Stripe emails the invoice/receipt** from its own sender. That works
  today, without our domain. Webhook `api/stripe-webhook.ts` marks the purchase paid. New server-only secrets
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) added by the owner by hand.
- **Generation after payment, not before:** the full assessment runs only once payment succeeds,
  from the scenario saved with the checkout session (the validated answers, no name), so an unpaid
  visitor can never reach the full output.
- **Same best match as the teaser:** the checkout carries the `rankingToken`; the paid run is given
  the stored ranking and asked to explain it, not to re-rank, so the AI can't name a different best
  match than the one whose verdict the visitor paid to see. If the token has expired (over 24 h),
  the visitor reruns the free check first.
- **Delivery:** after payment Stripe returns the visitor to the sheet, which shows the report and a
  private link to keep (random token, stored hashed, valid 30 days), with Copy. Once our own email
  works (domain), also email the link. Until then the Stripe invoice is the only email.
- **Data kept:** `report_purchases` (Stripe session/customer id, buyer name and email as Stripe
  returns them, the ranking token, the generated report, `paid_at`, `expires_at`), RLS deny-all,
  service role only. **This is personal information from the public**, so it needs a privacy
  notice, a retention period (report deleted after 30 days; purchase records kept as long as tax
  law requires) and a deletion path.
- **GST and invoices:** does Edamame charge GST (registered, ABN), and what must the invoice show?
  **Owner / accountant decision** before launch; Stripe Tax or a fixed tax rate covers either
  answer.
- **Refunds and failures:** if the AI fails after payment, retry automatically, then refund. Never
  leave a paid visitor without a report.
- **Legal (blocks launch, and the biggest risk in this plan):** charging the public for a
  personalised visa eligibility assessment is much closer to providing "immigration assistance"
  for a fee than a free general-information tool is. Under the Migration Act that's restricted to
  registered migration agents and lawyers. This needs the legal review before anything is built
  beyond a prototype. One possible shape: the paid report is written and signed off by a
  registered agent on Edamame, rather than sold by Edamame itself.
- Also: consumer law (what's promised for the fee), GST, and a refund policy.

## Setup (who does what)

| Item | Who | When |
|---|---|---|
| Cloudflare Turnstile test keys in `src/.env.local` and Vercel Preview | Claude | With VA.1 |
| `TRY_ADVISOR_IP_SALT` (random) in Vercel Preview + Production | Claude (Vercel MCP) | With VA.1 |
| `TRY_ADVISOR_ENABLED` / `VITE_TRY_ADVISOR_ENABLED` = `true` on **Preview only** | Claude (Vercel MCP) | With VA.2b |
| Create the real Turnstile site (`edemame.vercel.app`) in a Cloudflare account | **Owner** (needs your Cloudflare login) | Before launch |
| Real `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` in Vercel Production | **Owner** (secret, entered by hand like `SUPABASE_SERVICE_ROLE_KEY`) | Before launch |
| Apply the VA.1 / VA.3 migrations | Claude (Supabase MCP), after your OK | Before each deploy |
| Flip both flags to `true` in Production | **Owner** | After legal review |

---

## Out of scope

- Billing, subscriptions and plans (Decision 2), with the logged-in teaser tier that comes with it.
- An applicant account type or applicant portal (Decision 11).
- Emailing the full report to anonymous visitors (needs email collection, consent, and a sender;
  still blocked on a domain).

## Open before launch (not before building)

1. Legal review of the disclaimer and the teaser itself (Decision 5), now including applicants.
2. Owner sets up the real Turnstile site and keys (Setup table).
