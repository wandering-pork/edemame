/**
 * Per-authority employment reference letter requirements (GitHub issue #32).
 *
 * ⚠️ AUTHORED, NOT SOURCED — every rule in this file is a best-effort
 * reconstruction of what ACS, AITSL, Engineers Australia, VETASSESS and ANMAC
 * commonly ask for in an employment reference (statement of service) letter.
 * There is no machine-readable source of truth published by these authorities,
 * so this list was written from general knowledge and has NOT been verified
 * against the authorities' current published guidance. It must be reviewed by a
 * qualified human (RMA / registered migration lawyer) before being relied on,
 * and every surface that renders it must frame the output as AI-assisted
 * drafting help — never as a compliance guarantee.
 *
 * Structured the same way as `lib/documentTypes.ts` / `lib/checklistTemplates.ts`:
 * versionable data in one file, consumed by components rather than inlined in
 * them, so a legal review turns into a diff on this file alone.
 */

// ---------------------------------------------------------------------------
// Canonical field catalogue
// ---------------------------------------------------------------------------

/**
 * The union of every field any of the five authorities can require. Kept as one
 * catalogue (rather than per-authority field lists) so the Gemini extraction
 * schema is derived from a stable set of keys and an authority's rule set is
 * only a choice of which keys are required.
 */
export type ReferenceLetterFieldKey =
  | 'letterhead'
  | 'companyName'
  | 'companyAddress'
  | 'companyContact'
  | 'abn'
  | 'employeeName'
  | 'positionTitle'
  | 'nominatedOccupation'
  | 'employmentStartDate'
  | 'employmentEndDate'
  | 'employmentType'
  | 'hoursPerWeek'
  | 'duties'
  | 'salary'
  | 'countryOfEmployment'
  | 'registrationDetails'
  | 'signatoryName'
  | 'signatoryPosition'
  | 'signatoryContact'
  | 'signedAndDated';

export interface ReferenceLetterField {
  key: ReferenceLetterFieldKey;
  /** Short label used in the review UI. */
  label: string;
  /** What the extractor should look for — doubles as the reviewer's hint text. */
  hint: string;
}

export const REFERENCE_LETTER_FIELDS: ReferenceLetterField[] = [
  {
    key: 'letterhead',
    label: 'Company letterhead',
    hint: 'Whether the letter appears to be on official company letterhead (logo / printed company header). Answer with a short description, or leave empty if it is a plain unbranded page.',
  },
  { key: 'companyName', label: 'Employer name', hint: 'Full legal or trading name of the employing organisation.' },
  { key: 'companyAddress', label: 'Employer address', hint: 'Street address of the employer as printed on the letter.' },
  {
    key: 'companyContact',
    label: 'Employer contact details',
    hint: 'Employer phone number, email address or website shown on the letter.',
  },
  { key: 'abn', label: 'ABN / business registration number', hint: 'Australian Business Number, or the equivalent overseas business/company registration number.' },
  { key: 'employeeName', label: 'Employee full name', hint: 'Full name of the employee the letter is about.' },
  { key: 'positionTitle', label: 'Position / job title held', hint: 'The exact job title the employee held at this employer.' },
  {
    key: 'nominatedOccupation',
    label: 'Nominated occupation / ANZSCO reference',
    hint: 'Any statement linking the role to a nominated occupation or ANZSCO code.',
  },
  { key: 'employmentStartDate', label: 'Employment start date', hint: 'Start date of the employment period, as written on the letter.' },
  {
    key: 'employmentEndDate',
    label: 'Employment end date',
    hint: 'End date of the employment period, or a statement that the employee is still employed ("to date", "ongoing").',
  },
  {
    key: 'employmentType',
    label: 'Employment type',
    hint: 'Full-time, part-time, casual, contract, or whether the work was paid/unpaid.',
  },
  { key: 'hoursPerWeek', label: 'Hours worked per week', hint: 'Number of hours worked per week (e.g. "38 hours per week").' },
  {
    key: 'duties',
    label: 'Duties performed',
    hint: 'The description of duties/responsibilities actually performed in the role. Return the duties text, condensed if long.',
  },
  { key: 'salary', label: 'Salary / remuneration', hint: 'Salary or remuneration figure, including currency and period (e.g. "AUD 92,000 per annum").' },
  { key: 'countryOfEmployment', label: 'Country of employment', hint: 'The country (and city if stated) where the work was performed.' },
  {
    key: 'registrationDetails',
    label: 'Registration / licence details',
    hint: 'Any professional registration, licence or AHPRA-style number for the employee or the signatory.',
  },
  { key: 'signatoryName', label: 'Signatory name', hint: 'Name of the person who signed the letter.' },
  { key: 'signatoryPosition', label: 'Signatory position', hint: "Signatory's job title / position within the employing organisation." },
  {
    key: 'signatoryContact',
    label: 'Signatory contact details',
    hint: "Signatory's direct phone number and/or email address for verification.",
  },
  {
    key: 'signedAndDated',
    label: 'Signature and date',
    hint: 'Whether the letter carries a signature and a date it was issued. Describe what is present, or leave empty.',
  },
];

export const REFERENCE_LETTER_FIELDS_BY_KEY: Record<ReferenceLetterFieldKey, ReferenceLetterField> =
  REFERENCE_LETTER_FIELDS.reduce((acc, f) => {
    acc[f.key] = f;
    return acc;
  }, {} as Record<ReferenceLetterFieldKey, ReferenceLetterField>);

// ---------------------------------------------------------------------------
// Authorities
// ---------------------------------------------------------------------------

export type ReferenceLetterAuthorityId = 'acs' | 'aitsl' | 'engineers-australia' | 'vetassess' | 'anmac';

export interface ReferenceLetterAuthority {
  id: ReferenceLetterAuthorityId;
  /** Full name, as used in headings. */
  name: string;
  /** Short name for chips and filenames. */
  shortName: string;
  /** Which occupations this authority assesses — helps the user pick correctly. */
  occupationScope: string;
  /** One-paragraph plain-English summary of what this authority looks for. */
  guidance: string;
  /** Fields the authority's guidance commonly treats as mandatory. */
  requiredFields: ReferenceLetterFieldKey[];
  /** Fields that strengthen the letter but are not usually fatal if absent. */
  recommendedFields: ReferenceLetterFieldKey[];
  /** Authority-specific pointers rendered under the generated template. */
  templateNotes: string[];
}

const COMMON_REQUIRED: ReferenceLetterFieldKey[] = [
  'letterhead',
  'companyName',
  'companyAddress',
  'companyContact',
  'employeeName',
  'positionTitle',
  'employmentStartDate',
  'employmentEndDate',
  'employmentType',
  'hoursPerWeek',
  'duties',
  'signatoryName',
  'signatoryPosition',
  'signatoryContact',
  'signedAndDated',
];

export const REFERENCE_LETTER_AUTHORITIES: ReferenceLetterAuthority[] = [
  {
    id: 'acs',
    name: 'Australian Computer Society (ACS)',
    shortName: 'ACS',
    occupationScope: 'ICT occupations — developers, analysts, network and systems roles',
    guidance:
      'ACS expects a "statement of service" style reference on company letterhead that ties the duties actually performed to the nominated ANZSCO ICT occupation. Duties written as generic bullet points copied from a position description are a common reason for a skilled-employment claim being cut back.',
    requiredFields: [...COMMON_REQUIRED, 'nominatedOccupation', 'countryOfEmployment'],
    recommendedFields: ['abn', 'salary'],
    templateNotes: [
      'Describe duties in the employee\'s own role rather than restating the ANZSCO description word-for-word.',
      'State the ANZSCO code and title of the nominated occupation the experience is being claimed against.',
      'If the employment was outside Australia, name the country — ACS treats onshore and offshore experience differently.',
      'Third-party letters (e.g. from a colleague rather than HR) usually need a statutory declaration alongside them.',
    ],
  },
  {
    id: 'aitsl',
    name: 'Australian Institute for Teaching and School Leadership (AITSL)',
    shortName: 'AITSL',
    occupationScope: 'Teaching occupations — early childhood, primary, secondary and special education teachers',
    guidance:
      'AITSL assessments are qualification-led, but employment references are used to evidence supervised teaching practice and post-qualification teaching experience. Letters should identify the school/institution, the year levels and subjects taught, and the teaching registration held.',
    requiredFields: [...COMMON_REQUIRED, 'countryOfEmployment', 'registrationDetails'],
    recommendedFields: ['abn', 'salary', 'nominatedOccupation'],
    templateNotes: [
      'Name the school or institution, its sector (government / Catholic / independent) and the year levels and subjects taught.',
      'State the teaching registration or licence held during the period, including the issuing body.',
      'Distinguish supervised practicum hours from post-qualification teaching employment if both are covered.',
    ],
  },
  {
    id: 'engineers-australia',
    name: 'Engineers Australia',
    shortName: 'Engineers Australia',
    occupationScope: 'Engineering occupations — professional engineers, technologists, associates',
    guidance:
      'Engineers Australia relies on employment references to corroborate the career episodes in a Competency Demonstration Report (or to support a Relevant Skilled Employment Assessment). The letter should make clear the engineering discipline, the level of responsibility, and that the work was engineering work at the claimed occupational category.',
    requiredFields: [...COMMON_REQUIRED, 'nominatedOccupation', 'countryOfEmployment'],
    recommendedFields: ['abn', 'salary', 'registrationDetails'],
    templateNotes: [
      'State the engineering discipline and the occupational category claimed (Professional Engineer / Engineering Technologist / Engineering Associate).',
      'Describe the level of responsibility and any supervision, design or project-management duties.',
      'Keep the duties consistent with the career episodes described in the CDR — inconsistencies are queried.',
    ],
  },
  {
    id: 'vetassess',
    name: 'VETASSESS',
    shortName: 'VETASSESS',
    occupationScope: 'General professional, technical and trade occupations not covered by a specialist authority',
    guidance:
      'VETASSESS is the strictest of the five on the mechanics of the letter itself: it must be on letterhead, signed and dated by an authorised person, show that person\'s position and direct contact details, and state the employment dates, the hours per week, the salary and the duties actually performed. Payslips or tax records are usually expected alongside it.',
    requiredFields: [...COMMON_REQUIRED, 'salary', 'countryOfEmployment', 'nominatedOccupation'],
    recommendedFields: ['abn', 'registrationDetails'],
    templateNotes: [
      'Show the employment period with exact dates, and state the hours per week — VETASSESS will not infer full-time status.',
      'Include remuneration with currency and period; unpaid or voluntary work is assessed differently.',
      'The signatory must be someone able to verify the employment (HR, direct manager or a company director) with a direct phone and email.',
      'Pair the letter with independent evidence — payslips, tax documents or superannuation records — for the same period.',
    ],
  },
  {
    id: 'anmac',
    name: 'Australian Nursing and Midwifery Accreditation Council (ANMAC)',
    shortName: 'ANMAC',
    occupationScope: 'Nursing and midwifery occupations',
    guidance:
      'ANMAC skilled-employment references need to establish registered practice: the clinical setting, the registration division held during the period, and the hours worked. Registration (AHPRA or the overseas equivalent) held at the time of the employment is central.',
    requiredFields: [...COMMON_REQUIRED, 'registrationDetails', 'countryOfEmployment'],
    recommendedFields: ['abn', 'salary', 'nominatedOccupation'],
    templateNotes: [
      'State the registration division and registration number held during the employment period (AHPRA or overseas equivalent).',
      'Name the clinical setting or ward/unit and the nature of the nursing or midwifery practice performed.',
      'Confirm the hours per week and whether the role was permanent, agency or casual.',
    ],
  },
];

export const REFERENCE_LETTER_AUTHORITIES_BY_ID: Record<ReferenceLetterAuthorityId, ReferenceLetterAuthority> =
  REFERENCE_LETTER_AUTHORITIES.reduce((acc, a) => {
    acc[a.id] = a;
    return acc;
  }, {} as Record<ReferenceLetterAuthorityId, ReferenceLetterAuthority>);

export interface ReferenceLetterRequirement {
  field: ReferenceLetterField;
  required: boolean;
}

/** Required fields first, then recommended ones, both in catalogue order. */
export function requirementsForAuthority(id: ReferenceLetterAuthorityId): ReferenceLetterRequirement[] {
  const authority = REFERENCE_LETTER_AUTHORITIES_BY_ID[id];
  const required = new Set<ReferenceLetterFieldKey>(authority.requiredFields);
  const recommended = new Set<ReferenceLetterFieldKey>(authority.recommendedFields);
  const inOrder = (set: Set<ReferenceLetterFieldKey>) =>
    REFERENCE_LETTER_FIELDS.filter(f => set.has(f.key));
  return [
    ...inOrder(required).map(field => ({ field, required: true })),
    ...inOrder(recommended).map(field => ({ field, required: false })),
  ];
}

/** Values keyed by field — empty string means "not found in the letter". */
export type ReferenceLetterValues = Partial<Record<ReferenceLetterFieldKey, string>>;

export interface ReferenceLetterValidation {
  missingRequired: ReferenceLetterField[];
  missingRecommended: ReferenceLetterField[];
  presentRequired: ReferenceLetterField[];
  /** 0–100, share of the authority's required fields that were found. */
  completeness: number;
}

/** Pure comparison of extracted values against one authority's rule set. */
export function validateAgainstAuthority(
  id: ReferenceLetterAuthorityId,
  values: ReferenceLetterValues,
): ReferenceLetterValidation {
  const missingRequired: ReferenceLetterField[] = [];
  const missingRecommended: ReferenceLetterField[] = [];
  const presentRequired: ReferenceLetterField[] = [];

  for (const { field, required } of requirementsForAuthority(id)) {
    const filled = (values[field.key] || '').trim().length > 0;
    if (required) {
      (filled ? presentRequired : missingRequired).push(field);
    } else if (!filled) {
      missingRecommended.push(field);
    }
  }

  const totalRequired = presentRequired.length + missingRequired.length;
  return {
    missingRequired,
    missingRecommended,
    presentRequired,
    completeness: totalRequired === 0 ? 100 : Math.round((presentRequired.length / totalRequired) * 100),
  };
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

/** Placeholder rendered for anything the case doesn't already know. */
export function referenceLetterPlaceholder(field: ReferenceLetterField): string {
  return `[INSERT ${field.label.toUpperCase()}]`;
}

function value(values: ReferenceLetterValues, key: ReferenceLetterFieldKey): string {
  const v = (values[key] || '').trim();
  return v || referenceLetterPlaceholder(REFERENCE_LETTER_FIELDS_BY_KEY[key]);
}

/**
 * Builds a plain-text reference letter draft for the given authority,
 * pre-filled with whatever `values` already holds and placeholdered elsewhere.
 *
 * Deliberately plain text (not DOCX/PDF): the employer has to retype or paste
 * this onto their own letterhead anyway, so a copyable/downloadable .txt draft
 * is the honest output — see the disclaimer block at the top of the letter.
 */
export function buildReferenceLetterTemplate(
  id: ReferenceLetterAuthorityId,
  values: ReferenceLetterValues,
): string {
  const authority = REFERENCE_LETTER_AUTHORITIES_BY_ID[id];
  const v = (key: ReferenceLetterFieldKey) => value(values, key);
  const needsSalary = authority.requiredFields.includes('salary') || authority.recommendedFields.includes('salary');
  const needsRegistration =
    authority.requiredFields.includes('registrationDetails') || authority.recommendedFields.includes('registrationDetails');
  const needsOccupation =
    authority.requiredFields.includes('nominatedOccupation') || authority.recommendedFields.includes('nominatedOccupation');

  const lines: string[] = [
    `DRAFT — NOT A SUBMITTABLE DOCUMENT`,
    `Prepared for: ${authority.name} (${authority.shortName})`,
    ``,
    `This is an AI-assisted draft for the employer to complete, check and reproduce on`,
    `their own company letterhead before signing. Replace every [INSERT …] placeholder.`,
    `It is drafting assistance only — it is not legal advice and does not guarantee that`,
    `${authority.shortName} will accept the finished letter. Review before use.`,
    ``,
    `----------------------------------------------------------------------`,
    ``,
    `[EMPLOYER LETTERHEAD — company logo, ${v('companyName')}]`,
    `${v('companyAddress')}`,
    `${v('companyContact')}`,
    `ABN / business registration number: ${v('abn')}`,
    ``,
    `Date: [INSERT DATE OF ISSUE]`,
    ``,
    `TO WHOM IT MAY CONCERN`,
    ``,
    `STATEMENT OF SERVICE — ${v('employeeName')}`,
    ``,
    `I confirm that ${v('employeeName')} was employed by ${v('companyName')} in the`,
    `position of ${v('positionTitle')}.`,
    ``,
    `Employment period:      ${v('employmentStartDate')} to ${v('employmentEndDate')}`,
    `Employment type:        ${v('employmentType')}`,
    `Hours worked per week:  ${v('hoursPerWeek')}`,
    `Place of employment:    ${v('countryOfEmployment')}`,
  ];

  if (needsSalary) lines.push(`Remuneration:           ${v('salary')}`);
  if (needsOccupation) lines.push(`Nominated occupation:   ${v('nominatedOccupation')}`);
  if (needsRegistration) lines.push(`Registration held:      ${v('registrationDetails')}`);

  lines.push(
    ``,
    `During this period, ${v('employeeName')} performed the following duties:`,
    ``,
    values.duties?.trim()
      ? values.duties.trim().split(/\n|;\s*/).filter(Boolean).map(d => `  - ${d.trim()}`).join('\n')
      : [
          `  - [INSERT DUTY 1 — describe what the employee actually did, in your own words]`,
          `  - [INSERT DUTY 2]`,
          `  - [INSERT DUTY 3]`,
          `  - [INSERT DUTY 4]`,
        ].join('\n'),
    ``,
    `These duties were performed under my direct knowledge. I am happy to be contacted`,
    `to verify the information in this letter.`,
    ``,
    `Yours sincerely,`,
    ``,
    ``,
    `_____________________________________`,
    `${v('signatoryName')}`,
    `${v('signatoryPosition')}`,
    `${v('companyName')}`,
    `${v('signatoryContact')}`,
    ``,
    `----------------------------------------------------------------------`,
    ``,
    `Before sending this to the employer, check that:`,
    ...authority.templateNotes.map(n => `  - ${n}`),
    ``,
    `Authority guidance (AI-suggested summary — verify against ${authority.shortName}'s current published guidance):`,
    `  ${authority.guidance}`,
    ``,
  );

  return lines.join('\n');
}

/** `ACS_Reference_Letter_Draft_Nguyen_20260829.txt` */
export function referenceLetterFileName(id: ReferenceLetterAuthorityId, employeeName: string, date: Date): string {
  const authority = REFERENCE_LETTER_AUTHORITIES_BY_ID[id];
  const token = authority.shortName.replace(/[^A-Za-z0-9]+/g, '');
  const surname = (employeeName.trim().split(/\s+/).pop() || 'Applicant').replace(/[^A-Za-z0-9]+/g, '');
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  return `${token}_Reference_Letter_Draft_${surname}_${stamp}.txt`;
}
