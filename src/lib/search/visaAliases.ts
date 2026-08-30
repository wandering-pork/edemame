/**
 * Visa subclass lookup tables for the global search bar.
 *
 * This is the single, maintained place to teach search new visa vocabulary —
 * add a row here rather than hardcoding a subclass anywhere in the search
 * pipeline. Everything is matched locally; no query text leaves the device.
 */

/** Subclasses the app knows about, matched when typed as a bare number. */
export const KNOWN_SUBCLASSES = [
  '100', '103', '116', '143',
  '186', '187', '188', '189', '190', '191',
  '300', '309',
  '400', '407', '417', '462', '476', '482', '485', '489', '491', '494',
  '500', '590',
  '600', '601', '602', '651',
  '801', '804', '820', '835', '836', '864', '866',
] as const;

/**
 * Colloquial phrasings → the subclasses they should narrow to.
 *
 * Keys are lowercase and may be multi-word; the classifier matches the longest
 * phrase first, so "employer sponsored" wins over a bare "sponsored".
 */
export const VISA_ALIASES: Record<string, string[]> = {
  // Employer-sponsored / work
  'work visa': ['482'],
  'work': ['482'],
  'tss': ['482'],
  'skills in demand': ['482'],
  'sponsored work': ['482'],
  'employer sponsored': ['186', '187', '494'],
  'employer nomination': ['186'],
  'ens': ['186'],
  'permanent residence': ['186', '189', '190'],
  'permanent': ['186', '189', '190'],
  'pr': ['186', '189', '190'],
  'regional employer': ['187', '494'],

  // Skilled / points-tested
  'skilled': ['189', '190', '491'],
  'skilled independent': ['189'],
  'independent': ['189'],
  'state nominated': ['190'],
  'state nomination': ['190'],
  'nominated': ['190'],
  'regional': ['491', '494'],
  'skilled regional': ['491'],
  'business innovation': ['188'],
  'investor': ['188'],

  // Partner / family
  'partner visa': ['820', '801'],
  'partner': ['820', '801'],
  'spouse': ['820', '801'],
  'de facto': ['820', '801'],
  'defacto': ['820', '801'],
  'onshore partner': ['820', '801'],
  'offshore partner': ['309', '100'],
  'prospective marriage': ['300'],
  'fiance': ['300'],
  'parent': ['103', '143', '864'],
  'carer': ['116', '836'],

  // Student / graduate
  'student visa': ['500'],
  'student': ['500'],
  'study': ['500'],
  'graduate': ['485'],
  'post study': ['485'],
  'temporary graduate': ['485'],
  'guardian': ['590'],

  // Visitor / working holiday
  'visitor': ['600', '601', '651'],
  'tourist': ['600'],
  'visit': ['600'],
  'eta': ['601'],
  'working holiday': ['417', '462'],
  'whv': ['417', '462'],
  'backpacker': ['417'],

  // Protection
  'protection': ['866'],
  'asylum': ['866'],
  'refugee': ['866'],
};

/** Longest-first so multi-word aliases are consumed before their prefixes. */
const ALIAS_PHRASES = Object.keys(VISA_ALIASES).sort(
  (a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length
);

export interface ClassifiedQuery {
  /** Subclass codes implied by the query, deduped. Empty = no visa constraint. */
  subclasses: string[];
  /** Tokens that carry no visa meaning — treated as name / free text. */
  textTokens: string[];
}

/** Lowercase, strip punctuation, split on whitespace. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Split a query into visa constraints and free text.
 *
 * A bare number that isn't a known subclass stays in `textTokens` — it may be a
 * case-number fragment, so the direct-field fallback should still see it.
 */
export function classifyQuery(query: string): ClassifiedQuery {
  const tokens = tokenize(query);
  const consumed = new Array<boolean>(tokens.length).fill(false);
  const subclasses: string[] = [];

  const add = (codes: string[]) => {
    for (const code of codes) {
      if (!subclasses.includes(code)) subclasses.push(code);
    }
  };

  for (const phrase of ALIAS_PHRASES) {
    const parts = phrase.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (consumed.slice(i, i + parts.length).some(Boolean)) continue;
      if (!parts.every((p, k) => tokens[i + k] === p)) continue;
      for (let k = 0; k < parts.length; k++) consumed[i + k] = true;
      add(VISA_ALIASES[phrase]);
    }
  }

  tokens.forEach((token, i) => {
    if (consumed[i]) return;
    if ((KNOWN_SUBCLASSES as readonly string[]).includes(token)) {
      consumed[i] = true;
      add([token]);
    }
  });

  return {
    subclasses,
    textTokens: tokens.filter((_, i) => !consumed[i]),
  };
}
