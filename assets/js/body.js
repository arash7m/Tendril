/* Tendril body measurements: tendril:body.entries ([{ id, date, values: { key: cm or kg }, note }])
   and tendril:body.settings ({ unit: "cm" | "in", wunit: "kg" | "lb", track: [keys] }).
   Lengths are stored in cm and weight in kg, and shown in the chosen unit. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, L = window.TendrilLabs;
  const $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  const MEASURES = [
    { key: "chest", name: "Chest / bust" },
    { key: "underbust", name: "Underbust" },
    { key: "waist", name: "Waist" },
    { key: "hips", name: "Hips" },
    { key: "shoulders", name: "Shoulders" },
    { key: "thigh", name: "Thigh" },
    { key: "arm", name: "Upper arm" },
    { key: "neck", name: "Neck" },
    { key: "weight", name: "Weight", weight: true }
  ];
  const BY = {};
  MEASURES.forEach(function (m) { BY[m.key] = m; });
  const DEFAULT_TRACK = ["chest", "waist", "hips", "shoulders"];

  let entries = T.store.get("body.entries", []);
  let settings = Object.assign({ unit: "cm", wunit: "kg", track: DEFAULT_TRACK.slice() }, T.store.get("body.settings", {}));
  function save() { T.store.set("body.entries", entries); }
  function saveSettings() { T.store.set("body.settings", settings); }
  function sorted() { return entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }

  // ---------------- Units ----------------
  function unitOf(m) { return m.weight ? settings.wunit : settings.unit; }
  function toShown(m, v) {
    if (v == null) return null;
    if (m.weight) return settings.wunit === "lb" ? v / 0.45359237 : v;
    return settings.unit === "in" ? v / 2.54 : v;
  }
  function fromShown(m, v) {
    if (m.weight) return settings.wunit === "lb" ? v * 0.45359237 : v;
    return settings.unit === "in" ? v * 2.54 : v;
  }
  function fmt(m, v, sign) {
    const s = toShown(m, v);
    const d = unitOf(m) === "in" ? 1 : unitOf(m) === "lb" ? 1 : 1;
    const txt = Math.abs(s).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
    return (sign ? (s > 0.049 ? "+" : s < -0.049 ? "−" : "±") : (s < 0 ? "−" : "")) + txt;
  }
  function dateText(d, withYear) {
    return new Date(d + "T12:00").toLocaleDateString(undefined, withYear === false ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }
  function series(key) {
    return sorted().filter(function (e) { return e.values && e.values[key] != null; }).map(function (e) { return { date: e.date, v: e.values[key], e: e }; });
  }

  // ---------------- Render ----------------
  function shownKeys() {
    // Tracked ones, plus any with data so nothing disappears silently.
    const has = {};
    entries.forEach(function (e) { Object.keys(e.values || {}).forEach(function (k) { has[k] = true; }); });
    return MEASURES.filter(function (m) { return settings.track.indexOf(m.key) >= 0 || (has[m.key] && !m.weight); }).map(function (m) { return m.key; });
  }

  function render() {
    document.querySelectorAll("[data-unit]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.unit === settings.unit ? "true" : "false"); });
    document.querySelectorAll("[data-wunit]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.wunit === settings.wunit ? "true" : "false"); });
    const grid = $("body-grid");
    grid.innerHTML = "";
    $("body-empty").hidden = entries.length > 0;
    $("history-panel").hidden = entries.length === 0;
    renderNudge();
    if (!entries.length) return;

    shownKeys().forEach(function (key) {
      const m = BY[key], s = series(key);
      const card = el("button", "marker-card body-card");
      card.type = "button";
      card.appendChild(el("span", "mc-name", m.name));
      const val = el("span", "mc-value");
      if (s.length) {
        val.appendChild(el("strong", null, fmt(m, s[s.length - 1].v)));
        val.appendChild(document.createTextNode(" "));
        val.appendChild(el("span", "mc-unit", unitOf(m)));
      } else {
        val.appendChild(el("strong", "mc-none", "—"));
      }
      card.appendChild(val);
      const meta = el("span", "mc-meta");
      if (s.length > 1) {
        meta.appendChild(el("span", "bc-change", fmt(m, s[s.length - 1].v - s[0].v, true) + " " + unitOf(m) + " since " + dateText(s[0].date)));
      } else if (s.length === 1) {
        meta.appendChild(el("span", null, "Measured " + dateText(s[0].date)));
      } else {
        meta.appendChild(el("span", null, "Not measured yet"));
      }
      card.appendChild(meta);
      if (s.length > 1) {
        const c = el("canvas", "mc-spark");
        c.setAttribute("aria-hidden", "true");
        card.appendChild(c);
        requestAnimationFrame(function () { L.chart(c, s.map(function (p) { return { date: p.date, v: toShown(m, p.v) }; }), { compact: true }); });
      }
      card.addEventListener("click", function () { openMeasure(key); });
      grid.appendChild(card);
    });

    // Waist-to-hip ratio, from entries that have both
    const both = sorted().filter(function (e) { return e.values && e.values.waist && e.values.hips; });
    if (both.length && shownKeys().indexOf("waist") >= 0 && shownKeys().indexOf("hips") >= 0) {
      const card = el("button", "marker-card body-card ratio-card");
      card.type = "button";
      card.appendChild(el("span", "mc-name", "Waist ÷ hips"));
      const last = both[both.length - 1];
      const r = function (e) { return e.values.waist / e.values.hips; };
      const val = el("span", "mc-value");
      val.appendChild(el("strong", null, r(last).toFixed(2)));
      card.appendChild(val);
      const meta = el("span", "mc-meta");
      meta.appendChild(el("span", null, both.length > 1 ? "was " + r(both[0]).toFixed(2) + " on " + dateText(both[0].date) : "A ratio, so it doesn’t depend on units"));
      card.appendChild(meta);
      if (both.length > 1) {
        const c = el("canvas", "mc-spark");
        c.setAttribute("aria-hidden", "true");
        card.appendChild(c);
        requestAnimationFrame(function () { L.chart(c, both.map(function (e) { return { date: e.date, v: r(e) }; }), { compact: true }); });
      }
      card.addEventListener("click", function () { openMeasure("ratio"); });
      grid.appendChild(card);
    }

    renderHistory();
  }

  function renderNudge() {
    const n = $("body-nudge");
    if (!entries.length) { n.hidden = true; return; }
    const last = sorted()[entries.length - 1];
    const days = Math.round((new Date().setHours(12, 0, 0, 0) - new Date(last.date + "T12:00")) / 86400000);
    n.hidden = false;
    n.textContent = days <= 0 ? "Measured today. Nice." : days < 28
      ? "Last measured " + days + (days === 1 ? " day" : " days") + " ago."
      : "Last measured " + days + " days ago. It might be a good time for a new set.";
  }

  function renderHistory() {
    const list = $("history-list");
    list.innerHTML = "";
    sorted().reverse().forEach(function (e) {
      const li = el("li");
      const b = el("button", "test-btn");
      b.type = "button";
      b.appendChild(el("strong", null, dateText(e.date)));
      b.appendChild(el("span", "test-vals", MEASURES.filter(function (m) { return e.values[m.key] != null; })
        .map(function (m) { return m.name + " " + fmt(m, e.values[m.key]) + " " + unitOf(m); }).join(" · ")));
      if (e.note) b.appendChild(el("span", "test-note", e.note));
      b.addEventListener("click", function () { openEntry(e); });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  // ---------------- One measurement ----------------
  let openKey = null;
  function openMeasure(key) {
    openKey = key;
    drawMeasure();
    $("m-sheet").showModal();
  }
  function drawMeasure() {
    const key = openKey;
    const isRatio = key === "ratio";
    const m = isRatio ? { name: "Waist ÷ hips" } : BY[key];
    const pts = isRatio
      ? sorted().filter(function (e) { return e.values.waist && e.values.hips; }).map(function (e) { return { date: e.date, v: e.values.waist / e.values.hips }; })
      : series(key).map(function (p) { return { date: p.date, v: p.v }; });
    $("m-title").textContent = m.name;
    const show = function (v) { return isRatio ? v.toFixed(2) : fmt(m, v) + " " + unitOf(m); };
    const diff = function (v) { return isRatio ? (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) : fmt(m, v, true) + " " + unitOf(m); };
    $("m-summary").textContent = pts.length > 1
      ? diff(pts[pts.length - 1].v - pts[0].v) + " between " + dateText(pts[0].date) + " and " + dateText(pts[pts.length - 1].date) + "."
      : pts.length ? "One measurement so far. Add more over time to see a line." : "Not measured yet.";
    if (isRatio) $("m-summary").textContent += " Waist divided by hips, so it doesn’t depend on units.";
    requestAnimationFrame(function () { L.chart($("m-chart"), pts.map(function (p) { return { date: p.date, v: isRatio ? p.v : toShown(m, p.v) }; }), {}); });
    const rows = $("m-rows");
    rows.innerHTML = "";
    pts.slice().reverse().forEach(function (p, i, arr) {
      const tr = el("tr");
      tr.appendChild(el("td", null, dateText(p.date)));
      tr.appendChild(el("td", null, show(p.v)));
      const prev = arr[i + 1];
      tr.appendChild(el("td", null, prev ? diff(p.v - prev.v) : "—"));
      rows.appendChild(tr);
    });
  }

  // ---------------- Add / edit ----------------
  let editing = null;
  function todayValue() {
    const d = new Date(), pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function openEntry(e) {
    editing = e || null;
    $("entry-title").textContent = e ? "Edit measurements" : "Add measurements";
    $("entry-date").value = e ? e.date : todayValue();
    $("entry-note").value = e ? e.note || "" : "";
    const host = $("m-fields");
    host.innerHTML = "";
    const keys = shownKeys().slice();
    if (e) Object.keys(e.values).forEach(function (k) { if (keys.indexOf(k) < 0 && BY[k]) keys.push(k); });
    const last = sorted()[entries.length - 1];
    keys.forEach(function (key) {
      const m = BY[key];
      const lab = el("label", "m-field");
      lab.appendChild(el("span", "m-name", m.name));
      const wrap = el("span", "m-input");
      const inp = el("input", "input num");
      inp.type = "number"; inp.inputMode = "decimal"; inp.step = "0.1"; inp.min = "0"; inp.dataset.key = key;
      if (e && e.values[key] != null) inp.value = Number(toShown(m, e.values[key]).toFixed(1));
      else if (!e && last && last.values[key] != null) inp.placeholder = "last: " + fmt(m, last.values[key]);
      wrap.appendChild(inp);
      wrap.appendChild(el("span", "mc-unit", unitOf(m)));
      lab.appendChild(wrap);
      host.appendChild(lab);
    });
    const del = $("entry-delete");
    del.hidden = !e; del.textContent = "Delete"; delete del.dataset.armed;
    $("entry-sheet").showModal();
    const first = host.querySelector("input");
    if (first && !e) setTimeout(function () { first.focus(); }, 50);
  }

  $("entry-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const values = {};
    $("m-fields").querySelectorAll("input").forEach(function (inp) {
      const v = parseFloat(String(inp.value).replace(",", "."));
      if (isFinite(v) && v > 0) values[inp.dataset.key] = Math.round(fromShown(BY[inp.dataset.key], v) * 100) / 100;
    });
    if (!Object.keys(values).length) { T.toast("Add at least one measurement"); return; }
    const data = { date: $("entry-date").value || todayValue(), values: values, note: $("entry-note").value.trim() };
    if (editing) Object.assign(editing, data);
    else entries.push(Object.assign({ id: "b" + T.uid() }, data));
    save();
    $("entry-sheet").close();
    render();
    T.toast(editing ? "Saved" : "Measurements saved");
  });
  $("entry-delete").addEventListener("click", function () {
    const del = $("entry-delete");
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    entries = entries.filter(function (x) { return x !== editing; });
    save();
    $("entry-sheet").close();
    render();
    T.toast("Deleted");
  });

  // ---------------- Choose what to track ----------------
  function renderChoose() {
    const host = $("choose-list");
    host.innerHTML = "";
    MEASURES.forEach(function (m) {
      const lab = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = settings.track.indexOf(m.key) >= 0;
      cb.addEventListener("change", function () {
        settings.track = settings.track.filter(function (k) { return k !== m.key; });
        if (cb.checked) settings.track.push(m.key);
        settings.track.sort(function (a, b) { return MEASURES.indexOf(BY[a]) - MEASURES.indexOf(BY[b]); });
        saveSettings();
        render();
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", null, m.name));
      host.appendChild(lab);
    });
  }
  $("choose-btn").addEventListener("click", function () { renderChoose(); $("choose-sheet").showModal(); });

  document.querySelectorAll("[data-unit]").forEach(function (b) {
    b.addEventListener("click", function () { settings.unit = b.dataset.unit; saveSettings(); render(); });
  });
  document.querySelectorAll("[data-wunit]").forEach(function (b) {
    b.addEventListener("click", function () { settings.wunit = b.dataset.wunit; saveSettings(); render(); });
  });

  $("add-entry").addEventListener("click", function () { openEntry(null); });
  $("add-first").addEventListener("click", function () { openEntry(null); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  document.querySelectorAll("dialog.sheet").forEach(function (d) { d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); }); });
  window.addEventListener("resize", function () { if ($("m-sheet").open) drawMeasure(); });

  // Default to inches where people usually measure in inches.
  if (!T.store.get("body.settings", null) && /-(US|LR|MM)$/i.test(navigator.language || "")) { settings.unit = "in"; settings.wunit = "lb"; }
  render();
  if (location.hash === "#add") { history.replaceState(null, "", location.pathname); openEntry(null); }
});
