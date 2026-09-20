/* =========================================================
   PRAGYA AI — VOICE + TEXT ENGINE
   Same voice preference + same speech settings across devices.
   ========================================================= */

window.VoiceEngine = (() => {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    const synth = window.speechSynthesis;

    let recognition = null;
    let active = false;
    let manualStop = false;
    let processingTurn = false;
    let callbacks = {};
    let selectedVoice = null;
    let voicePromise = null;

    const history = [];
    const MAX_HISTORY_TURNS = 4;

    function supported() {
        return Boolean(SpeechRecognition) && Boolean(synth);
    }

    function buildRecognition() {
        const rec = new SpeechRecognition();

        rec.lang = "en-IN";
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
            let interim = "";
            let final = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    final += transcript;
                } else {
                    interim += transcript;
                }
            }

            if (interim && callbacks.onUserInterim) {
                callbacks.onUserInterim(interim);
            }

            if (final) {
                handleFinalTranscript(final.trim());
            }
        };

        rec.onerror = (event) => {
            if (event.error === "no-speech" || event.error === "aborted") return;

            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                fail("Microphone access was blocked. Allow microphone permission and try again.");
                return;
            }

            fail(`Speech recognition error: ${event.error}`);
        };

        rec.onend = () => {
            if (manualStop || processingTurn || !active) return;
            safeStartRecognition();
        };

        return rec;
    }

    function safeStartRecognition() {
        if (!active || manualStop || processingTurn || !recognition) return;

        try {
            recognition.start();
        } catch (e) {
            // Already running; harmless.
        }
    }

    async function handleFinalTranscript(text) {
        if (!text || processingTurn) return;

        processingTurn = true;

        try { recognition?.stop(); } catch (e) {}

        callbacks.onUserFinal?.(text);
        callbacks.onAIThinking?.();

        try {
            const reply = await askPragya(text);
            callbacks.onAITranscript?.(reply);
            speak(reply);
        } catch (error) {
            processingTurn = false;
            callbacks.onError?.(error.message || "PRAGYA could not respond.");
            safeStartRecognition();
        }
    }

    async function askPragya(message, image) {
        const controller = new AbortController();
        // Slightly longer than the server's own 18s deadline, so the
        // real error from the backend (rate limit, auth, overload, etc.)
        // has time to arrive instead of being replaced by this fallback.
        const timeout = setTimeout(() => controller.abort(), 22000);

        let response;
        try {
            response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history, image: image || undefined }),
                signal: controller.signal
            });
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("PRAGYA's backend didn't respond at all (no reply from the server). Check that the Netlify function is deployed and reachable.");
            }
            throw new Error("Could not reach the PRAGYA backend. Is the server running?");
        } finally {
            clearTimeout(timeout);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error("The backend returned an invalid response.");
        }

        if (!response.ok) {
            throw new Error(data.error || "PRAGYA backend returned an error.");
        }

        if (!data.reply) {
            throw new Error("PRAGYA sent an empty reply.");
        }

        history.push({ role: "user", text: message || "What is in this photo?" });
        history.push({ role: "model", text: data.reply });

        while (history.length > MAX_HISTORY_TURNS * 2) {
            history.shift();
        }

        return data.reply;
    }

    /*
     * Use one fixed priority order on every device.
     * A browser can only use a voice that the device provides.
     *
     * NOTE: Android's built-in Google TTS engine names its voices
     * things like "Google US English" (no "Male"/"Female" suffix),
     * so plain base names are listed first — they're the ones
     * actually present on most phones.
     */
    const PC_STYLE_VOICES = [
        "Google US English",
        "Google UK English Male",
        "Google UK English Female",
        "Microsoft David",
        "Microsoft Guy Online (Natural) - English (United States)",
        "Microsoft Ryan Online (Natural) - English (United Kingdom)",
        "Google US English Male",
        "Google English",
        "Ravi",
        "David",
        "Mark",
        "George",
        "Daniel",
        "James",
        "Alex"
    ];

    function chooseMaleVoice() {
        if (!synth) return null;

        const voices = synth.getVoices().filter(Boolean);
        if (!voices.length) return null;

        /* Keep the same voice for the whole session. */
        if (selectedVoice && voices.some(v => v.voiceURI === selectedVoice.voiceURI)) {
            return selectedVoice;
        }

        for (const wanted of PC_STYLE_VOICES) {
            const wantedLower = wanted.toLowerCase();

            const match = voices.find((v) => {
                if (!/^en(-|_)/i.test(v.lang)) return false;
                const name = v.name.toLowerCase();
                // Match either direction: a device voice can be a longer
                // name that contains "wanted" (desktop), or a shorter
                // base name that "wanted" contains (Android).
                return name.includes(wantedLower) || wantedLower.includes(name);
            });

            if (match) {
                selectedVoice = match;
                return match;
            }
        }

        /* Male-looking English fallback. */
        const english = voices.filter(v => /^en(-|_)/i.test(v.lang));

        const maleLooking = english.find(v =>
            /male|david|guy|ryan|mark|george|daniel|james|ravi|alex/i.test(v.name)
        );

        selectedVoice =
            maleLooking ||
            english.find(v => /en-IN/i.test(v.lang)) ||
            english.find(v => /en-US/i.test(v.lang)) ||
            english.find(v => /en-GB/i.test(v.lang)) ||
            english[0] ||
            null;

        return selectedVoice;
    }

    function loadVoices() {
        if (!synth) return Promise.resolve([]);

        const available = synth.getVoices();
        if (available.length) {
            chooseMaleVoice();
            return Promise.resolve(available);
        }

        if (!voicePromise) {
            voicePromise = new Promise(resolve => {
                const done = () => {
                    synth.removeEventListener("voiceschanged", done);
                    chooseMaleVoice();
                    resolve(synth.getVoices());
                };

                synth.addEventListener("voiceschanged", done);

                setTimeout(() => {
                    synth.removeEventListener("voiceschanged", done);
                    chooseMaleVoice();
                    resolve(synth.getVoices());
                }, 1200);
            });
        }

        return voicePromise;
    }

    function speak(text) {
        if (!synth) {
            finishTurn();
            return;
        }

        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(String(text || "").trim());
        const voice = chooseMaleVoice();

        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        } else {
            utterance.lang = "en-IN";
        }

        /* Same deeper PC-style speech settings on mobile. */
        utterance.rate = 0.94;
        utterance.pitch = 0.62;
        utterance.volume = 1.0;

        utterance.onstart = () => callbacks.onAIAudioStart?.();
        utterance.onend = () => finishTurn();
        utterance.onerror = () => finishTurn();

        synth.speak(utterance);
    }

    function finishTurn() {
        processingTurn = false;
        callbacks.onTurnComplete?.();
        safeStartRecognition();
    }

    async function sendText(text, image) {
        const message = String(text || "").trim();
        if ((!message && !image) || processingTurn) return false;

        processingTurn = true;

        if (active) {
            try { recognition?.stop(); } catch (e) {}
        }

        callbacks.onTextSubmitted?.(message || "What is in this photo?");
        callbacks.onAIThinking?.();

        try {
            const reply = await askPragya(message, image);
            callbacks.onAITranscript?.(reply);
            speak(reply);
            return true;
        } catch (error) {
            processingTurn = false;
            callbacks.onError?.(error.message || "PRAGYA could not respond.");
            safeStartRecognition();
            return false;
        }
    }

    function fail(message) {
        active = false;
        manualStop = true;
        processingTurn = false;

        try { recognition?.stop(); } catch (e) {}
        try { synth?.cancel(); } catch (e) {}

        callbacks.onError?.(message);
    }

    function registerCallbacks(cb) {
        callbacks = cb || {};
    }

    async function start(cb) {
        if (cb) callbacks = cb;

        if (!supported()) {
            throw new Error("Chrome or Edge with Web Speech support is required.");
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
            throw new Error("Microphone permission was denied.");
        }

        manualStop = false;
        active = true;
        processingTurn = false;
        recognition = buildRecognition();

        /* Wait for the browser's voice list before listening. */
        await loadVoices();
        chooseMaleVoice();
        safeStartRecognition();
    }

    function stop() {
        manualStop = true;
        active = false;
        processingTurn = false;

        try { recognition?.stop(); } catch (e) {}
        try { synth?.cancel(); } catch (e) {}

        callbacks.onEnd?.();
    }

    if (synth) {
        synth.addEventListener("voiceschanged", () => {
            /* Refresh selection when mobile Chrome loads voices late. */
            if (!selectedVoice) chooseMaleVoice();
        });
    }

    return {
        supported,
        registerCallbacks,
        start,
        stop,
        sendText
    };
})();
