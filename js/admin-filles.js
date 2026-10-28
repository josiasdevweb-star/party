/*
 * Espace admin : gestion des filles (ajout, modification, suppression, ordre) et de leurs fichiers
 * (photo de profil, 3 photos, 2 vidéos). Les données vont dans la table « models », les fichiers dans le bucket « models ».
 * Les images sont réduites dans le navigateur avant l'envoi pour que le site reste léger. Aucun HTML injecté : textContent uniquement.
 */
(function () {
    "use strict";

    var A = window.PoseifyAdmin;
    var P = window.Poseify;
    if (!A || !P) return;

    var $ = function (id) { return document.getElementById(id); };
    var el = A.el;
    var clear = A.clear;
    var BUCKET = "models";
    var MAX_VIDEO = 500 * 1024 * 1024;
    var VIDEO_TYPES = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", wmv: "video/x-ms-wmv", flv: "video/x-flv", "3gp": "video/3gpp", mpg: "video/mpeg", mpeg: "video/mpeg", ogv: "video/ogg", ts: "video/mp2t" };
    var MAX_IMAGE = 25 * 1024 * 1024;
    var rows = [];
    var editor = null;
    var busy = false;

    function client() { return A.client(); }

    function storageBase() {
        var c = window.POSEIFY_SUPABASE;
        return c && c.url ? c.url + "/storage/v1/object/public/" + BUCKET + "/" : null;
    }

    // Chemin dans le bucket si l'URL pointe vers notre stockage (sinon : fichier du site, on n'y touche pas)
    function storagePath(url) {
        var base = storageBase();
        return base && typeof url === "string" && url.indexOf(base) === 0 ? decodeURIComponent(url.slice(base.length)) : null;
    }

    function removeFiles(urls) {
        var paths = urls.map(storagePath).filter(Boolean);
        if (!paths.length || !client()) return Promise.resolve();
        return client().storage.from(BUCKET).remove(paths).then(function () {}, function () {});
    }

    function extOf(file) {
        var m = /\.([a-z0-9]{2,5})$/i.exec(file.name || "");
        if (m) return m[1].toLowerCase();
        return file.type === "video/webm" ? "webm" : file.type === "video/mp4" ? "mp4" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    }

    // Type MIME d'une vidéo : celui du navigateur, sinon déduit de l'extension (mkv, avi… sont souvent sans type). Vide si ce n'est pas une vidéo.
    function videoMime(file) {
        if (file.type.indexOf("video/") === 0) return file.type;
        return VIDEO_TYPES[extOf(file)] || "";
    }

    // Numéro saisi -> lien WhatsApp. 0612345678 devient 33612345678 ; +33 6 12 34 56 78 et 0033… sont acceptés. Vide -> pas de lien.
    function waLink(raw, prenom) {
        var d = String(raw || "").replace(/[^0-9]/g, "");
        if (!d) return "#!";
        if (d.indexOf("00") === 0) d = d.slice(2);
        else if (d.charAt(0) === "0" && d.length === 10) d = "33" + d.slice(1);
        if (d.length < 8 || d.length > 15) return null;
        return "https://wa.me/" + d + "?text=" + encodeURIComponent("Bonjour, je souhaite réserver " + prenom);
    }

    function waNumber(url) {
        var m = /wa[.]me[/]([0-9]{6,15})/.exec(String(url || ""));
        return m ? "+" + m[1] : "";
    }

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    // Réduit l'image (côté le plus long = maxSide) et la convertit en JPEG léger. En cas de souci : fichier d'origine.
    function compress(file, maxSide) {
        return new Promise(function (resolve) {
            var original = { blob: file, type: file.type, ext: extOf(file) };
            var url = URL.createObjectURL(file);
            var img = new Image();
            var timer = setTimeout(function () { URL.revokeObjectURL(url); resolve(original); }, 8000);
            img.onload = function () {
                clearTimeout(timer);
                try {
                    var w = img.naturalWidth, h = img.naturalHeight;
                    var s = Math.min(1, maxSide / Math.max(w, h));
                    var cv = document.createElement("canvas");
                    cv.width = Math.max(1, Math.round(w * s));
                    cv.height = Math.max(1, Math.round(h * s));
                    var ctx = cv.getContext("2d");
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(0, 0, cv.width, cv.height);
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    cv.toBlob(function (b) {
                        URL.revokeObjectURL(url);
                        if (b && (s < 1 || b.size < file.size)) resolve({ blob: b, type: "image/jpeg", ext: "jpg" });
                        else resolve(original);
                    }, "image/jpeg", 0.85);
                } catch (e) { URL.revokeObjectURL(url); resolve(original); }
            };
            img.onerror = function () { clearTimeout(timer); URL.revokeObjectURL(url); resolve(original); };
            img.src = url;
        });
    }

    function upload(file, folder, prefix, isImage) {
        var prep = isImage ? compress(file, prefix === "vignette" ? 1000 : 1600) : Promise.resolve({ blob: file, type: videoMime(file) || file.type, ext: extOf(file) });
        return prep.then(function (r) {
            var path = folder + "/" + prefix + "-" + uid() + "." + r.ext;
            var bucket = client().storage.from(BUCKET);
            return bucket.upload(path, r.blob, { contentType: r.type || undefined, cacheControl: "31536000", upsert: false }).then(function (res) {
                if (res.error) throw res.error;
                return { url: bucket.getPublicUrl(path).data.publicUrl, path: path };
            });
        });
    }

    // ---- liste -----------------------------------------------------------------
    function sqlHint() {
        return "La gestion des filles n'est pas encore activée : exécutez la mise à jour SQL « filles » dans Supabase (SQL Editor), puis actualisez.";
    }

    function load() {
        if (!client() || editor) return Promise.resolve();
        return client().from("models").select("*").order("position", { ascending: true }).order("id", { ascending: true }).limit(500).then(function (res) {
            if (res.error) throw res.error;
            rows = res.data || [];
            $("cnt-filles").textContent = String(rows.length);
            renderList();
        }).catch(function () {
            clear($("f-list"));
            $("f-list").appendChild(el("p", "adm-empty mb-0", sqlHint()));
        });
    }

    function nextId() {
        var max = 0;
        rows.forEach(function (r) { if (/^\d+$/.test(r.id)) max = Math.max(max, parseInt(r.id, 10)); });
        var n = max + 1;
        return (n < 10 ? "0" : "") + n;
    }

    function nextPosition() {
        var max = 0;
        rows.forEach(function (r) { max = Math.max(max, r.position || 0); });
        return max + 1;
    }

    function iconBtn(icon, label, fn, disabled) {
        var b = el("button", "adm-x");
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.title = label;
        b.disabled = !!disabled;
        b.appendChild(el("i", "fa " + icon));
        b.addEventListener("click", fn);
        return b;
    }

    function renderList() {
        var box = $("f-list");
        clear(box);
        $("f-editor").classList.add("hidden");
        box.classList.remove("hidden");
        $("f-head").classList.remove("hidden");
        $("f-summary").textContent = rows.length + " fiche(s) · l'ordre ci-dessous est celui du site";
        if (!rows.length) {
            box.appendChild(el("p", "adm-empty", "Aucune fiche enregistrée : le site affiche pour l'instant la liste par défaut. Importez-la pour pouvoir modifier chaque fille, ou ajoutez-en une nouvelle."));
            var imp = el("button", "btn btn-primary px-4", "Importer les " + P.defaults.length + " filles actuelles");
            imp.type = "button";
            imp.addEventListener("click", importDefaults);
            box.appendChild(imp);
            return;
        }
        rows.forEach(function (r, i) {
            var row = el("div", "adm-girl");
            var img = el("img");
            img.alt = "";
            img.loading = "lazy";
            img.src = r.vignette || "img/team-1.jpg";
            img.addEventListener("error", function () { img.style.visibility = "hidden"; });
            row.appendChild(img);
            var tx = el("div", "tx");
            tx.appendChild(el("div", "l1", (r.prenom + " " + (r.nom || "")).trim()));
            tx.appendChild(el("div", "l2", "n° " + r.id + " · " + (r.categorie || "–") + " · " + (r.photos || []).length + " photo(s) · " + (r.videos || []).length + " vidéo(s)"));
            row.appendChild(tx);
            var acts = el("div", "acts");
            acts.appendChild(iconBtn("fa-arrow-up", "Monter", function () { move(i, -1); }, i === 0));
            acts.appendChild(iconBtn("fa-arrow-down", "Descendre", function () { move(i, 1); }, i === rows.length - 1));
            acts.appendChild(iconBtn("fa-pen", "Modifier", function () { openEditor(r); }));
            acts.appendChild(iconBtn("fa-trash", "Supprimer", function () { removeRow(r); }));
            row.appendChild(acts);
            box.appendChild(row);
        });
    }

    function importDefaults() {
        var list = P.defaults.map(function (m, i) {
            return { id: m.id, prenom: m.prenom, nom: m.nom, categorie: m.categorie, description: m.description, accroche: m.accroche,
                reservation: m.reservation, vignette: m.vignette, photos: m.photos.slice(), videos: m.videos.slice(), position: i + 1 };
        });
        A.message("info", "Import en cours…");
        client().from("models").insert(list).then(function (res) {
            if (res.error) throw res.error;
            A.message("info", list.length + " fiches importées. Vous pouvez maintenant modifier chaque fille.");
            return load();
        }).catch(function () { A.message("err", sqlHint()); });
    }

    function move(i, dir) {
        var j = i + dir;
        if (j < 0 || j >= rows.length || !client()) return;
        var order = rows.slice();
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        var jobs = [];
        order.forEach(function (r, k) {
            if (r.position !== k + 1) jobs.push(client().from("models").update({ position: k + 1 }).eq("id", r.id).then(function (res) { if (res.error) throw res.error; }));
            r.position = k + 1;
        });
        rows = order;
        renderList();
        Promise.all(jobs).catch(function () { A.message("err", "L'ordre n'a pas pu être enregistré. Actualisez puis réessayez."); load(); });
    }

    function removeRow(r) {
        if (!client()) return;
        if (!window.confirm("Supprimer définitivement " + r.prenom + " et tous ses fichiers ?")) return;
        client().from("models").delete().eq("id", r.id).then(function (res) {
            if (res.error) throw res.error;
            return removeFiles([r.vignette].concat(r.photos || [], r.videos || []));
        }).then(function () {
            A.message("info", r.prenom + " a été supprimée.");
            return load();
        }).catch(function () { A.message("err", "Suppression impossible. Réessayez dans un instant."); });
    }

    // ---- éditeur ---------------------------------------------------------------
    function newSlot(url) { return { url: url || "", file: null, preview: "" }; }

    function openEditor(r) {
        var isNew = !r;
        editor = {
            isNew: isNew,
            id: isNew ? nextId() : r.id,
            position: isNew ? nextPosition() : r.position,
            vignette: newSlot(r && r.vignette),
            photos: [0, 1, 2].map(function (k) { return newSlot(r && r.photos && r.photos[k]); }),
            videos: [0, 1].map(function (k) { return newSlot(r && r.videos && r.videos[k]); }),
            trash: [],
            fields: {}
        };
        renderEditor(r ? Object.assign({}, r, { reservation: waNumber(r.reservation) || "+" + "33637184457" }) : { prenom: "", nom: "", categorie: P.categories[0], accroche: "", reservation: "+33637184457", description: "" });
    }

    function field(labelText, node) {
        var wrap = el("div", "adm-field");
        wrap.appendChild(el("label", null, labelText));
        wrap.appendChild(node);
        return wrap;
    }

    function input(name, value, placeholder, max) {
        var i = el("input", "adm-input");
        i.type = "text";
        i.value = value || "";
        i.maxLength = max || 80;
        if (placeholder) i.placeholder = placeholder;
        editor.fields[name] = i;
        return i;
    }

    function releasePreview(slot) {
        if (slot.preview) { URL.revokeObjectURL(slot.preview); slot.preview = ""; }
    }

    function slotNode(slot, kind, label) {
        var isVideo = kind === "video";
        var box = el("div", "adm-slot");
        box.appendChild(el("div", "adm-slot-label", label));
        var pv = el("div", "pv");
        var src = slot.preview || slot.url;
        if (src) {
            var m = el(isVideo ? "video" : "img");
            if (isVideo) { m.muted = true; m.preload = "metadata"; m.controls = true; m.playsInline = true; } else { m.alt = ""; }
            m.src = src;
            m.addEventListener("error", function () { pv.classList.add("missing"); });
            pv.appendChild(m);
        } else {
            pv.appendChild(el("i", "fa " + (isVideo ? "fa-film" : "fa-image")));
        }
        box.appendChild(pv);
        if (slot.file) box.appendChild(el("div", "adm-slot-note", "Nouveau fichier : " + slot.file.name));

        var file = el("input");
        file.type = "file";
        file.accept = isVideo ? "video/*,.mp4,.m4v,.mov,.mkv,.avi,.wmv,.flv,.3gp,.mpg,.mpeg,.webm,.ogv,.ts" : "image/jpeg,image/png,image/webp";
        file.className = "hidden";
        file.addEventListener("change", function () {
            var f = file.files && file.files[0];
            if (!f) return;
            if (isVideo ? !videoMime(f) : !/^image[/](jpeg|png|webp)$/.test(f.type)) { A.message("err", isVideo ? "Ce fichier n'est pas une vidéo reconnue." : "Format photo accepté : JPG, PNG ou WebP."); return; }
            if (isVideo && f.size > MAX_VIDEO) { A.message("err", "Cette vidéo dépasse 500 Mo."); return; }
            if (!isVideo && f.size > MAX_IMAGE) { A.message("err", "Cette photo dépasse 25 Mo."); return; }
            A.message("", "");
            releasePreview(slot);
            slot.file = f;
            slot.preview = URL.createObjectURL(f);
            renderEditor();
        });
        box.appendChild(file);

        var bar = el("div", "adm-slot-btns");
        var pick = el("button", "btn btn-outline-primary btn-sm px-3", src ? "Remplacer" : "Choisir");
        pick.type = "button";
        pick.addEventListener("click", function () { file.click(); });
        bar.appendChild(pick);
        if (src) {
            var del = el("button", "btn btn-outline-primary btn-sm px-3", "Retirer");
            del.type = "button";
            del.addEventListener("click", function () {
                if (slot.url) editor.trash.push(slot.url);
                releasePreview(slot);
                slot.url = "";
                slot.file = null;
                renderEditor();
            });
            bar.appendChild(del);
        }
        box.appendChild(bar);
        return box;
    }

    function readFields() {
        var f = editor.fields;
        return {
            prenom: f.prenom.value.trim(), nom: f.nom.value.trim(), categorie: f.categorie.value.trim(),
            accroche: f.accroche.value.trim(), reservation: f.reservation.value.trim(), description: f.description.value.trim()
        };
    }

    function renderEditor(values) {
        var box = $("f-editor");
        var keep = values || (editor.fields.prenom ? readFields() : {});
        clear(box);
        editor.fields = {};
        $("f-list").classList.add("hidden");
        $("f-head").classList.add("hidden");
        box.classList.remove("hidden");

        box.appendChild(el("h2", null, editor.isNew ? "Nouvelle fille" : "Modifier la fiche n° " + editor.id));

        var grid = el("div", "adm-form-grid");
        grid.appendChild(field("Prénom", input("prenom", keep.prenom, "Ex. Naomy", 60)));
        grid.appendChild(field("Nom", input("nom", keep.nom, "Ex. Olsen", 60)));
        var cat = input("categorie", keep.categorie, "", 80);
        cat.setAttribute("list", "f-cats");
        var dl = el("datalist");
        dl.id = "f-cats";
        P.categories.forEach(function (c) { var o = el("option"); o.value = c; dl.appendChild(o); });
        var catWrap = field("Catégorie (badge sur la carte)", cat);
        catWrap.appendChild(dl);
        grid.appendChild(catWrap);
        grid.appendChild(field("Message au survol de la carte", input("accroche", keep.accroche, "Ex. Découvre-moi", 80)));
        var res = field("Numéro WhatsApp du bouton « Réserver » (avec l'indicatif, ex. +33637184457)", input("reservation", keep.reservation, "+33637184457", 25));
        res.classList.add("adm-wide");
        grid.appendChild(res);
        var ta = el("textarea", "adm-input");
        ta.rows = 4;
        ta.maxLength = 2000;
        ta.value = keep.description || "";
        editor.fields.description = ta;
        var desc = field("Description du profil", ta);
        desc.classList.add("adm-wide");
        grid.appendChild(desc);
        box.appendChild(grid);

        box.appendChild(el("h3", "adm-sub", "Photo de profil (carte + page de la fille)"));
        var s0 = el("div", "adm-slots");
        s0.appendChild(slotNode(editor.vignette, "image", "Photo de profil"));
        box.appendChild(s0);

        box.appendChild(el("h3", "adm-sub", "Photos de la galerie (3 maximum)"));
        var s1 = el("div", "adm-slots");
        editor.photos.forEach(function (s, k) { s1.appendChild(slotNode(s, "image", "Photo " + (k + 1))); });
        box.appendChild(s1);

        box.appendChild(el("h3", "adm-sub", "Vidéos (2 maximum, tous formats, 500 Mo chacune)"));
        var s2 = el("div", "adm-slots");
        editor.videos.forEach(function (s, k) { s2.appendChild(slotNode(s, "video", "Vidéo " + (k + 1))); });
        box.appendChild(s2);

        var status = el("p", "adm-empty mt-3 mb-0");
        status.id = "f-status";
        box.appendChild(status);

        var bar = el("div", "d-flex flex-wrap gap-2 mt-3");
        var save = el("button", "btn btn-primary px-4", "Enregistrer");
        save.type = "button";
        save.id = "f-save";
        save.addEventListener("click", save_);
        var cancel = el("button", "btn btn-outline-primary border-2 px-4", "Annuler");
        cancel.type = "button";
        cancel.id = "f-cancel";
        cancel.addEventListener("click", closeEditor);
        bar.appendChild(save);
        bar.appendChild(cancel);
        box.appendChild(bar);
    }

    function releaseAll() {
        if (!editor) return;
        [editor.vignette].concat(editor.photos, editor.videos).forEach(releasePreview);
    }

    function closeEditor() {
        if (busy) return;
        releaseAll();
        editor = null;
        load();
    }

    function setBusy(on, text) {
        busy = on;
        ["f-save", "f-cancel"].forEach(function (id) { var b = $(id); if (b) b.disabled = on; });
        var s = $("f-status");
        if (s) s.textContent = text || "";
    }

    function save_() {
        if (busy || !editor || !client()) return;
        var v = readFields();
        if (!v.prenom) { A.message("err", "Le prénom est obligatoire."); return; }
        var wa = waLink(v.reservation, v.prenom);
        if (wa === null) { A.message("err", "Numéro WhatsApp invalide : indiquez-le avec l'indicatif pays, par exemple +33637184457."); return; }
        v.reservation = wa;
        A.message("", "");

        var pending = [];
        if (editor.vignette.file) pending.push({ slot: editor.vignette, prefix: "vignette", image: true });
        editor.photos.forEach(function (s) { if (s.file) pending.push({ slot: s, prefix: "photo", image: true }); });
        editor.videos.forEach(function (s) { if (s.file) pending.push({ slot: s, prefix: "video", image: false }); });

        var uploaded = [];
        var replaced = [];
        var done = 0;
        setBusy(true, pending.length ? "Envoi des fichiers… 0/" + pending.length : "Enregistrement…");

        // envoi un par un : plus fiable sur mobile et progression lisible
        var chain = Promise.resolve();
        pending.forEach(function (job) {
            chain = chain.then(function () {
                return upload(job.slot.file, editor.id, job.prefix, job.image).then(function (r) {
                    uploaded.push(r.path);
                    if (job.slot.url) replaced.push(job.slot.url);
                    job.slot.newUrl = r.url;
                    done++;
                    setBusy(true, "Envoi des fichiers… " + done + "/" + pending.length);
                });
            });
        });

        chain.then(function () {
            var urlOf = function (s) { return s.newUrl || s.url; };
            var data = {
                prenom: v.prenom, nom: v.nom, categorie: v.categorie, accroche: v.accroche, reservation: v.reservation, description: v.description,
                vignette: urlOf(editor.vignette) || "",
                photos: editor.photos.map(urlOf).filter(Boolean),
                videos: editor.videos.map(urlOf).filter(Boolean)
            };
            setBusy(true, "Enregistrement…");
            var q = editor.isNew
                ? client().from("models").insert(Object.assign({ id: editor.id, position: editor.position }, data))
                : client().from("models").update(data).eq("id", editor.id);
            return q.then(function (res) {
                if (res.error) throw res.error;
                return removeFiles(replaced.concat(editor.trash));
            });
        }).then(function () {
            var nom = v.prenom;
            busy = false;
            releaseAll();
            editor = null;
            A.message("info", "Fiche de " + nom + " enregistrée. Elle est visible sur le site.");
            window.scrollTo(0, 0);
            return load();
        }).catch(function (err) {
            // on retire les fichiers déjà envoyés pour ne rien laisser d'orphelin
            if (uploaded.length && client()) client().storage.from(BUCKET).remove(uploaded).then(function () {}, function () {});
            editor.vignette.newUrl = null;
            editor.photos.concat(editor.videos).forEach(function (s) { s.newUrl = null; });
            setBusy(false, "");
            var msg = err && err.message ? String(err.message) : "";
            A.message("err", /size|large|exceed|payload/i.test(msg) ? "Un fichier dépasse la taille autorisée par votre offre Supabase (Storage > Settings > limite de taille)." : "Enregistrement impossible. Vérifiez votre connexion et que la mise à jour SQL « filles » a été exécutée, puis réessayez.");
            window.scrollTo(0, 0);
        });
    }

    // ---- branchement -----------------------------------------------------------
    $("f-add").addEventListener("click", function () {
        if (!editor) openEditor(null);
    });

    document.addEventListener("adm:view", function (ev) {
        if (ev.detail === "filles") load();
    });
})();
