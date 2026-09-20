import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const TITLE_INSTRUCTION =
  "You title chat conversations. Read the exchange and reply with ONLY a " +
  "short title (3 to 6 words) that names the topic. No quotes, no markdown, " +
  "no trailing punctuation, no preamble like 'Title:'. If the exchange is " +
  "just a greeting or too vague to name a topic, reply with 'New chat'.";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanTitle(raw) {
  return String(raw || "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/^title:\s*/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
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

  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 800) : "";
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 800) : "";

  if (!message) {
    return json({ error: "No message provided." }, 400);
  }

  const prompt = `User: ${message}\nAssistant: ${reply || "(no reply yet)"}`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: TITLE_INSTRUCTION,
          thinkingConfig: { thinkingLevel: "minimal" },
          maxOutputTokens: 20,
          abortSignal: controller.signal,
        },
      });
    } finally {
      clearTimeout(deadline);
    }

    const title = cleanTitle(response.text).slice(0, 60) || "New chat";
    return json({ title });
  } catch (error) {
    console.error("PRAGYA TITLE ERROR:", error);
    return json({ error: "Could not generate a title." }, 500);
  }
};
