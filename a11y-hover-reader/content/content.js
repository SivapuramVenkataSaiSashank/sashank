// ===============================================================
// A11y Hover Reader – Content Script v8
// 
// Live proximity radar: announces ELEMENT TYPE + NAME + DIRECTION
// the moment cursor comes within 130px of any interactive element.
// ===============================================================

(function () {
    if (window.__a11y) return;
    window.__a11y = true;

    var enabled = false;

    // ── TTS via background ────────────────────────────────────
    function say(text, repeat) {
        if (!enabled || !text) return;
        chrome.runtime.sendMessage({ type: "SPEAK", text: String(text).trim(), repeat: !!repeat });
    }
    function stopSpeech() { chrome.runtime.sendMessage({ type: "STOP" }); }

    // ── Toggle from background ────────────────────────────────
    chrome.runtime.onMessage.addListener(function (msg) {
        if (msg.type !== "TOGGLE") return;
        if (msg.on) {
            enabled = true;
            nearbySet = {};
        } else {
            enabled = false;
            nearbySet = {};
            stopSpeech();
        }
    });

    // Sync on page load
    chrome.runtime.sendMessage({ type: "GET_STATE" }, function (resp) {
        if (resp && resp.on) enabled = true;
    });

    // ── Config ─────────────────────────────────────────────────
    var cfg = { speechRate: 1.0, directionNarration: true, verbosity: "normal" };
    chrome.storage.sync.get(cfg, function (i) { cfg = Object.assign(cfg, i); });
    chrome.storage.onChanged.addListener(function (ch, area) {
        if (area !== "sync") return;
        Object.keys(ch).forEach(function (k) { cfg[k] = ch[k].newValue; });
    });

    // ── Get accessible label ──────────────────────────────────
    function getLbl(el) {
        if (!el) return "";
        var tag = (el.tagName || "").toLowerCase();
        var role = (el.getAttribute ? el.getAttribute("role") : "") || "";
        role = role.toLowerCase();

        var a = el.getAttribute ? el.getAttribute("aria-label") : null;
        if (a && a.trim()) return a.trim();

        var lid = el.getAttribute ? el.getAttribute("aria-labelledby") : null;
        if (lid) {
            var ref = document.getElementById(lid);
            if (ref && ref.innerText) return ref.innerText.trim();
        }

        if (el.getAttribute && el.getAttribute("alt") && el.getAttribute("alt").trim()) return el.getAttribute("alt").trim();
        if (el.getAttribute && el.getAttribute("title") && el.getAttribute("title").trim()) return el.getAttribute("title").trim();

        var isBtn = tag === "button" || role === "button" ||
            (tag === "input" && ["button", "submit", "reset"].indexOf(el.type) >= 0);
        if (isBtn) {
            var bt = el.innerText ? el.innerText.trim() : "";
            if (bt) return bt;
            var bv = el.getAttribute ? el.getAttribute("value") : null;
            return bv ? bv.trim() : "button";
        }

        if (tag === "input" || tag === "textarea" || tag === "select") {
            var p = el.getAttribute ? el.getAttribute("placeholder") : null;
            if (p && p.trim()) return p.trim();
            var n = el.getAttribute ? el.getAttribute("name") : null;
            if (n) return n;
            return el.value ? el.value.trim() : tag;
        }

        if (tag === "a") {
            return el.innerText ? el.innerText.trim().substring(0, 60) : "link";
        }

        if (tag === "img") {
            var src = el.getAttribute ? (el.getAttribute("src") || "") : "";
            return src.split("/").pop().split(".")[0].replace(/[-_]/g, " ") || "image";
        }

        var inner = el.innerText ? el.innerText.trim() : "";
        return inner.substring(0, cfg.verbosity === "high" ? 200 : 80);
    }

    // ── Get element type label ────────────────────────────────
    function getType(el) {
        var tag = (el.tagName || "").toLowerCase();
        var role = (el.getAttribute ? el.getAttribute("role") : "") || "";
        role = role.toLowerCase();
        var isBtn = tag === "button" || role === "button" ||
            (tag === "input" && ["button", "submit", "reset"].indexOf(el.type) >= 0);
        if (isBtn) return "Button";
        if (tag === "a") return "Link";
        if (tag === "input") return el.type === "text" ? "Text field" : (el.type || "Input") + " field";
        if (tag === "textarea") return "Text area";
        if (tag === "select") return "Dropdown";
        if (/^h[1-6]$/.test(tag)) return "Heading";
        if (tag === "img") return "Image";
        return "";
    }

    // ── Full element announcement (for hover) ─────────────────
    function announce(el) {
        var lbl = getLbl(el);
        var type = getType(el);
        if (!lbl) return "";
        return type ? type + ": " + lbl : lbl;
    }

    // ── 8-compass direction from dx/dy ───────────────────────
    function angleToDir(dx, dy) {
        var a = Math.atan2(dy, dx) * 180 / Math.PI;
        // a=0°→right, 90°→below, ±180°→left, -90°→above
        if (a > -22.5 && a <= 22.5) return "to your right";
        else if (a > 22.5 && a <= 67.5) return "below and to the right";
        else if (a > 67.5 && a <= 112.5) return "below";
        else if (a > 112.5 && a <= 157.5) return "below and to the left";
        else if (a > 157.5 || a <= -157.5) return "to your left";
        else if (a > -157.5 && a <= -112.5) return "above and to the left";
        else if (a > -112.5 && a <= -67.5) return "above";
        else return "above and to the right";
    }

    // ── Proximity Radar ───────────────────────────────────────
    // Announces ALL nearby elements in ONE batch phrase the moment cursor
    // enters a 200px radius around any interactive element.
    var nearbySet = {};   // {elKey: true} for elements in zone
    var ENTER_DIST = 200;  // px radius — wide enough to catch multiple elements at once
    var radarTimer = null;
    var ISEL = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]';

    function elKey(el) {
        var r = el.getBoundingClientRect();
        return Math.round(r.left) + ":" + Math.round(r.top) + ":" + (el.tagName || "");
    }

    function runRadar(cx, cy, hovered) {
        try {
            var els = document.querySelectorAll(ISEL);
            var newSet = {};
            var newly = []; // collect ALL new zone entries this frame

            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el === hovered) continue;

                var r = el.getBoundingClientRect();
                if (!r || (r.width === 0 && r.height === 0)) continue;

                var elCx = r.left + r.width / 2;
                var elCy = r.top + r.height / 2;
                var dx = elCx - cx;
                var dy = elCy - cy;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > ENTER_DIST) continue;

                var key = elKey(el);
                newSet[key] = { el: el, dx: dx, dy: dy, dist: dist };

                if (!nearbySet[key]) {
                    var lbl = getLbl(el);
                    var type = getType(el);
                    if (lbl) {
                        var dir = angleToDir(dx, dy);
                        newly.push((type ? type + ": " : "") + lbl + ", " + dir);
                    }
                }
            }

            // Speak ALL newly-detected elements as ONE phrase
            if (newly.length > 0) {
                var phrase = newly.length === 1
                    ? newly[0]
                    : "Nearby: " + newly.join(". ");
                say(phrase, true);
            }

            // Update zone tracking
            Object.keys(nearbySet).forEach(function (k) { if (!newSet[k]) delete nearbySet[k]; });
            Object.keys(newSet).forEach(function (k) { nearbySet[k] = true; });
        } catch (e) {
            console.warn("[A11y] radar error:", e);
        }
    }

    // ── State ──────────────────────────────────────────────────
    var lastEl = null;
    var lastX = 0, lastY = 0;
    var hoverTmr = null, dirTmr = null, edgeTmr = null;

    // ── Edge detection ─────────────────────────────────────────
    function checkEdge(x, y) {
        if (edgeTmr) return;
        var W = window.innerWidth, H = window.innerHeight;
        var msg = "";
        if (x <= 10) msg = "reached left edge";
        else if (x >= W - 10) msg = "reached right edge";
        else if (y <= 10) msg = "reached top edge";
        else if (y >= H - 10) msg = "reached bottom. Taskbar is below.";
        if (!msg) return;
        say(msg, true);
        edgeTmr = setTimeout(function () { edgeTmr = null; }, 1500);
    }

    // ── Mouse move ─────────────────────────────────────────────
    document.addEventListener("mousemove", function (e) {
        if (!enabled) return;
        var x = e.clientX, y = e.clientY;

        // 1. Edge detection
        checkEdge(x, y);

        // 2. Direction narration
        if (cfg.directionNarration && !dirTmr) {
            var dx = x - lastX, dy = y - lastY;
            if (Math.sqrt(dx * dx + dy * dy) > 30) {
                var d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
                say("moving " + d, true);
                lastX = x; lastY = y;
                dirTmr = setTimeout(function () { dirTmr = null; }, 400);
            }
        }

        // 3. Element hover & Radar integration
        var el = document.elementFromPoint(x, y);
        if (el && el !== lastEl && el.tagName !== "HTML" && el.tagName !== "BODY") {
            lastEl = el;
            clearTimeout(hoverTmr);
            if (radarTimer) { clearTimeout(radarTimer); radarTimer = null; }

            hoverTmr = setTimeout(function () {
                var ann = announce(el);
                if (ann) {
                    // Pre-calculate what's around this hovered element
                    var newly = [];
                    try {
                        var els = document.querySelectorAll(ISEL);
                        for (var i = 0; i < els.length; i++) {
                            var rel = els[i];
                            if (rel === el) continue;
                            var r = rel.getBoundingClientRect();
                            if (!r || (r.width === 0 && r.height === 0)) continue;
                            var rCx = r.left + r.width / 2;
                            var rCy = r.top + r.height / 2;
                            var dx = rCx - x, dy = rCy - y;
                            var dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist <= ENTER_DIST) {
                                var k = elKey(rel);
                                nearbySet[k] = true; // mark it so radar doesn't repeat it immediately
                                var lbl = getLbl(rel), type = getType(rel);
                                if (lbl) newly.push((type ? type + ": " : "") + lbl + ", " + angleToDir(dx, dy));
                            }
                        }
                    } catch (e) { }

                    // Speak hovered element + nearby elements in ONE sentence
                    if (newly.length > 0) {
                        say(ann + ". Nearby: " + newly.join(". "), true);
                    } else {
                        say(ann, true);
                    }
                }
            }, 250);
        }

        // 4. Live proximity radar — runs while mouse moves (when NOT just triggering a hover)
        if (!radarTimer && el === lastEl) {
            (function (snapX, snapY, snapEl) {
                radarTimer = setTimeout(function () {
                    radarTimer = null;
                    runRadar(snapX, snapY, snapEl);
                }, 150);
            })(x, y, lastEl);
        }
    }, { passive: true });

    // ── Keyboard focus ─────────────────────────────────────────
    document.addEventListener("focusin", function (e) {
        if (!enabled) return;
        lastEl = e.target;
        var ann = announce(e.target);
        if (ann) say("Focused: " + ann);
    });

    console.log("[A11y v8] Proximity radar ready.");
})();
