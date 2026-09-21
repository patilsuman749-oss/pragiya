/* =========================================================
   PRAGYA AI
   FAST VOICE + TEXT APPLICATION CONTROLLER
   With persistent on-screen chat history.
   ========================================================= */

const $ = (selector) => document.querySelector(selector);

const micButton = $("#micButton");

const coreState = $("#coreState");
const sessionState = $("#sessionState");

const voiceStatus = $("#voiceStatus");
const aiStatus = $("#aiStatus");
const systemStatus = $("#systemStatus");
const latency = $("#latency");
const clockElement = $("#clock");
const waveform = $("#waveform");

const conversationHistory = $("#conversationHistory");
const historyEmpty = $("#historyEmpty");
const clearHistoryButton = $("#clearHistoryButton");

const textComposer = $("#textComposer");
const textInput = $("#textInput");
const sendTextButton = $("#sendTextButton");

const CHAT_STORAGE_KEY = "pragya_chat_history_v1";
const MAX_UI_MESSAGES = 80;

let sessionStarted = false;
let starting = false;
let lastUserSpeechTime = 0;
let lastAIResponseTime = 0;

/* =========================================================
   CHAT HISTORY
   ========================================================= */

let chatMessages = loadChatHistory();

function loadChatHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved
            .filter((item) =>
                item &&
                (item.role === "user" || item.role === "ai") &&
                typeof item.text === "string" &&
                item.text.trim()
            )
            .slice(-MAX_UI_MESSAGES);
    } catch {
        return [];
    }
}

function saveChatHistory() {
    try {
        localStorage.setItem(
            CHAT_STORAGE_KEY,
            JSON.stringify(chatMessages.slice(-MAX_UI_MESSAGES))
        );
    } catch {
        // Storage may be unavailable in some browser privacy modes.
    }
}

function addChatMessage(role, text, options = {}) {
    const clean = String(text || "").trim();
    if (!clean || !conversationHistory) return;

    const message = { role, text: clean };

    if (options.replaceLast && chatMessages.length) {
        const last = chatMessages[chatMessages.length - 1];
        if (last.role === role) {
            chatMessages[chatMessages.length - 1] = message;
        } else {
            chatMessages.push(message);
        }
    } else {
        chatMessages.push(message);
    }

    chatMessages = chatMessages.slice(-MAX_UI_MESSAGES);
    saveChatHistory();
    renderChatHistory();
}

function renderChatHistory() {
    if (!conversationHistory) return;

    conversationHistory.innerHTML = "";

    if (!chatMessages.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent =
            "PRAGYA neural interface initialized. Your conversation will appear here.";
        conversationHistory.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();

    chatMessages.forEach((message) => {
        const box = document.createElement("article");
        box.className = `history-message ${message.role === "user" ? "history-user" : "history-ai"}`;

        const label = document.createElement("div");
        label.className = "message-label";
        label.textContent = message.role === "user" ? "YOU" : "PRAGYA AI";

        const text = document.createElement("div");
        text.className = "message-text";
        text.textContent = message.text;

        box.appendChild(label);
        box.appendChild(text);
        fragment.appendChild(box);
    });

    conversationHistory.appendChild(fragment);
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
}

function updateLastAIMessage(text) {
    const clean = String(text || "").trim();
    if (!clean) return;

    const last = chatMessages[chatMessages.length - 1];
    if (last?.role === "ai") {
        last.text = clean;
    } else {
        chatMessages.push({ role: "ai", text: clean });
    }

    chatMessages = chatMessages.slice(-MAX_UI_MESSAGES);
    saveChatHistory();
    renderChatHistory();
}

function clearChatHistory() {
    chatMessages = [];
    try {
        localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {}
    renderChatHistory();
}

/* =========================================================
   UI STATE
   ========================================================= */

function setState(state) {
    if (coreState) coreState.textContent = state;
    if (sessionState) sessionState.textContent = state;

    if (voiceStatus) {
        if (state === "CONNECTING") voiceStatus.textContent = "CONNECTING";
        else if (state === "LISTENING") voiceStatus.textContent = "LISTENING";
        else if (state === "SPEAKING") voiceStatus.textContent = "SPEAKING";
        else voiceStatus.textContent = "READY";
    }

    if (aiStatus) {
        if (state === "THINKING") aiStatus.textContent = "THINKING";
        else if (state === "SPEAKING") aiStatus.textContent = "RESPONDING";
        else aiStatus.textContent = "STANDBY";
    }

    if (systemStatus) {
        if (state === "CONNECTING") systemStatus.textContent = "CONNECTING TO GEMINI";
        else if (state === "LISTENING") systemStatus.textContent = "MICROPHONE ACTIVE";
        else if (state === "THINKING") systemStatus.textContent = "NEURAL PROCESSING";
        else if (state === "SPEAKING") systemStatus.textContent = "PRAGYA RESPONDING";
        else systemStatus.textContent = "SYSTEM ONLINE";
    }

    document.body.classList.toggle("thinking", state === "THINKING");
    document.body.classList.toggle("speaking", state === "SPEAKING");

    if (waveform) {
        waveform.classList.toggle(
            "active",
            state === "LISTENING" || state === "SPEAKING"
        );
    }
}

function showUserSpeech(text, options = {}) {
    const clean = String(text || "").trim();
    if (!clean) return;

    lastUserSpeechTime = performance.now();

    // Interim recognition is displayed without creating a permanent history item.
    if (options.interim) {
        renderTemporaryUserMessage(clean);
    } else {
        addChatMessage("user", clean);
    }

    setState("LISTENING");
}

function renderTemporaryUserMessage(text) {
    if (!conversationHistory) return;

    renderChatHistory();

    const temp = document.createElement("article");
    temp.className = "history-message history-user history-interim";
    temp.dataset.interim = "true";

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = "YOU";

    const body = document.createElement("div");
    body.className = "message-text";
    body.textContent = text;

    temp.appendChild(label);
    temp.appendChild(body);
    conversationHistory.appendChild(temp);
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
}

function removeTemporaryUserMessage() {
    conversationHistory?.querySelector('[data-interim="true"]')?.remove();
}

function showAIResponse(text) {
    const clean = String(text || "").trim();
    if (!clean) return;

    removeTemporaryUserMessage();
    updateLastAIMessage(clean);
}

function markAIResponding() {
    lastAIResponseTime = performance.now();
    setState("SPEAKING");

    if (latency) {
        const responseTime = Math.round(lastAIResponseTime - lastUserSpeechTime);
        if (responseTime >= 0 && responseTime < 60000) {
            latency.textContent = `${responseTime} ms`;
        }
    }
}

function setTextBusy(busy) {
    if (textInput) textInput.disabled = busy;
    if (sendTextButton) sendTextButton.disabled = busy;
}

function setMicButtonBusy(busy) {
    if (!micButton) return;
    micButton.disabled = busy;
    micButton.classList.toggle("connecting", busy);
}

/* =========================================================
   VOICE ENGINE CALLBACKS
   Registered immediately (not only when the mic is started)
   so text-only messages before the first mic tap still render.
   ========================================================= */

const pragyaCallbacks = {
    onUserInterim: (text) => {
        if (text) showUserSpeech(text, { interim: true });
    },

    onUserFinal: (text) => {
        removeTemporaryUserMessage();
        if (text) showUserSpeech(text);
    },

    onAIThinking: () => {
        setState("THINKING");
        removeTemporaryUserMessage();
        addChatMessage("ai", "Thinking...");
    },

    onAITranscript: (text) => {
        if (text) showAIResponse(text);
    },

    onAIAudioStart: () => {
        markAIResponding();
    },

    onTurnComplete: () => {
        if (sessionStarted) {
            setState("LISTENING");
        } else {
            setState("STANDBY");
        }
    },

    onTextSubmitted: (text) => {
        if (text) {
            removeTemporaryUserMessage();
            addChatMessage("user", text);
        }
        setState("THINKING");
    },

    onInterrupted: () => {
        setState("LISTENING");
    },

    onReconnecting: () => {
        setState("CONNECTING");
        addChatMessage("ai", "Reconnecting to PRAGYA Voice...");
    },

    onEnd: () => {
        sessionStarted = false;
        starting = false;
        setMicButtonBusy(false);
        micButton?.classList.remove("active");
        setState("STANDBY");
        addChatMessage("ai", "PRAGYA Voice session ended.");
    },

    onError: (errorMessage) => {
        console.error("PRAGYA VOICE ERROR:", errorMessage);
        sessionStarted = false;
        starting = false;
        setMicButtonBusy(false);
        micButton?.classList.remove("active");
        setState("STANDBY");
        addChatMessage("ai", `PRAGYA ERROR: ${errorMessage}`);
    }
};

if (VoiceEngine?.registerCallbacks) {
    VoiceEngine.registerCallbacks(pragyaCallbacks);
}

/* =========================================================
   START PRAGYA VOICE
   ========================================================= */

async function startPragya() {
    if (sessionStarted || starting) return;

    if (!VoiceEngine || !VoiceEngine.supported()) {
        addChatMessage("ai", "Your browser cannot start the PRAGYA Voice voice engine.");
        return;
    }

    starting = true;
    setMicButtonBusy(true);
    micButton?.classList.add("active");
    setState("CONNECTING");

    addChatMessage("ai", "PRAGYA Voice is connecting...");

    try {
        await VoiceEngine.start(pragyaCallbacks);

        sessionStarted = true;
        starting = false;
        setMicButtonBusy(false);
        setState("LISTENING");
    } catch (error) {
        console.error("PRAGYA START ERROR:", error);
        sessionStarted = false;
        starting = false;
        setMicButtonBusy(false);
        micButton?.classList.remove("active");
        setState("STANDBY");
        addChatMessage("ai", `Connection error: ${error.message}`);
    }
}

/* =========================================================
   STOP PRAGYA VOICE
   ========================================================= */

function stopPragya() {
    try {
        VoiceEngine.stop();
    } catch (error) {
        console.error("STOP ERROR:", error);
    }

    sessionStarted = false;
    starting = false;
    setMicButtonBusy(false);
    micButton?.classList.remove("active");
    setState("STANDBY");
}

/* =========================================================
   EVENTS
   ========================================================= */

if (micButton) {
    micButton.addEventListener("click", async () => {
        if (sessionStarted) {
            stopPragya();
        } else if (!starting) {
            await startPragya();
        }
    });
}

if (textComposer) {
    textComposer.addEventListener("submit", async (event) => {
        event.preventDefault();

        const message = textInput?.value.trim();
        if (!message || !VoiceEngine?.sendText) return;

        textInput.value = "";
        setTextBusy(true);

        try {
            await VoiceEngine.sendText(message);
        } finally {
            setTextBusy(false);
            textInput?.focus();
        }
    });
}

if (clearHistoryButton) {
    clearHistoryButton.addEventListener("click", () => {
        clearChatHistory();
        textInput?.focus();
    });
}

document.addEventListener("keydown", async (event) => {
    const activeElement = document.activeElement;
    if (
        activeElement &&
        (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
    ) {
        return;
    }

    if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        if (sessionStarted) stopPragya();
        else if (!starting) await startPragya();
    }
});

/* =========================================================
   CLOCK + INIT
   ========================================================= */

function updateClock() {
    if (!clockElement) return;

    clockElement.textContent = new Date().toLocaleTimeString("en-IN", {
        hour12: false
    });
}

setInterval(updateClock, 1000);
updateClock();
renderChatHistory();
setState("STANDBY");

console.log(
    "%c PRAGYA AI — CHAT HISTORY ENABLED ",
    "background:#03111d;color:#38e8ff;padding:10px;font-weight:bold;"
);
