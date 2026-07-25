import type { IncomingMessage, ServerResponse } from "http";
import { getUserManualContext } from "./_lib/userManual";

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

  const { messages, caseContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  // Build case-aware system prompt
  const userManualContext = getUserManualContext();

  const systemPrompt = `You are Edamame Agent, an expert AI assistant for Australian immigration lawyers and migration agents.

You are working inside Focus Mode on a specific case. Your role is to:
- Answer questions about visa requirements, processes, and timelines
- Help draft correspondence and document checklists
- Analyse case circumstances and flag risks or opportunities
- Reference Australian Department of Home Affairs policy accurately
- Suggest next steps based on case progress
- Answer "how do I…" / training questions about the Edamame product itself using the USER MANUAL below

${caseContext ? `ACTIVE CASE CONTEXT:\n${caseContext}\n` : ''}
${userManualContext ? `USER MANUAL (authoritative reference for how Edamame is meant to work — use this to answer product training questions and to judge whether described behaviour matches what is documented):\n${userManualContext}\n` : ''}
When asked how to use a feature, base your answer on the USER MANUAL content above. If the manual does not cover something, say so honestly instead of guessing.

Keep responses concise but complete. Use markdown formatting for lists and headings. When referencing specific policy, cite the relevant legislative instrument or policy guidance.`;

  // Convert messages to Gemini format
  const geminiMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: geminiMessages,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Gemini API error:", response.status, errorData);
      return res.status(502).json({ error: "Gemini API request failed" });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

    return res.status(200).json({ reply: replyText });
  } catch (error) {
    console.error("Focus chat error:", error);
    return res.status(500).json({ error: "Failed to generate response" });
  }
}
