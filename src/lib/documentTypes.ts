import { v4 as uuidv4 } from 'uuid';
import type { DocumentType } from '../types';
import type { IDocumentTypeRepository } from '../repositories/types';

/**
 * System default Document Type reference list (GitHub issue #4 §3.3).
 *
 * Seeded per account on first load and locked against rename/recode/delete —
 * only the per-firm `autoLink` flag is editable on these rows. Firms may append
 * their own rows on top; the seeded set is expected to cover the large majority
 * of AU immigration matters.
 *
 * `OTH` is the mandated fallback row: every picker offers it so a user is never
 * blocked by a document that doesn't fit a specific type.
 */

export const DOCUMENT_TYPE_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
export const DOCUMENT_TYPE_CODE_MAX = 6;
export const DOCUMENT_TYPE_DESCRIPTION_MAX = 100;

/** The fallback code every picker offers when nothing else fits. */
export const OTHER_DOCUMENT_TYPE_CODE = 'OTH';

export interface SystemDocumentTypeSeed {
  code: string;
  description: string;
  category: string;
}

/** Display order for the grouped pickers and the Configurations list. */
export const DOCUMENT_TYPE_CATEGORY_ORDER = [
  'Identity',
  'Civil Status',
  'Sponsor & Employer',
  'Skills & Qualifications',
  'Health & Character',
  'State Nomination & Points',
  'Partner Visa — Sponsor',
  'Partner Visa — Financial Aspects',
  'Partner Visa — Household',
  'Partner Visa — Social Context',
  'Partner Visa — Nature of Relationship',
  'Children & Dependants',
  'Secondary Applicants',
  'Other',
];

export const SYSTEM_DOCUMENT_TYPES: SystemDocumentTypeSeed[] = [
  // --- Identity ---
  { code: 'PPT', description: 'Passport — all pages', category: 'Identity' },
  { code: 'PPTBIO', description: 'Passport biodata page', category: 'Identity' },
  { code: 'NIDCRD', description: 'National identity card', category: 'Identity' },
  { code: 'BIRTH', description: 'Birth certificate or certified extract', category: 'Identity' },
  { code: 'NAMECH', description: 'Change of name certificate or deed poll', category: 'Identity' },
  { code: 'PHOTO', description: 'Passport-sized photograph', category: 'Identity' },
  { code: 'CITZCT', description: 'Citizenship certificate', category: 'Identity' },
  { code: 'VISAGR', description: 'Current visa grant notice', category: 'Identity' },
  { code: 'TRAVEL', description: 'Travel history — entry and exit records', category: 'Identity' },
  { code: 'RESPMT', description: 'Residence permit for country of current residence', category: 'Identity' },

  // --- Civil Status ---
  { code: 'MARCRT', description: 'Marriage certificate', category: 'Civil Status' },
  { code: 'DIVCRT', description: 'Divorce certificate or decree absolute', category: 'Civil Status' },
  { code: 'DEATHC', description: 'Death certificate of a former spouse', category: 'Civil Status' },
  { code: 'DEFACT', description: 'Statutory declaration of de facto relationship', category: 'Civil Status' },
  { code: 'RELREG', description: 'Relationship registration certificate', category: 'Civil Status' },
  { code: 'SEPAGR', description: 'Separation agreement or consent orders', category: 'Civil Status' },
  { code: 'FAMREG', description: 'Family register or household book', category: 'Civil Status' },

  // --- Sponsor & Employer ---
  { code: 'SBSAPP', description: 'Approved Standard Business Sponsorship letter', category: 'Sponsor & Employer' },
  { code: 'NOMAPP', description: 'Nomination application (Form 1395)', category: 'Sponsor & Employer' },
  { code: 'EMPCON', description: 'Employment contract signed by both parties', category: 'Sponsor & Employer' },
  { code: 'TSMIT', description: 'Evidence salary meets the current TSMIT threshold', category: 'Sponsor & Employer' },
  { code: 'SAFLVY', description: 'Skilling Australians Fund (SAF) levy receipt', category: 'Sponsor & Employer' },
  { code: 'LMTEVD', description: 'Labour Market Testing evidence — job advertisements', category: 'Sponsor & Employer' },
  { code: 'BUSREG', description: 'Business registration or ABN extract', category: 'Sponsor & Employer' },
  { code: 'EMPFIN', description: 'Employer financial statements', category: 'Sponsor & Employer' },
  { code: 'ORGCHT', description: 'Organisational chart showing the nominated position', category: 'Sponsor & Employer' },
  { code: 'POSDES', description: 'Position description for the nominated occupation', category: 'Sponsor & Employer' },

  // --- Skills & Qualifications ---
  { code: 'SKLASS', description: 'Skills assessment certificate from the assessing authority', category: 'Skills & Qualifications' },
  { code: 'DEGCRT', description: 'Degree, diploma or award certificate', category: 'Skills & Qualifications' },
  { code: 'TRANSC', description: 'Academic transcript', category: 'Skills & Qualifications' },
  { code: 'REFLTR', description: 'Employment reference letter', category: 'Skills & Qualifications' },
  { code: 'PAYSLP', description: 'Payslips evidencing employment', category: 'Skills & Qualifications' },
  { code: 'TAXSTM', description: 'Tax statements or other income evidence', category: 'Skills & Qualifications' },
  { code: 'CV', description: 'Curriculum vitae / résumé', category: 'Skills & Qualifications' },
  { code: 'LICREG', description: 'Professional licence or registration', category: 'Skills & Qualifications' },
  { code: 'ENGTST', description: 'English language test result (IELTS / PTE / TOEFL)', category: 'Skills & Qualifications' },

  // --- Health & Character ---
  { code: 'AFPCHK', description: 'AFP National Police Check', category: 'Health & Character' },
  { code: 'OSPOL', description: 'Overseas police clearance certificate', category: 'Health & Character' },
  { code: 'MEDEX', description: 'Immigration medical examination results / HAP ID letter', category: 'Health & Character' },
  { code: 'CHESTX', description: 'Chest x-ray report', category: 'Health & Character' },
  { code: 'F80', description: 'Form 80 — Personal particulars for assessment', category: 'Health & Character' },
  { code: 'F1221', description: 'Form 1221 — Additional personal particulars', category: 'Health & Character' },
  { code: 'MILSVC', description: 'Military service record or discharge papers', category: 'Health & Character' },
  { code: 'CHARST', description: 'Character statutory declaration or explanation', category: 'Health & Character' },
  { code: 'VACCIN', description: 'Vaccination or immunisation record', category: 'Health & Character' },

  // --- State Nomination & Points ---
  { code: 'EOI', description: 'SkillSelect Expression of Interest summary', category: 'State Nomination & Points' },
  { code: 'NOMINV', description: 'State or territory nomination invitation', category: 'State Nomination & Points' },
  { code: 'NOMCOM', description: 'State or territory nomination commitment statement', category: 'State Nomination & Points' },
  { code: 'PTSCLM', description: 'Points claim summary and supporting breakdown', category: 'State Nomination & Points' },
  { code: 'REGRES', description: 'Evidence of regional residence or regional work', category: 'State Nomination & Points' },
  { code: 'STUDAU', description: 'Evidence of Australian study requirement', category: 'State Nomination & Points' },
  { code: 'PROYR', description: 'Professional Year completion certificate', category: 'State Nomination & Points' },
  { code: 'CCLANG', description: 'Credentialled community language (NAATI) certificate', category: 'State Nomination & Points' },

  // --- Partner Visa — Sponsor ---
  { code: 'SPNAPP', description: 'Sponsorship application (Form 40SP)', category: 'Partner Visa — Sponsor' },
  { code: 'SPNIDN', description: 'Sponsor identity documents', category: 'Partner Visa — Sponsor' },
  { code: 'SPNPOL', description: 'Sponsor police check', category: 'Partner Visa — Sponsor' },
  { code: 'SPNFIN', description: 'Sponsor financial capacity evidence', category: 'Partner Visa — Sponsor' },

  // --- Partner Visa — Financial Aspects ---
  { code: 'JNTACC', description: 'Joint bank account statements', category: 'Partner Visa — Financial Aspects' },
  { code: 'JNTLIA', description: 'Joint liabilities — loans, credit, debts', category: 'Partner Visa — Financial Aspects' },
  { code: 'SHREXP', description: 'Evidence of shared household expenses', category: 'Partner Visa — Financial Aspects' },
  { code: 'ASTOWN', description: 'Jointly owned assets — property, vehicles', category: 'Partner Visa — Financial Aspects' },
  { code: 'FINSUP', description: 'Evidence of financial support between partners', category: 'Partner Visa — Financial Aspects' },
  { code: 'INSPOL', description: 'Insurance policies naming the partner', category: 'Partner Visa — Financial Aspects' },

  // --- Partner Visa — Household ---
  { code: 'JNTLSE', description: 'Joint lease, mortgage or tenancy agreement', category: 'Partner Visa — Household' },
  { code: 'UTLBIL', description: 'Utility bills in both names', category: 'Partner Visa — Household' },
  { code: 'MAILAD', description: 'Mail addressed to both partners at the same address', category: 'Partner Visa — Household' },
  { code: 'HHCHOR', description: 'Statement of household responsibilities', category: 'Partner Visa — Household' },
  { code: 'CORRAD', description: 'Correspondence evidencing a shared address', category: 'Partner Visa — Household' },

  // --- Partner Visa — Social Context ---
  { code: 'SOCPHT', description: 'Photographs of the couple together', category: 'Partner Visa — Social Context' },
  { code: 'SOCEVT', description: 'Evidence of joint social events or travel', category: 'Partner Visa — Social Context' },
  { code: 'F888', description: 'Form 888 statutory declaration from a supporting witness', category: 'Partner Visa — Social Context' },
  { code: 'SOCMED', description: 'Social media or messaging evidence', category: 'Partner Visa — Social Context' },
  { code: 'JNTINV', description: 'Joint invitations, memberships or club records', category: 'Partner Visa — Social Context' },

  // --- Partner Visa — Nature of Relationship ---
  { code: 'RELSTM', description: 'Personal statement about the relationship history', category: 'Partner Visa — Nature of Relationship' },
  { code: 'COMMLG', description: 'Communication log covering periods apart', category: 'Partner Visa — Nature of Relationship' },
  { code: 'FUTPLN', description: 'Evidence of future plans and commitments', category: 'Partner Visa — Nature of Relationship' },
  { code: 'WILLDC', description: 'Wills or superannuation beneficiary nominations', category: 'Partner Visa — Nature of Relationship' },
  { code: 'POWATT', description: 'Power of attorney naming the partner', category: 'Partner Visa — Nature of Relationship' },

  // --- Children & Dependants ---
  { code: 'BRTHCH', description: "Child's birth certificate", category: 'Children & Dependants' },
  { code: 'CUSTOD', description: 'Custody or guardianship orders', category: 'Children & Dependants' },
  { code: 'CONSNT', description: 'Consent to travel from a non-migrating parent (Form 1229)', category: 'Children & Dependants' },
  { code: 'SCHENR', description: 'School enrolment records', category: 'Children & Dependants' },
  { code: 'DEPFIN', description: 'Evidence of financial dependency', category: 'Children & Dependants' },
  { code: 'ADOPTN', description: 'Adoption papers or court orders', category: 'Children & Dependants' },

  // --- Secondary Applicants ---
  { code: 'SECIDN', description: 'Secondary applicant identity documents', category: 'Secondary Applicants' },
  { code: 'SECMED', description: 'Secondary applicant medical examination', category: 'Secondary Applicants' },
  { code: 'SECPOL', description: 'Secondary applicant police clearance', category: 'Secondary Applicants' },
  { code: 'SECREL', description: 'Evidence of relationship to the primary applicant', category: 'Secondary Applicants' },
  { code: 'SECENG', description: 'Secondary applicant English evidence or VAC2 exemption', category: 'Secondary Applicants' },

  // --- Other (mandated fallback) ---
  { code: OTHER_DOCUMENT_TYPE_CODE, description: 'Other — anything not covered by a specific type', category: 'Other' },
];

/** Validates a proposed code; returns an error message, or null when valid. */
export function validateDocumentTypeCode(code: string, existing: DocumentType[], selfId?: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return 'Code is required.';
  if (!DOCUMENT_TYPE_CODE_PATTERN.test(trimmed)) {
    return 'Code must be 1–6 characters, uppercase letters and digits only.';
  }
  if (existing.some(t => t.code === trimmed && t.id !== selfId)) return `Code "${trimmed}" is already in use.`;
  return null;
}

/** Validates a proposed description; returns an error message, or null when valid. */
export function validateDocumentTypeDescription(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return 'Description is required.';
  if (trimmed.length > DOCUMENT_TYPE_DESCRIPTION_MAX) {
    return `Description must be ${DOCUMENT_TYPE_DESCRIPTION_MAX} characters or fewer.`;
  }
  return null;
}

/**
 * Seeds any missing system-default rows for the account and returns the full
 * list. Idempotent: only codes not already present are written, so a firm's
 * `autoLink` choices (and any custom rows) survive, and seed rows added in a
 * later release appear on the next load without a migration.
 */
export async function ensureSystemDocumentTypes(repo: IDocumentTypeRepository): Promise<DocumentType[]> {
  const existing = await repo.getAll();
  const known = new Set(existing.map(t => t.code));
  const missing = SYSTEM_DOCUMENT_TYPES.filter(s => !known.has(s.code)).map(s => ({
    id: uuidv4(),
    code: s.code,
    description: s.description,
    category: s.category,
    isSystemDefault: true,
    // Opt-in by design (§3.4) — firms consciously choose what is safe to auto-link.
    autoLink: false,
  }));
  if (missing.length === 0) return existing;
  await repo.createMany(missing);
  return [...existing, ...missing];
}

/** Sorts by the canonical category order, then alphabetically by code. */
export function sortDocumentTypes(types: DocumentType[]): DocumentType[] {
  const rank = (cat: string) => {
    const i = DOCUMENT_TYPE_CATEGORY_ORDER.indexOf(cat);
    return i === -1 ? DOCUMENT_TYPE_CATEGORY_ORDER.length : i;
  };
  return [...types].sort(
    (a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category) || a.code.localeCompare(b.code),
  );
}

/** Groups types into `[category, types[]]` pairs in canonical category order. */
export function groupDocumentTypes(types: DocumentType[]): Array<[string, DocumentType[]]> {
  const groups = new Map<string, DocumentType[]>();
  for (const t of sortDocumentTypes(types)) {
    if (!groups.has(t.category)) groups.set(t.category, []);
    groups.get(t.category)!.push(t);
  }
  return Array.from(groups.entries());
}

/** Search-as-you-type filter, matching on code and description (and category). */
export function filterDocumentTypes(types: DocumentType[], query: string): DocumentType[] {
  const q = query.trim().toLowerCase();
  if (!q) return types;
  return types.filter(
    t =>
      t.code.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
  );
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'or', 'and', 'for', 'from', 'with', 'all', 'any', 'to', 'in', 'on', 'by',
  'evidence', 'document', 'documents', 'certificate', 'certified', 'copy', 'copies', 'applicant',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Best-effort default Document Type for a generated checklist item (§5.1):
 * scores the item's label/description against each type's description, taking
 * the highest word overlap and falling back to `OTH` when nothing matches.
 * Deliberately a heuristic — the user can change the type on any item at any
 * time, which is cheaper than being wrong in a way they can't correct.
 */
export function suggestDocumentTypeCode(label: string, types: DocumentType[], description?: string): string {
  const itemWords = new Set(tokenize(`${label} ${description ?? ''}`));
  if (itemWords.size === 0) return OTHER_DOCUMENT_TYPE_CODE;

  let best: { code: string; score: number } = { code: OTHER_DOCUMENT_TYPE_CODE, score: 0 };
  for (const type of types) {
    if (type.code === OTHER_DOCUMENT_TYPE_CODE) continue;
    const typeWords = tokenize(type.description);
    if (typeWords.length === 0) continue;
    let hits = 0;
    for (const w of typeWords) if (itemWords.has(w)) hits++;
    // Normalise so a short, fully-matched description beats a long, partly-matched one.
    const score = hits / typeWords.length + hits * 0.01;
    if (hits > 0 && score > best.score) best = { code: type.code, score };
  }
  return best.score > 0 ? best.code : OTHER_DOCUMENT_TYPE_CODE;
}
