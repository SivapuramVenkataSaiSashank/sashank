// ===============================================================
// Background Service Worker – MINIMAL + BULLETPROOF
// All TTS via chrome.tts (no user-gesture requirement).
// ===============================================================

var isEnabled = false;

// ── Icon click ────────────────────────────────────────────────
chrome.action.onClicked.addListener(function (tab) {
    isEnabled = !isEnabled;
    setBadge(isEnabled);

    if (isEnabled) {
        // Step 1 – inject content script (safe even if already injected)
        chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ["content/content.js"] },
            function () {
                // Step 2 – tell content script it is ON
                chrome.tabs.sendMessage(tab.id, { type: "TOGGLE", on: true }, function () { });
                // Step 3 – speak via chrome.tts (guaranteed, no page needed)
                ttsSay("A11y narration is ON");
            }
        );
    } else {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE", on: false }, function () { });
        chrome.tts.stop();
        setBadge(false);
    }
});

// ── Keyboard shortcut ─────────────────────────────────────────
chrome.commands.onCommand.addListener(function (cmd) {
    if (cmd !== "toggle-narration") return;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) chrome.action.onClicked.dispatch(tabs[0]);
    });
});

// ── Context menu ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function () {
    chrome.contextMenus.create({
        id: "a11y-read",
        title: "A11y: Read Selection",
        contexts: ["selection"]
    });
});
chrome.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === "a11y-read" && info.selectionText) {
        ttsSay(info.selectionText);
    }
});

// ── Messages from content script ──────────────────────────────
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "SPEAK" && isEnabled) {
        ttsSay(msg.text, msg.repeat);
    }
    if (msg.type === "STOP") chrome.tts.stop();
    if (msg.type === "GET_STATE") sendResponse({ on: isEnabled });
});

// ── TTS wrapper ───────────────────────────────────────────────
var _lastSaid = "";
function ttsSay(text, forceRepeat) {
    if (!text) return;
    text = String(text).trim().substring(0, 200);
    if (!forceRepeat && text === _lastSaid) return;
    _lastSaid = text;
    chrome.tts.stop();
    // Get available voices and pick the first English one
    chrome.tts.getVoices(function (voices) {
        var opts = { rate: 1.15, enqueue: false };
        // Pick a suitable English voice if available
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].lang && voices[i].lang.indexOf("en") === 0) {
                opts.voiceName = voices[i].voiceName;
                break;
            }
        }
        chrome.tts.speak(text, opts, function () {
            if (chrome.runtime.lastError) {
                console.warn("[A11y TTS]", chrome.runtime.lastError.message);
            }
        });
    });
}

// ── Badge ─────────────────────────────────────────────────────
function setBadge(on) {
    chrome.action.setBadgeText({ text: on ? "ON" : "" });
    chrome.action.setBadgeBackgroundColor({ color: on ? "#16a34a" : "#9ca3af" });
}
