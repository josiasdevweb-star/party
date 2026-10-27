(function () {
    var P = window.Poseify;
    var id = new URLSearchParams(window.location.search).get("id");
    var m = P.findModel(id);
    if (!m) { window.location.replace("index.html"); return; }
    var cible = "model.html?id=" + m.id;
    if (new URLSearchParams(window.location.search).has("reset")) P.clearLocalisation();
    if (P.getLocalisation()) { window.location.replace(cible); return; }
    document.getElementById("loc-nom").textContent = m.prenom + " " + m.nom;

    // Envoi de l'inscription à l'espace admin : jamais bloquant, le visiteur accède au profil quoi qu'il arrive.
    function envoyer(prenom, pays, ville) {
        var done = new Promise(function (resolve) {
            try {
                var sb = window.PoseifySupabase;
                var an = window.PoseifyAnalytics;
                if (!sb || !an) { resolve(); return; }
                sb.get().then(function (client) {
                    if (!client) { resolve(); return; }
                    return client.rpc("submit_guest", {
                        p_visitor_id: an.getOrCreateVisitorId(),
                        p_first_name: prenom,
                        p_city: ville,
                        p_country: pays,
                        p_model_id: m.id
                    });
                }).then(function () { resolve(); }, function () { resolve(); });
            } catch (e) { resolve(); }
        });
        var limite = new Promise(function (resolve) { setTimeout(resolve, 1500); });
        return Promise.race([done, limite]);
    }

    document.getElementById("loc-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var prenom = document.getElementById("prenom").value.trim();
        var pays = document.getElementById("pays").value.trim();
        var ville = document.getElementById("ville").value.trim();
        if (!prenom || !pays || !ville) { document.getElementById("loc-erreur").style.display = "block"; return; }
        document.getElementById("loc-erreur").style.display = "none";
        P.setLocalisation(pays, ville, prenom);
        var btn = e.target.querySelector("button[type=submit]");
        if (btn) btn.disabled = true;
        envoyer(prenom, pays, ville).then(function () { window.location.href = cible; });
    });
})();
