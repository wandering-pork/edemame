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

  const { caseDescription, workflowDescription, startDate } = req.body;

  if (!caseDescription || !workflowDescription || !startDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are an expert legal assistant for an immigration lawyer.
    Analyze the following case and workflow to generate a schedule of tasks.

    Case Description:
    ${caseDescription}

    Standard Workflow Guide:
    ${workflowDescription}

    Start Date: ${startDate}

    Task:
    Generate a chronological list of tasks based on the workflow applied to this specific case.
    Determine the relative date for each task (daysOffset) starting from 0 (start date).
    Be specific to the client's background mentioned in the case description.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: taskSchema,
        systemInstruction: "You are a precise legal project manager. Output only JSON.",
      },
    });

    const generatedData = JSON.parse(response.text || "[]");
    return res.status(200).json(generatedData);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: "Failed to generate tasks" });
  }
}
