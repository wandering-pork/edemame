// Validates and trims the Visa Advisor's wizard answers before anything reaches Gemini
// (docs/plans/public-visa-advisor-trial.md, VA.0):
// - only known fields survive, so a request can't smuggle extra text into the prompt;
// - choice fields must be one of the wizard's own values;
// - free text is capped (MAX_TEXT) and stripped of control characters;
// - no name and no date of birth: the browser sends `age` instead, so Gemini never receives either.

export const MAX_TEXT = 200;

const PURPOSES = ["work", "study", "family", "pr", "visit"] as const;
const DURATIONS = ["short", "medium", "years", "permanent"] as const;
const ENGLISH = ["none", "basic", "intermediate", "proficient", "fluent"] as const;
// Free-text (or select) fields on the wizard's conditional "details" step.
const DETAIL_FIELDS = [
  "occupation",
  "courseLevel",
  "relationshipType",
  "sponsorStatus",
  "pointsScore",
  "statePreference",
  "tripDuration",
] as const;

export interface EligibilityInput {
  clientInfo: { age: number | null; nationality: string; inAustralia: boolean; currentVisaStatus: string };
  goals: { primaryPurpose: string; intendedDuration: string };
  details: Partial<Record<(typeof DETAIL_FIELDS)[number], string>>;
  supportingFactors: { englishProficiency: string; healthConcerns: boolean; criminalHistory: boolean };
}

export type EligibilityInputResult = { ok: true; value: EligibilityInput } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Trims, removes control characters (newlines included, so text can't fake prompt structure), caps length. */
function text(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/** One of `allowed`, or "" when unset; anything else is an error (returned as null). */
function choice(v: unknown, allowed: readonly string[]): string | null {
  if (v === undefined || v === null || v === "") return "";
  return typeof v === "string" && allowed.includes(v) ? v : null;
}

export function validateEligibilityInput(body: unknown): EligibilityInputResult {
  if (!isObject(body)) return { ok: false, error: "Missing required fields" };
  const { clientInfo, goals, details, supportingFactors } = body;
  if (!isObject(clientInfo) || !isObject(goals) || !isObject(details) || !isObject(supportingFactors)) {
    return { ok: false, error: "Missing required fields" };
  }

  let age: number | null = null;
  if (clientInfo.age !== undefined && clientInfo.age !== null && clientInfo.age !== "") {
    const n = Number(clientInfo.age);
    if (!Number.isInteger(n) || n < 0 || n > 120) return { ok: false, error: "Invalid age" };
    age = n;
  }

  const primaryPurpose = choice(goals.primaryPurpose, PURPOSES);
  if (primaryPurpose === null) return { ok: false, error: "Invalid primary purpose" };
  const intendedDuration = choice(goals.intendedDuration, DURATIONS);
  if (intendedDuration === null) return { ok: false, error: "Invalid intended duration" };
  const englishProficiency = choice(supportingFactors.englishProficiency, ENGLISH);
  if (englishProficiency === null) return { ok: false, error: "Invalid English proficiency" };

  const cleanDetails: EligibilityInput["details"] = {};
  for (const key of DETAIL_FIELDS) {
    const value = text(details[key]);
    if (value) cleanDetails[key] = value;
  }

  return {
    ok: true,
    value: {
      clientInfo: {
        age,
        nationality: text(clientInfo.nationality),
        inAustralia: clientInfo.inAustralia === true,
        currentVisaStatus: text(clientInfo.currentVisaStatus),
      },
      goals: { primaryPurpose, intendedDuration },
      details: cleanDetails,
      supportingFactors: {
        englishProficiency,
        healthConcerns: supportingFactors.healthConcerns === true,
        criminalHistory: supportingFactors.criminalHistory === true,
      },
    },
  };
}
