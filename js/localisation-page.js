        (function () {
            var id = new URLSearchParams(window.location.search).get("id");
            var m = window.Poseify.findModel(id);
            if (!m) { window.location.replace("index.html"); return; }
            var cible = "model.html?id=" + m.id;
            if (new URLSearchParams(window.location.search).has("reset")) window.Poseify.clearLocalisation();
            if (window.Poseify.getLocalisation()) { window.location.replace(cible); return; }
            document.getElementById("loc-nom").textContent = m.prenom + " " + m.nom;
            document.getElementById("loc-form").addEventListener("submit", function (e) {
                e.preventDefault();
                var pays = document.getElementById("pays").value.trim();
                var ville = document.getElementById("ville").value.trim();
                if (!pays || !ville) { document.getElementById("loc-erreur").style.display = "block"; return; }
                window.Poseify.setLocalisation(pays, ville);
                window.location.href = cible;
            });
        })();
