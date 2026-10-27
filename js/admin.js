/* Espace admin : connexion, contrôle du rôle, tableau de bord Audience. Aucun HTML injecté : tout passe par textContent. */
(function () {
    "use strict";

    var S = window.PoseifyAdminService;
    var $ = function (id) { return document.getElementById(id); };
    var client = null;
    var timer = null;
    var visitors = [];

    var DEVICES = [
        { key: "mobile", label: "Téléphone", icon: "fa-mobile-screen", cls: "c-mobile" },
        { key: "desktop", label: "Ordinateur", icon: "fa-desktop", cls: "c-desktop" },
        { key: "tablet", label: "Tablette", icon: "fa-tablet-screen-button", cls: "c-tablet" }
    ];

    // ---- utilitaires DOM ------------------------------------------------------
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = text;
        return n;
    }

    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

    function show(id, on) { $(id).classList.toggle("hidden", !on); }

    function fmtDate(v) {
        var d = v ? new Date(v) : null;
        return d && !isNaN(d) ? d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
    }

    function fmtTs(t) { return t ? fmtDate(t) : "–"; }

    function nf(n) { return Number(n || 0).toLocaleString("fr-FR"); }

    function deviceLabel(k) {
        for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i].key === k) return DEVICES[i].label;
        return k || "–";
    }

    function message(kind, text) {
        var box = $("adm-state");
        clear(box);
        if (!text) return;
        box.appendChild(el("div", "adm-msg " + kind, text));
    }

    // ---- affichage ------------------------------------------------------------
    function renderList(id, items, withDates) {
        var box = $(id);
        clear(box);
        if (!items.length) { box.appendChild(el("p", "adm-empty mb-0", "Aucune donnée pour le moment.")); return; }
        var max = items[0].count || 1;
        items.slice(0, 8).forEach(function (it) {
            var row = el("div", "adm-row");
            var top = el("div", "top");
            top.appendChild(el("span", null, it.name));
            top.appendChild(el("span", null, nf(it.count) + " · " + nf(it.visits) + " visites"));
            row.appendChild(top);
            var track = el("div", "track");
            var bar = el("i");
            bar.style.width = Math.max(4, Math.round((it.count / max) * 100)) + "%";
            track.appendChild(bar);
            row.appendChild(track);
            if (withDates) row.appendChild(el("div", "meta", "Première visite : " + fmtTs(it.first) + " · Dernière : " + fmtTs(it.last)));
            box.appendChild(row);
        });
    }

    function renderDevices(stats) {
        var split = $("dev-split");
        clear(split);
        var bar = el("div", "adm-bar");
        DEVICES.forEach(function (d) {
            var seg = el("span", d.cls);
            seg.style.width = stats.byDevice[d.key].pct + "%";
            bar.appendChild(seg);
        });
        split.appendChild(bar);
        DEVICES.forEach(function (d) {
            var row = el("div", "adm-dev");
            var ic = el("div", "ic " + d.cls);
            ic.appendChild(el("i", "fa " + d.icon));
            row.appendChild(ic);
            row.appendChild(el("div", "nm", d.label));
            var nb = el("div", "nb", nf(stats.byDevice[d.key].count));
            nb.appendChild(el("small", null, stats.byDevice[d.key].pct.toLocaleString("fr-FR") + " %"));
            row.appendChild(nb);
            split.appendChild(row);
        });

        var vis = $("dev-visits");
        clear(vis);
        DEVICES.forEach(function (d) {
            var row = el("div", "adm-dev");
            var ic = el("div", "ic " + d.cls);
            ic.appendChild(el("i", "fa " + d.icon));
            row.appendChild(ic);
            row.appendChild(el("div", "nm", d.label));
            row.appendChild(el("div", "nb", nf(stats.byDevice[d.key].visits) + " visites"));
            vis.appendChild(row);
        });
    }

    function renderClicks(clicks) {
        var box = $("l-clicks");
        clear(box);
        if (!clicks.buttons.length) { box.appendChild(el("p", "adm-empty mb-0", "Aucun clic enregistré pour le moment.")); return; }
        var max = clicks.buttons[0].total || 1;
        clicks.buttons.forEach(function (b) {
            var row = el("div", "adm-row");
            var top = el("div", "top");
            top.appendChild(el("span", null, b.name));
            top.appendChild(el("span", null, nf(b.total) + " clics"));
            row.appendChild(top);
            var track = el("div", "track");
            var bar = el("i");
            bar.style.width = Math.max(4, Math.round((b.total / max) * 100)) + "%";
            track.appendChild(bar);
            row.appendChild(track);
            var split = el("div", "clk-split");
            DEVICES.forEach(function (d) { split.appendChild(el("span", null, d.label + " : " + nf(b[d.key]))); });
            row.appendChild(split);
            box.appendChild(row);
        });
    }

    function renderVisitors() {
        var box = $("v-table");
        clear(box);
        var q = $("v-search").value.trim().toLowerCase();
        var list = visitors.filter(function (r) {
            if (!q) return true;
            return [fmtDate(r.created_at), deviceLabel(r.device_type), r.operating_system, r.browser, r.utm_source, r.page_path]
                .join(" ").toLowerCase().indexOf(q) >= 0;
        }).slice(0, 30);

        if (!list.length) { box.appendChild(el("p", "adm-empty mb-0", q ? "Aucun visiteur ne correspond à cette recherche." : "Aucun visiteur pour le moment.")); return; }

        var table = el("table", "adm-table");
        var head = el("thead");
        var hr = el("tr");
        ["Date", "Appareil", "Système", "Navigateur", "Source", "Page", "Visites"].forEach(function (h) { hr.appendChild(el("th", null, h)); });
        head.appendChild(hr);
        table.appendChild(head);
        var body = el("tbody");
        list.forEach(function (r) {
            var tr = el("tr");
            [
                ["Date", fmtDate(r.created_at)], ["Appareil", deviceLabel(r.device_type)], ["Système", r.operating_system || "–"],
                ["Navigateur", r.browser || "–"], ["Source", r.utm_source || "direct"], ["Page", r.page_path || "–"], ["Visites", nf(r.visits_count)]
            ].forEach(function (c) {
                var td = el("td", null, c[1]);
                td.setAttribute("data-label", c[0]);
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        box.appendChild(table);
    }

    function renderAll(a, c) {
        visitors = a.rows;
        var s = a.stats;
        $("k-unique").textContent = nf(s.uniqueDevices);
        $("k-visits").textContent = nf(s.totalVisits);
        $("k-today").textContent = nf(s.newToday);
        $("k-week").textContent = nf(s.new7d);
        renderDevices(s);
        renderList("l-systems", s.systems);
        renderList("l-browsers", s.browsers);
        renderList("l-sources", s.sources);
        renderList("l-campaigns", s.campaigns, true);
        renderClicks(c.stats);
        renderVisitors();
        $("adm-updated").textContent = "Dernière actualisation : " + new Date().toLocaleTimeString("fr-FR") +
            " · calculs sur les " + S.LIMIT + " dernières lignes · actualisation automatique toutes les 60 s";
    }

    // ---- données --------------------------------------------------------------
    function load() {
        if (!client) return Promise.resolve();
        message("info", "Chargement des données…");
        return Promise.all([S.fetchAnalyticsData(client), S.fetchClicksData(client)]).then(function (res) {
            message("", "");
            renderAll(res[0], res[1]);
        }).catch(function () {
            message("err", "Impossible de charger les statistiques. Vérifiez votre connexion puis cliquez sur « Actualiser ».");
        });
    }

    function startAuto() {
        stopAuto();
        timer = setInterval(function () { if (!document.hidden) load(); }, 60000);
    }

    function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

    // ---- accès ----------------------------------------------------------------
    function showLogin(err) {
        stopAuto();
        show("adm-dash", false);
        show("adm-actions", false);
        show("adm-login", true);
        message(err ? "err" : "", err || "");
    }

    function showRestricted() {
        stopAuto();
        show("adm-dash", false);
        show("adm-login", false);
        show("adm-actions", true);
        ["btn-refresh", "btn-csv"].forEach(function (id) { $(id).classList.add("hidden"); });
        message("err", "Accès restreint. Ce compte n'a pas les droits administrateur.");
    }

    function showDashboard() {
        show("adm-login", false);
        show("adm-dash", true);
        show("adm-actions", true);
        ["btn-refresh", "btn-csv"].forEach(function (id) { $(id).classList.remove("hidden"); });
        message("", "");
        load();
        startAuto();
    }

    function checkRole() {
        return client.rpc("app_role").then(function (res) {
            if (res.error) throw res.error;
            if (res.data === "admin") showDashboard(); else showRestricted();
        }).catch(function () {
            message("err", "Impossible de vérifier vos droits. Réessayez dans un instant.");
        });
    }

    function boot() {
        if (!window.PoseifySupabase || !window.PoseifySupabase.configured()) {
            message("err", "Supabase n'est pas configuré. Renseignez l'URL et la clé publique dans js/supabase-config.js.");
            return;
        }
        message("info", "Chargement…");
        window.PoseifySupabase.get({ session: true }).then(function (c) {
            if (!c) { message("err", "Connexion au service impossible. Vérifiez votre connexion internet."); return; }
            client = c;
            return client.auth.getSession().then(function (res) {
                var session = res && res.data && res.data.session;
                message("", "");
                if (session) return checkRole();
                showLogin();
            });
        });
    }

    // ---- événements -----------------------------------------------------------
    $("login-form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!client) return;
        var email = $("login-email").value.trim();
        var pass = $("login-pass").value;
        if (!email || !pass) { message("err", "Renseignez votre e-mail et votre mot de passe."); return; }
        var btn = $("login-btn");
        btn.disabled = true;
        client.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
            btn.disabled = false;
            if (res.error) { message("err", "E-mail ou mot de passe incorrect."); return; }
            $("login-pass").value = "";
            message("", "");
            return checkRole();
        }).catch(function () {
            btn.disabled = false;
            message("err", "Connexion impossible. Réessayez dans un instant.");
        });
    });

    $("btn-logout").addEventListener("click", function () {
        if (!client) return;
        client.auth.signOut().then(function () { visitors = []; showLogin(); });
    });

    $("btn-refresh").addEventListener("click", function () { load(); });

    $("v-search").addEventListener("input", renderVisitors);

    $("btn-csv").addEventListener("click", function () {
        if (!visitors.length) { message("info", "Aucune donnée à exporter pour le moment."); return; }
        var blob = new Blob([S.visitorsToCsv(visitors)], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "audience-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    boot();
})();
