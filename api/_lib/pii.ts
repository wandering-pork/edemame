// Lightweight, regex-based PII redaction for the agentic GitHub issue filing
// feature (GitHub issue #15 / PR #21 code review). The Gemini prompt already
// instructs the model not to include client-identifying details in a drafted
// issue (api/focus-chat.ts), but that's a soft instruction the model has no
// reliable way to guarantee -- since the target repo (wandering-pork/edemame)
// is public, this is a server-side backstop applied right before the GitHub
// API call in api/file-github-issue.ts.
//
// Deliberately simple: pattern-based redaction of the most obvious PII
// shapes, not a full PII-detection system. It will have false positives
// (e.g. case/reference numbers that happen to look like a passport number)
// and false negatives (freeform text like "the client's name is Jane Smith"
// isn't caught by any of these patterns) -- both are acceptable for a
// defense-in-depth guard, not a substitute for the prompt instruction.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Phone numbers: sequences of 8+ digits allowing common separators
// (spaces, dashes, dots, parens) and an optional leading +.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d[\d\s.-]{7,}\d/g;

// Passport-number-like tokens: 1-2 uppercase letters followed by 6-8 digits
// (covers AU/NZ/most Commonwealth formats, e.g. "N1234567", "LA123456").
const PASSPORT_RE = /\b[A-Z]{1,2}\d{6,8}\b/g;

export interface ScrubResult {
  text: string;
  redactionCount: number;
}

/**
 * Replaces obvious PII patterns (emails, phone numbers, passport-number-like
 * strings) with "[redacted]". Returns the scrubbed text plus how many
 * replacements were made, so callers can log/flag when a draft needed
 * scrubbing.
 */
export function scrubPii(input: string): ScrubResult {
  let redactionCount = 0;
  const redact = (): string => {
    redactionCount++;
    return "[redacted]";
  };

  const text = input.replace(EMAIL_RE, redact).replace(PHONE_RE, redact).replace(PASSPORT_RE, redact);

  return { text, redactionCount };
}
