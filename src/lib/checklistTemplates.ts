import type { DocumentChecklistItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Required document labels per visa subclass.
 * Each entry: [label, description?]
 */
const CHECKLIST_DEFINITIONS: Record<string, Array<[string, string?]>> = {
  '186': [
    ['Passport (all pages)', 'Must be valid for at least 12 months from lodgement'],
    ['Skills assessment certificate', 'From relevant assessing authority (TRA, ACS, AHPRA, etc.)'],
    ['IELTS / PTE / TOEFL certificate', 'Competent English required — minimum IELTS 6.0 in each band'],
    ['Employment contract', 'Current employer — signed by both parties'],
    ['Reference letters (last 5 years)', 'From all employers relevant to the nominated occupation'],
    ['AFP National Police Check', 'Must be less than 12 months old at lodgement'],
    ['Overseas police clearances', 'For each country lived in for 12+ months after age 16'],
    ['Medical examination results', 'Conducted by Bupa-approved panel physician'],
    ['Form 80 — Personal particulars', 'Completed and signed'],
    ['Form 1221 — Additional personal particulars', 'Completed and signed'],
    ['Employer financials', 'Last 2 years of financial statements to demonstrate business viability'],
  ],
  '482': [
    ['Passport (all pages)', 'Must be valid for the intended stay duration'],
    ['Employment contract', 'Position, salary, and conditions must match nomination'],
    ['Qualifications / degree certificates', 'Certified translations required for non-English documents'],
    ['English language test certificate', 'IELTS, PTE, or TOEFL as required by occupation'],
    ['AFP National Police Check', 'Must be less than 12 months old'],
    ['Overseas police clearances', 'All countries of residence for 12+ months after age 16'],
    ['Medical examination results', 'Via Bupa MedicalConnect portal'],
    ['SBS approval evidence', 'Standard Business Sponsorship approval letter for employer'],
    ['Skills assessment (if applicable)', 'Occupation-dependent — confirm with DAMA/TSS requirements'],
  ],
  '490': [
    ['Passport (all pages)', 'Valid for duration of intended stay'],
    ['Skills assessment certificate', 'From assessing authority relevant to nominated occupation'],
    ['IELTS / PTE certificate', 'English proficiency — higher scores earn more points'],
    ['AFP National Police Check', 'Less than 12 months old'],
    ['Overseas police clearances', 'All countries of residence after age 16 for 12+ months'],
    ['Medical examination results', 'Bupa panel physician'],
    ['State nomination letter', 'From state/territory nominating authority'],
    ['SkillSelect EOI screenshot', 'Showing invitation to apply with points score'],
    ['Evidence of regional intent', 'Job offer, family connection, or settlement plans in regional area'],
  ],
  '820': [
    ['Passport (all pages)', "Applicant's passport — valid at lodgement"],
    ["Sponsor's citizenship / PR evidence", 'Australian citizenship certificate, birth certificate, or PR evidence'],
    ['Joint bank account statements', 'At least 3–6 months of statements showing shared finances'],
    ['Lease or mortgage documents', 'Showing shared address — both names on document'],
    ['Relationship photos', 'Chronological photos together (at least 20–30 spanning the relationship)'],
    ['Form 888 — Statutory declaration #1', 'From a friend or family member who knows the couple'],
    ['Form 888 — Statutory declaration #2', 'Second statutory declaration from a different witness'],
    ['Form 80 — Personal particulars', 'Completed by primary applicant'],
    ['AFP National Police Check', 'Less than 12 months old'],
    ['Medical examination results', 'Bupa panel physician'],
  ],
};

/**
 * Generate DocumentChecklistItem[] for a given case and visa subclass.
 * Returns empty array for unknown subclasses.
 */
export function generateChecklist(caseId: string, visaSubclass: string): DocumentChecklistItem[] {
  const defs = CHECKLIST_DEFINITIONS[visaSubclass];
  if (!defs) return [];

  return defs.map(([label, description]) => ({
    id: uuidv4(),
    caseId,
    label,
    description,
    status: 'pending' as const,
    requiredForSubclass: [visaSubclass],
  }));
}

/** All subclasses that have a defined checklist */
export const SUPPORTED_SUBCLASSES = Object.keys(CHECKLIST_DEFINITIONS);
