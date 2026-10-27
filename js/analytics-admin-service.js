/*
 * Service de lecture et de calcul des statistiques d'audience (espace admin).
 * Lecture limitée aux 1000 dernières lignes, triées par date décroissante.
 */
(function (root) {
    "use strict";

    var LIMIT = 1000;
    var DEVICES = ["mobile", "desktop", "tablet"];

    function startOfToday(now) {
        var d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    function time(v) {
        var t = v ? new Date(v).getTime() : NaN;
        return isNaN(t) ? 0 : t;
    }

    function percent(part, total) {
        return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
    }

    function groupBy(rows, key, fallback) {
        var map = {};
        rows.forEach(function (r) {
            var k = (r[key] && String(r[key]).trim()) || fallback;
            var g = map[k] || (map[k] = { name: k, count: 0, visits: 0, first: 0, last: 0 });
            g.count += 1;
            g.visits += r.visits_count || 0;
            var f = time(r.first_seen || r.created_at);
            var l = time(r.last_seen || r.created_at);
            if (!g.first || (f && f < g.first)) g.first = f;
            if (l > g.last) g.last = l;
        });
        return Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b) { return b.count - a.count || b.visits - a.visits; });
    }

    function computeAnalytics(rows, now) {
        now = now || Date.now();
        var today = startOfToday(now);
        var week = now - 7 * 24 * 3600 * 1000;
        var total = rows.length;

        var byDevice = {};
        DEVICES.forEach(function (d) { byDevice[d] = { count: 0, visits: 0, pct: 0 }; });

        var totalVisits = 0, newToday = 0, new7d = 0;
        rows.forEach(function (r) {
            var dev = byDevice[r.device_type] ? r.device_type : "desktop";
            byDevice[dev].count += 1;
            byDevice[dev].visits += r.visits_count || 0;
            totalVisits += r.visits_count || 0;
            var created = time(r.created_at);
            if (created >= today) newToday += 1;
            if (created >= week) new7d += 1;
        });
        DEVICES.forEach(function (d) { byDevice[d].pct = percent(byDevice[d].count, total); });

        return {
            uniqueDevices: total,
            totalVisits: totalVisits,
            newToday: newToday,
            new7d: new7d,
            byDevice: byDevice,
            systems: groupBy(rows, "operating_system", "Inconnu"),
            browsers: groupBy(rows, "browser", "Inconnu"),
            sources: groupBy(rows, "utm_source", "direct"),
            campaigns: groupBy(rows, "utm_campaign", "organic")
        };
    }

    function computeClicks(rows) {
        var map = {};
        rows.forEach(function (r) {
            var g = map[r.click_id] || (map[r.click_id] = { name: r.click_id, total: 0, mobile: 0, desktop: 0, tablet: 0 });
            g.total += 1;
            var dev = DEVICES.indexOf(r.device_type) >= 0 ? r.device_type : "desktop";
            g[dev] += 1;
        });
        return {
            total: rows.length,
            buttons: Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; })
        };
    }

    function fetchAnalyticsData(client) {
        return client.from("analytics_visitors").select("*").order("created_at", { ascending: false }).limit(LIMIT)
            .then(function (res) {
                if (res.error) throw res.error;
                var rows = res.data || [];
                return { rows: rows, stats: computeAnalytics(rows) };
            });
    }

    function fetchClicksData(client) {
        return client.from("analytics_clicks").select("*").order("created_at", { ascending: false }).limit(LIMIT)
            .then(function (res) {
                if (res.error) throw res.error;
                var rows = res.data || [];
                return { rows: rows, stats: computeClicks(rows) };
            });
    }

    // CSV : guillemets doublés + neutralisation des formules (=, +, -, @) pour Excel / Sheets.
    function csvCell(v) {
        var s = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function visitorsToCsv(rows) {
        var cols = [
            ["created_at", "Date"], ["device_type", "Appareil"], ["operating_system", "Système"], ["browser", "Navigateur"],
            ["utm_source", "Source"], ["utm_medium", "Support"], ["utm_campaign", "Campagne"],
            ["page_path", "Page"], ["referrer", "Provenance"], ["visits_count", "Visites"],
            ["first_seen", "Première visite"], ["last_seen", "Dernière visite"]
        ];
        var lines = [cols.map(function (c) { return csvCell(c[1]); }).join(",")];
        rows.forEach(function (r) {
            lines.push(cols.map(function (c) { return csvCell(r[c[0]]); }).join(","));
        });
        return "﻿" + lines.join("\r\n");
    }

    var api = {
        LIMIT: LIMIT,
        computeAnalytics: computeAnalytics,
        computeClicks: computeClicks,
        fetchAnalyticsData: fetchAnalyticsData,
        fetchClicksData: fetchClicksData,
        visitorsToCsv: visitorsToCsv
    };

    root.PoseifyAdminService = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
