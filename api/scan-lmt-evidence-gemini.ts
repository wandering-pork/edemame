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
 * Labour Market Testing evidence OCR (GitHub issue #31).
 *
 * Mirrors api/scan-passport-gemini.ts: inline base64 file data, one Gemini
 * Vision call, a strict JSON shape back. Accepts PDFs as well as images because
 * job ads are as often saved as a "print to PDF" as a screenshot.
 *
 * The extracted dates are a starting point only — the client always shows them
 * in an editable confirm step (components/LmtAdScanner.tsx) before anything is
 * saved, because an ad's closing date drives a hard compliance deadline.
 */

const ACCEPTED_MIME_PREFIXES = ["image/"];
const ACCEPTED_MIME_TYPES = ["application/pdf"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileBase64, mimeType } = req.body;

  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: "Missing file data" });
  }

  const mimeAccepted =
    ACCEPTED_MIME_PREFIXES.some((p) => String(mimeType).startsWith(p)) ||
    ACCEPTED_MIME_TYPES.includes(String(mimeType));
  if (!mimeAccepted) {
    return res.status(400).json({ error: "Unsupported file type. Upload an image or a PDF." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `This file is evidence of a job advertisement run for Australian Labour Market Testing (LMT) — a screenshot, print-out or PDF of a job ad. Extract the advertising campaign details.

Return your response as a JSON object with these exact fields:

{
  "platform": "the job board, publication or website the ad ran on, e.g. Seek, LinkedIn, Indeed, or the employer's own careers page",
  "startDate": "the date the ad was posted / went live, in YYYY-MM-DD format",
  "endDate": "the date the ad closed or is scheduled to close, in YYYY-MM-DD format",
  "positionTitle": "the advertised job title",
  "notes": "any wording that states how long the ad ran, or an explicit closing date, quoted verbatim — at most one short sentence"
}

Rules:
- Today's date is ${today}. If the ad shows a relative posting time such as "Posted 30 days ago", convert it to an absolute date relative to today.
- If only a posting date and a duration ("advertised for 28 days") are shown, compute the closing date.
- Do NOT guess a date that is not supported by the document. Use an empty string for any field you cannot determine.
- Return ONLY the JSON object.`;

  try {
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: fileBase64,
              },
            },
          ],
        },
      ],
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
        error: "Failed to read the advertisement. Please try again or enter the dates manually.",
      });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let extractedData: any;
    try {
      extractedData = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(200).json({ success: false, error: "Could not parse response." });
      }
      try {
        extractedData = JSON.parse(jsonMatch[0]);
      } catch {
        return res.status(200).json({
          success: false,
          error: "Could not extract advertisement details.",
        });
      }
    }

    // Only pass through dates that are actually YYYY-MM-DD — a half-parsed
    // date is worse than an empty field the user has to fill in deliberately.
    const isoDate = (value: unknown) => {
      const s = String(value || "").trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
    };

    const fields = {
      platform: String(extractedData.platform || "").trim(),
      startDate: isoDate(extractedData.startDate),
      endDate: isoDate(extractedData.endDate),
      positionTitle: String(extractedData.positionTitle || "").trim(),
      notes: String(extractedData.notes || "").trim(),
    };

    const hasData = fields.platform || fields.startDate || fields.endDate || fields.positionTitle;
    if (!hasData) {
      return res.status(200).json({
        success: false,
        error: "Could not detect advertisement details in this file.",
      });
    }

    return res.status(200).json({ success: true, fields });
  } catch (error) {
    console.error("LMT evidence scan error:", error);
    return res.status(200).json({
      success: false,
      error: "An error occurred while processing the file.",
    });
  }
}
