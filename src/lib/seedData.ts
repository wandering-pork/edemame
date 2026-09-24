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
      steps: [
        { title: 'Initial Consultation', description: 'Assess nominated occupation against the relevant skilled occupation list and estimate points score.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority for the nominated occupation.' },
        { title: 'English Language Test', description: 'Book and complete IELTS/PTE/TOEFL — superior English earns maximum points.' },
        { title: 'Points Test Documentation', description: 'Gather evidence for each points claim (age, English, work experience, qualifications, etc.).' },
        { title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim; no sponsor or nomination required for 189.' },
        { title: 'Invitation to Apply', description: 'Monitor SkillSelect for an invitation — check current points cut-off for the occupation.' },
        { title: 'Visa Application', description: 'Lodge visa application within the 60-day invitation window with full supporting evidence.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'Obtain AFP National Police Check and overseas clearances for all countries lived in 12+ months.' },
        { title: 'Grant & Settlement', description: 'Visa grant notification — advise on travel window and settlement obligations.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess points score, eligible occupations, and which state/territory nomination programs are open.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority.' },
        { title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL — higher scores earn more points.' },
        { title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim, indicating interest in state nomination.' },
        { title: 'State Nomination Application', description: 'Apply to the chosen state/territory for nomination (adds 5 points) — check current occupation lists and criteria.' },
        { title: 'Invitation to Apply', description: 'Receive and accept invitation — 60-day lodgement window.' },
        { title: 'Visa Application', description: 'Lodge full visa application with evidence of points claims and nomination.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP check and overseas police clearances for all countries lived in 12+ months.' },
        { title: 'Grant & Settlement', description: 'Visa grant — advise on any state residence commitment and settlement obligations.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess eligibility and discuss pathway — Direct Entry, Temporary Residence Transition (TRT, for eligible 482/457 holders), or Labour Agreement — and gather employer details.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with relevant assessing authority (if Direct Entry stream).' },
        { title: 'English Language Test', description: 'Book and complete IELTS/PTE/TOEFL — competent English required.' },
        { title: 'Employer Nomination (Form 186N)', description: 'Employer lodges nomination with Department of Home Affairs.' },
        { title: 'Nomination Approval Wait', description: 'Monitor nomination status and respond to any requests for information.' },
        { title: 'Visa Application (Form 186V)', description: 'Lodge primary applicant visa application with all supporting documents.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'Obtain AFP National Police Check and overseas clearances.' },
        { title: 'Application Follow-Up', description: 'Monitor processing and respond to any further requests.' },
        { title: 'Grant & Settlement', description: 'Visa grant notification — advise on travel and settlement obligations.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess eligibility and determine stream — Core Skills (occupation on the Core Skills Occupation List, salary at/above the Core Skills Income Threshold), Specialist Skills (higher-skilled ANZSCO major groups, salary at/above the higher Specialist Skills Income Threshold), or Labour Agreement.' },
        { title: 'Sponsor Approval', description: 'Ensure sponsoring employer holds an approved Standard Business Sponsorship (SBS), or an equivalent Labour Agreement.' },
        { title: 'Labour Market Testing', description: 'Employer demonstrates genuine attempts to recruit locally (advertising evidence), unless a specific exemption applies — confirm current exemptions, particularly for the Specialist Skills stream.' },
        { title: 'Nomination Lodgement', description: 'Employer lodges nomination for the specific occupation, stream, and position, meeting the applicable income threshold.' },
        { title: 'Skills Assessment (if required)', description: 'Some occupations require a formal skills assessment.' },
        { title: 'English Language Test', description: 'Applicant completes required English proficiency test.' },
        { title: 'Visa Application', description: 'Lodge visa application with work history, qualifications, and character documents.' },
        { title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP National Police Check and any overseas clearances.' },
        { title: 'Grant & Conditions', description: 'Visa grant — advise on visa conditions, employer obligations, and pathway to PR (e.g. via the 186 TRT stream).' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess points score, eligible occupations, and state nomination options.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority.' },
        { title: 'English Language Test', description: 'Complete IELTS/PTE — higher scores earn more points.' },
        { title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim.' },
        { title: 'State/Territory Nomination or Family Sponsorship', description: 'Apply to the chosen state/territory for nomination, or arrange eligible family sponsorship in a regional area — check current points table for the points added.' },
        { title: 'Invitation to Apply', description: 'Receive and accept invitation — 60-day lodgement window.' },
        { title: 'Visa Application', description: 'Lodge full visa application with evidence of points claims.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP check and overseas police clearances for all countries lived in 12+ months.' },
        { title: 'Grant & Regional Obligations', description: 'Visa grant — advise on 3-year regional residence obligation and pathway to 191.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess course choice, provider, funding plan, and any dependants travelling with the applicant.' },
        { title: 'Confirmation of Enrolment (CoE)', description: 'Obtain CoE from the CRICOS-registered provider for each course being studied.' },
        { title: 'Genuine Student (GS) Statement', description: 'Prepare the GS requirement statement addressing ties to home country, course suitability, and study/career intent.' },
        { title: 'Financial Capacity Evidence', description: 'Gather evidence of funds for tuition, living costs, and travel — check current minimum financial requirement.' },
        { title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL if required by the provider or Department (may be waived for some applicants).' },
        { title: 'Overseas Student Health Cover (OSHC)', description: 'Arrange OSHC for the full intended stay, covering all family members included in the application.' },
        { title: 'Visa Application', description: 'Lodge visa application with CoE, GS statement, financial evidence, and OSHC.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants if required by country of origin.' },
        { title: 'Police Clearances', description: 'Obtain police clearances where required (e.g. stays over 12 months).' },
        { title: 'Grant & Conditions', description: 'Visa grant — advise on study, work-hour, and health cover conditions for the visa period.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Determine eligible stream — Post-Higher Education Work, Post-Vocational Education Work, or Second Post-Higher Education Work (for eligible prior 485 holders who studied regionally) — check the Australian study requirement is met and the applicant is within the current age limit for the stream.' },
        { title: 'Qualification Evidence', description: 'Obtain the official course completion letter and academic transcript from the CRICOS-registered provider confirming the Australian study requirement (typically 2 academic years) was met — these, not the CoE, are the required evidence at this stage.' },
        { title: 'English Language Test', description: 'Complete IELTS/PTE/TOEFL — competent English required, from a single sitting taken within the current validity window before application.' },
        { title: 'Health Insurance', description: 'Arrange health insurance for the duration of the visa (adequate arrangements required as a condition).' },
        { title: 'Skills Assessment (if applicable)', description: 'Required before lodgement for the Post-Vocational Education Work stream (occupation must be on the current skilled occupation list); generally not required for the Post-Higher Education Work stream — confirm against current stream requirements.' },
        { title: 'Visa Application', description: 'Lodge visa application within 6 months of course completion, while in Australia, with qualification, English, and health evidence.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP National Police Check and overseas clearances for all countries lived in 12+ months.' },
        { title: 'Application Follow-Up', description: 'Monitor processing and respond to any requests for further information.' },
        { title: 'Grant & Work Rights', description: 'Visa grant — advise on full work rights and visa validity period for the granted stream.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Confirm purpose of visit and the appropriate stream — Tourist, Business Visitor, Sponsored Family, Approved Destination Status (PRC passport holders on an approved tour), or Frequent Traveller (select passport countries).' },
        { title: 'Travel Itinerary', description: 'Prepare intended travel dates, accommodation, and itinerary for the visit.' },
        { title: 'Financial Capacity Evidence', description: 'Gather evidence of sufficient funds to support the visit without working.' },
        { title: 'Ties to Home Country', description: 'Compile evidence of strong incentive to return home — employment, family, property, or other ties.' },
        { title: 'Invitation Letter (if applicable)', description: 'For the Sponsored Family stream or business visits, obtain an invitation letter from the host/sponsor in Australia.' },
        { title: 'Visa Application', description: 'Lodge visa application with itinerary, financial, and ties evidence.' },
        { title: 'Health Examinations', description: 'Arrange medical exams if required based on intended stay length and country of origin.' },
        { title: 'Character Documents', description: 'Provide police clearances if requested by the Department (not always required for short visits).' },
        { title: 'Application Follow-Up', description: 'Monitor processing and respond to any requests for further information.' },
        { title: 'Grant & Conditions', description: 'Visa grant — advise on stay length, multiple-entry conditions, and no-work condition where it applies.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Confirm eligible passport country (417, not the separate 462 country list) and that the applicant is within the current age limit — generally 18 up to 30, extended to 35 for a number of eligible passport countries (including the UK) — check the current age limit for the applicant\'s passport country.' },
        { title: 'Passport Eligibility Check', description: 'Verify the applicant holds a valid passport from a country eligible for subclass 417 (as opposed to 462) and has not previously exceeded the visa grant limit for this subclass.' },
        { title: 'Funds Evidence', description: 'Gather evidence of sufficient funds to support the initial period of the stay — check current minimum requirement.' },
        { title: 'Outbound Travel Evidence', description: 'Provide evidence of onward travel or sufficient funds to purchase a return/onward ticket.' },
        { title: 'Visa Application', description: 'Lodge visa application online with passport, funds, and travel evidence.' },
        { title: 'Health Examinations', description: 'Arrange medical exams if required based on intended activities or country of origin.' },
        { title: 'Character Documents', description: 'Provide police clearances if requested by the Department.' },
        { title: 'Grant & Entry Window', description: 'Visa grant — advise on the 12-month entry window and single 12-month stay (extendable via specified regional work for eligible applicants).' },
        { title: 'Second/Third Year Extension (if applicable)', description: 'If eligible, plan specified regional work to qualify for a second or third-year working holiday visa.' },
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
      steps: [
        { title: 'Initial Consultation', description: 'Assess relationship genuineness, discuss evidence requirements and timeline.' },
        { title: 'Relationship Evidence Collection', description: 'Gather joint finances, cohabitation proof, social evidence, photos, travel history.' },
        { title: 'Statutory Declarations', description: 'Prepare Form 888 statements from friends and family attesting to relationship.' },
        { title: 'Form 80 & Form 1221', description: 'Complete personal particulars and additional personal particulars forms.' },
        { title: 'Sponsor Application', description: 'Australian partner lodges sponsorship approval (character + history checks).' },
        { title: 'Visa Application', description: 'Lodge combined 820/801 application with full evidence package.' },
        { title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP National Police Check and overseas clearances.' },
        { title: 'Interview (if required)', description: 'Attend departmental interview if requested — prepare applicant and sponsor.' },
        { title: 'Temporary Grant (820)', description: '820 grant — advise on work rights and bridging visa. 801 eligibility in ~2 years.' },
      ],
    },
  ];
}
