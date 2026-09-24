import type { WorkflowTemplate, TeamMember } from '../types';

/**
 * Default team for single-firm installs. Prepends the authenticated user as
 * "you", followed by 3 synthetic collaborators across partner / lawyer /
 * assistant roles so the Team view has something to render on first launch.
 */
export function seedDefaultTeam(currentUser: { id: string; name: string; email: string }): TeamMember[] {
  return [
    {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      avatar: currentUser.name
        .split(' ')
        .map(part => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'ME',
      role: 'partner',
      caseCount: 0,
      activeTaskCount: 0,
      status: 'available',
      joinedAt: new Date().toISOString(),
    },
    {
      id: 'tm-eliza-chen',
      name: 'Eliza Chen',
      email: 'eliza.chen@edamamelegal.com.au',
      avatar: 'EC',
      role: 'partner',
      caseCount: 0,
      activeTaskCount: 0,
      status: 'available',
      joinedAt: '2023-04-02T09:00:00Z',
    },
    {
      id: 'tm-marcus-okafor',
      name: 'Marcus Okafor',
      email: 'marcus.okafor@edamamelegal.com.au',
      avatar: 'MO',
      role: 'lawyer',
      caseCount: 0,
      activeTaskCount: 0,
      status: 'busy',
      joinedAt: '2023-09-15T09:00:00Z',
    },
    {
      id: 'tm-priya-singh',
      name: 'Priya Singh',
      email: 'priya.singh@edamamelegal.com.au',
      avatar: 'PS',
      role: 'assistant',
      caseCount: 0,
      activeTaskCount: 0,
      status: 'available',
      joinedAt: '2024-02-20T09:00:00Z',
    },
  ];
}

/**
 * System default visa subclass templates. Originally the MVP set per the pitch
 * deck (Slide 9) — 186 (ENS), 482 (TSS), 490 (Skilled Regional), 820 (Partner) —
 * extended to cover every subclass the Visa Eligibility Advisor
 * (`api/check-eligibility.ts`) can return: 189, 190, 482, 186, 500, 820, 485,
 * 600, 417, 491. Content reflects general Department of Home Affairs
 * requirements as a starting point for a firm's own workflow — thresholds and
 * fees change frequently, so steps say "check current threshold" rather than
 * hardcoding numbers that go stale.
 *
 * Verification (2026-09-24): every template below was checked/corrected
 * against the official Department of Home Affairs visa listing pages on
 * immi.homeaffairs.gov.au (see each template's `sourceUrl`/`lastVerified`).
 * Home Affairs blocks automated fetches of its own pages (HTTP 403), so
 * content was verified via search-result excerpts of those pages plus
 * corroborating secondary sources (migration-agent guides, state government
 * nomination pages) rather than a direct page fetch — flagged per-template
 * below where that matters. PR #53's review description has the full
 * per-subclass verification table.
 *
 * NOTE on subclass 490 vs 491: "490" is not a current Australian visa
 * subclass. The provisional, points-tested regional visa is subclass 491
 * (Skilled Work Regional (Provisional)) — 490 was an older/related
 * designation. This template's `id` is kept as `tpl-490` (not renamed to
 * `tpl-491`) even though its `visaSubclass`/title are corrected to 491,
 * because `id` is what a persisted `Case.templateId` references — renaming it
 * would silently orphan any case created against this system template before
 * this fix, since system templates are hardcoded and merged into app state by
 * id (see `App.tsx`). Only the user-visible subclass/title/content changed.
 *
 * --- Step timing (1E, added 2026-09-24) --------------------------------
 * Every step below now carries a `key` (stable id — anchors reference it
 * across reorders) and a `timing` (`StepTiming` — see `types.ts`). All
 * templates are `version: 1`, `timingVerified: false`: durations are
 * reasonable starting estimates, not yet signed off by a registered agent
 * (see the "Visa Content Review" note — BAs validate visa templates in
 * testing; timing sign-off is a separate, not-yet-done pass). The Templates
 * page shows "Timing not yet reviewed" until that happens.
 *
 * Anchoring convention used throughout: the first step ("Initial
 * Consultation") anchors on `case_start` with `offsetDays: 1` — never 0 —
 * because a case's actual open moment is rarely the literal instant the
 * agent sits down with the client, and offset-0 tasks are exactly the
 * "case opens with an already-overdue task" bug 1E exists to fix (Trello
 * "Configurable Task Due Date"). Every other step anchors on
 * `previous_step`, chaining off the prior step's own estimated duration, so
 * the whole plan re-flows automatically once a step actually finishes.
 *
 * `durationDays` values are grounded in the processing-time ranges already
 * quoted to Gemini in `api/generate-tasks.ts`'s prompt (skills assessment
 * 28–84 days, police clearances 30–45, medical exams 1–3, NAATI translation
 * 7–14, state nomination 14–60, 482 sponsorship/nomination 14–28, visa grant
 * 60–360 depending on subclass) wherever a step matches one of those
 * categories. Where a step doesn't map to any of those (e.g. booking an
 * English test, gathering financial evidence, a department follow-up
 * window), the duration is a general estimate and is called out as such in
 * an inline comment — these are exactly the numbers `timingVerified: false`
 * is flagging as not yet agent-reviewed.
 *
 * `fixed: true` (a real legal window, not just an estimate) is used only for
 * the two cases the plan calls out:
 *  - 189 / 190 / 491: the "Visa Application" step anchors on
 *    `{ type: 'deadline', kind: 'invitation_window' }` with `offsetDays: 60`
 *    — an EOI invitation must be actioned within 60 days, a set-by-law
 *    deadline (see `DeadlineKind` in `types.ts`; the actual invitation date
 *    is recorded separately once 1D's Deadline entity exists — until then,
 *    the scheduler treats this anchor as "unknown" and produces a
 *    provisional/`datePending` date).
 *  - 482 / 186: the "Visa Application" step anchors on the nomination
 *    step's `done` edge (`{ type: 'step', stepKey: ..., edge: 'done' }`,
 *    `offsetDays: 0`) — the visa application can only be lodged once the
 *    nomination is approved, which is a structural/legal dependency, not an
 *    estimate, even though (unlike the 60-day invitation window) there's no
 *    single universal number of days to encode as the offset.
 * Every other step is `fixed: false` — an estimate the agent can move.
 *
 * `isGate: true` marks a step the case can't meaningfully proceed past
 * without completing (feeds the 1C At Risk rule "a gate task is overdue"):
 * the visa lodgement step on every template, plus a small number of
 * steps that block lodgement on external action out of the agent's control
 * (an EOI invitation, a nomination approval, a nomination/sponsorship wait).
 * -------------------------------------------------------------------------
 */
export function seedDefaultTemplates(): WorkflowTemplate[] {
  return [
    {
      id: 'tpl-189',
      title: 'Skilled Independent (Subclass 189)',
      description: 'Permanent, points-tested visa for invited skilled workers not sponsored by an employer, state, or family member.',
      visaSubclass: '189',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-independent-189',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess nominated occupation against the relevant skilled occupation list and estimate points score.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'skills-assessment', title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority for the nominated occupation.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Book and complete IELTS/PTE/TOEFL — superior English earns maximum points.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate: booking + sitting + results
        { key: 'points-test-documentation', title: 'Points Test Documentation', description: 'Gather evidence for each points claim (age, English, work experience, qualifications, etc.).', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 3, max: 7 }, fixed: false } },
        { key: 'eoi-submission', title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim; no sponsor or nomination required for 189.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'invitation-to-apply', title: 'Invitation to Apply', description: 'Monitor SkillSelect for an invitation — check current points cut-off for the occupation.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 14, max: 90 }, fixed: false }, isGate: true }, // general estimate: EOI invitation round timing varies significantly by occupation
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application within the 60-day invitation window with full supporting evidence.', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'Obtain AFP National Police Check and overseas clearances for all countries lived in 12+ months.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'grant-and-settlement', title: 'Grant & Settlement', description: 'Visa grant notification — advise on travel window and settlement obligations.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 180, max: 360 }, fixed: false } }, // PR grant sits at the long end of the 60–360 day range
      ],
    },
    {
      id: 'tpl-190',
      title: 'Skilled Nominated (Subclass 190)',
      description: 'Permanent, points-tested visa for skilled workers nominated by a state or territory government.',
      visaSubclass: '190',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-nominated-190',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess points score, eligible occupations, and which state/territory nomination programs are open.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'skills-assessment', title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL — higher scores earn more points.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'eoi-submission', title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim, indicating interest in state nomination.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'state-nomination-application', title: 'State Nomination Application', description: 'Apply to the chosen state/territory for nomination (adds 5 points) — check current occupation lists and criteria.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 14, max: 60 }, fixed: false } },
        { key: 'invitation-to-apply', title: 'Invitation to Apply', description: 'Receive and accept invitation — 60-day lodgement window.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 7, max: 30 }, fixed: false }, isGate: true }, // general estimate: nominated invitations issue faster than the general 189 pool
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge full visa application with evidence of points claims and nomination.', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'AFP check and overseas police clearances for all countries lived in 12+ months.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'grant-and-settlement', title: 'Grant & Settlement', description: 'Visa grant — advise on any state residence commitment and settlement obligations.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 180, max: 360 }, fixed: false } }, // PR grant sits at the long end of the range
      ],
    },
    {
      id: 'tpl-186',
      title: 'Employer Nomination Scheme (Subclass 186)',
      description: 'Permanent residency visa for skilled workers nominated by their employer.',
      visaSubclass: '186',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/employer-nomination-scheme-186',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess eligibility and discuss pathway — Direct Entry, Temporary Residence Transition (TRT, for eligible 482/457 holders), or Labour Agreement — and gather employer details.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'skills-assessment', title: 'Skills Assessment', description: 'Lodge skills assessment with relevant assessing authority (if Direct Entry stream).', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Book and complete IELTS/PTE/TOEFL — competent English required.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'employer-nomination', title: 'Employer Nomination (Form 186N)', description: 'Employer lodges nomination with Department of Home Affairs.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'nomination-approval-wait', title: 'Nomination Approval Wait', description: 'Monitor nomination status and respond to any requests for information.', timing: { anchor: { type: 'previous_step' }, offsetDays: 1, durationDays: { min: 60, max: 180 }, fixed: false }, isGate: true }, // general estimate: 186 nomination processing, no fixed range in the source list
        { key: 'visa-application', title: 'Visa Application (Form 186V)', description: 'Lodge primary applicant visa application with all supporting documents.', timing: { anchor: { type: 'step', stepKey: 'nomination-approval-wait', edge: 'done' }, offsetDays: 0, fixed: true }, isGate: true }, // legal dependency: can only lodge once nomination is approved
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'Obtain AFP National Police Check and overseas clearances.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'application-follow-up', title: 'Application Follow-Up', description: 'Monitor processing and respond to any further requests.', timing: { anchor: { type: 'previous_step' }, offsetDays: 30, durationDays: { min: 30, max: 90 }, fixed: false } }, // general estimate: department processing/follow-up window
        { key: 'grant-and-settlement', title: 'Grant & Settlement', description: 'Visa grant notification — advise on travel and settlement obligations.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 180, max: 360 }, fixed: false } }, // PR grant sits at the long end of the range
      ],
    },
    {
      id: 'tpl-482',
      title: 'Skills in Demand visa (Subclass 482)',
      description: 'Temporary employer-sponsored work visa (rebranded from Temporary Skill Shortage in December 2024) allowing employers to sponsor skilled overseas workers under the Core Skills, Specialist Skills, or Labour Agreement stream.',
      visaSubclass: '482',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skills-in-demand-visa-subclass-482',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess eligibility and determine stream — Core Skills (occupation on the Core Skills Occupation List, salary at/above the Core Skills Income Threshold), Specialist Skills (higher-skilled ANZSCO major groups, salary at/above the higher Specialist Skills Income Threshold), or Labour Agreement.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'sponsor-approval', title: 'Sponsor Approval', description: 'Ensure sponsoring employer holds an approved Standard Business Sponsorship (SBS), or an equivalent Labour Agreement.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 14, max: 28 }, fixed: false } },
        { key: 'labour-market-testing', title: 'Labour Market Testing', description: 'Employer demonstrates genuine attempts to recruit locally (advertising evidence), unless a specific exemption applies — confirm current exemptions, particularly for the Specialist Skills stream.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 21, max: 35 }, fixed: false } }, // general estimate: minimum job-ad campaign length
        { key: 'nomination-lodgement', title: 'Nomination Lodgement', description: 'Employer lodges nomination for the specific occupation, stream, and position, meeting the applicable income threshold.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 14, max: 28 }, fixed: false }, isGate: true },
        { key: 'skills-assessment', title: 'Skills Assessment (if required)', description: 'Some occupations require a formal skills assessment.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Applicant completes required English proficiency test.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application with work history, qualifications, and character documents.', timing: { anchor: { type: 'step', stepKey: 'nomination-lodgement', edge: 'done' }, offsetDays: 0, fixed: true }, isGate: true }, // legal dependency: can only lodge once nomination is approved
        { key: 'health-examinations', title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'AFP National Police Check and any overseas clearances.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'grant-and-conditions', title: 'Grant & Conditions', description: 'Visa grant — advise on visa conditions, employer obligations, and pathway to PR (e.g. via the 186 TRT stream).', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 30, max: 90 }, fixed: false } }, // temporary visa grant sits at the shorter end of the 60–360 day range
      ],
    },
    {
      id: 'tpl-490', // kept for backward compatibility — see file-header note on 490 vs 491
      title: 'Skilled Work Regional Provisional (Subclass 491)',
      description: 'Points-tested provisional visa for skilled workers nominated by a state/territory or sponsored by an eligible family member in regional Australia. (Note: 490 is not a current subclass — the correct code is 491.)',
      visaSubclass: '491',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-work-regional-provisional-491',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess points score, eligible occupations, and state nomination options.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'skills-assessment', title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Complete IELTS/PTE — higher scores earn more points.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'eoi-submission', title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'state-or-family-nomination', title: 'State/Territory Nomination or Family Sponsorship', description: 'Apply to the chosen state/territory for nomination, or arrange eligible family sponsorship in a regional area — check current points table for the points added.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 14, max: 60 }, fixed: false } },
        { key: 'invitation-to-apply', title: 'Invitation to Apply', description: 'Receive and accept invitation — 60-day lodgement window.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 7, max: 30 }, fixed: false }, isGate: true }, // general estimate
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge full visa application with evidence of points claims.', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'AFP check and overseas police clearances for all countries lived in 12+ months.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'grant-and-regional-obligations', title: 'Grant & Regional Obligations', description: 'Visa grant — advise on 3-year regional residence obligation and pathway to 191.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 90, max: 240 }, fixed: false } }, // provisional visa grant, general estimate within the 60–360 day range
      ],
    },
    {
      id: 'tpl-500',
      title: 'Student Visa (Subclass 500)',
      description: 'Temporary visa for full-time study in Australia with a registered education provider (CRICOS).',
      visaSubclass: '500',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess course choice, provider, funding plan, and any dependants travelling with the applicant.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'confirmation-of-enrolment', title: 'Confirmation of Enrolment (CoE)', description: 'Obtain CoE from the CRICOS-registered provider for each course being studied.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 3, max: 14 }, fixed: false } }, // general estimate: provider turnaround
        { key: 'genuine-student-statement', title: 'Genuine Student (GS) Statement', description: 'Prepare the GS requirement statement addressing ties to home country, course suitability, and study/career intent.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 5 }, fixed: false } },
        { key: 'financial-capacity-evidence', title: 'Financial Capacity Evidence', description: 'Gather evidence of funds for tuition, living costs, and travel — check current minimum financial requirement.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 7 }, fixed: false } },
        { key: 'english-language-test', title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL if required by the provider or Department (may be waived for some applicants).', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'oshc', title: 'Overseas Student Health Cover (OSHC)', description: 'Arrange OSHC for the full intended stay, covering all family members included in the application.', timing: { anchor: { type: 'previous_step' }, offsetDays: 1, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application with CoE, GS statement, financial evidence, and OSHC.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, fixed: false }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants if required by country of origin.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'Obtain police clearances where required (e.g. stays over 12 months).', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'grant-and-conditions', title: 'Grant & Conditions', description: 'Visa grant — advise on study, work-hour, and health cover conditions for the visa period.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 14, max: 60 }, fixed: false } }, // student visas typically process faster than PR streams; general estimate
      ],
    },
    {
      id: 'tpl-485',
      title: 'Temporary Graduate (Subclass 485)',
      description: 'Temporary visa for recent graduates of an Australian qualification to live and work in Australia after study.',
      visaSubclass: '485',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Determine eligible stream — Post-Higher Education Work, Post-Vocational Education Work, or Second Post-Higher Education Work (for eligible prior 485 holders who studied regionally) — check the Australian study requirement is met and the applicant is within the current age limit for the stream.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'qualification-evidence', title: 'Qualification Evidence', description: 'Obtain the official course completion letter and academic transcript from the CRICOS-registered provider confirming the Australian study requirement (typically 2 academic years) was met — these, not the CoE, are the required evidence at this stage.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 3, max: 14 }, fixed: false } }, // general estimate: provider turnaround
        { key: 'english-language-test', title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL — competent English required, from a single sitting taken within the current validity window before application.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'health-insurance', title: 'Health Insurance', description: 'Arrange health insurance for the duration of the visa (adequate arrangements required as a condition).', timing: { anchor: { type: 'previous_step' }, offsetDays: 1, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'skills-assessment', title: 'Skills Assessment (if applicable)', description: 'Required before lodgement for the Post-Vocational Education Work stream (occupation must be on the current skilled occupation list); generally not required for the Post-Higher Education Work stream — confirm against current stream requirements.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 28, max: 84 }, fixed: false } },
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application within 6 months of course completion, while in Australia, with qualification, English, and health evidence.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, fixed: false }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'AFP National Police Check and overseas clearances for all countries lived in 12+ months.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'application-follow-up', title: 'Application Follow-Up', description: 'Monitor processing and respond to any requests for further information.', timing: { anchor: { type: 'previous_step' }, offsetDays: 30, durationDays: { min: 30, max: 90 }, fixed: false } }, // general estimate
        { key: 'grant-and-work-rights', title: 'Grant & Work Rights', description: 'Visa grant — advise on full work rights and visa validity period for the granted stream.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 30, max: 90 }, fixed: false } }, // temporary visa, shorter end of the 60–360 day range
      ],
    },
    {
      id: 'tpl-600',
      title: 'Visitor Visa (Subclass 600)',
      description: 'Temporary visa to visit Australia for tourism, to see family, or for short business visits.',
      visaSubclass: '600',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Confirm purpose of visit and the appropriate stream — Tourist, Business Visitor, Sponsored Family, Approved Destination Status (PRC passport holders on an approved tour), or Frequent Traveller (select passport countries).', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'travel-itinerary', title: 'Travel Itinerary', description: 'Prepare intended travel dates, accommodation, and itinerary for the visit.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'financial-capacity-evidence', title: 'Financial Capacity Evidence', description: 'Gather evidence of sufficient funds to support the visit without working.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 5 }, fixed: false } },
        { key: 'ties-to-home-country', title: 'Ties to Home Country', description: 'Compile evidence of strong incentive to return home — employment, family, property, or other ties.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 5 }, fixed: false } },
        { key: 'invitation-letter', title: 'Invitation Letter (if applicable)', description: 'For the Sponsored Family stream or business visits, obtain an invitation letter from the host/sponsor in Australia.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 7 }, fixed: false } },
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application with itinerary, financial, and ties evidence.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, fixed: false }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange medical exams if required based on intended stay length and country of origin.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'character-documents', title: 'Character Documents', description: 'Provide police clearances if requested by the Department (not always required for short visits).', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate — often a single AFP check rather than the full overseas-clearance range
        { key: 'application-follow-up', title: 'Application Follow-Up', description: 'Monitor processing and respond to any requests for further information.', timing: { anchor: { type: 'previous_step' }, offsetDays: 14, durationDays: { min: 14, max: 30 }, fixed: false } }, // general estimate — visitor visas typically process faster than other streams
        { key: 'grant-and-conditions', title: 'Grant & Conditions', description: 'Visa grant — advise on stay length, multiple-entry conditions, and no-work condition where it applies.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 1, max: 5 }, fixed: false } },
      ],
    },
    {
      id: 'tpl-417',
      title: 'Working Holiday (Subclass 417)',
      description: 'Temporary visa for young adults from eligible passport countries to holiday and work in Australia. Note: subclass 417 has no English language requirement — functional English is a requirement of the separate Work and Holiday (subclass 462) visa, for a different set of passport countries.',
      visaSubclass: '417',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Confirm eligible passport country (417, not the separate 462 country list) and that the applicant is within the current age limit — generally 18 up to 30, extended to 35 for a number of eligible passport countries (including the UK) — check the current age limit for the applicant\'s passport country.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'passport-eligibility-check', title: 'Passport Eligibility Check', description: 'Verify the applicant holds a valid passport from a country eligible for subclass 417 (as opposed to 462) and has not previously exceeded the visa grant limit for this subclass.', timing: { anchor: { type: 'previous_step' }, offsetDays: 1, durationDays: { min: 1, max: 2 }, fixed: false } },
        { key: 'funds-evidence', title: 'Funds Evidence', description: 'Gather evidence of sufficient funds to support the initial period of the stay — check current minimum requirement.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 5 }, fixed: false } },
        { key: 'outbound-travel-evidence', title: 'Outbound Travel Evidence', description: 'Provide evidence of onward travel or sufficient funds to purchase a return/onward ticket.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 5 }, fixed: false } },
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge visa application online with passport, funds, and travel evidence.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, fixed: false }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Arrange medical exams if required based on intended activities or country of origin.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'character-documents', title: 'Character Documents', description: 'Provide police clearances if requested by the Department.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 7, max: 21 }, fixed: false } }, // general estimate
        { key: 'grant-and-entry-window', title: 'Grant & Entry Window', description: 'Visa grant — advise on the 12-month entry window and single 12-month stay (extendable via specified regional work for eligible applicants).', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 1, max: 14 }, fixed: false } }, // general estimate — 417 typically grants quickly
        { key: 'second-third-year-extension', title: 'Second/Third Year Extension (if applicable)', description: 'If eligible, plan specified regional work to qualify for a second or third-year working holiday visa.', timing: { anchor: { type: 'previous_step' }, offsetDays: 30, fixed: false } },
      ],
    },
    {
      id: 'tpl-820',
      title: 'Partner Visa — Onshore (Subclass 820)',
      description: 'Temporary partner visa for applicants in Australia in a genuine relationship with an Australian citizen, PR holder, or eligible NZ citizen.',
      visaSubclass: '820',
      userId: null,
      sourceUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/partner-onshore',
      lastVerified: '2026-09-24',
      version: 1,
      timingVerified: false,
      steps: [
        { key: 'initial-consultation', title: 'Initial Consultation', description: 'Assess relationship genuineness, discuss evidence requirements and timeline.', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } },
        { key: 'relationship-evidence-collection', title: 'Relationship Evidence Collection', description: 'Gather joint finances, cohabitation proof, social evidence, photos, travel history.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 14, max: 60 }, fixed: false } }, // general estimate — substantial evidence-gathering effort
        { key: 'statutory-declarations', title: 'Statutory Declarations', description: 'Prepare Form 888 statements from friends and family attesting to relationship.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, durationDays: { min: 7, max: 21 }, fixed: false } },
        { key: 'form-80-1221', title: 'Form 80 & Form 1221', description: 'Complete personal particulars and additional personal particulars forms.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 2, max: 7 }, fixed: false } },
        { key: 'sponsor-application', title: 'Sponsor Application', description: 'Australian partner lodges sponsorship approval (character + history checks).', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 14, max: 45 }, fixed: false } }, // general estimate — sponsor character/history checks
        { key: 'visa-application', title: 'Visa Application', description: 'Lodge combined 820/801 application with full evidence package.', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, fixed: false }, isGate: true },
        { key: 'health-examinations', title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 1, max: 3 }, fixed: false } },
        { key: 'police-clearances', title: 'Police Clearances', description: 'AFP National Police Check and overseas clearances.', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, durationDays: { min: 30, max: 45 }, fixed: false } },
        { key: 'interview', title: 'Interview (if required)', description: 'Attend departmental interview if requested — prepare applicant and sponsor.', timing: { anchor: { type: 'previous_step' }, offsetDays: 30, durationDays: { min: 1, max: 7 }, fixed: false } }, // general estimate
        { key: 'temporary-grant', title: 'Temporary Grant (820)', description: '820 grant — advise on work rights and bridging visa. 801 eligibility in ~2 years.', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, durationDays: { min: 180, max: 360 }, fixed: false } }, // partner visa processing sits at the long end of the 60–360 day range
      ],
    },
  ];
}
