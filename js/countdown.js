/*
 * Compte à rebours de la soirée + message de bienvenue des invités (page d'accueil).
 * Pour changer la date ou l'heure, modifiez uniquement PARTY ci-dessous (heure de Paris, +01:00 en hiver, +02:00 en été).
 */
(function () {
    "use strict";

    var PARTY = "2026-10-31T10:00:00+01:00";   // samedi 31 octobre 2026, début du programme à 10h00
    var HIDE_AFTER_MS = 24 * 60 * 60 * 1000;   // le bloc disparaît 24 h après le début de la soirée
    var WELCOME_KEY = "poseify_welcome_v1";

    var target = new Date(PARTY).getTime();
    if (isNaN(target)) return;

    var $ = function (id) { return document.getElementById(id); };
    function pad(n) { return n < 10 ? "0" + n : String(n); }

    // ---- compte à rebours --------------------------------------------------------
    var section = $("countdown");
    var timer = null;
    var last = {};

    function dateLabel() {
        try {
            var d = new Date(target);
            var jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(d);
            var parts = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris" }).formatToParts(d);
            var h = "", m = "";
            parts.forEach(function (p) { if (p.type === "hour") h = p.value; if (p.type === "minute") m = p.value; });
            return jour.charAt(0).toUpperCase() + jour.slice(1) + " · à partir de " + h + "h" + (m === "00" ? "" : m);
        } catch (e) { return ""; }
    }

    function set(id, value) {
        var node = $(id);
        if (!node || last[id] === value) return;
        last[id] = value;
        node.textContent = value;
        node.classList.remove("tick");
        void node.offsetWidth;
        node.classList.add("tick");
    }

    function tick() {
        var diff = target - Date.now();
        if (diff <= 0) { finish(diff); return; }
        var s = Math.floor(diff / 1000);
        set("cd-d", pad(Math.floor(s / 86400)));
        set("cd-h", pad(Math.floor((s % 86400) / 3600)));
        set("cd-m", pad(Math.floor((s % 3600) / 60)));
        set("cd-s", pad(s % 60));
    }

    function finish(diff) {
        if (timer) { clearInterval(timer); timer = null; }
        if (-diff > HIDE_AFTER_MS) { section.classList.add("hidden"); return; }
        $("cd-titre").textContent = "C'est maintenant";
        $("cd-grid").classList.add("hidden");
        $("cd-note").textContent = "La soirée est lancée. Profitez, vous êtes attendu(e).";
    }

    function startCountdown() {
        if (!section) return;
        $("cd-date").textContent = dateLabel();
        tick();
        if (target - Date.now() <= 0) return;
        timer = setInterval(function () { if (!document.hidden) tick(); }, 1000);
        document.addEventListener("visibilitychange", function () { if (!document.hidden && timer) tick(); });
    }

    // ---- message de bienvenue ------------------------------------------------------
    function seen() {
        try { return !!window.sessionStorage.getItem(WELCOME_KEY); } catch (e) { return false; }
    }

    function markSeen() {
        try { window.sessionStorage.setItem(WELCOME_KEY, "1"); } catch (e) {}
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text) n.textContent = text;
        return n;
    }

    function showWelcome() {
        if (seen() || target - Date.now() < -HIDE_AFTER_MS) return;
        var overlay = el("div", "welcome");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "welcome-titre");

        var card = el("div", "welcome-card");
        var icon = el("div", "welcome-icon");
        icon.appendChild(el("i", "fa fa-crown"));
        card.appendChild(icon);
        card.appendChild(el("p", "welcome-kicker", "Invitation privée"));
        var h = el("h2", "welcome-titre", "Bienvenue, vous êtes invité(e)");
        h.id = "welcome-titre";
        card.appendChild(h);
        card.appendChild(el("p", "welcome-text", "Ce lien n'est pas public : il n'a été confié qu'à quelques privilégiés, et vous en faites partie. Samedi soir, la fête est pour vous. Profitez de chaque instant, vous êtes attendu(e)."));
        var btn = el("button", "btn btn-primary welcome-btn", "Entrer dans la soirée");
        btn.type = "button";
        btn.setAttribute("data-track", "bienvenue_entrer");
        card.appendChild(btn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        document.body.classList.add("welcome-open");
        requestAnimationFrame(function () { overlay.classList.add("open"); });
        btn.focus();

        function close() {
            markSeen();
            overlay.classList.remove("open");
            document.body.classList.remove("welcome-open");
            document.removeEventListener("keydown", onKey);
            setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
        }
        function onKey(ev) { if (ev.key === "Escape") close(); }
        btn.addEventListener("click", close);
        overlay.addEventListener("click", function (ev) { if (ev.target === overlay) close(); });
        document.addEventListener("keydown", onKey);
    }

    startCountdown();
    // petit délai : on laisse le spinner de chargement se retirer avant d'accueillir l'invité
    setTimeout(showWelcome, 450);
})();
