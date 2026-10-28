/* Tendril doctor summary: builds a printable one-page overview from what's
   saved on the device. Settings in tendril:summary.settings. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, L = window.TendrilLabs;
  const $ = function (id) { return document.getElementById(id); };

  const KIND = { injection: "Injection", pill: "Pill", patch: "Patch", gel: "Gel", other: "Other" };
  const SITE = { "arm-l": "left arm", "arm-r": "right arm", "belly-l": "left belly", "belly-r": "right belly", "thigh-l": "left thigh", "thigh-r": "right thigh", "glute-l": "left buttock", "glute-r": "right buttock" };
  const MOODS = { 1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
  const SHARE_TAGS = ["health", "body", "skin", "energy"];
  const SUGGESTED = [
    "Are my levels where you’d like them to be?",
    "When should I have my next blood test?",
    "Are there side effects I should watch for?",
    "What should I do if I miss a dose?",
    "Should anything change about my dose or how I take it?"
  ];

  let settings = T.store.get("summary.settings", {});
  const excluded = {}; // journal entries unticked this time

  // ---------------- Helpers ----------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function day(d) { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  function isoDay(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function periodStart() {
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt($("period").value, 10));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function on(section) { const b = $("sections").querySelector('input[value="' + section + '"]'); return b && b.checked; }
  function everyText(days) {
    if (days === 1) return "Daily";
    if (days === 3.5) return "Twice a week";
    if (days === 7) return "Weekly";
    if (days % 7 === 0) return "Every " + days / 7 + " weeks";
    return "Every " + days + " days";
  }
  function journalInPeriod(start) {
    return T.store.get("timeline.entries", [])
      .filter(function (e) { return new Date(e.at) >= start; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }
  function defaultShared(e) {
    return (e.tags || []).some(function (t) { return SHARE_TAGS.indexOf(t) >= 0; }) && !!(e.text || e.title);
  }

  // ---------------- Gathering ----------------
  function medsData(start) {
    const meds = T.store.get("doses.meds", []).filter(function (m) { return !m.example; });
    const log = T.store.get("doses.log", []);
    const now = new Date();
    return meds.map(function (m) {
      const mine = log.filter(function (e) { return e.medId === m.id; }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      const inPeriod = mine.filter(function (e) { return new Date(e.at) >= start; });
      const first = mine[0] ? new Date(mine[0].at) : null;
      // Expected doses: from the start of the period (or first logged dose) until now.
      const from = first && first > start ? first : start;
      const expected = first ? Math.max(1, Math.floor((now - from) / 86400000 / m.everyDays) + (first > start ? 1 : 0)) : 0;
      const sites = {};
      inPeriod.forEach(function (e) { if (e.site) sites[e.site] = (sites[e.site] || 0) + 1; });
      return { med: m, last: mine[mine.length - 1], taken: inPeriod.length, expected: expected, sites: sites };
    });
  }

  function labsData(start) {
    const tests = T.store.get("labs.tests", []).filter(function (t) { return !t.example; });
    const ranges = T.store.get("labs.ranges", {});
    const keys = {};
    tests.forEach(function (t) { (t.results || []).forEach(function (r) { keys[r.m] = r.name || keys[r.m] || true; }); });
    return Object.keys(keys).map(function (key) {
      const s = L.series(tests, key);
      const last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
      const r = ranges[key];
      let range = "";
      if (r) {
        const lo = r.low != null ? L.convert(key, r.low, r.unit, last.u) : null;
        const hi = r.high != null ? L.convert(key, r.high, r.unit, last.u) : null;
        range = (lo != null ? L.fmt(lo) : "") + "–" + (hi != null ? L.fmt(hi) : "") + " " + last.u;
      }
      const prevInUnit = prev ? L.convert(key, prev.v, prev.u, last.u) : null;
      return {
        name: typeof keys[key] === "string" ? keys[key] : L.info(key).name,
        last: last, prev: prev, prevInUnit: prevInUnit, range: range,
        old: new Date(last.date + "T12:00") < start
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function moodData(entries) {
    const moods = entries.filter(function (e) { return e.mood; }).map(function (e) { return e.mood; });
    const tags = {};
    entries.forEach(function (e) { (e.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    const counts = [1, 2, 3, 4, 5].map(function (m) { return moods.filter(function (x) { return x === m; }).length; });
    return { n: moods.length, avg: moods.length ? moods.reduce(function (a, b) { return a + b; }, 0) / moods.length : null, counts: counts, tags: tags, entries: entries.length };
  }

  function voiceData(start) {
    const v = T.store.get("voice.history", []).filter(function (h) { return new Date(h.at) >= start; }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    const r = T.store.get("resonance.history", []).filter(function (h) { return new Date(h.at) >= start; });
    return { pitch: v, res: r };
  }

  function questionsList() {
    return $("questions").value.split("\n").map(function (q) { return q.trim(); }).filter(Boolean);
  }

  // ---------------- Note picker ----------------
  function renderPicks() {
    const host = $("note-picks");
    host.innerHTML = "";
    const entries = journalInPeriod(periodStart()).filter(function (e) { return e.text || e.title; });
    $("no-notes").hidden = entries.length > 0;
    entries.slice().reverse().forEach(function (e) {
      const l = document.createElement("label");
      l.className = "note-pick";
      l.innerHTML = '<input type="checkbox"><span><strong></strong><span></span></span>';
      const box = l.querySelector("input");
      box.checked = e.id in excluded ? !excluded[e.id] : defaultShared(e);
      box.addEventListener("change", function () { excluded[e.id] = !box.checked; build(); });
      l.querySelector("strong").textContent = day(e.at) + (e.title ? " · " + e.title : "");
      l.querySelector("span > span").textContent = (e.text || "").slice(0, 90) + ((e.text || "").length > 90 ? "…" : "");
      host.appendChild(l);
    });
  }
  function sharedNotes(start) {
    return journalInPeriod(start).filter(function (e) {
      if (!(e.text || e.title)) return false;
      return e.id in excluded ? !excluded[e.id] : defaultShared(e);
    });
  }

  // ---------------- Building the document ----------------
  let plainText = "";

  function build() {
    const start = periodStart(), now = new Date();
    const doc = $("doc");
    doc.innerHTML = "";
    const text = [];

    const name = $("sum-name").value.trim(), pron = $("sum-pron").value.trim();
    const head = el("header", "doc-head");
    head.appendChild(el("h2", "doc-title", "Health summary"));
    head.id = "doc-title";
    const who = [name, pron ? "(" + pron + ")" : ""].filter(Boolean).join(" ");
    if (who) head.appendChild(el("p", "doc-who", who));
    head.appendChild(el("p", "doc-period", "Covers " + day(start) + " to " + day(now) + " · Prepared " + day(now)));
    doc.appendChild(head);
    text.push("HEALTH SUMMARY" + (who ? " – " + who : ""), "Covers " + day(start) + " to " + day(now), "");

    function section(title) {
      const s = el("section", "doc-sec");
      s.appendChild(el("h3", null, title));
      doc.appendChild(s);
      text.push(title.toUpperCase());
      return s;
    }
    function table(sec, headers, rows) {
      const wrap = el("div", "doc-table-wrap");
      const t = el("table", "doc-table");
      const thead = el("thead"), tr = el("tr");
      headers.forEach(function (h) { const th = el("th", null, h); th.scope = "col"; tr.appendChild(th); });
      thead.appendChild(tr);
      t.appendChild(thead);
      const tb = el("tbody");
      rows.forEach(function (r) {
        const row = el("tr");
        r.forEach(function (c) { row.appendChild(el("td", null, c)); });
        tb.appendChild(row);
        text.push("- " + r.filter(Boolean).join(" | "));
      });
      t.appendChild(tb);
      wrap.appendChild(t);
      sec.appendChild(wrap);
    }
    function empty(sec, msg) { sec.appendChild(el("p", "doc-empty", msg)); text.push(msg); }

    if (on("meds")) {
      const sec = section("Medications");
      const meds = medsData(start);
      if (!meds.length) empty(sec, "No medications recorded.");
      else table(sec, ["Medication", "How", "Last dose", "Taken in period", "Sites used"], meds.map(function (d) {
        const m = d.med;
        const how = [KIND[m.kind] || "", m.amount, everyText(m.everyDays)].filter(Boolean).join(", ");
        const sites = Object.keys(d.sites).sort(function (a, b) { return d.sites[b] - d.sites[a]; }).map(function (s) { return SITE[s] + " ×" + d.sites[s]; }).join(", ");
        return [m.name, how, d.last ? day(d.last.at) : "Not logged", d.expected ? d.taken + " of about " + d.expected : String(d.taken), sites || "—"];
      }));
      text.push("");
    }

    if (on("labs")) {
      const sec = section("Lab results");
      const labs = labsData(start);
      if (!labs.length) empty(sec, "No lab results recorded.");
      else {
        table(sec, ["Marker", "Latest", "Date", "Previous", "Target range"], labs.map(function (l) {
          return [
            l.name,
            L.fmt(l.last.v) + " " + l.last.u,
            day(l.last.date + "T12:00") + (l.old ? " (before this period)" : ""),
            l.prev ? L.fmt(l.prevInUnit != null ? l.prevInUnit : l.prev.v) + " " + (l.prevInUnit != null ? l.last.u : l.prev.u) + ", " + day(l.prev.date + "T12:00") : "—",
            l.range || "—"
          ];
        }));
        sec.appendChild(el("p", "doc-note", "Target ranges are the ones entered by the patient from previous appointments."));
      }
      text.push("");
    }

    const entries = journalInPeriod(start);
    if (on("mood")) {
      const sec = section("Mood");
      const md = moodData(entries);
      if (!md.n) empty(sec, "No moods recorded in this period.");
      else {
        const p = el("p", null, md.n + " mood check-ins. Average: " + MOODS[Math.round(md.avg)] + " (" + md.avg.toFixed(1) + " on a scale of 1 to 5).");
        sec.appendChild(p);
        text.push(p.textContent);
        const bars = el("div", "mood-bars");
        const max = Math.max.apply(null, md.counts) || 1;
        md.counts.forEach(function (c, i) {
          const b = el("div", "mood-bar");
          const fill = el("span", "mood-fill");
          fill.style.height = Math.round((c / max) * 100) + "%";
          b.appendChild(el("span", "mood-n", String(c)));
          b.appendChild(fill);
          b.appendChild(el("span", "mood-l", MOODS[i + 1]));
          bars.appendChild(b);
        });
        sec.appendChild(bars);
        text.push(md.counts.map(function (c, i) { return MOODS[i + 1] + ": " + c; }).join(", "));
      }
      text.push("");
    }

    if (on("notes")) {
      const notes = sharedNotes(start);
      if (notes.length) {
        const sec = section("Notes from my journal");
        const list = el("ul", "doc-notes");
        notes.forEach(function (e) {
          const li = el("li");
          li.appendChild(el("strong", null, day(e.at) + (e.title ? " – " + e.title : "")));
          if (e.text) li.appendChild(el("span", null, e.text));
          list.appendChild(li);
          text.push("- " + day(e.at) + (e.title ? " – " + e.title : "") + (e.text ? ": " + e.text.replace(/\s+/g, " ") : ""));
        });
        sec.appendChild(list);
        text.push("");
      }
    }

    if (on("voice")) {
      const sec = section("Voice practice");
      const v = voiceData(start);
      if (!v.pitch.length && !v.res.length) empty(sec, "No voice practice recorded in this period.");
      if (v.pitch.length) {
        const first = v.pitch[0], last = v.pitch[v.pitch.length - 1];
        const p = el("p", null, v.pitch.length + " pitch sessions. Average speaking pitch went from " + first.avg + " Hz (" + day(first.at) + ") to " + last.avg + " Hz (" + day(last.at) + ").");
        sec.appendChild(p);
        text.push(p.textContent);
      }
      if (v.res.length) {
        const p = el("p", null, v.res.length + " resonance sessions.");
        sec.appendChild(p);
        text.push(p.textContent);
      }
      text.push("");
    }

    if (on("questions")) {
      const qs = questionsList();
      if (qs.length) {
        const sec = section("My questions");
        const ol = el("ol", "doc-questions");
        qs.forEach(function (q, i) { ol.appendChild(el("li", null, q)); text.push((i + 1) + ". " + q); });
        sec.appendChild(ol);
        text.push("");
      }
    }

    doc.appendChild(el("footer", "doc-foot", "Recorded by the patient in Tendril, a personal tracking app. Not a medical record."));
    plainText = text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---------------- Settings ----------------
  function persist() {
    settings = {
      period: $("period").value,
      name: $("sum-name").value,
      pron: $("sum-pron").value,
      questions: $("questions").value,
      sections: Array.prototype.filter.call($("sections").querySelectorAll("input"), function (b) { return b.checked; }).map(function (b) { return b.value; })
    };
    T.store.set("summary.settings", settings);
  }

  function restore() {
    const short = T.store.get("names.shortlist", [])[0];
    $("period").value = settings.period || "3";
    $("sum-name").value = settings.name != null ? settings.name : short ? short.name : "";
    $("sum-pron").value = settings.pron != null ? settings.pron : short && short.set ? short.set.sub + "/" + short.set.obj : "";
    $("questions").value = settings.questions || "";
    if (settings.sections) {
      $("sections").querySelectorAll("input").forEach(function (b) { b.checked = settings.sections.indexOf(b.value) >= 0; });
    }
  }

  // ---------------- Wire up ----------------
  $("sum-form").addEventListener("input", function (ev) {
    if (ev.target.closest("#note-picks")) return;
    persist();
    if (ev.target.id === "period") renderPicks();
    $("notes-field").hidden = !on("notes");
    build();
  });
  $("sum-form").addEventListener("change", function (ev) {
    if (ev.target.closest("#note-picks")) return;
    persist();
    if (ev.target.id === "period") renderPicks();
    $("notes-field").hidden = !on("notes");
    build();
  });
  $("suggest-q").addEventListener("click", function () {
    const have = questionsList();
    const add = SUGGESTED.filter(function (q) { return have.indexOf(q) < 0; });
    $("questions").value = have.concat(add).join("\n");
    persist();
    build();
  });
  $("print").addEventListener("click", function () { window.print(); });
  $("copy-text").addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plainText).then(function () { T.toast("Summary copied as text"); }, function () { T.toast("Couldn’t copy on this device"); });
    } else T.toast("Couldn’t copy on this device");
  });

  restore();
  renderPicks();
  $("notes-field").hidden = !on("notes");
  build();
});
