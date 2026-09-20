/* =========================================================
   PRAGYA AI
   FAST VOICE + TEXT APPLICATION CONTROLLER
   Google sign-in + Firestore-backed multi-chat history.
   ========================================================= */

const $ = (selector) => document.querySelector(selector);

const loginOverlay = $("#loginOverlay");
const loginNote = $("#loginNote");
const googleSignInButton = $("#googleSignInButton");

const appShell = $("#appShell");
const sidebar = $("#sidebar");
const sidebarBackdrop = $("#sidebarBackdrop");
const sidebarToggle = $("#sidebarToggle");
const newChatButton = $("#newChatButton");
const chatList = $("#chatList");
const chatListEmpty = $("#chatListEmpty");
const userAvatar = $("#userAvatar");
const userName = $("#userName");
const signOutButton = $("#signOutButton");

const micButton = $("#micButton");

const cameraButton = $("#cameraButton");
const cameraInput = $("#cameraInput");

const coreState = $("#coreState");
const systemStatus = $("#systemStatus");
const clockElement = $("#clock");
const waveform = $("#waveform");

const conversationHistory = $("#conversationHistory");
const clearHistoryButton = $("#clearHistoryButton");

const voiceToggleButton = $("#voiceToggleButton");
const voiceOnIcon = $("#voiceOnIcon");
const voiceOffIcon = $("#voiceOffIcon");

const textComposer = $("#textComposer");
const textInput = $("#textInput");
const sendTextButton = $("#sendTextButton");

const MAX_UI_MESSAGES = 200;

let sessionStarted = false;
let starting = false;
let lastUserSpeechTime = 0;
let lastAIResponseTime = 0;

let currentUser = null;
let currentChatId = null;
let chatMessages = [];
let unsubscribeChatList = null;

// { mimeType, data } (base64, no "data:" prefix) — set once a photo is
// picked via the camera button, cleared once it's sent or removed.
let pendingImage = null;

/* =========================================================
   AUTH
   ========================================================= */

function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.PragyaFirebase) return resolve(window.PragyaFirebase);
        window.addEventListener("pragya-firebase-ready", () => resolve(window.PragyaFirebase), { once: true });
    });
}

async function initAuth() {
    const Firebase = await waitForFirebase();

    Firebase.watchAuthState(async (user) => {
        currentUser = user;

        if (user) {
            loginOverlay.style.display = "none";
            appShell.hidden = false;

            userName.textContent = user.displayName || user.email || "Account";
            if (user.photoURL) {
                userAvatar.src = user.photoURL;
                userAvatar.style.display = "block";
            } else {
                userAvatar.style.display = "none";
            }

            startChatListListener();
            startNewChatState();
        } else {
            appShell.hidden = true;
            loginOverlay.style.display = "flex";
            if (unsubscribeChatList) unsubscribeChatList();
            currentChatId = null;
            chatMessages = [];
        }
    });

    if (googleSignInButton) {
        googleSignInButton.addEventListener("click", async () => {
            googleSignInButton.disabled = true;
            loginNote.textContent = "Opening Google sign-in...";
            try {
                await Firebase.signInWithGoogle();
            } catch (error) {
                console.error("SIGN-IN ERROR:", error);
                loginNote.textContent = `Sign-in failed: ${error.message}`;
            } finally {
                googleSignInButton.disabled = false;
            }
        });
    }

    if (signOutButton) {
        signOutButton.addEventListener("click", async () => {
            try {
                await Firebase.signOutUser();
            } catch (error) {
                console.error("SIGN-OUT ERROR:", error);
            }
        });
    }
}

/* =========================================================
   SIDEBAR — CHAT LIST
   ========================================================= */

function startChatListListener() {
    if (unsubscribeChatList) unsubscribeChatList();

    unsubscribeChatList = window.PragyaFirebase.watchChatList(currentUser.uid, (chats) => {
        renderChatList(chats);
    });
}

function renderChatList(chats) {
    if (!chatList) return;

    chatList.querySelectorAll(".chat-list-item").forEach((el) => el.remove());

    if (chatListEmpty) chatListEmpty.style.display = chats.length ? "none" : "block";

    chats.forEach((chat) => {
        const title = chat.title || "New chat";

        const item = document.createElement("div");
        item.className = "chat-list-item";
        item.dataset.chatId = chat.id;
        if (chat.id === currentChatId) item.classList.add("active");

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "chat-list-open";
        openButton.textContent = title;
        openButton.addEventListener("click", () => openChat(chat.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "chat-list-delete";
        deleteButton.setAttribute("aria-label", `Delete "${title}"`);
        deleteButton.title = "Delete chat";
        deleteButton.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="3 6 5 6 21 6"></polyline>' +
            '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
            '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
            '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>' +
            '</svg>';
        deleteButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            await deleteChatWithConfirm(chat.id, title);
        });

        item.appendChild(openButton);
        item.appendChild(deleteButton);
        chatList.appendChild(item);
    });
}

async function deleteChatWithConfirm(chatId, title) {
    if (!currentUser) return;
    const confirmed = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!confirmed) return;

    try {
        await window.PragyaFirebase.deleteChat(currentUser.uid, chatId);
        if (chatId === currentChatId) startNewChatState();
    } catch (error) {
        console.error("DELETE CHAT ERROR:", error);
    }
}

function closeSidebarOnMobile() {
    sidebar?.classList.remove("open");
    sidebarBackdrop?.classList.remove("open");
}

function updateActiveChatHighlight() {
    chatList?.querySelectorAll(".chat-list-item").forEach((el) => {
        el.classList.toggle("active", el.dataset.chatId === currentChatId);
    });
}

/* =========================================================
   CHAT SWITCHING
   ========================================================= */

function startNewChatState() {
    currentChatId = null;
    chatMessages = [];
    renderChatHistory();
    closeSidebarOnMobile();
    updateActiveChatHighlight();
}

async function openChat(chatId) {
    if (!currentUser) return;

    currentChatId = chatId;
    closeSidebarOnMobile();
    updateActiveChatHighlight();

    try {
        const messages = await window.PragyaFirebase.loadMessages(currentUser.uid, chatId);
        chatMessages = messages
            .filter((m) => m.role === "user" || m.role === "ai")
            .map((m) => ({ role: m.role, text: m.text }))
            .slice(-MAX_UI_MESSAGES);
        renderChatHistory();
    } catch (error) {
        console.error("LOAD CHAT ERROR:", error);
    }
}

/* =========================================================
   CHAT HISTORY (local render cache + Firestore persistence)
   ========================================================= */

async function persistMessage(role, text) {
    if (!currentUser) return;

    try {
        if (!currentChatId) {
            currentChatId = await window.PragyaFirebase.createNewChat(currentUser.uid);
        }
        await window.PragyaFirebase.addMessage(currentUser.uid, currentChatId, role, text);
    } catch (error) {
        console.error("SAVE MESSAGE ERROR:", error);
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
    renderChatHistory();

    if (options.persist !== false) {
        persistMessage(role, clean);
    }
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
    renderChatHistory();
    persistMessage("ai", clean);
}

function clearChatHistory() {
    startNewChatState();
}

/* =========================================================
   UI STATE
   ========================================================= */

function setState(state) {
    if (coreState) coreState.textContent = state;

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
   Status-only bubbles pass { persist: false } so they never
   get written to Firestore as real chat content.
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
        addChatMessage("ai", "Thinking...", { persist: false });
    },

    onAITranscript: (text) => {
        if (text) showAIResponse(text);
    },

    onAIAudioStart: () => {
        markAIResponding();
    },

    onTurnComplete: () => {
        setState(sessionStarted ? "LISTENING" : "STANDBY");
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
        addChatMessage("ai", "Reconnecting to PRAGYA Voice...", { persist: false });
    },

    onEnd: () => {
        sessionStarted = false;
        starting = false;
        setMicButtonBusy(false);
        micButton?.classList.remove("active");
        setState("STANDBY");
        addChatMessage("ai", "PRAGYA Voice session ended.", { persist: false });
    },

    onError: (errorMessage) => {
        console.error("PRAGYA VOICE ERROR:", errorMessage);
        sessionStarted = false;
        starting = false;
        setMicButtonBusy(false);
        micButton?.classList.remove("active");
        setState("STANDBY");
        addChatMessage("ai", `PRAGYA ERROR: ${errorMessage}`, { persist: false });
    }
};

if (VoiceEngine?.registerCallbacks) {
    VoiceEngine.registerCallbacks(pragyaCallbacks);
}

/* =========================================================
   START / STOP PRAGYA VOICE
   ========================================================= */

async function startPragya() {
    if (sessionStarted || starting) return;

    if (!VoiceEngine || !VoiceEngine.supported()) {
        addChatMessage("ai", "Your browser cannot start the PRAGYA Voice voice engine.", { persist: false });
        return;
    }

    starting = true;
    setMicButtonBusy(true);
    micButton?.classList.add("active");
    setState("CONNECTING");

    addChatMessage("ai", "PRAGYA Voice is connecting...", { persist: false });

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
        addChatMessage("ai", `Connection error: ${error.message}`, { persist: false });
    }
}

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
   CAMERA — pick a photo, attach it to the next message sent.
   The camera button lights up (like the mic does) while a
   photo is queued. The raw photo is only sent to Gemini for
   that one reply — it is not saved to Firestore, only the
   question text is (so chat history stays small).
   ========================================================= */

function fileToImagePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || "");
            const comma = dataUrl.indexOf(",");
            if (comma === -1) return reject(new Error("Could not read that photo."));
            resolve({
                mimeType: file.type || "image/jpeg",
                data: dataUrl.slice(comma + 1)
            });
        };
        reader.onerror = () => reject(new Error("Could not read that photo."));
        reader.readAsDataURL(file);
    });
}

function clearPendingImage() {
    pendingImage = null;
    cameraButton?.classList.remove("has-image");
    if (cameraInput) cameraInput.value = "";
}

if (cameraButton && cameraInput) {
    cameraButton.addEventListener("click", () => cameraInput.click());

    cameraInput.addEventListener("change", async () => {
        const file = cameraInput.files?.[0];
        if (!file) return;

        try {
            pendingImage = await fileToImagePart(file);
            cameraButton.classList.add("has-image");
            textInput?.focus();
        } catch (error) {
            console.error("CAMERA READ ERROR:", error);
            clearPendingImage();
        }
    });
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
        const image = pendingImage;
        if ((!message && !image) || !VoiceEngine?.sendText) return;

        textInput.value = "";
        clearPendingImage();
        setTextBusy(true);

        try {
            await VoiceEngine.sendText(message, image);
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

function applyVoiceToggleUI(enabled) {
    if (voiceOnIcon) voiceOnIcon.hidden = !enabled;
    if (voiceOffIcon) voiceOffIcon.hidden = enabled;
    if (voiceToggleButton) {
        const label = enabled ? "Mute PRAGYA's voice" : "Unmute PRAGYA's voice";
        voiceToggleButton.setAttribute("aria-label", label);
        voiceToggleButton.title = label;
        voiceToggleButton.classList.toggle("voice-muted", !enabled);
    }
}

if (voiceToggleButton && VoiceEngine?.setVoiceEnabled) {
    applyVoiceToggleUI(VoiceEngine.isVoiceEnabled());

    voiceToggleButton.addEventListener("click", () => {
        const nextEnabled = !VoiceEngine.isVoiceEnabled();
        VoiceEngine.setVoiceEnabled(nextEnabled);
        applyVoiceToggleUI(nextEnabled);
    });
}

if (newChatButton) {
    newChatButton.addEventListener("click", () => {
        startNewChatState();
        textInput?.focus();
    });
}

if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
        sidebar?.classList.toggle("open");
        sidebarBackdrop?.classList.toggle("open");
    });
}

if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebarOnMobile);
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
initAuth();

console.log(
    "%c PRAGYA AI — GOOGLE LOGIN + FIRESTORE CHAT HISTORY ",
    "background:#03111d;color:#38e8ff;padding:10px;font-weight:bold;"
);
