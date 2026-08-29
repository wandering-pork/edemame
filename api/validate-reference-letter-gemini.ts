import type { IncomingMessage, ServerResponse } from "http";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

/**
 * Reference Letter Validator extraction endpoint (GitHub issue #32 §2).
 *
 * Mirrors `scan-passport-gemini.ts`: inline base64 document data sent to Gemini
 * Vision, JSON back. Two deliberate differences:
 *
 * 1. PDFs are accepted as well as images. Gemini accepts `application/pdf` as
 *    inline data directly, so a scanned or digital letter goes through the same
 *    path with no client-side PDF rasterisation.
 * 2. The field list is supplied by the caller rather than hardcoded here. The
 *    per-authority rule sets live in `src/lib/referenceLetterRequirements.ts`
 *    (versionable, reviewable data) and there is no import path from the
 *    root-level `api/` functions into `src/` — so the client sends the fields it
 *    wants extracted and this function builds the prompt and response schema
 *    from them. Input is validated and capped below; nothing from the request
 *    reaches anything but the Gemini prompt.
 */

const MAX_FIELDS = 40;
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

interface RequestedField {
  key: string;
  label: string;
  hint: string;
}

function sanitizeText(value: unknown, max: number): string {
  // Strip control characters, keeping newlines and tabs (duty lists use them).
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, max);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileBase64, mimeType, authorityName, fields } = req.body || {};

  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: "Missing document data" });
  }

  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: "Unsupported file type. Upload a PDF, JPG or PNG." });
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: "Missing fields to extract" });
  }

  const requested: RequestedField[] = [];
  const seen = new Set<string>();
  for (const raw of fields.slice(0, MAX_FIELDS)) {
    const key = String(raw?.key ?? "");
    if (!KEY_PATTERN.test(key) || seen.has(key)) continue;
    seen.add(key);
    requested.push({
      key,
      label: sanitizeText(raw?.label, 80) || key,
      hint: sanitizeText(raw?.hint, 400),
    });
  }

  if (requested.length === 0) {
    return res.status(400).json({ error: "No valid fields to extract" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const authority = sanitizeText(authorityName, 120) || "the assessing authority";

  const fieldList = requested
    .map((f) => `- "${f.key}" (${f.label}): ${f.hint}`)
    .join("\n");

  const prompt = `You are reviewing an employment reference letter that will be submitted to ${authority} as part of an Australian skills assessment.

Read the document and extract the following fields:

${fieldList}

Rules:
- Return a JSON object whose keys are exactly the field keys listed above.
- Every value must be a string. Use an empty string ("") for any field the document does not clearly contain — do NOT guess, infer, or fill a field from context. An empty string is the correct answer whenever you are unsure.
- Quote or closely paraphrase what the letter actually says; do not summarise beyond what is written.
- Keep each value under 600 characters.

Return ONLY the JSON object.`;

  // Structured response schema built from the requested keys, so Gemini returns
  // a flat string map rather than free-form prose we have to salvage.
  const properties: Record<string, { type: string; description: string }> = {};
  for (const f of requested) {
    properties[f.key] = { type: "string", description: `${f.label}. ${f.hint}` };
  }

  try {
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: fileBase64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties,
          required: requested.map((f) => f.key),
        },
      },
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Gemini API error:", response.status, errorData);
      return res.status(200).json({
        success: false,
        error: "Failed to read the reference letter. Please try again.",
      });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let extracted: any;
    try {
      extracted = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(200).json({ success: false, error: "Could not parse the extraction response." });
      }
      try {
        extracted = JSON.parse(jsonMatch[0]);
      } catch {
        return res.status(200).json({ success: false, error: "Could not parse the extraction response." });
      }
    }

    const values: Record<string, string> = {};
    for (const f of requested) {
      values[f.key] = sanitizeText(extracted?.[f.key], 600);
    }

    const anyFound = Object.values(values).some((v) => v.length > 0);
    if (!anyFound) {
      return res.status(200).json({
        success: false,
        error: "No reference letter details could be read from this file.",
      });
    }

    return res.status(200).json({ success: true, values });
  } catch (error) {
    console.error("Reference letter validation error:", error);
    return res.status(200).json({
      success: false,
      error: "An error occurred while reading the document.",
    });
  }
}
