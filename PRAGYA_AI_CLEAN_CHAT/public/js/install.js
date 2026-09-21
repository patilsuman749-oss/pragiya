/* =========================================================
   INSTALL APP BUTTON
   Shows a pill button in the header; wires up the native
   "Add to Home Screen" / install prompt where the browser
   supports it (Chrome/Edge/Android), and falls back to a
   quick instruction toast on iOS Safari, where there is no
   programmatic install API.
   ========================================================= */

(function () {
    const installButton = document.getElementById("installAppButton");
    if (!installButton) return;

    let deferredPrompt = null;

    const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    if (isStandalone) {
        // Already installed / running as an app — nothing to offer.
        return;
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            /* non-fatal — install prompt just won't fire without it */
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        installButton.hidden = false;
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installButton.hidden = true;
    });

    // iOS Safari never fires beforeinstallprompt — show the button anyway
    // and explain the manual step on tap.
    if (isIOS) {
        installButton.hidden = false;
    }

    function showIOSInstructions() {
        const existing = document.getElementById("iosInstallToast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "iosInstallToast";
        toast.className = "ios-install-toast";
        toast.innerHTML =
            'Tap <strong>Share</strong> <span aria-hidden="true">⬆️</span> then ' +
            '<strong>"Add to Home Screen"</strong> to install PRAGYA AI.';
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add("visible"));
        setTimeout(() => {
            toast.classList.remove("visible");
            setTimeout(() => toast.remove(), 250);
        }, 4000);
    }

    installButton.addEventListener("click", async () => {
        if (deferredPrompt) {
            installButton.disabled = true;
            deferredPrompt.prompt();
            try {
                await deferredPrompt.userChoice;
            } finally {
                deferredPrompt = null;
                installButton.disabled = false;
            }
            return;
        }

        if (isIOS) {
            showIOSInstructions();
        }
    });
})();
