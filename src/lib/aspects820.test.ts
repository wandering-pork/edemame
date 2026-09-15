import { describe, it, expect } from 'vitest';
import type { Aspect820, Document } from '../types';
import { ASPECTS_820, ASPECT_ORDER_820, suggestAspectFromFilename, aspectFilenameToken } from './aspects820';
import { splitIntoGroups, type LoadedPdf } from './pdfBundle';
import { classifyKind } from './autoPackager';

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    caseId: 'case-1',
    fileName: 'scan.pdf',
    filePath: 'documents/case-1/scan.pdf',
    fileType: 'application/pdf',
    fileSize: 8 * 1024 * 1024,
    uploadedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ASPECTS_820 / ASPECT_ORDER_820 coherence', () => {
  it('has exactly 7 entries, matching the keys of ASPECTS_820', () => {
    expect(ASPECT_ORDER_820.length).toBe(7);
    expect([...ASPECT_ORDER_820].sort()).toEqual(Object.keys(ASPECTS_820).sort());
  });

  it('every meta.key matches its own map key', () => {
    for (const key of ASPECT_ORDER_820) {
      expect(ASPECTS_820[key].key).toBe(key);
    }
  });

  it('every label/immiSlot/hint is a non-empty string', () => {
    for (const key of ASPECT_ORDER_820) {
      const meta = ASPECTS_820[key];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.immiSlot.length).toBeGreaterThan(0);
      expect(meta.hint.length).toBeGreaterThan(0);
    }
  });

  it('every color is a valid 6-digit hex', () => {
    for (const key of ASPECT_ORDER_820) {
      expect(ASPECTS_820[key].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('all immiSlot values are distinct', () => {
    const slots = ASPECT_ORDER_820.map((k) => ASPECTS_820[k].immiSlot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('all label values are distinct', () => {
    const labels = ASPECT_ORDER_820.map((k) => ASPECTS_820[k].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('suggestAspectFromFilename — one case per aspect', () => {
  it.each([
    ['Applicant_Passport_Scan.pdf', 'identity'],
    ['birth-certificate.pdf', 'identity'],
    ['Form40SP_sponsor.pdf', 'sponsor'],
    ['citizenship_certificate.pdf', 'sponsor'],
    ['AFP_police_check.pdf', 'police_health'],
    ['bupa_medical.pdf', 'police_health'],
    ['CBA_bank_statement_Jan.pdf', 'financial'],
    ['joint_account_2025.pdf', 'financial'],
    ['residential_lease.pdf', 'household'],
    ['electricity_bill_march.pdf', 'household'],
    ['Form888_stat_dec_Jones.pdf', 'social'],
    ['wedding_photos.pdf', 'social'],
    ['relationship_statement.pdf', 'commitment'],
    ['whatsapp_chat_export.pdf', 'commitment'],
    ['flight_itinerary_2024.pdf', 'commitment'],
    ['misc_document.pdf', undefined],
    ['', undefined],
  ] as const)('suggestAspectFromFilename(%j) === %j', (fileName, expected) => {
    expect(suggestAspectFromFilename(fileName)).toBe(expected);
  });
});

describe('suggestAspectFromFilename — first-match-wins precedence', () => {
  it('identity (passport) is checked before sponsor and financial', () => {
    expect(suggestAspectFromFilename('sponsor_passport_bank_statement.pdf')).toBe('identity');
  });

  it('the household mortgage(?!.*statement) negative lookahead does not steal a financial doc', () => {
    expect(suggestAspectFromFilename('joint_mortgage_statement.pdf')).toBe('financial');
  });

  it('a bare "mortgage" without "statement" falls to household', () => {
    expect(suggestAspectFromFilename('mortgage_documents.pdf')).toBe('household');
  });
});

describe('suggestAspectFromFilename — case insensitivity and separator tolerance', () => {
  it('is case-insensitive', () => {
    expect(suggestAspectFromFilename('PASSPORT.PDF')).toBe('identity');
  });

  it.each(['police-check.pdf', 'police check.pdf', 'police.check.pdf'])(
    'tolerates arbitrary separators between "police" and "check": %s',
    (fileName) => {
      expect(suggestAspectFromFilename(fileName)).toBe('police_health');
    },
  );
});

describe('suggestAspectFromFilename — no false positives on innocuous names', () => {
  it('Invoice_2026.pdf is untagged', () => {
    expect(suggestAspectFromFilename('Invoice_2026.pdf')).toBe(undefined);
  });

  it('cover_letter.pdf is untagged', () => {
    expect(suggestAspectFromFilename('cover_letter.pdf')).toBe(undefined);
  });

  it('checklist.pdf is untagged ("check" alone is not a pattern; police.?check requires "police")', () => {
    expect(suggestAspectFromFilename('checklist.pdf')).toBe(undefined);
  });

  it('family_court_order.pdf is tagged "social" via the bare "family" keyword — current behavior, arguably an over-match, pinned as-is', () => {
    expect(suggestAspectFromFilename('family_court_order.pdf')).toBe('social');
  });
});

describe('aspectFilenameToken', () => {
  it.each([
    ['financial', 'Financial'],
    ['household', 'Household'],
    ['social', 'Social'],
    ['commitment', 'Commitment'],
    ['identity', 'Identity'],
    ['sponsor', 'Sponsor'],
    ['police_health', 'PoliceHealth'],
  ] as const)('aspectFilenameToken(%j) === %j', (aspect, expected) => {
    expect(aspectFilenameToken(aspect)).toBe(expected);
  });

  it('every aspect token is filename-safe (alphanumeric only)', () => {
    for (const key of ASPECT_ORDER_820) {
      expect(aspectFilenameToken(key)).toMatch(/^[A-Za-z0-9]+$/);
    }
  });
});

describe('820 filename composition — non-ASCII surname now sanitised like autoPackager', () => {
  // BundleBuilder820.tsx now runs `lastName` through sanitiseFilenameSegment
  // before interpolating it into `820_${token}_${lastName}_${date}${partSuffix}.pdf`,
  // matching suggestOutputName() in autoPackager.ts.
  it('sanitiseFilenameSegment makes a non-ASCII surname filename-safe', async () => {
    const { sanitiseFilenameSegment } = await import('./pdfBundle');
    expect(sanitiseFilenameSegment('Nguyễn')).toBe('Nguy_n');
  });

  it('BundleBuilder820s sanitised filename composition strips the non-ASCII surname', async () => {
    const { sanitiseFilenameSegment } = await import('./pdfBundle');
    const token = aspectFilenameToken('police_health');
    const lastName = sanitiseFilenameSegment('Nguyễn');
    const filename = `820_${token}_${lastName}_20260115.pdf`;
    expect(filename).toBe('820_PoliceHealth_Nguy_n_20260115.pdf');
    expect(filename).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('auto-split labelling arithmetic (proxy for BundleBuilder820.tsx ~line 108)', () => {
  const TARGET_BYTES = 4.9 * 1024 * 1024;

  function partSuffix(index: number, total: number): string {
    return total > 1 ? `_Pt${index + 1}of${total}` : '';
  }

  function loadedPdfOfSize(id: string, size: number): LoadedPdf {
    return { doc: makeDoc({ id }), bytes: new Uint8Array(size), pageCount: 1 };
  }

  it('a split into 2 groups yields Pt1of2 and Pt2of2', () => {
    const MB = 1024 * 1024;
    const items = [
      loadedPdfOfSize('a', 2 * MB),
      loadedPdfOfSize('b', 2 * MB),
      loadedPdfOfSize('c', 2 * MB),
      loadedPdfOfSize('d', 2 * MB),
    ];
    const groups = splitIntoGroups(items, TARGET_BYTES);
    expect(groups.length).toBe(2);

    const suffixes = groups.map((_, i) => partSuffix(i, groups.length));
    expect(suffixes).toEqual(['_Pt1of2', '_Pt2of2']);
  });

  it('a single group yields no suffix at all', () => {
    const MB = 1024 * 1024;
    const items = [loadedPdfOfSize('a', 1 * MB)];
    const groups = splitIntoGroups(items, TARGET_BYTES);
    expect(groups.length).toBe(1);
    expect(partSuffix(0, groups.length)).toBe('');
  });
});

describe('aspect with zero tagged documents produces zero output files', () => {
  it('splitIntoGroups([], target) returns an empty array, not one empty PDF group', () => {
    expect(splitIntoGroups([], 4.9 * 1024 * 1024)).toEqual([]);
  });
});

describe('only exact-mime PDFs are eligible for 820 bundling (proxy for BundleBuilder820.tsx grouping)', () => {
  it('a .pdf document with an empty fileType is classified as a PDF everywhere else, but excluded from the 820 builder', () => {
    const doc = makeDoc({ fileName: 'scan.pdf', fileType: '' });
    expect(classifyKind(doc)).toBe('pdf');
    expect(doc.fileType === 'application/pdf').toBe(false);
  });
});

describe('BundleBuilder820 grouping/untagged partition (reachable proxy)', () => {
  function partition(docs: { fileType: string; aspectTag?: Aspect820 }[]) {
    const pdfs = docs.filter((d) => d.fileType === 'application/pdf');
    const grouped: Record<Aspect820, typeof docs> = {} as any;
    for (const k of ASPECT_ORDER_820) grouped[k] = [];
    const untagged: typeof docs = [];
    for (const d of pdfs) {
      if (d.aspectTag) grouped[d.aspectTag].push(d);
      else untagged.push(d);
    }
    return { grouped, untagged };
  }

  it('groups tagged PDFs by aspect, filters out non-PDFs before grouping, and every aspect key is initialised', () => {
    const docs = [
      { fileType: 'application/pdf', aspectTag: 'financial' as Aspect820 },
      { fileType: 'application/pdf', aspectTag: 'financial' as Aspect820 },
      { fileType: 'application/pdf' },
      { fileType: 'image/jpeg', aspectTag: 'social' as Aspect820 },
    ];

    const { grouped, untagged } = partition(docs);

    expect(grouped.financial.length).toBe(2);
    expect(grouped.social.length).toBe(0);
    expect(untagged.length).toBe(1);
    for (const key of ASPECT_ORDER_820) {
      expect(grouped[key]).toBeDefined();
      expect(Array.isArray(grouped[key])).toBe(true);
    }
  });
});

describe('BundleBuilder820 split-badge rule (reachable proxy for ~line 222)', () => {
  const TARGET_BYTES = 4.9 * 1024 * 1024;

  function badgeState(totalSize: number, docCount: number) {
    const overTarget = totalSize > TARGET_BYTES;
    const willSplit = overTarget && docCount > 1;
    return { overTarget, willSplit };
  }

  it('a single document over 5 MB shows "single doc > 5 MB", not auto-split', () => {
    const state = badgeState(6 * 1024 * 1024, 1);
    expect(state.overTarget).toBe(true);
    expect(state.willSplit).toBe(false);
  });

  it('two documents summing over 5 MB shows auto-split', () => {
    const state = badgeState(6 * 1024 * 1024, 2);
    expect(state.willSplit).toBe(true);
  });

  it('two documents under the target show neither badge', () => {
    const state = badgeState(4 * 1024 * 1024, 2);
    expect(state.overTarget).toBe(false);
    expect(state.willSplit).toBe(false);
  });
});
