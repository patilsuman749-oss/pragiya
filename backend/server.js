/* =========================================================
   PRAGYA AI
   BACKEND (plain Gemini generateContent - no Live/WebSocket)
   ========================================================= */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");


/* =========================================================
   SERVER
   ========================================================= */

const app = express();
const PORT = process.env.PORT || 3000;

// Standard Gemini text model - stable, no Live/Preview quirks.
// Override with GEMINI_MODEL in backend/.env if you want a
// different one (e.g. "gemini-2.5-pro" for stronger reasoning).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_INSTRUCTION =
    "You are PRAGYA, a helpful, concise AI assistant with a calm, " +
    "confident, slightly futuristic tone (think: onboard ship AI). " +
    "Keep replies very concise and conversational because they are read aloud. " +
    "Usually answer in 1 to 3 short sentences. Avoid markdown, bullet points, " +
    "emojis, long lists, and unnecessary explanations unless the user asks for detail.";


/* =========================================================
   GEMINI CLIENT
   ========================================================= */

if (!process.env.GEMINI_API_KEY) {
    console.error("");
    console.error("ERROR: GEMINI_API_KEY is missing from backend/.env");
    console.error("");
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Guard against malformed JSON bodies crashing the process.
app.use((err, req, res, next) => {

    if (err && err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Malformed JSON request body." });
    }

    next(err);
});


/* =========================================================
   FRONTEND (serves index.html, style.css, js/*)
   ========================================================= */

app.use(express.static(path.join(__dirname, "..")));


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (req, res) => {

    res.json({
        online: true,
        model: MODEL,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
    });
});


/* =========================================================
   FRIENDLY ERROR MAPPING
   ========================================================= */

function describeGeminiError(error) {

    const status =
        error?.status ??
        error?.code ??
        error?.response?.status;

    switch (status) {

        case 400:
            return "The request to Gemini was invalid. Check GEMINI_MODEL in backend/.env.";

        case 401:
        case 403:
            return "GEMINI_API_KEY was rejected by Google. Verify the key in backend/.env.";

        case 404:
            return `The model "${MODEL}" was not found or is unavailable for your account.`;

        case 429:
            return "Gemini rate limit or quota exceeded. Please wait and try again.";

        case 500:
        case 503:
            return "Gemini is temporarily overloaded or unavailable. Try again shortly.";

        default:
            return "Could not get a response from Gemini. See server logs for details.";
    }
}


/* =========================================================
   CHAT ENDPOINT
   ========================================================= */

app.post("/api/chat", async (req, res) => {

    try {

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured on the server."
            });
        }

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        if (!message) {
            return res.status(400).json({ error: "No message provided." });
        }

        // Optional short rolling history from the client:
        // [{ role: "user"|"model", text: "..." }, ...]
        const history = Array.isArray(req.body?.history)
            ? req.body.history.slice(-8)
            : [];

        const contents = [
            ...history
                .filter((turn) => turn && typeof turn.text === "string")
                .map((turn) => ({
                    role: turn.role === "model" ? "model" : "user",
                    parts: [{ text: turn.text }]
                })),
            {
                role: "user",
                parts: [{ text: message }]
            }
        ];

        // Give Gemini a hard deadline. Without this, a slow/hanging
        // upstream call just sits here forever, and only the browser's
        // own timeout ever fires — masking the real error.
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 18000);

        let response;
        try {
            response = await ai.models.generateContent({
                model: MODEL,
                contents,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    thinkingConfig: {
                        thinkingLevel: "minimal"
                    },
                    abortSignal: controller.signal
                }
            });
        } finally {
            clearTimeout(deadline);
        }

        const reply = (response.text || "").trim();

        if (!reply) {
            return res.status(502).json({
                error: "Gemini returned an empty response."
            });
        }

        res.json({ reply, model: MODEL });

    } catch (error) {

        if (error?.name === "AbortError") {
            console.error("CHAT TIMEOUT: Gemini did not respond within 18s.");
            return res.status(504).json({
                error:
                    "Gemini did not respond in time. This usually means the API key has hit its rate/quota limit or the model is overloaded — check your Google AI Studio quota page."
            });
        }

        console.error("CHAT ERROR:", error);

        res.status(500).json({
            error: describeGeminiError(error)
        });
    }
});


/* =========================================================
   404 FOR UNKNOWN API ROUTES
   ========================================================= */

app.use("/api", (req, res) => {
    res.status(404).json({ error: "Unknown API endpoint." });
});


/* =========================================================
   START SERVER
   ========================================================= */

const server = app.listen(PORT, () => {

    console.log("");
    console.log("==========================================");
    console.log("          PRAGYA AI ONLINE");
    console.log("==========================================");
    console.log("MODEL:", MODEL);
    console.log(`SERVER: http://localhost:${PORT}`);
    console.log("CHAT ENDPOINT:");
    console.log(`http://localhost:${PORT}/api/chat`);
    console.log("==========================================");
    console.log("");
});

server.on("error", (error) => {

    if (error.code === "EADDRINUSE") {
        console.error(`PORT ${PORT} is already in use. Set a different PORT in backend/.env or stop the other process.`);
        process.exit(1);
    }

    console.error("SERVER ERROR:", error);
    process.exit(1);
});


/* =========================================================
   PROCESS-LEVEL SAFETY NETS
   ========================================================= */

process.on("unhandledRejection", (reason) => {
    console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);
});
