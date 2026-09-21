/* =========================================================
   PRAGYA AI — FIREBASE INITIALIZATION
   Loaded as a <script type="module">. Sets up Auth + Firestore
   and exposes everything app.js (a classic script) needs on
   window.PragyaFirebase.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCTJN3_fzcDwNyxd8KP1cBMxRBeaWtL0lg",
    authDomain: "pragya-ai-3a2b5.firebaseapp.com",
    projectId: "pragya-ai-3a2b5",
    storageBucket: "pragya-ai-3a2b5.firebasestorage.app",
    messagingSenderId: "559732982290",
    appId: "1:559732982290:web:9d5e8c59f85ae61ff7cecb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/* ---------------------------------------------------------
   AUTH
   --------------------------------------------------------- */

function signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
}

function signOutUser() {
    return signOut(auth);
}

function watchAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

/* ---------------------------------------------------------
   CHAT LIST (sidebar)
   users/{uid}/chats/{chatId}
   --------------------------------------------------------- */

function watchChatList(uid, callback) {
    const chatsRef = collection(db, "users", uid, "chats");
    const q = query(chatsRef, orderBy("updatedAt", "desc"));
    return onSnapshot(q, (snapshot) => {
        const chats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(chats);
    });
}

async function createNewChat(uid) {
    const chatsRef = collection(db, "users", uid, "chats");
    const newChat = await addDoc(chatsRef, {
        title: "New chat",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return newChat.id;
}

async function deleteChat(uid, chatId) {
    await deleteDoc(doc(db, "users", uid, "chats", chatId));
}

/*
 * Titles the chat from its topic instead of just echoing the first
 * message. Runs once, right after the first AI reply is saved (so
 * the model has an actual exchange to summarize, not just one line
 * out of context). Falls back to the old "first words" behavior if
 * the title API is unreachable, so a chat is never left untitled.
 */
async function maybeGenerateTitle(uid, chatId, aiReplyText) {
    const chatRef = doc(db, "users", uid, "chats", chatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists() || (snap.data().title && snap.data().title !== "New chat")) return;

    const messagesRef = collection(db, "users", uid, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const msgSnap = await getDocs(q);
    const firstUserMessage = msgSnap.docs
        .map((d) => d.data())
        .find((m) => m.role === "user");

    const firstUserText = (firstUserMessage?.text || "").trim();
    if (!firstUserText) return;

    try {
        const response = await fetch("/api/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: firstUserText, reply: aiReplyText })
        });
        const data = await response.json();
        const title = (data.title || "").trim();

        if (title && title.toLowerCase() !== "new chat") {
            await updateDoc(chatRef, { title: title.slice(0, 60) });
            return;
        }
    } catch (error) {
        console.error("TITLE GENERATION ERROR:", error);
    }

    // Fallback: first words of the user's message, same as before.
    await updateDoc(chatRef, { title: firstUserText.slice(0, 45) || "New chat" });
}

/* ---------------------------------------------------------
   MESSAGES
   users/{uid}/chats/{chatId}/messages/{messageId}
   --------------------------------------------------------- */

async function loadMessages(uid, chatId) {
    const messagesRef = collection(db, "users", uid, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addMessage(uid, chatId, role, text) {
    const messagesRef = collection(db, "users", uid, "chats", chatId, "messages");
    await addDoc(messagesRef, {
        role,
        text,
        createdAt: serverTimestamp()
    });

    const chatRef = doc(db, "users", uid, "chats", chatId);
    await updateDoc(chatRef, { updatedAt: serverTimestamp() });

    if (role === "ai") {
        await maybeGenerateTitle(uid, chatId, text);
    }
}

window.PragyaFirebase = {
    signInWithGoogle,
    signOutUser,
    watchAuthState,
    watchChatList,
    createNewChat,
    deleteChat,
    loadMessages,
    addMessage
};

window.dispatchEvent(new Event("pragya-firebase-ready"));
