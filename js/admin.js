/* Espace admin : connexion, contrôle du rôle, tableau de bord Audience. Aucun HTML injecté : tout passe par textContent. */
(function () {
    "use strict";

    var S = window.PoseifyAdminService;
    var $ = function (id) { return document.getElementById(id); };
    var client = null;
    var timer = null;
    var visitors = [];
    var guests = [];
    var guestLimit = 10;
    var visitLimit = 10;
    var currentView = "apercu";

    var VIEWS = {
        apercu: "Aperçu",
        appareils: "Appareils",
        sources: "Sources",
        clics: "Clics",
        invites: "Invités",
        connexions: "Dernières connexions"
    };

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

    function deviceOf(k) {
        for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i].key === k) return DEVICES[i];
        return DEVICES[1];
    }

    function deviceLabel(k) { return k ? deviceOf(k).label : "–"; }

    function message(kind, text) {
        var box = $("adm-state");
        clear(box);
        if (!text) return;
        box.appendChild(el("div", "adm-msg " + kind, text));
    }

    function moreButton(label, onClick) {
        var b = el("button", "btn btn-outline-primary border-2 btn-sm px-4 adm-more", label);
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
    }

    // ---- menu hamburger / navigation ------------------------------------------
    function toggleMenu(open) {
        var panel = $("menu-panel");
        var isOpen = open === undefined ? panel.classList.contains("hidden") : open;
        panel.classList.toggle("hidden", !isOpen);
        $("menu-btn").setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function showView(name) {
        if (!VIEWS[name]) name = "apercu";
        currentView = name;
        var views = document.querySelectorAll(".adm-view");
        for (var i = 0; i < views.length; i++) views[i].classList.toggle("hidden", views[i].getAttribute("data-view") !== name);
        var items = document.querySelectorAll("[data-nav]");
        for (var j = 0; j < items.length; j++) items[j].classList.toggle("active", items[j].getAttribute("data-nav") === name);
        $("adm-view-name").textContent = VIEWS[name];
        show("adm-view-name", true);
        toggleMenu(false);
        window.scrollTo(0, 0);
    }

    function updateBadges() {
        var fresh = visitors.filter(function (r) { return !r.dismissed_at; }).length;
        $("cnt-connexions").textContent = nf(fresh);
        $("cnt-invites").textContent = nf(guests.length);
        var badge = $("menu-badge");
        badge.textContent = fresh > 99 ? "99+" : String(fresh);
        badge.classList.toggle("hidden", fresh === 0);
    }

    // ---- affichage ------------------------------------------------------------
    function renderList(id, items, withDates) {
        var box = $(id);
        clear(box);
        if (!items.length) { box.appendChild(el("p", "adm-empty mb-0", "Aucune donnée pour le moment.")); return; }
        var max = items[0].count || 1;
        items.slice(0, 5).forEach(function (it) {
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
        if (items.length > 5) box.appendChild(el("p", "adm-empty mt-2 mb-0", "+ " + (items.length - 5) + " autre(s) non affiché(s)"));
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

        // version compacte pour l'aperçu
        var mini = $("dev-mini");
        clear(mini);
        var bar2 = el("div", "adm-bar");
        DEVICES.forEach(function (d) {
            var seg = el("span", d.cls);
            seg.style.width = stats.byDevice[d.key].pct + "%";
            bar2.appendChild(seg);
        });
        mini.appendChild(bar2);
        var line = el("div", "adm-mini");
        DEVICES.forEach(function (d) {
            var s = el("span");
            s.appendChild(el("i", "dot " + d.cls));
            s.appendChild(document.createTextNode(d.label + " " + stats.byDevice[d.key].pct.toLocaleString("fr-FR") + " %"));
            line.appendChild(s);
        });
        mini.appendChild(line);
    }

    function renderClicks(clicks) {
        var box = $("l-clicks");
        clear(box);
        if (!clicks.buttons.length) { box.appendChild(el("p", "adm-empty mb-0", "Aucun clic enregistré pour le moment.")); return; }
        var max = clicks.buttons[0].total || 1;
        clicks.buttons.slice(0, 8).forEach(function (b) {
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
        if (clicks.buttons.length > 8) box.appendChild(el("p", "adm-empty mt-2 mb-0", "+ " + (clicks.buttons.length - 8) + " autre(s) bouton(s)"));
    }

    // Notifications : dernières connexions non effacées, la plus récente en premier
    function renderVisitors() {
        var box = $("v-table");
        clear(box);
        var fresh = visitors.filter(function (r) { return !r.dismissed_at; });
        $("v-summary").textContent = nf(fresh.length) + " connexion(s) à traiter · effacer une notification ne modifie pas les statistiques";
        var q = $("v-search").value.trim().toLowerCase();
        var list = fresh.filter(function (r) {
            if (!q) return true;
            return [fmtDate(r.last_seen || r.created_at), deviceLabel(r.device_type), r.operating_system, r.browser, r.utm_source, r.page_path]
                .join(" ").toLowerCase().indexOf(q) >= 0;
        }).sort(function (a, b) { return new Date(b.last_seen || b.created_at) - new Date(a.last_seen || a.created_at); });

        if (!list.length) { box.appendChild(el("p", "adm-empty mb-0", q ? "Aucune connexion ne correspond à cette recherche." : "Aucune nouvelle connexion. Tout est à jour.")); return; }

        list.slice(0, visitLimit).forEach(function (r) {
            var d = deviceOf(r.device_type);
            var row = el("div", "adm-notif");
            var ic = el("div", "ic " + d.cls);
            ic.appendChild(el("i", "fa " + d.icon));
            row.appendChild(ic);
            var tx = el("div", "tx");
            tx.appendChild(el("div", "l1", [d.label, r.operating_system || "–", r.browser || "–"].join(" · ")));
            tx.appendChild(el("div", "l2", [r.utm_source || "direct", r.page_path || "–", nf(r.visits_count) + " visite(s)", fmtDate(r.last_seen || r.created_at)].join(" · ")));
            row.appendChild(tx);
            var x = el("button", "adm-x");
            x.type = "button";
            x.setAttribute("aria-label", "Effacer cette notification");
            x.appendChild(el("i", "fa fa-xmark"));
            x.addEventListener("click", function () { dismissVisitor(r, x); });
            row.appendChild(x);
            box.appendChild(row);
        });
        if (list.length > visitLimit) {
            box.appendChild(moreButton("Voir plus (" + (list.length - visitLimit) + ")", function () { visitLimit += 10; renderVisitors(); }));
        }
    }

    function sqlHint() {
        return "Action impossible. Vérifiez que la mise à jour SQL « notifications » a bien été exécutée dans Supabase, puis réessayez.";
    }

    function dismissVisitor(r, btn) {
        if (!client) return;
        btn.disabled = true;
        client.rpc("admin_dismiss_visitor", { p_id: r.id }).then(function (res) {
            if (res.error) throw res.error;
            r.dismissed_at = new Date().toISOString();
            renderVisitors();
            updateBadges();
        }).catch(function () {
            btn.disabled = false;
            message("err", sqlHint());
        });
    }

    function dismissAll() {
        if (!client) return;
        var n = visitors.filter(function (r) { return !r.dismissed_at; }).length;
        if (!n) { message("info", "Aucune notification à effacer."); return; }
        if (!window.confirm("Effacer les " + n + " notification(s) de connexion ? Les statistiques ne changent pas.")) return;
        client.rpc("admin_dismiss_all_visitors").then(function (res) {
            if (res.error) throw res.error;
            var now = new Date().toISOString();
            visitors.forEach(function (r) { if (!r.dismissed_at) r.dismissed_at = now; });
            message("", "");
            renderVisitors();
            updateBadges();
        }).catch(function () { message("err", sqlHint()); });
    }

    function renderGuests(g) {
        var box = $("g-table");
        clear(box);
        if (g) guests = g.rows;
        var summary = $("g-summary");
        if (g === null) {
            summary.textContent = "";
            box.appendChild(el("p", "adm-empty mb-0", "La liste des invités n'est pas encore disponible : la table n'est pas créée dans Supabase (voir les étapes d'installation)."));
            return;
        }
        if (g) {
            summary.textContent = nf(g.stats.total) + " invité(s) · " + nf(g.stats.newToday) + " aujourd'hui · " + nf(g.stats.new7d) + " sur 7 jours" +
                (g.stats.countries.length ? " · pays le plus représenté : " + g.stats.countries[0].name + " (" + nf(g.stats.countries[0].count) + ")" : "");
        }
        var q = $("g-search").value.trim().toLowerCase();
        var all = guests.filter(function (r) {
            if (!q) return true;
            return [r.first_name, r.city, r.country].join(" ").toLowerCase().indexOf(q) >= 0;
        });
        var list = all.slice(0, guestLimit);
        if (!list.length) { box.appendChild(el("p", "adm-empty mb-0", q ? "Aucun invité ne correspond à cette recherche." : "Aucun invité inscrit pour le moment.")); return; }

        var table = el("table", "adm-table");
        var head = el("thead");
        var hr = el("tr");
        ["Date", "Prénom", "Ville", "Pays", "Profil", "Action"].forEach(function (h) { hr.appendChild(el("th", null, h)); });
        head.appendChild(hr);
        table.appendChild(head);
        var body = el("tbody");
        list.forEach(function (r) {
            var tr = el("tr");
            [["Date", fmtDate(r.created_at)], ["Prénom", r.first_name], ["Ville", r.city], ["Pays", r.country], ["Profil", r.model_id ? "n° " + r.model_id : "–"]].forEach(function (c) {
                var td = el("td", null, c[1]);
                td.setAttribute("data-label", c[0]);
                tr.appendChild(td);
            });
            var act = el("td");
            act.setAttribute("data-label", "Action");
            var btn = el("button", "btn btn-outline-primary btn-sm px-3", "Faire repasser");
            btn.type = "button";
            btn.addEventListener("click", function () { resetGuest(r, btn); });
            act.appendChild(btn);
            tr.appendChild(act);
            body.appendChild(tr);
        });
        table.appendChild(body);
        box.appendChild(table);
        if (all.length > guestLimit) {
            box.appendChild(moreButton("Voir plus (" + (all.length - guestLimit) + ")", function () { guestLimit += 10; renderGuests(undefined); }));
        }
    }

    function resetGuest(r, btn) {
        if (!client) return;
        var ok = window.confirm("Supprimer la soumission de " + r.first_name + " (" + r.city + ", " + r.country + ") et lui permettre de repasser le formulaire ?");
        if (!ok) return;
        btn.disabled = true;
        client.rpc("admin_reset_guest", { p_id: r.id }).then(function (res) {
            if (res.error) throw res.error;
            return load().then(function () {
                message("info", "Soumission de " + r.first_name + " supprimée. Cette personne repassera par le formulaire à sa prochaine visite d'un profil.");
            });
        }).catch(function () {
            btn.disabled = false;
            message("err", "Suppression impossible. Vérifiez que la mise à jour SQL des invités a bien été exécutée, puis réessayez.");
        });
    }

    function renderAll(a, c, g) {
        visitors = a.rows;
        renderGuests(g);
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
        updateBadges();
        $("adm-updated").textContent = "Dernière actualisation : " + new Date().toLocaleTimeString("fr-FR") +
            " · calculs sur les " + S.LIMIT + " dernières lignes · actualisation automatique toutes les 60 s";
    }

    // ---- données --------------------------------------------------------------
    function load() {
        if (!client) return Promise.resolve();
        message("info", "Chargement des données…");
        return Promise.all([S.fetchAnalyticsData(client), S.fetchClicksData(client), S.fetchGuestsData(client).catch(function () { return null; })]).then(function (res) {
            message("", "");
            renderAll(res[0], res[1], res[2]);
        }).catch(function () {
            message("err", "Impossible de charger les statistiques. Vérifiez votre connexion puis choisissez « Actualiser » dans le menu.");
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
        toggleMenu(false);
        show("adm-dash", false);
        show("adm-actions", false);
        show("adm-view-name", false);
        show("adm-login", true);
        message(err ? "err" : "", err || "");
    }

    function showRestricted() {
        stopAuto();
        toggleMenu(false);
        show("adm-dash", false);
        show("adm-login", false);
        show("adm-view-name", false);
        show("adm-actions", true);
        $("adm-actions").classList.add("restricted");
        message("err", "Accès restreint. Ce compte n'a pas les droits administrateur.");
    }

    function showDashboard() {
        show("adm-login", false);
        show("adm-dash", true);
        show("adm-actions", true);
        $("adm-actions").classList.remove("restricted");
        message("", "");
        showView(currentView);
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

    function download(name, content) {
        var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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

    $("menu-btn").addEventListener("click", function (ev) { ev.stopPropagation(); toggleMenu(); });
    $("menu-panel").addEventListener("click", function (ev) { ev.stopPropagation(); });
    document.addEventListener("click", function () { toggleMenu(false); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") toggleMenu(false); });

    var navItems = document.querySelectorAll("[data-nav]");
    for (var i = 0; i < navItems.length; i++) {
        navItems[i].addEventListener("click", function (ev) { showView(ev.currentTarget.getAttribute("data-nav")); });
    }

    $("btn-logout").addEventListener("click", function () {
        if (!client) return;
        toggleMenu(false);
        client.auth.signOut().then(function () { visitors = []; guests = []; showLogin(); });
    });

    $("btn-refresh").addEventListener("click", function () { toggleMenu(false); load(); });

    $("v-search").addEventListener("input", renderVisitors);
    $("v-clear").addEventListener("click", dismissAll);
    $("g-search").addEventListener("input", function () { renderGuests(undefined); });

    $("g-csv").addEventListener("click", function () {
        toggleMenu(false);
        if (!guests.length) { message("info", "Aucun invité à exporter pour le moment."); return; }
        download("invites", S.guestsToCsv(guests));
    });

    $("btn-csv").addEventListener("click", function () {
        toggleMenu(false);
        if (!visitors.length) { message("info", "Aucune donnée à exporter pour le moment."); return; }
        download("audience", S.visitorsToCsv(visitors));
    });

    boot();
})();
