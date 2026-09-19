/* =========================================================
   PRAGYA AI — VOICE + TEXT ENGINE
   Fast REST Gemini backend + browser speech APIs.

   Public API:
     VoiceEngine.supported()
     VoiceEngine.start(callbacks)
     VoiceEngine.stop()
     VoiceEngine.sendText(text)
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

    async function askPragya(message) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        let response;
        try {
            response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history }),
                signal: controller.signal
            });
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("PRAGYA is taking too long. Please try again.");
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

        history.push({ role: "user", text: message });
        history.push({ role: "model", text: data.reply });

        while (history.length > MAX_HISTORY_TURNS * 2) {
            history.shift();
        }

        return data.reply;
    }

    function chooseMaleVoice() {
        if (!synth) return null;

        const voices = synth.getVoices();
        if (!voices.length) return null;

        const preferred = [
            "Google UK English Male",
            "Google US English Male",
            "Microsoft David",
            "Microsoft Mark",
            "Microsoft George",
            "Microsoft Ryan Online (Natural) - English (United Kingdom)",
            "Microsoft Guy Online (Natural) - English (United States)",
            "Ravi",
            "Daniel",
            "David",
            "Mark",
            "George",
            "Alex"
        ];

        const byPreferredName = preferred.find((name) =>
            voices.some((voice) => voice.name.toLowerCase().includes(name.toLowerCase()))
        );

        if (byPreferredName) {
            return voices.find((voice) =>
                voice.name.toLowerCase().includes(byPreferredName.toLowerCase())
            );
        }

        const english = voices.filter((voice) => /^en(-|_)/i.test(voice.lang));
        return english.find((voice) => /male|david|mark|george|daniel|guy|ryan|ravi|alex/i.test(voice.name))
            || english.find((voice) => /en-IN|en-GB|en-US/i.test(voice.lang))
            || voices[0];
    }

    function speak(text) {
        if (!synth) {
            finishTurn();
            return;
        }

        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voice = chooseMaleVoice();

        if (voice) utterance.voice = voice;

        utterance.lang = voice?.lang || "en-IN";
        utterance.rate = 0.94;
        utterance.pitch = 0.62;
        utterance.volume = 1;

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

    async function sendText(text) {
        const message = String(text || "").trim();
        if (!message || processingTurn) return false;

        processingTurn = true;

        if (active) {
            try { recognition?.stop(); } catch (e) {}
        }

        callbacks.onTextSubmitted?.(message);
        callbacks.onAIThinking?.();

        try {
            const reply = await askPragya(message);
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

    async function start(cb) {
        callbacks = cb || {};

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
        synth?.getVoices();
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
        synth.onvoiceschanged = () => synth.getVoices();
    }

    return {
        supported,
        start,
        stop,
        sendText
    };
})();
