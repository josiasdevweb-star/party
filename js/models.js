/*
 * Données des mannequins + rendu des cartes + mémorisation de la localisation du visiteur.
 *
 * Pour chaque mannequin (id 1 à 15) déposez vos fichiers ici :
 *   - photos  : img/models/<id>/photo-1.jpg, photo-2.jpg, photo-3.jpg
 *   - vidéos  : videos/<id>/video-1.mp4, video-2.mp4
 * <id> est sur 2 chiffres : 01, 02 ... 15.
 * Le lien du bouton « Réserver » se règle dans le champ "reservation" de chaque mannequin.
 */
(function () {
    "use strict";

    var CATEGORIES = [
        "Défilés de mode",
        "Événements d'entreprise",
        "Shootings photo commerciaux",
        "Mannequinat professionnel"
    ];

    var DESCRIPTION = "Mannequin professionnelle de l'agence Isabella. Présentation à compléter : parcours, style, " +
        "expériences et points forts.";

    var IDENTITES = [
        ["Olsen", "Naomy"], ["Torney", "Pamela"], ["Irwin", "Joanne"], ["Rowe", "Gillian"],
        ["Anderson", "Lana"], ["Martin", "Camille"], ["Bernard", "Léa"], ["Dubois", "Chloé"],
        ["Moreau", "Inès"], ["Laurent", "Manon"], ["Simon", "Jade"], ["Michel", "Sarah"],
        ["Lefèvre", "Emma"], ["Garnier", "Zoé"], ["Roux", "Louise"]
    ];

    // Message affiché au survol de la carte (modifiable pour chaque mannequin, dans l'ordre).
    var ACCROCHES = [
        "Découvre-moi", "Miam ! Tu viens ?", "Viens me rencontrer", "Tu n'oseras pas résister",
        "Un petit coup d'œil ?", "Approche, je ne mords pas", "Curieux ? Clique !", "Je t'attendais",
        "Laisse-toi tenter", "Prêt à craquer ?", "Entre dans mon monde", "Tu viens me voir ?",
        "Une surprise t'attend", "Ose me découvrir", "Je t'ai gardé une place"
    ];

    var MODELS = IDENTITES.map(function (ident, i) {
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
            var href = "localisation.html?id=" + m.id;
            var delay = (0.1 + (i % 4) * 0.15).toFixed(2);
            var nom = escapeHtml(m.prenom + " " + m.nom);
            return '' +
                '<div class="col-xl-3 col-lg-4 col-md-6 wow fadeInUp" data-wow-delay="' + delay + 's">' +
                '<a class="model-card" data-track="carte_mannequin" href="' + href + '">' +
                '<img class="model-card-img" src="' + m.vignette + '" alt="' + nom + '" loading="lazy" decoding="async" width="600" height="800">' +
                '<span class="model-badge">' + escapeHtml(m.categorie) + '</span>' +
                '<div class="model-hover"><i class="fa fa-heart"></i><span>' + escapeHtml(m.accroche) + '</span></div>' +
                '<div class="model-info">' +
                '<h5 class="text-uppercase mb-1">' + escapeHtml(m.prenom) + ' <small>' + escapeHtml(m.nom) + '</small></h5>' +
                '</div>' +
                '</a>' +
                '</div>';
        }).join("");
    }

    window.Poseify = {
        models: MODELS,
        findModel: findModel,
        getLocalisation: getLocalisation,
        setLocalisation: setLocalisation,
        clearLocalisation: clearLocalisation,
        escapeHtml: escapeHtml
    };

    var grid = document.getElementById("models-grid");
    if (grid) renderGrid(grid);
})();
