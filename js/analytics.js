/*
 * Mesure d'audience anonyme (Supabase uniquement).
 * - Un identifiant aléatoire par appareil (localStorage), aucune donnée personnelle.
 * - Visites : fonction SQL track_visit. Clics : fonction SQL track_click.
 * - Silencieux en cas d'erreur : le site ne doit jamais être affecté.
 */
(function (root) {
    "use strict";

    var SITE = "poseify";
    var VISITOR_KEY = SITE + "_visitor_id";
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var ADMIN_RE = /(^|\/)admin(\.html)?(\/|$)/i;

    function w() { return typeof window !== "undefined" ? window : {}; }

    function debug(err) {
        try { if (typeof console !== "undefined" && console.debug) console.debug("[analytics]", err); } catch (e) { /* ignore */ }
    }

    function env(over) {
        var win = w();
        var nav = win.navigator || {};
        var loc = win.location || {};
        var doc = win.document || {};
        var base = {
            ua: nav.userAgent || "",
            width: win.innerWidth || 0,
            touch: (nav.maxTouchPoints || 0) > 0,
            pathname: loc.pathname || "/",
            search: loc.search || "",
            host: loc.host || "",
            referrer: doc.referrer || ""
        };
        if (over) for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) base[k] = over[k];
        return base;
    }

    // ---- identifiant visiteur ------------------------------------------------
    function newUuid() {
        var c = w().crypto;
        if (c && typeof c.randomUUID === "function") return c.randomUUID();
        var b = new Uint8Array(16);
        if (c && c.getRandomValues) c.getRandomValues(b);
        else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
        return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    }

    var memoryId = null; // repli uniquement si le stockage est bloqué : identifiant stable le temps de la page

    function getOrCreateVisitorId(storage) {
        var store = storage;
        if (store === undefined) {
            try { store = w().localStorage; } catch (e) { store = null; }
        }
        var blocked = !store;
        try {
            var saved = store ? store.getItem(VISITOR_KEY) : null;
            if (saved && UUID_RE.test(saved)) return saved;
        } catch (e) { blocked = true; }
        var id;
        if (blocked && memoryId && UUID_RE.test(memoryId)) return memoryId;
        id = newUuid();
        try { if (store) store.setItem(VISITOR_KEY, id); } catch (e) { blocked = true; }
        if (blocked) memoryId = id;
        return id;
    }

    // ---- détection appareil / OS / navigateur --------------------------------
    function detectDeviceType(over) {
        var e = env(over);
        var ua = e.ua;
        var android = /android/i.test(ua);
        if (/ipad|tablet/i.test(ua) || (android && !/mobile/i.test(ua))) return "tablet";
        if (/mobile|iphone|ipod/i.test(ua) || android) return "mobile";
        // iPadOS se présente comme un Mac : seul l'écran tactile permet de le distinguer.
        if (/macintosh/i.test(ua) && e.touch && e.width >= 768 && e.width <= 1024) return "tablet";
        if (e.touch && e.width > 0) {
            if (e.width >= 768 && e.width <= 1024) return "tablet";
            if (e.width < 768) return "mobile";
        }
        return "desktop";
    }

    function detectOperatingSystem(over) {
        var e = env(over);
        var ua = e.ua;
        if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && e.touch)) return "iOS";
        if (/android/i.test(ua)) return "Android";
        if (/cros/i.test(ua)) return "Chrome OS";
        if (/windows/i.test(ua)) return "Windows";
        if (/macintosh|mac os x/i.test(ua)) return "macOS";
        if (/linux|x11/i.test(ua)) return "Linux";
        return "Autre";
    }

    function detectBrowser(over) {
        var ua = env(over).ua;
        if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
        if (/opr\/|opera|opios/i.test(ua)) return "Opera";
        if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
        if (/firefox|fxios/i.test(ua)) return "Firefox";
        if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
        if (/safari/i.test(ua)) return "Safari";
        return "Autre";
    }

    // ---- provenance ----------------------------------------------------------
    function hostOf(url) {
        try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch (e) { return ""; }
    }

    function sourceFromReferrer(referrer, ownHost) {
        var host = hostOf(referrer);
        if (!host) return "";
        var own = String(ownHost || "").replace(/:\d+$/, "").replace(/^www\./i, "").toLowerCase();
        if (own && host === own) return "";
        if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return "facebook";
        if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
        if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
        if (/(^|\.)google\./.test(host)) return "google";
        if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
        return host;
    }

    function resolveSource(over) {
        var e = env(over);
        var params;
        try { params = new URLSearchParams(e.search); } catch (err) { params = new URLSearchParams(""); }
        function p(name) { var v = params.get(name); return v ? v.trim().toLowerCase().slice(0, 100) : null; }

        var fromRef = sourceFromReferrer(e.referrer, e.host);
        var source = p("utm_source") || fromRef || "direct";
        var medium = p("utm_medium") || (p("utm_source") ? null : (fromRef ? "referral" : null));
        return {
            utm_source: source,
            utm_medium: medium,
            utm_campaign: p("utm_campaign"),
            utm_term: p("utm_term"),
            utm_content: p("utm_content"),
            referrer: fromRef ? String(e.referrer).slice(0, 500) : ""
        };
    }

    // Chemin enregistré : on ne garde jamais la query string complète (elle pourrait contenir du texte saisi).
    function safePath(e) {
        var id = "";
        try { id = new URLSearchParams(e.search).get("id") || ""; } catch (err) { id = ""; }
        return (e.pathname + (/^[0-9]{1,3}$/.test(id) ? "?id=" + id : "")).slice(0, 300);
    }

    function isAdminPath(pathname) {
        return ADMIN_RE.test(pathname || "");
    }

    // ---- envoi ---------------------------------------------------------------
    function getClient() {
        var s = w().PoseifySupabase;
        return s ? s.get() : Promise.resolve(null);
    }

    function trackVisitorVisit(over, client) {
        var e = env(over);
        if (isAdminPath(e.pathname)) return Promise.resolve(false);
        var src = resolveSource(over);
        var args = {
            p_visitor_id: getOrCreateVisitorId(over && over.storage),
            p_device_type: detectDeviceType(over),
            p_operating_system: detectOperatingSystem(over),
            p_browser: detectBrowser(over),
            p_utm_source: src.utm_source,
            p_utm_medium: src.utm_medium,
            p_utm_campaign: src.utm_campaign,
            p_utm_term: src.utm_term,
            p_utm_content: src.utm_content,
            p_page_path: safePath(e),
            p_referrer: src.referrer
        };
        return Promise.resolve(client || getClient()).then(function (c) {
            if (!c) return false;
            return c.rpc("track_visit", args).then(function (res) {
                if (res && res.error) { debug(res.error); return false; }
                return true;
            });
        }).catch(function (err) { debug(err); return false; });
    }

    function trackClick(clickId, over, client) {
        var e = env(over);
        if (isAdminPath(e.pathname) || !clickId) return Promise.resolve(false);
        var args = {
            p_visitor_id: getOrCreateVisitorId(over && over.storage),
            p_click_id: String(clickId).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60),
            p_page_path: safePath(e),
            p_device_type: detectDeviceType(over)
        };
        if (!args.p_click_id) return Promise.resolve(false);
        return Promise.resolve(client || getClient()).then(function (c) {
            if (!c) return false;
            return c.rpc("track_click", args).then(function (res) {
                if (res && res.error) { debug(res.error); return false; }
                return true;
            });
        }).catch(function (err) { debug(err); return false; });
    }

    // ---- suivi automatique ---------------------------------------------------
    var lastTracked = null;

    function trackCurrentPage() {
        var loc = w().location;
        if (!loc) return;
        var key = safePath({ pathname: loc.pathname, search: loc.search });
        if (key === lastTracked) return;
        lastTracked = key;
        trackVisitorVisit();
    }

    function whenIdle(fn) {
        var win = w();
        if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(fn, { timeout: 4000 });
        else setTimeout(fn, 1500);
    }

    var started = false;

    function init() {
        if (started) return;
        started = true;
        var win = w();
        var doc = win.document;
        if (!doc) return;

        // Clics : tout élément portant data-track="nom_du_bouton"
        doc.addEventListener("click", function (ev) {
            try {
                var node = ev.target && ev.target.closest ? ev.target.closest("[data-track]") : null;
                if (node) trackClick(node.getAttribute("data-track"));
            } catch (err) { debug(err); }
        }, true);

        // Visite : pendant un temps libre pour ne pas ralentir l'affichage
        whenIdle(trackCurrentPage);
        // Navigation sans rechargement (historique)
        win.addEventListener("popstate", function () { whenIdle(trackCurrentPage); });
    }

    var api = {
        getOrCreateVisitorId: getOrCreateVisitorId,
        detectDeviceType: detectDeviceType,
        detectOperatingSystem: detectOperatingSystem,
        detectBrowser: detectBrowser,
        resolveSource: resolveSource,
        isAdminPath: isAdminPath,
        safePath: safePath,
        trackVisitorVisit: trackVisitorVisit,
        trackClick: trackClick,
        init: init
    };

    root.PoseifyAnalytics = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else init();
})(typeof window !== "undefined" ? window : this);
