/*
 * Données des filles + rendu des cartes + mémorisation de la localisation du visiteur.
 *
 * Pour chaque fille (id 1 à 15) déposez vos fichiers ici :
 *   - photos  : img/models/<id>/photo-1.jpg, photo-2.jpg, photo-3.jpg
 *   - vidéos  : videos/<id>/video-1.mp4, video-2.mp4
 * <id> est sur 2 chiffres : 01, 02 ... 15.
 * Le lien du bouton « Réserver » se règle dans le champ "reservation" de chaque fille.
 */
(function () {
    "use strict";

    var CATEGORIES = [
        "Défilés de mode",
        "Événements",
        "Shootings photo commerciaux",
        "Accompagnement professionnel"
    ];

    var DESCRIPTION = "Une des filles d'Isabella. Présentation à compléter : parcours, style, " +
        "expériences et points forts.";

    var IDENTITES = [
        ["Olsen", "Naomy"], ["Torney", "Pamela"], ["Irwin", "Joanne"], ["Rowe", "Gillian"],
        ["Anderson", "Lana"], ["Martin", "Camille"], ["Bernard", "Léa"], ["Dubois", "Chloé"],
        ["Moreau", "Inès"], ["Laurent", "Manon"], ["Simon", "Jade"], ["Michel", "Sarah"],
        ["Lefèvre", "Emma"], ["Garnier", "Zoé"], ["Roux", "Louise"]
    ];

    // Message affiché au survol de la carte (modifiable pour chaque fille, dans l'ordre).
    var ACCROCHES = [
        "Découvre-moi", "Miam ! Tu viens ?", "Viens me rencontrer", "Tu n'oseras pas résister",
        "Un petit coup d'œil ?", "Approche, je ne mords pas", "Curieux ? Clique !", "Je t'attendais",
        "Laisse-toi tenter", "Prêt à craquer ?", "Entre dans mon monde", "Tu viens me voir ?",
        "Une surprise t'attend", "Ose me découvrir", "Je t'ai gardé une place"
    ];

    var DEFAULTS = IDENTITES.map(function (ident, i) {
        var n = i + 1;
        var id = (n < 10 ? "0" : "") + n;
        return {
            id: id,
            nom: ident[0],
            prenom: ident[1],
            categorie: CATEGORIES[i % CATEGORIES.length],
            description: DESCRIPTION,
            accroche: ACCROCHES[i % ACCROCHES.length],
            vignette: "img/team-" + ((i % 8) + 1) + ".jpg",
            photos: [1, 2, 3].map(function (k) { return "img/models/" + id + "/photo-" + k + ".jpg"; }),
            videos: [1, 2].map(function (k) { return "videos/" + id + "/video-" + k + ".mp4"; }),
            reservation: "#!"
        };
    });

    // Liste affichée : les fiches créées dans l'espace admin (Supabase) si elles existent, sinon la liste ci-dessus.
    // Le tableau garde toujours la même référence : on le remplit sur place.
    var MODELS = DEFAULTS.slice();

    var cfg = window.POSEIFY_SUPABASE;
    var script = document.currentScript;
    var LOCAL_ONLY = !!(script && script.hasAttribute && script.hasAttribute("data-local"));
    var CACHE_KEY = "poseify_models_v1";
    var WAIT_MS = 900;

    function safeUrl(u, fallback) {
        if (typeof u !== "string" || !u) return fallback;
        if (cfg && cfg.url && u.indexOf(cfg.url + "/storage/v1/object/public/") === 0) return u;
        if (/^(img|videos)\/[\w\-./]+$/.test(u)) return u;
        return fallback;
    }

    function safeLink(u) {
        return typeof u === "string" && /^(https?:\/\/|\/|#|tel:|mailto:|[\w.-]+\.html)/i.test(u) ? u : "#!";
    }

    function normalize(rows) {
        return rows.map(function (r, i) {
            var vignette = safeUrl(r.vignette, "img/team-" + ((i % 8) + 1) + ".jpg");
            return {
                id: String(r.id),
                nom: String(r.nom || ""),
                prenom: String(r.prenom || ""),
                categorie: String(r.categorie || CATEGORIES[0]),
                description: String(r.description || DESCRIPTION),
                accroche: String(r.accroche || ACCROCHES[i % ACCROCHES.length]),
                vignette: vignette,
                photos: (Array.isArray(r.photos) ? r.photos : []).map(function (u) { return safeUrl(u, ""); }).filter(Boolean).slice(0, 3),
                videos: (Array.isArray(r.videos) ? r.videos : []).map(function (u) { return safeUrl(u, ""); }).filter(Boolean).slice(0, 2),
                reservation: safeLink(r.reservation)
            };
        });
    }

    function apply(rows) {
        var list = rows && rows.length ? normalize(rows) : DEFAULTS;
        MODELS.length = 0;
        list.forEach(function (m) { MODELS.push(m); });
    }

    function signature() { return JSON.stringify(MODELS); }

    function readCache() {
        try {
            var rows = JSON.parse(window.localStorage.getItem(CACHE_KEY));
            return Array.isArray(rows) && rows.length ? rows : null;
        } catch (e) { return null; }
    }

    function writeCache(rows) {
        try {
            if (rows && rows.length) window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
            else window.localStorage.removeItem(CACHE_KEY);
        } catch (e) {}
    }

    // Une seule petite requête (JSON) : tableau de lignes, [] si aucune fiche, null si indisponible.
    function fetchRemote() {
        if (LOCAL_ONLY || !cfg || !cfg.url || !cfg.anonKey || !window.fetch) return Promise.resolve(null);
        var url = cfg.url + "/rest/v1/models?select=id,prenom,nom,categorie,description,accroche,reservation,vignette,photos,videos&order=position.asc,id.asc&limit=200";
        return window.fetch(url, { headers: { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (rows) { return Array.isArray(rows) ? rows : null; })
            .catch(function () { return null; });
    }

    var STORAGE_KEY = "poseify_localisation_v5";

    function getLocalisation() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            var data = raw ? JSON.parse(raw) : null;
            return data && data.prenom && data.pays && data.ville ? data : null;
        } catch (e) {
            return null;
        }
    }

    function setLocalisation(pays, ville, prenom) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ prenom: prenom, pays: pays, ville: ville, at: Date.now() }));
            return true;
        } catch (e) {
            return false;
        }
    }

    function clearLocalisation() {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    function findModel(id) {
        for (var i = 0; i < MODELS.length; i++) {
            if (MODELS[i].id === id) return MODELS[i];
        }
        return null;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function renderGrid(container) {
        container.innerHTML = MODELS.map(function (m, i) {
            var href = "localisation.html?id=" + encodeURIComponent(m.id);
            var delay = (0.1 + (i % 4) * 0.15).toFixed(2);
            var nom = escapeHtml(m.prenom + " " + m.nom);
            return '' +
                '<div class="col-xl-3 col-lg-4 col-md-6 wow fadeInUp" data-wow-delay="' + delay + 's">' +
                '<a class="model-card" data-track="carte_fille" href="' + escapeHtml(href) + '">' +
                '<img class="model-card-img" src="' + escapeHtml(m.vignette) + '" alt="' + nom + '" loading="lazy" decoding="async" width="600" height="800">' +
                '<span class="model-badge">' + escapeHtml(m.categorie) + '</span>' +
                '<div class="model-hover"><i class="fa fa-heart"></i><span>' + escapeHtml(m.accroche) + '</span></div>' +
                '<div class="model-info">' +
                '<h5 class="text-uppercase mb-1">' + escapeHtml(m.prenom) + ' <small>' + escapeHtml(m.nom) + '</small></h5>' +
                '</div>' +
                '</a>' +
                '</div>';
        }).join("");
    }

    // Écrans tactiles (pas de survol) : la carte qui arrive au centre de l'écran affiche son message toute seule,
    // et un doigt posé sur une carte l'active aussi, sans avoir à cliquer. Un clic ouvre le profil.
    // Retourne une fonction à rappeler après chaque nouveau rendu des cartes.
    function enableTouchPreview(container) {
        if (!window.matchMedia || !window.matchMedia("(hover: none)").matches || !("IntersectionObserver" in window)) return function () {};
        var current = null;
        function activate(card) {
            if (current === card) return;
            if (current) current.classList.remove("is-active");
            current = card;
            if (card) card.classList.add("is-active");
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) activate(en.target);
                else if (current === en.target) activate(null);
            });
        }, { rootMargin: "-42% 0px -42% 0px", threshold: 0 });
        container.addEventListener("touchstart", function (e) {
            var c = e.target.closest ? e.target.closest(".model-card") : null;
            if (c) activate(c);
        }, { passive: true });
        return function refresh() {
            io.disconnect();
            current = null;
            Array.prototype.forEach.call(container.querySelectorAll(".model-card"), function (c) { io.observe(c); });
        };
    }

    var grid = document.getElementById("models-grid");
    var refreshTouch = grid ? enableTouchPreview(grid) : function () {};
    var painted = null;

    function paint() {
        if (!grid) return;
        var sig = signature();
        if (sig === painted) return;
        painted = sig;
        renderGrid(grid);
        refreshTouch();
    }

    // Affichage immédiat avec la dernière liste connue (cache), puis mise à jour silencieuse si l'admin a changé quelque chose.
    // Première visite : on attend au plus 0,9 s la liste de l'admin, sinon la liste par défaut s'affiche.
    var cached = readCache();
    var remote = fetchRemote();
    var ready;
    if (cached) {
        apply(cached);
        paint();
        ready = Promise.resolve();
        remote.then(function (rows) {
            if (rows === null) return;
            writeCache(rows);
            apply(rows);
            paint();
        });
    } else if (LOCAL_ONLY || !cfg || !cfg.url || !cfg.anonKey || !window.fetch) {
        paint();
        ready = Promise.resolve();
    } else {
        var late = true;
        ready = Promise.race([
            remote.then(function (rows) { return { rows: rows }; }),
            new Promise(function (resolve) { setTimeout(function () { resolve(null); }, WAIT_MS); })
        ]).then(function (res) {
            if (res && res.rows !== null) { late = false; writeCache(res.rows); apply(res.rows); }
            paint();
        });
        remote.then(function (rows) {
            if (!late || rows === null) return;
            late = false;
            writeCache(rows);
            apply(rows);
            paint();
        });
    }

    window.Poseify = {
        models: MODELS,
        defaults: DEFAULTS,
        categories: CATEGORIES,
        ready: ready,
        findModel: findModel,
        getLocalisation: getLocalisation,
        setLocalisation: setLocalisation,
        clearLocalisation: clearLocalisation,
        escapeHtml: escapeHtml
    };
})();
