/* Tendril lab results (tendril:labs.tests, labs.ranges, labs.units). */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, L = window.TendrilLabs;
  const $ = function (id) { return document.getElementById(id); };

  let tests = T.store.get("labs.tests", []);
  let ranges = T.store.get("labs.ranges", {});
  let lastUnits = T.store.get("labs.units", {});

  function save() {
    T.store.set("labs.tests", tests);
    T.store.set("labs.ranges", ranges);
    T.store.set("labs.units", lastUnits);
  }

  function markerKeys() {
    const seen = {};
    tests.forEach(function (t) { (t.results || []).forEach(function (r) { seen[r.m] = r.name || seen[r.m] || true; }); });
    const keys = Object.keys(seen);
    return keys.sort(function (a, b) {
      const ia = L.ORDER.indexOf(a), ib = L.ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }
  function nameOf(key) {
    if (L.MARKERS[key]) return L.MARKERS[key].name;
    for (const t of tests) for (const r of t.results || []) if (r.m === key && r.name) return r.name;
    return key.replace(/^c:/, "");
  }
  function rangeIn(key, unit) {
    const r = ranges[key];
    if (!r) return null;
    const conv = function (v) { return v == null ? null : L.convert(key, v, r.unit, unit); };
    const low = conv(r.low), high = conv(r.high);
    if ((r.low != null && low == null) || (r.high != null && high == null)) return null;
    return { low: low, high: high };
  }

  // ---------------- Overview ----------------
  function render() {
    const grid = $("marker-grid");
    grid.innerHTML = "";
    const keys = markerKeys();
    $("labs-empty").hidden = keys.length > 0;
    $("add-test").hidden = keys.length === 0;
    $("example-banner").hidden = !tests.some(function (t) { return t.example; });

    keys.forEach(function (key) {
      const raw = L.series(tests, key);
      const last = raw[raw.length - 1];
      const pts = L.inUnit(key, raw, last.u);
      const prev = pts.length > 1 ? pts[pts.length - 2] : null;
      const range = rangeIn(key, last.u);
      const state = L.rangeState(last.v, range);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "marker-card";
      card.innerHTML =
        '<span class="mc-name"></span>' +
        '<span class="mc-value"><strong></strong> <span class="mc-unit"></span></span>' +
        '<span class="mc-meta"><span class="mc-date"></span><span class="mc-change"></span></span>' +
        '<canvas class="mc-spark" aria-hidden="true"></canvas>' +
        '<span class="mc-range" hidden></span>';
      card.querySelector(".mc-name").textContent = nameOf(key);
      card.querySelector(".mc-value strong").textContent = L.fmt(last.v);
      card.querySelector(".mc-unit").textContent = last.u;
      card.querySelector(".mc-date").textContent = new Date(last.date + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      if (prev) {
        const d = pts[pts.length - 1].v - prev.v;
        const ch = card.querySelector(".mc-change");
        ch.textContent = (d > 0 ? "↑ " : d < 0 ? "↓ " : "") + L.fmt(Math.abs(d)) + " since last";
        if (!d) ch.textContent = "No change since last";
      }
      if (state) {
        const r = card.querySelector(".mc-range");
        r.hidden = false;
        r.dataset.state = state;
        r.textContent = state === "within" ? "Within your range" : state === "above" ? "Above your range" : "Below your range";
      }
      card.setAttribute("aria-label", nameOf(key) + ", latest " + L.fmt(last.v) + " " + last.u + ". Open details");
      card.addEventListener("click", function () { openMarker(key); });
      grid.appendChild(card);
      requestAnimationFrame(function () { L.chart(card.querySelector(".mc-spark"), pts, { compact: true, range: range }); });
    });

    renderTests();
  }

  function renderTests() {
    const list = $("test-list");
    list.innerHTML = "";
    $("tests-panel").hidden = tests.length === 0;
    tests.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (t) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button" class="test-btn"><strong></strong><span class="test-vals"></span><span class="test-note"></span></button>';
      li.querySelector("strong").textContent = new Date(t.date + "T12:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      li.querySelector(".test-vals").textContent = (t.results || []).map(function (r) { return nameOf(r.m) + " " + L.fmt(r.v) + " " + r.u; }).join(" · ");
      li.querySelector(".test-note").textContent = t.note || "";
      li.querySelector(".test-btn").addEventListener("click", function () { openTest(t); });
      list.appendChild(li);
    });
  }

  // ---------------- Marker detail ----------------
  let openKey = null;

  function openMarker(key) {
    openKey = key;
    $("marker-sheet").showModal();
    drawMarker();
  }

  function drawMarker() {
    const key = openKey;
    const raw = L.series(tests, key);
    if (!raw.length) { $("marker-sheet").close(); return; }
    const unit = raw[raw.length - 1].u;
    const pts = L.inUnit(key, raw, unit);
    const range = rangeIn(key, unit);
    $("marker-title").textContent = nameOf(key);
    $("range-unit").textContent = "in " + unit;
    const plain = function (v) { return Number(v.toPrecision(4)); };
    $("range-low").value = range && range.low != null ? plain(range.low) : "";
    $("range-high").value = range && range.high != null ? plain(range.high) : "";
    const skipped = raw.length - pts.length;
    $("marker-unit-note").textContent = "Shown in " + unit + (skipped ? ". " + skipped + " result" + (skipped > 1 ? "s" : "") + " in another unit couldn’t be converted and " + (skipped > 1 ? "aren’t" : "isn’t") + " on the chart." : (raw.some(function (p) { return p.u !== unit; }) ? ". Results in other units were converted." : "."));
    requestAnimationFrame(function () { L.chart($("marker-chart"), pts, { range: range }); });

    const body = $("marker-rows");
    body.innerHTML = "";
    raw.slice().reverse().forEach(function (p, i, arr) {
      const tr = document.createElement("tr");
      const prev = arr[i + 1];
      let change = "";
      if (prev) {
        const a = L.convert(key, p.v, p.u, unit), b = L.convert(key, prev.v, prev.u, unit);
        if (a != null && b != null) change = (a - b > 0 ? "↑ " : a - b < 0 ? "↓ " : "") + L.fmt(Math.abs(a - b));
      }
      tr.innerHTML = "<td></td><td></td><td></td>";
      tr.children[0].textContent = new Date(p.date + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      tr.children[1].textContent = L.fmt(p.v) + " " + p.u;
      tr.children[2].textContent = change;
      body.appendChild(tr);
    });
  }

  $("range-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const raw = L.series(tests, openKey);
    const unit = raw[raw.length - 1].u;
    const low = $("range-low").value === "" ? null : parseFloat($("range-low").value);
    const high = $("range-high").value === "" ? null : parseFloat($("range-high").value);
    if (low == null && high == null) { T.toast("Enter at least one end of the range"); return; }
    if (low != null && high != null && low > high) { T.toast("The first number should be the lower one"); return; }
    ranges[openKey] = { low: low, high: high, unit: unit };
    save();
    drawMarker();
    render();
    T.toast("Range saved");
  });
  $("range-clear").addEventListener("click", function () {
    delete ranges[openKey];
    save();
    drawMarker();
    render();
  });

  // ---------------- Add / edit a test ----------------
  let editing = null;

  function markerOptions(select, current) {
    select.innerHTML = "";
    L.ORDER.forEach(function (k) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = L.MARKERS[k].name;
      select.appendChild(o);
    });
    const other = document.createElement("option");
    other.value = "other";
    other.textContent = "Something else…";
    select.appendChild(other);
    select.value = current && L.MARKERS[current] ? current : current ? "other" : "e2";
  }

  function unitOptions(select, key, current) {
    select.innerHTML = "";
    const units = L.MARKERS[key] ? L.MARKERS[key].units : [];
    units.forEach(function (u) {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = u;
      select.appendChild(o);
    });
    select.value = current && units.indexOf(current) >= 0 ? current : (lastUnits[key] && units.indexOf(lastUnits[key]) >= 0 ? lastUnits[key] : units[0]);
  }

  function addRow(r) {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML =
      '<select class="input r-marker" aria-label="Marker"></select>' +
      '<input class="input r-name" type="text" maxlength="40" placeholder="Name, e.g. Vitamin D" aria-label="Marker name" hidden>' +
      '<input class="input r-value num" type="number" step="any" inputmode="decimal" placeholder="Value" aria-label="Value" required>' +
      '<select class="input r-unit" aria-label="Unit"></select>' +
      '<input class="input r-unit-text" type="text" maxlength="12" placeholder="Unit" aria-label="Unit" hidden>' +
      '<button class="icon-btn r-del" type="button" aria-label="Remove this marker">×</button>';
    const sel = row.querySelector(".r-marker"), unit = row.querySelector(".r-unit");
    const key = r ? r.m : null;
    markerOptions(sel, key);
    const sync = function (keepUnit) {
      const isOther = sel.value === "other";
      row.querySelector(".r-name").hidden = !isOther;
      unit.hidden = isOther;
      row.querySelector(".r-unit-text").hidden = !isOther;
      if (!isOther) unitOptions(unit, sel.value, keepUnit);
    };
    sync(r ? r.u : null);
    if (r) {
      row.querySelector(".r-value").value = r.v;
      if (!L.MARKERS[r.m]) { row.querySelector(".r-name").value = r.name || r.m.replace(/^c:/, ""); row.querySelector(".r-unit-text").value = r.u; }
    }
    sel.addEventListener("change", function () { sync(null); });
    row.querySelector(".r-del").addEventListener("click", function () {
      if ($("result-rows").children.length > 1) row.remove();
    });
    $("result-rows").appendChild(row);
  }

  function todayValue() {
    const d = new Date(), pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function openTest(t) {
    editing = t || null;
    $("test-title").textContent = t ? "Edit results" : "Add results";
    $("test-date").value = t ? t.date : todayValue();
    $("test-note").value = t ? t.note || "" : "";
    $("result-rows").innerHTML = "";
    if (t) t.results.forEach(addRow);
    else {
      // Start with the markers you've logged before, or estradiol.
      const keys = markerKeys().filter(function (k) { return L.MARKERS[k]; }).slice(0, 4);
      if (keys.length) keys.forEach(function (k) { addRow({ m: k, v: "", u: lastUnits[k] }); });
      else addRow(null);
      $("result-rows").querySelectorAll(".r-value").forEach(function (i) { i.value = ""; });
    }
    const del = $("test-delete");
    del.hidden = !t;
    del.textContent = "Delete test";
    delete del.dataset.armed;
    $("test-sheet").showModal();
  }

  $("add-row").addEventListener("click", function () { addRow(null); });

  $("test-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const results = [];
    let problem = "";
    $("result-rows").querySelectorAll(".result-row").forEach(function (row) {
      const valueText = row.querySelector(".r-value").value;
      if (valueText === "") return; // empty rows are skipped
      const v = parseFloat(valueText);
      const sel = row.querySelector(".r-marker").value;
      if (sel === "other") {
        const name = row.querySelector(".r-name").value.trim();
        const u = row.querySelector(".r-unit-text").value.trim();
        if (!name) { problem = "Give the extra marker a name"; return; }
        results.push({ m: "c:" + name.toLowerCase(), name: name, v: v, u: u });
      } else {
        const u = row.querySelector(".r-unit").value;
        results.push({ m: sel, v: v, u: u });
        lastUnits[sel] = u;
      }
    });
    if (problem) { T.toast(problem); return; }
    if (!results.length) { T.toast("Enter at least one result"); return; }
    const data = { date: $("test-date").value || todayValue(), results: results, note: $("test-note").value.trim() };
    if (editing) { Object.assign(editing, data); delete editing.example; }
    else tests.push(Object.assign({ id: "t" + T.uid() }, data));
    save();
    $("test-sheet").close();
    render();
    T.toast(editing ? "Saved" : "Results added");
  });

  $("test-delete").addEventListener("click", function () {
    const del = $("test-delete");
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    tests = tests.filter(function (x) { return x !== editing; });
    save();
    $("test-sheet").close();
    render();
    T.toast("Test deleted");
  });

  // ---------------- Examples ----------------
  function loadExamples() {
    const d = function (monthsAgo) {
      const x = new Date();
      x.setMonth(x.getMonth() - monthsAgo);
      const pad = function (n) { return String(n).padStart(2, "0"); };
      return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
    };
    tests = [
      { id: "tx1", example: true, date: d(12), note: "Before starting", results: [{ m: "e2", v: 32, u: "pg/mL" }, { m: "tt", v: 520, u: "ng/dL" }, { m: "k", v: 4.3, u: "mmol/L" }] },
      { id: "tx2", example: true, date: d(9), note: "", results: [{ m: "e2", v: 95, u: "pg/mL" }, { m: "tt", v: 210, u: "ng/dL" }, { m: "k", v: 4.6, u: "mmol/L" }] },
      { id: "tx3", example: true, date: d(5), note: "", results: [{ m: "e2", v: 140, u: "pg/mL" }, { m: "tt", v: 60, u: "ng/dL" }, { m: "k", v: 4.5, u: "mmol/L" }] },
      { id: "tx4", example: true, date: d(1), note: "Trough, morning", results: [{ m: "e2", v: 168, u: "pg/mL" }, { m: "tt", v: 38, u: "ng/dL" }, { m: "k", v: 4.4, u: "mmol/L" }] }
    ];
    save();
    render();
  }
  $("load-examples").addEventListener("click", loadExamples);
  $("clear-examples").addEventListener("click", function () {
    tests = tests.filter(function (t) { return !t.example; });
    save();
    render();
    T.toast("Example data cleared");
  });

  // ---------------- Wire up ----------------
  $("add-test").addEventListener("click", function () { openTest(null); });
  $("add-first").addEventListener("click", function () { openTest(null); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });
  document.querySelectorAll("dialog.sheet").forEach(function (dl) {
    dl.addEventListener("click", function (ev) { if (ev.target === dl) dl.close(); });
  });
  window.addEventListener("resize", function () { render(); if ($("marker-sheet").open) drawMarker(); });

  render();
});
