import type { CasePointsClaim, Document, PointsClaimEntry } from '../types';

/**
 * The Australian General Skilled Migration (GSM) points test, authored as
 * structured reference data (GitHub issue #36).
 *
 * Conventions follow `lib/documentTypes.ts` and
 * `lib/referenceLetterRequirements.ts`: a hand-authored table with the
 * judgment calls written down next to the entry they affect, consumed by a
 * pure calculation function with no React or repository dependencies.
 *
 * ---------------------------------------------------------------------------
 * SOURCE AND REVIEW STATUS — READ BEFORE TRUSTING A NUMBER
 * ---------------------------------------------------------------------------
 * Every criterion below carries a `source` naming what the point values are
 * based on. Those citations were written from general knowledge of the points
 * test as it stands at the authoring date below — **no live lookup of the
 * Department of Home Affairs website or the Federal Register of Legislation
 * was performed**, and the Schedule 6D part references are given at the level
 * of the qualification they describe rather than pinned to item numbers that
 * were not verified against the current instrument.
 *
 * The points test is amended by legislative instrument from time to time (the
 * partner-skills bands, for example, changed materially in November 2019). A
 * human with access to the current tables must review this file periodically,
 * and the UI must keep telling users to check the current DoHA tables before
 * relying on any of it for a lodgement.
 */

/** When the values in this file were last authored/reviewed by a human. */
export const POINTS_TEST_AUTHORED_ON = '2026-08-29';

/** Minimum score to be able to submit an EOI for a points-tested visa. */
export const POINTS_PASS_MARK = 65;

/** Shown wherever a total or an export is produced. Never soften this copy. */
export const POINTS_TEST_DISCLAIMER =
  'These point values are an authored reference table, not a legal source. Review the current Department of Home Affairs points tables and Schedule 6D of the Migration Regulations 1994 before relying on this for a lodgement — the test is amended by legislative instrument from time to time. Points are assessed by the Department at the time of invitation, not at the time you fill this in.';

export const POINTS_TEST_SOURCE_NOTE =
  'Authored from general knowledge of the points test as at ' +
  POINTS_TEST_AUTHORED_ON +
  '. No live lookup of homeaffairs.gov.au or the Federal Register of Legislation was performed; Schedule 6D references are indicative, not verified item numbers.';

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

/**
 * The points-tested GSM subclasses. 189 and 491 have no Document Checklist
 * template in `lib/checklistTemplates.ts` — deliberately out of scope for this
 * change (issue #36), and not needed: the calculator is driven by the subclass
 * picked here, not by whether a checklist template exists for the case.
 */
export type PointsSubclass = '189' | '190' | '491';

export const POINTS_SUBCLASSES: Array<{ id: PointsSubclass; label: string }> = [
  { id: '189', label: '189 — Skilled Independent' },
  { id: '190', label: '190 — Skilled Nominated' },
  { id: '491', label: '491 — Skilled Work Regional (Provisional)' },
];

export function isPointsSubclass(value: string | undefined): value is PointsSubclass {
  return value === '189' || value === '190' || value === '491';
}

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

export interface PointsOption {
  /** Stable id — persisted on the case's claim, so never renumber these. */
  id: string;
  label: string;
  points: number;
  description?: string;
}

export interface PointsCriterion {
  /** Stable id — persisted on the case's claim, so never rename these. */
  id: string;
  label: string;
  /** One-line explanation of what the criterion measures. */
  helpText: string;
  /** What the point values are based on. See the file header on review status. */
  source: string;
  /** Judgment calls / caveats specific to this criterion, shown in the UI. */
  note?: string;
  /** Mutually exclusive bands. Exactly one is claimable at a time. */
  options: PointsOption[];
  /** Subclasses the criterion applies to. */
  appliesTo: PointsSubclass[];
  /**
   * Document Type codes (see `lib/documentTypes.ts`) that evidence this
   * criterion. Used to suggest Case Files for linking — the same "shared
   * vocabulary" idea the Document Checklist auto-link is built on.
   */
  evidenceDocumentTypeCodes: string[];
  /** What the agent should actually be looking at to call this proven. */
  evidenceHint: string;
  /** Cap group this criterion's points count towards, if any. */
  capGroup?: string;
}

export interface PointsCapGroup {
  id: string;
  label: string;
  max: number;
  note: string;
}

/**
 * Caps that apply across several criteria rather than within one. Applied to
 * the claimed and proven totals alike — a cap is a rule about what the
 * Department will award, so it must not be possible to "prove" past it.
 */
export const POINTS_CAP_GROUPS: PointsCapGroup[] = [
  {
    id: 'skilled-employment',
    label: 'Skilled employment (overseas + Australian combined)',
    max: 20,
    note: 'Overseas and Australian skilled employment are scored separately but the combined award is capped at 20 points.',
  },
];

const DOHA_TABLE = 'Department of Home Affairs — skilled visa points table (subclasses 189 / 190 / 491)';

export const POINTS_CRITERIA: PointsCriterion[] = [
  {
    id: 'age',
    label: 'Age',
    helpText: 'Age at the time of invitation. 45 and over scores nothing and is generally not eligible.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — age qualifications`,
    note: 'Age is assessed at the date of invitation, which may be months after the EOI. Claim the band the applicant will be in when invited, not necessarily today.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['PPT', 'PPTBIO', 'BIRTH'],
    evidenceHint: 'Passport biodata page or birth certificate showing date of birth.',
    options: [
      { id: 'age-18-24', label: '18–24 years', points: 25 },
      { id: 'age-25-32', label: '25–32 years', points: 30 },
      { id: 'age-33-39', label: '33–39 years', points: 25 },
      { id: 'age-40-44', label: '40–44 years', points: 15 },
      { id: 'age-45-plus', label: '45 years and over (or under 18)', points: 0, description: 'No points — and generally not eligible to be invited.' },
    ],
  },
  {
    id: 'english',
    label: 'English language ability',
    helpText: 'Scored on the test result held at the time of invitation. Competent English is the entry requirement and scores nothing.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — English language qualifications`,
    note: 'Test-score equivalences (IELTS / PTE / TOEFL iBT / OET / Cambridge) are set by a separate instrument and are not modelled here — record the band the applicant qualifies for.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['ENGTST'],
    evidenceHint: 'Valid English test result (IELTS / PTE / TOEFL / OET / Cambridge) in the applicant\'s name.',
    options: [
      { id: 'eng-competent', label: 'Competent English', points: 0, description: 'e.g. IELTS 6 in each band — the minimum requirement.' },
      { id: 'eng-proficient', label: 'Proficient English', points: 10, description: 'e.g. IELTS 7 in each band.' },
      { id: 'eng-superior', label: 'Superior English', points: 20, description: 'e.g. IELTS 8 in each band.' },
    ],
  },
  {
    id: 'employment-overseas',
    label: 'Skilled employment — outside Australia',
    helpText: 'Skilled employment in the nominated (or closely related) occupation, outside Australia, in the last 10 years.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — overseas skilled employment qualifications`,
    note: 'Only employment after the date the assessing authority treats as "skilled" counts. Combined with Australian employment, the award is capped at 20 points.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['REFLTR', 'PAYSLP', 'TAXSTM', 'EMPCON', 'SKLASS', 'CV'],
    evidenceHint: 'Employment reference letters covering each claimed period, backed by payslips or tax statements.',
    capGroup: 'skilled-employment',
    options: [
      { id: 'emp-os-none', label: 'Less than 3 years', points: 0 },
      { id: 'emp-os-3', label: '3 to 4 years', points: 5 },
      { id: 'emp-os-5', label: '5 to 7 years', points: 10 },
      { id: 'emp-os-8', label: '8 to 10 years', points: 15 },
    ],
  },
  {
    id: 'employment-australia',
    label: 'Skilled employment — in Australia',
    helpText: 'Skilled employment in the nominated (or closely related) occupation, in Australia, in the last 10 years.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — Australian skilled employment qualifications`,
    note: 'Work must have been performed lawfully, with permission to work. Combined with overseas employment, the award is capped at 20 points.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['REFLTR', 'PAYSLP', 'TAXSTM', 'EMPCON', 'CV'],
    evidenceHint: 'Australian employment references plus payslips, PAYG summaries or ATO income statements.',
    capGroup: 'skilled-employment',
    options: [
      { id: 'emp-au-none', label: 'Less than 1 year', points: 0 },
      { id: 'emp-au-1', label: '1 to 2 years', points: 5 },
      { id: 'emp-au-3', label: '3 to 4 years', points: 10 },
      { id: 'emp-au-5', label: '5 to 7 years', points: 15 },
      { id: 'emp-au-8', label: '8 to 10 years', points: 20 },
    ],
  },
  {
    id: 'education',
    label: 'Educational qualifications',
    helpText: 'Highest relevant qualification held at the time of invitation. Only one band may be claimed.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — educational qualifications`,
    note: 'A qualification obtained overseas only scores where the assessing authority (or the Department) recognises it as comparable to the Australian standard.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['DEGCRT', 'TRANSC', 'SKLASS'],
    evidenceHint: 'Award certificate and academic transcript, plus the skills assessment recognising the qualification.',
    options: [
      { id: 'edu-doctorate', label: 'Doctorate from an Australian institution, or other recognised Doctorate', points: 20 },
      { id: 'edu-bachelor', label: 'Bachelor degree (including Honours or Masters) from an Australian institution, or other recognised degree', points: 15 },
      { id: 'edu-diploma', label: 'Diploma or trade qualification completed in Australia', points: 10 },
      { id: 'edu-recognised', label: 'Qualification or award recognised by the assessing authority for the nominated occupation', points: 10 },
      { id: 'edu-none', label: 'No qualifying educational qualification', points: 0 },
    ],
  },
  {
    id: 'specialist-education',
    label: 'Specialist education qualification (STEM)',
    helpText: 'Australian Masters by research or Doctorate including at least two academic years in a relevant STEM or ICT field.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — specialist education qualifications`,
    note: 'The eligible fields of education are set by instrument and are not enumerated here — confirm the applicant\'s field appears on the current list.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['DEGCRT', 'TRANSC'],
    evidenceHint: 'Testamur and transcript showing a research Masters or Doctorate in an eligible field, completed in Australia.',
    options: [
      { id: 'spec-yes', label: 'Holds a qualifying Australian STEM/ICT research Masters or Doctorate', points: 10 },
      { id: 'spec-no', label: 'Does not hold one', points: 0 },
    ],
  },
  {
    id: 'australian-study',
    label: 'Australian study requirement',
    helpText: 'At least two academic years of study in Australia towards a qualification closely related to the nominated occupation.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — Australian study requirement`,
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['STUDAU', 'DEGCRT', 'TRANSC'],
    evidenceHint: 'Completion letter and transcript evidencing at least two academic years (usually 92 weeks) of study in Australia.',
    options: [
      { id: 'ausstudy-yes', label: 'Meets the Australian study requirement', points: 5 },
      { id: 'ausstudy-no', label: 'Does not meet it', points: 0 },
    ],
  },
  {
    id: 'community-language',
    label: 'Credentialled community language',
    helpText: 'NAATI credential at the Certified Provisional level or above in a community language.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — credentialled community language qualifications`,
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['CCLANG'],
    evidenceHint: 'Current NAATI certification for translating or interpreting.',
    options: [
      { id: 'ccl-yes', label: 'Holds a credentialled community language qualification', points: 5 },
      { id: 'ccl-no', label: 'Does not hold one', points: 0 },
    ],
  },
  {
    id: 'regional-study',
    label: 'Study in regional Australia',
    helpText: 'Met the Australian study requirement while living and studying in a designated regional area.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — study in regional Australia`,
    note: 'Distance education does not count, and the campus must have been in a designated regional area for the whole of the study. Claiming this requires the Australian study requirement to be met as well.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['REGRES', 'STUDAU', 'TRANSC'],
    evidenceHint: 'Campus/enrolment confirmation and evidence of living in the regional area for the study period.',
    options: [
      { id: 'regstudy-yes', label: 'Studied and lived in a designated regional area', points: 5 },
      { id: 'regstudy-no', label: 'Did not', points: 0 },
    ],
  },
  {
    id: 'partner-skills',
    label: 'Partner skills',
    helpText: 'Points for a partner\'s skills, or for having no partner / an Australian citizen or PR partner.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — partner qualifications (bands revised by legislative instrument in November 2019)`,
    note: 'The 10-point skilled-partner band requires the partner to be under 45, hold at least Competent English, have a positive skills assessment in an occupation on the same list, and be applying for the same visa.',
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['MARCRT', 'DEFACT', 'ENGTST', 'SKLASS', 'CITZCT', 'VISAGR'],
    evidenceHint: 'Partner\'s English test and skills assessment, or evidence of the partner\'s Australian citizenship/PR, or evidence the applicant has no spouse or de facto partner.',
    options: [
      { id: 'partner-single-or-aus', label: 'No spouse or de facto partner, or partner is an Australian citizen or permanent resident', points: 10 },
      { id: 'partner-skilled', label: 'Partner has Competent English and a suitable skills assessment (under 45, applying for the same visa)', points: 10 },
      { id: 'partner-english', label: 'Partner has Competent English only', points: 5 },
      { id: 'partner-none', label: 'Partner meets none of the above', points: 0 },
    ],
  },
  {
    id: 'professional-year',
    label: 'Professional Year in Australia',
    helpText: 'A completed Professional Year of at least 12 months in the four years before invitation, in a field closely related to the nominated occupation.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — professional year qualifications`,
    appliesTo: ['189', '190', '491'],
    evidenceDocumentTypeCodes: ['PROYR'],
    evidenceHint: 'Professional Year completion certificate from an approved provider.',
    options: [
      { id: 'py-yes', label: 'Completed a qualifying Professional Year', points: 5 },
      { id: 'py-no', label: 'Did not', points: 0 },
    ],
  },
  {
    id: 'nomination-190',
    label: 'State or Territory nomination',
    helpText: 'Nomination by a State or Territory government for a subclass 190 visa.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — nomination by a State or Territory government`,
    appliesTo: ['190'],
    evidenceDocumentTypeCodes: ['NOMINV', 'NOMCOM', 'EOI'],
    evidenceHint: 'State/territory nomination invitation or approval, and the signed nomination commitment.',
    options: [
      { id: 'nom190-yes', label: 'Nominated by a State or Territory government', points: 5 },
      { id: 'nom190-no', label: 'Not nominated', points: 0 },
    ],
  },
  {
    id: 'nomination-491',
    label: 'Regional nomination or family sponsorship',
    helpText: 'Nomination by a State or Territory government, or sponsorship by an eligible family member living in a designated regional area, for a subclass 491 visa.',
    source: `${DOHA_TABLE}; Migration Regulations 1994 (Cth) Schedule 6D — nomination or sponsorship for a designated regional area`,
    appliesTo: ['491'],
    evidenceDocumentTypeCodes: ['NOMINV', 'NOMCOM', 'REGRES', 'EOI'],
    evidenceHint: 'Regional nomination approval, or the sponsoring relative\'s evidence of residence in a designated regional area.',
    options: [
      { id: 'nom491-yes', label: 'Nominated by a State or Territory, or sponsored by an eligible family member', points: 15 },
      { id: 'nom491-no', label: 'Not nominated or sponsored', points: 0 },
    ],
  },
];

/** The criteria that apply to a subclass, in table order. */
export function criteriaForSubclass(subclass: PointsSubclass): PointsCriterion[] {
  return POINTS_CRITERIA.filter(c => c.appliesTo.includes(subclass));
}

export function findCriterion(criterionId: string): PointsCriterion | undefined {
  return POINTS_CRITERIA.find(c => c.id === criterionId);
}

export function findOption(criterion: PointsCriterion, optionId: string | undefined): PointsOption | undefined {
  return optionId ? criterion.options.find(o => o.id === optionId) : undefined;
}

// ---------------------------------------------------------------------------
// Claimed / Proven / Outstanding
// ---------------------------------------------------------------------------

export type EvidenceStatus = 'unclaimed' | 'proven' | 'outstanding';

export interface CriterionResult {
  criterion: PointsCriterion;
  entry?: PointsClaimEntry;
  option?: PointsOption;
  /** Points the client says they qualify for. */
  claimedPoints: number;
  /** Claimed points backed by at least one linked Case File that still exists. */
  provenPoints: number;
  /** claimedPoints - provenPoints. */
  outstandingPoints: number;
  /** Linked documents that still exist in Case Files. */
  linkedDocuments: Document[];
  /** Linked document ids whose file is no longer in Case Files. */
  missingDocumentIds: string[];
  status: EvidenceStatus;
}

export interface CapAdjustment {
  group: PointsCapGroup;
  claimedRaw: number;
  claimedCapped: number;
  provenRaw: number;
  provenCapped: number;
}

export interface PointsSummary {
  subclass: PointsSubclass;
  results: CriterionResult[];
  /** Totals after cap groups are applied. */
  claimedTotal: number;
  provenTotal: number;
  outstandingTotal: number;
  capAdjustments: CapAdjustment[];
  meetsPassMark: boolean;
}

/**
 * Judgment call: a criterion counts as **proven** when at least one linked
 * Case File still exists — not when a human has separately ticked it off.
 *
 * The alternative (a third "verified by me" flag on top of the link) was
 * rejected as duplicating what the Document Checklist's Linked/Verified
 * statuses already do for documents, and because the value of this screen is
 * "what have I got a document for" — a question the link itself answers. An
 * agent who wants a second sign-off records it on the checklist item.
 */
export function calculatePoints(
  subclass: PointsSubclass,
  entries: PointsClaimEntry[],
  documents: Document[],
): PointsSummary {
  const docsById = new Map(documents.map(d => [d.id, d]));
  const entriesById = new Map(entries.map(e => [e.criterionId, e]));

  const results: CriterionResult[] = criteriaForSubclass(subclass).map(criterion => {
    const entry = entriesById.get(criterion.id);
    const option = findOption(criterion, entry?.optionId);
    const claimedPoints = option?.points ?? 0;

    const linkedDocuments: Document[] = [];
    const missingDocumentIds: string[] = [];
    for (const id of entry?.documentIds ?? []) {
      const doc = docsById.get(id);
      if (doc) linkedDocuments.push(doc);
      else missingDocumentIds.push(id);
    }

    const provenPoints = linkedDocuments.length > 0 ? claimedPoints : 0;
    const status: EvidenceStatus = !option
      ? 'unclaimed'
      : linkedDocuments.length > 0
        ? 'proven'
        : 'outstanding';

    return {
      criterion,
      entry,
      option,
      claimedPoints,
      provenPoints,
      outstandingPoints: claimedPoints - provenPoints,
      linkedDocuments,
      missingDocumentIds,
      status,
    };
  });

  // Cap groups are applied to claimed and proven alike — a cap is a limit on
  // what can be awarded, so evidence cannot push a total past it.
  const capAdjustments: CapAdjustment[] = [];
  let claimedTotal = 0;
  let provenTotal = 0;

  const ungrouped = results.filter(r => !r.criterion.capGroup);
  claimedTotal += ungrouped.reduce((sum, r) => sum + r.claimedPoints, 0);
  provenTotal += ungrouped.reduce((sum, r) => sum + r.provenPoints, 0);

  for (const group of POINTS_CAP_GROUPS) {
    const inGroup = results.filter(r => r.criterion.capGroup === group.id);
    if (inGroup.length === 0) continue;
    const claimedRaw = inGroup.reduce((sum, r) => sum + r.claimedPoints, 0);
    const provenRaw = inGroup.reduce((sum, r) => sum + r.provenPoints, 0);
    const claimedCapped = Math.min(claimedRaw, group.max);
    const provenCapped = Math.min(provenRaw, group.max);
    claimedTotal += claimedCapped;
    provenTotal += provenCapped;
    capAdjustments.push({ group, claimedRaw, claimedCapped, provenRaw, provenCapped });
  }

  return {
    subclass,
    results,
    claimedTotal,
    provenTotal,
    outstandingTotal: claimedTotal - provenTotal,
    capAdjustments,
    meetsPassMark: claimedTotal >= POINTS_PASS_MARK,
  };
}

/**
 * Case Files that look like evidence for a criterion, by Document Type code —
 * the same code-matching the Document Checklist auto-link uses
 * (`lib/autoLink.ts`).
 *
 * Judgment call: unlike checklist auto-link this ignores the Document Type's
 * per-firm `autoLink` flag and never links anything on its own. A points claim
 * is an assertion the agent signs off on, so evidence here is *suggested* and
 * attached by a click; the `autoLink` flag governs a different, automatic
 * behaviour and reusing it would silently mark claims as proven.
 */
export function suggestEvidenceForCriterion(criterion: PointsCriterion, documents: Document[]): Document[] {
  const codes = new Set(criterion.evidenceDocumentTypeCodes);
  return documents
    .filter(d => d.documentTypeCode && codes.has(d.documentTypeCode))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** An empty claim for a case, defaulted to a subclass. */
export function emptyPointsClaim(id: string, caseId: string, subclass: PointsSubclass): CasePointsClaim {
  return { id, caseId, subclass, entries: [], updatedAt: new Date().toISOString() };
}
