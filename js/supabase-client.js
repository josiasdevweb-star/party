/*
 * Client Supabase unique (SDK auto-hébergé dans lib/supabase, version 2.45.4, chargé à la demande).
 * window.PoseifySupabase.get(options) -> Promise<client | null>
 * Retourne null si la configuration n'est pas renseignée ou si le chargement échoue.
 */
(function () {
    "use strict";

    var SDK_URL = "lib/supabase/supabase.js";
    var clientPromise = null;

    function configured() {
        var c = window.POSEIFY_SUPABASE;
        return !!(c && c.url && c.anonKey && c.url.indexOf("VOTRE-PROJET") === -1 && c.anonKey.indexOf("VOTRE_CLE") === -1);
    }

    function loadSdk() {
        return new Promise(function (resolve, reject) {
            if (window.supabase && window.supabase.createClient) { resolve(); return; }
            var s = document.createElement("script");
            s.src = SDK_URL;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error("Chargement de supabase-js impossible")); };
            document.head.appendChild(s);
        });
    }

    // options.session = true : conserve la session (espace admin). Sinon, client léger pour le suivi public.
    function get(options) {
        if (clientPromise) return clientPromise;
        if (!configured()) return Promise.resolve(null);
        var withSession = !!(options && options.session);
        clientPromise = loadSdk().then(function () {
            var c = window.POSEIFY_SUPABASE;
            return window.supabase.createClient(c.url, c.anonKey, {
                auth: {
                    persistSession: withSession,
                    autoRefreshToken: withSession,
                    detectSessionInUrl: false,
                    storageKey: "poseify_auth"
                },
                // keepalive : la requête part même si la page change juste après un clic.
                global: {
                    fetch: function (input, init) {
                        return fetch(input, Object.assign({}, init, { keepalive: true }));
                    }
                }
            });
        }).catch(function (err) {
            clientPromise = null;
            if (window.console && console.debug) console.debug("[supabase]", err);
            return null;
        });
        return clientPromise;
    }

    window.PoseifySupabase = { get: get, configured: configured };
})();
