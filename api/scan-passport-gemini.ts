import type { IncomingMessage, ServerResponse } from "http";

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

  const { imageBase64, mimeType } = req.body;

  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: "Missing image data" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const prompt = `Analyze this passport image and extract the following information. Return your response as a JSON object with these exact fields:

{
  "firstName": "first name or given names from the passport",
  "lastName": "surname or family name from the passport",
  "dateOfBirth": "date of birth in YYYY-MM-DD format",
  "nationality": "country name",
  "passportNumber": "passport number",
  "expiryDate": "expiration date in YYYY-MM-DD format",
  "gender": "Male/Female/Other"
}

Use empty string for fields you cannot read. Return ONLY the JSON object.`;

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
                data: imageBase64,
              },
            },
          ],
        },
      ],
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
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
        error: "Failed to process image. Please try again.",
      });
    }

    const data = await response.json();
    const responseText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    console.log("Gemini response:", responseText);

    // Parse JSON response
    let extractedData;
    try {
      extractedData = JSON.parse(responseText);
    } catch (parseErr) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0]);
        } catch {
          return res.status(200).json({
            success: false,
            error: "Could not extract passport information.",
          });
        }
      } else {
        return res.status(200).json({
          success: false,
          error: "Could not parse response.",
        });
      }
    }

    const fields = {
      firstName: String(extractedData.firstName || "").trim(),
      lastName: String(extractedData.lastName || "").trim(),
      dateOfBirth: String(extractedData.dateOfBirth || "").trim(),
      nationality: String(extractedData.nationality || "").trim(),
      passportNumber: String(extractedData.passportNumber || "").trim(),
      expiryDate: String(extractedData.expiryDate || "").trim(),
      gender: String(extractedData.gender || "").trim(),
    };

    const hasData =
      fields.firstName || fields.lastName || fields.passportNumber;

    if (!hasData) {
      return res.status(200).json({
        success: false,
        error: "Could not detect passport data in image.",
      });
    }

    return res.status(200).json({
      success: true,
      fields,
    });
  } catch (error) {
    console.error("Passport scan error:", error);
    return res.status(200).json({
      success: false,
      error: "An error occurred while processing the image.",
    });
  }
}
