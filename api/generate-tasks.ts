import type { IncomingMessage, ServerResponse } from "http";
import { GoogleGenAI, Type } from "@google/genai";

interface VercelRequest extends IncomingMessage {
  method: string;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
}

const taskSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "The title of the task",
      },
      description: {
        type: Type.STRING,
        description: "A brief description of what needs to be done",
      },
      daysOffset: {
        type: Type.INTEGER,
        description:
          "Number of days from the start date this task should be scheduled",
      },
    },
    required: ["title", "description", "daysOffset"],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { caseDescription, workflowDescription, startDate, visaSubclass, workflowTitle, steps } = req.body;

  if (!caseDescription || !startDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build the structured steps section if steps array is provided
  const stepsSection = Array.isArray(steps) && steps.length > 0
    ? steps.map((s: { title: string; description: string }, i: number) =>
        `${i + 1}. ${s.title}${s.description ? `: ${s.description}` : ''}`
      ).join('\n')
    : workflowDescription || 'Follow standard immigration workflow procedures';

  const visaLabel = visaSubclass
    ? `Australian Subclass ${visaSubclass}${workflowTitle ? ` — ${workflowTitle}` : ''}`
    : workflowTitle || 'Immigration';

  const prompt = `You are a senior Australian immigration case manager at a registered migration agency.

VISA APPLICATION TYPE: ${visaLabel}

CLIENT PROFILE & CASE NOTES:
${caseDescription}

WORKFLOW STEPS TO FOLLOW:
${stepsSection}

Application Start Date: ${startDate}

TASK:
Generate a precise, chronological task list for this ${visaLabel} application.

Each task must:
- Be a specific, actionable step (not vague)
- Map clearly to one or more of the workflow steps above
- Reference relevant Australian immigration systems where applicable:
  • ImmiAccount (visa lodgement portal)
  • SkillSelect / EOI (for points-tested visas)
  • VEVO (Visa Entitlement Verification Online)
  • TRA / ACS / Engineers Australia / AHPRA (skills assessment bodies, where relevant)
  • Department of Home Affairs correspondence
  • State nomination portals (for 190/491 state-sponsored visas)
- Include realistic daysOffset based on Australian processing timeframes:
  • Skills assessments: 28–84 days
  • State nomination: 14–60 days
  • Police clearances (AFP + overseas): 30–45 days
  • Medical examinations: 1–3 days (schedule 30–60 days before lodgement)
  • Document translation (NAATI): 7–14 days
  • Employer sponsorship approval (TSS/482): 14–28 days
  • Visa grant after lodgement: 60–360 days depending on subclass

Generate 10–15 specific tasks that realistically schedule this case from start date.
Tailor the tasks to the client's specific background and circumstances noted above.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: taskSchema,
        systemInstruction:
          "You are a precise Australian immigration case manager. Generate task lists that are specific, actionable, and correctly timed for Australian visa processing. Output only valid JSON.",
      },
    });

    const generatedData = JSON.parse(response.text || "[]");
    return res.status(200).json(generatedData);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: "Failed to generate tasks" });
  }
}
