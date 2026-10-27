        (function () {
            var P = window.Poseify;
            var id = new URLSearchParams(window.location.search).get("id");
            var m = P.findModel(id);
            if (!m) { window.location.replace("index.html"); return; }
            var loc = P.getLocalisation();
            if (!loc) { window.location.replace("localisation.html?id=" + m.id); return; }
            var e = P.escapeHtml;
            var nomComplet = m.prenom + " " + m.nom;
            document.title = "Poseify - " + nomComplet;
            document.getElementById("page-titre").textContent = m.prenom;
            document.getElementById("page-crumb").textContent = m.prenom;

            var photos = m.photos.map(function (src, i) {
                return '<div class="col-md-4 wow fadeInUp" data-wow-delay="' + (0.1 + i * 0.15).toFixed(2) + 's">' +
                    '<a class="profil-galerie-item" href="' + e(src) + '" data-lightbox="profil" data-title="' + e(nomComplet) + '">' +
                    '<img src="' + e(src) + '" alt="' + e(nomComplet) + ' - photo ' + (i + 1) + '" ' +
                    'data-fallback="' + e(m.vignette) + '" loading="lazy" decoding="async"></a></div>';
            }).join("");
            var videos = m.videos.map(function (src, i) {
                return '<div class="col-md-6 wow fadeInUp" data-wow-delay="' + (0.1 + i * 0.2).toFixed(2) + 's">' +
                    '<div class="profil-video" data-src="' + e(src) + '"><video muted preload="metadata" poster="' + e(m.vignette) + '">' +
                    '<source src="' + e(src) + '" type="video/mp4"></video></div></div>';
            }).join("");

            document.getElementById("profil").innerHTML =
                '<section class="profil-hero">' +
                  '<div class="profil-hero-bg" style="background-image:url(\'' + e(m.vignette) + '\')"></div>' +
                  '<div class="container"><div class="row g-5 align-items-center">' +
                    '<div class="col-lg-5 wow fadeInLeft" data-wow-delay="0.1s"><div class="profil-portrait">' +
                      '<img src="' + e(m.vignette) + '" alt="' + e(nomComplet) + '" loading="lazy" decoding="async"></div></div>' +
                    '<div class="col-lg-7 wow fadeInRight" data-wow-delay="0.3s">' +
                      '<span class="profil-badge">' + e(m.categorie) + '</span>' +
                      '<h1 class="profil-nom">' + e(m.prenom) + '</h1>' +
                      '<div class="profil-nom-famille">' + e(m.nom) + '</div>' +
                      '<div class="profil-chips">' +
                        '<span class="profil-chip"><i class="fa fa-star"></i>' + e(m.categorie) + '</span>' +
                        '<span class="profil-chip"><i class="fa fa-location-dot"></i>Vous êtes à : ' + e(loc.ville) + ', ' + e(loc.pays) + '</span>' +
                      '</div>' +
                      '<p class="profil-desc">' + e(m.description) + '</p>' +
                      '<div class="d-flex flex-wrap gap-3">' +
                        '<a class="btn btn-primary btn-reserver" data-track="reserver_modele" href="' + e(m.reservation) + '"><i class="fa fa-heart me-2"></i>Réserver ' + e(m.prenom) + '</a>' +
                        '<a class="btn btn-outline-primary border-2 py-3 px-4" data-track="voir_galerie" href="#galerie">Voir la galerie</a>' +
                      '</div>' +
                    '</div>' +
                  '</div></div>' +
                '</section>' +
                '<section class="profil-section" id="galerie"><div class="container">' +
                  '<div class="text-center"><div class="title wow fadeInUp"><div class="title-center"><h5>Galerie</h5><h1>Ses photos</h1></div></div></div>' +
                  '<div class="row g-4">' + photos + '</div>' +
                '</div></section>' +
                '<section class="profil-section"><div class="container">' +
                  '<div class="text-center"><div class="title wow fadeInUp"><div class="title-center"><h5>En mouvement</h5><h1>Ses vidéos</h1></div></div></div>' +
                  '<div class="row g-4">' + videos + '</div>' +
                  '<div class="profil-cta wow fadeInUp">' +
                    '<h2>Envie de ' + e(m.prenom) + ' ?</h2>' +
                    '<p>Ne la laissez pas filer. Réservez-la dès maintenant.</p>' +
                    '<a class="btn btn-primary btn-reserver" data-track="reserver_modele" href="' + e(m.reservation) + '"><i class="fa fa-heart me-2"></i>Réserver ' + e(m.prenom) + '</a>' +
                  '</div>' +
                  '<div class="text-center mt-5"><a class="btn btn-outline-primary border-2 px-5 py-3" href="index.html">Retour aux mannequins</a></div>' +
                '</div></section>' +
                '<div class="profil-bar"><a class="btn btn-primary py-3" data-track="reserver_modele" href="' + e(m.reservation) + '"><i class="fa fa-heart me-2"></i>Réserver ' + e(m.prenom) + '</a></div>';

            // Photo manquante : on affiche la vignette à la place
            document.getElementById("profil").addEventListener("error", function (ev) {
                var t = ev.target;
                if (t && t.tagName === "IMG" && t.getAttribute("data-fallback") && !t.getAttribute("data-failed")) {
                    t.setAttribute("data-failed", "1");
                    t.src = t.getAttribute("data-fallback");
                }
            }, true);

            // Clic sur une vidéo : elle s'agrandit
            var overlay = document.createElement("div");
            overlay.className = "video-zoom";
            overlay.innerHTML = '<video controls></video>';
            document.body.appendChild(overlay);
            var big = overlay.querySelector("video");
            function fermer() { overlay.classList.remove("open"); big.pause(); big.removeAttribute("src"); big.load(); }
            document.querySelectorAll(".profil-video").forEach(function (box) {
                box.addEventListener("click", function () {
                    big.src = box.getAttribute("data-src");
                    overlay.classList.add("open");
                    big.play();
                });
            });
            overlay.addEventListener("click", function (ev) { if (ev.target === overlay) fermer(); });
            document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fermer(); });
        })();
