import type { Aspect820 } from '../types';

/**
 * Subclass-820 evidence taxonomy.
 *
 * Maps each Aspect820 to the ImmiAccount attachment slot it belongs to,
 * and provides display metadata for the BundleBuilder UI.
 *
 * The four "aspects of the relationship" come from the Migration Regulations
 * sch.2 cl.820.211 / DHA policy. The remaining slots are non-relationship
 * evidence that ImmiAccount asks for as separate attachment fields.
 *
 * Slot names are best-guess approximations of the real ImmiAccount field
 * labels — adjust when verified against a live lodgement.
 */

export interface AspectMeta {
  key: Aspect820;
  label: string;
  /** ImmiAccount attachment field name */
  immiSlot: string;
  /** Hex tint used for badges/group headers */
  color: string;
  /** Short helper for the empty/intro state */
  hint: string;
}

export const ASPECTS_820: Record<Aspect820, AspectMeta> = {
  financial: {
    key: 'financial',
    label: 'Financial',
    immiSlot: 'Financial Aspects of the Relationship',
    color: '#0a6b6e',
    hint: 'Joint accounts, shared expenses, property',
  },
  household: {
    key: 'household',
    label: 'Household',
    immiSlot: 'Nature of the Household',
    color: '#b08000',
    hint: 'Shared lease/mortgage, bills, address',
  },
  social: {
    key: 'social',
    label: 'Social',
    immiSlot: 'Social Aspects of the Relationship',
    color: '#5a2d8a',
    hint: 'Form 888 declarations, photos, joint events',
  },
  commitment: {
    key: 'commitment',
    label: 'Commitment',
    immiSlot: 'Nature of the Commitment',
    color: '#c8440a',
    hint: 'Relationship statement, long-term plans',
  },
  identity: {
    key: 'identity',
    label: 'Identity',
    immiSlot: 'Identity Documents (Applicant)',
    color: '#1d5c3a',
    hint: 'Passport, birth certificate, ID',
  },
  sponsor: {
    key: 'sponsor',
    label: 'Sponsor',
    immiSlot: 'Sponsor Documents (Form 40SP support)',
    color: '#1a3a6b',
    hint: 'Citizenship/PR evidence, sponsor police check',
  },
  police_health: {
    key: 'police_health',
    label: 'Police & Health',
    immiSlot: 'Character & Health Evidence',
    color: '#6b2a1a',
    hint: 'AFP check, overseas clearances, medicals',
  },
};

/** Render order in the BundleBuilder — matches typical ImmiAccount layout */
export const ASPECT_ORDER_820: Aspect820[] = [
  'financial',
  'household',
  'social',
  'commitment',
  'identity',
  'sponsor',
  'police_health',
];

/**
 * Filename keyword heuristics — first match wins.
 * Used by DocumentUpload to pre-fill aspectTag at upload time.
 * The agent confirms/changes from DocumentList — this just removes friction.
 */
const FILENAME_HEURISTICS: Array<[RegExp, Aspect820]> = [
  // Identity (highest specificity first)
  [/passport|birth.?cert|driver.?licen[sc]e|national.?id/i, 'identity'],
  // Sponsor
  [/40sp|sponsor.*citizen|sponsor.*pr|sponsor.*passport|citizenship.?cert/i, 'sponsor'],
  // Police & health
  [/afp|police.?check|police.?clearance|medical|health|hap|bupa/i, 'police_health'],
  // Financial
  [/bank.?statement|joint.?account|payslip|tax.?return|loan|mortgage.?statement|super(?:annuation)?|insurance.*joint/i, 'financial'],
  // Household
  [/lease|tenancy|rental|mortgage(?!.*statement)|utility|bill|electricity|gas|water|internet|address.?proof|council/i, 'household'],
  // Social — Form 888 declarations + photos + events
  [/888|stat.?dec|statutory.?declaration|witness|photo|wedding|engagement|event|family/i, 'social'],
  // Commitment — relationship statements, communication evidence
  [/relationship.?statement|relationship.?history|chat|whatsapp|messenger|facetime|travel|flight|itinerary/i, 'commitment'],
];

/**
 * Suggest an Aspect820 from a filename. Returns undefined if no heuristic matches —
 * caller should leave the document untagged so the agent must decide.
 */
export function suggestAspectFromFilename(fileName: string): Aspect820 | undefined {
  for (const [pattern, aspect] of FILENAME_HEURISTICS) {
    if (pattern.test(fileName)) return aspect;
  }
  return undefined;
}

/** Slugify the aspect label for filename use (e.g. "Police & Health" → "PoliceHealth") */
export function aspectFilenameToken(aspect: Aspect820): string {
  return ASPECTS_820[aspect].label.replace(/[^a-zA-Z0-9]/g, '');
}
