import type { IncomingMessage, ServerResponse } from "http";
import { estimateCostUsd } from "./_lib/aiPricing";
import { callGemini } from "./_lib/gemini";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clientInfo, goals, details, supportingFactors } = req.body;

  if (!clientInfo || !goals || !details || !supportingFactors) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const prompt = `You are an expert Australian immigration adviser. Assess this client's eligibility for Australian visas.

CLIENT: ${JSON.stringify(clientInfo)}
GOALS: ${JSON.stringify(goals)}
DETAILS: ${JSON.stringify(details)}
FACTORS: ${JSON.stringify(supportingFactors)}

Return ONLY valid JSON (no markdown, no extra text):
{
  "visaOptions": [
    {
      "visaSubclass": "190",
      "visaName": "Skilled Nominated",
      "verdict": "qualifies|possibly_qualifies|unlikely|needs_more_info",
      "reasons": ["reason 1", "reason 2"],
      "gaps": ["gap 1"]
    }
  ],
  "summary": "1-2 sentence summary",
  "primaryRecommendation": "recommended visa",
  "suggestedTemplateKeyword": "190"
}

Assess: 189, 190, 482, 186, 500, 820, 485, 600, 417, 491`;

  try {
    const response = await callGemini(apiKey, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    // A real error status (not a 200 with an empty report) so the Visa Advisor shows its
    // "try again" toast instead of rendering and saving an empty assessment.
    if (!response.ok) {
      return res.status(502).json({ error: "Gemini API request failed" });
    }

    const data = await response.json();
    const responseText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const usageMetadata = data.usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount ?? 0;
    const candidatesTokens = usageMetadata?.candidatesTokenCount ?? 0;
    const usage = usageMetadata
      ? {
          promptTokens,
          candidatesTokens,
          totalTokens: usageMetadata?.totalTokenCount ?? promptTokens + candidatesTokens,
          estimatedCostUsd: estimateCostUsd(promptTokens, candidatesTokens),
        }
      : null;

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    return res.status(200).json({
      result: result || {
        visaOptions: [],
        summary: "Unable to parse response",
        primaryRecommendation: "Please try again",
        suggestedTemplateKeyword: "",
      },
      usage,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Failed to check eligibility" });
  }
}
