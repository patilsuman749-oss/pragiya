import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_INSTRUCTION =
  "You are PRAGYA, a helpful, concise AI assistant with a calm, " +
  "confident, slightly futuristic tone (think: onboard ship AI). " +
  "Keep replies very concise and conversational because they are read aloud. " +
  "Usually answer in 1 to 3 short sentences. Avoid markdown, bullet points, " +
  "emojis, long lists, and unnecessary explanations unless the user asks for detail.";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function describeGeminiError(error) {
  const status = error?.status ?? error?.code ?? error?.response?.status;

  switch (status) {
    case 400:
      return "The request to Gemini was invalid. Check GEMINI_MODEL in Netlify environment variables.";
    case 401:
    case 403:
      return "GEMINI_API_KEY was rejected by Google. Verify the key in Netlify environment variables.";
    case 404:
      return `The model "${MODEL}" was not found or is unavailable for this account.`;
    case 429:
      return "Gemini rate limit or quota exceeded. Please wait and try again.";
    case 500:
    case 503:
      return "Gemini is temporarily overloaded or unavailable. Try again shortly.";
    default:
      return "Could not get a response from Gemini. Check the Netlify function logs for details.";
  }
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!process.env.GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY is not configured on Netlify." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed JSON request body." }, 400);
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return json({ error: "No message provided." }, 400);
  }

  const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];

  const contents = [
    ...history
      .filter((turn) => turn && typeof turn.text === "string" && turn.text.trim())
      .map((turn) => ({
        role: turn.role === "model" ? "model" : "user",
        parts: [{ text: turn.text.trim() }],
      })),
    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      },
    });

    const reply = (response.text || "").trim();

    if (!reply) {
      return json({ error: "Gemini returned an empty response." }, 502);
    }

    return json({ reply, model: MODEL });
  } catch (error) {
    console.error("PRAGYA CHAT ERROR:", error);
    return json({ error: describeGeminiError(error) }, 500);
  }
};
