/* Tendril euphoria jar (tendril:jar.notes, tendril:jar.seen).
   Timeline entries tagged "euphoria" also come up when picking. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };
  const NS = "http://www.w3.org/2000/svg";

  const KINDS = {
    seen: { label: "Seen as me", tone: "pink" },
    compliment: { label: "Compliment", tone: "purple" },
    felt: { label: "Felt like me", tone: "blue" },
    win: { label: "Small win", tone: "pink" },
    support: { label: "Support", tone: "purple" },
    other: { label: "Other", tone: "blue" }
  };

  let notes = T.store.get("jar.notes", []);
  let filter = "all";
  let editing = null;
  let lastPicked = null;
  let justAdded = null;

  function save() { T.store.set("jar.notes", notes); }

  // ---------------- Jar drawing ----------------
  // Slips are placed with a fixed pseudo-random pattern so the jar looks the same each time.
  function rand(i, k) {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function drawJar() {
    const svg = $("jar-svg");
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const clip = el("clipPath", { id: "jar-inside" }, defs);
    el("path", { d: "M62 70 Q48 70 46 92 L40 250 Q40 280 70 282 L170 282 Q200 280 200 250 L194 92 Q192 70 178 70 Z" }, clip);

    // Glass
    el("path", { class: "jar-glass", d: "M62 70 Q48 70 46 92 L40 250 Q40 280 70 282 L170 282 Q200 280 200 250 L194 92 Q192 70 178 70 Z" }, svg);

    // Slips, stacked from the bottom
    const g = el("g", { "clip-path": "url(#jar-inside)" }, svg);
    const shown = notes.slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); }).slice(-48);
    shown.forEach(function (n, i) {
      const row = Math.floor(i / 4), col = i % 4;
      const x = 66 + col * 36 + rand(i, 1) * 10;
      const y = 262 - row * 16 - rand(i, 2) * 6;
      const rot = (rand(i, 3) - 0.5) * 70;
      const kind = KINDS[n.kind] || KINDS.other;
      const slip = el("rect", {
        x: x - 19, y: y - 7, width: 38, height: 14, rx: 4,
        class: "slip slip-" + kind.tone + (n.id === justAdded ? " slip-new" : ""),
        transform: "rotate(" + rot.toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")"
      }, g);
      if (n.id === justAdded) slip.style.setProperty("--drop", (y + 40) + "px");
    });

    // Shine and lid
    el("path", { class: "jar-shine", d: "M60 100 Q56 170 58 240" }, svg);
    el("rect", { class: "jar-neck", x: 58, y: 50, width: 124, height: 24, rx: 8 }, svg);
    el("rect", { class: "jar-lid", x: 52, y: 30, width: 136, height: 24, rx: 10 }, svg);
    justAdded = null;
  }

  function renderCount() {
    const n = notes.length;
    $("jar-count").textContent = n === 0 ? "Your jar is empty" : n === 1 ? "1 moment in your jar" : n + " moments in your jar";
    $("pick-note").hidden = pool().length === 0;
  }

  // ---------------- Notes list ----------------
  function renderFilter() {
    const host = $("note-filter");
    host.innerHTML = "";
    const used = {};
    notes.forEach(function (n) { used[n.kind] = true; });
    const opts = [["all", "All"]].concat(Object.keys(KINDS).filter(function (k) { return used[k]; }).map(function (k) { return [k, KINDS[k].label]; }));
    if (opts.length <= 2) { host.hidden = true; return; }
    host.hidden = false;
    opts.forEach(function (o) {
      const l = document.createElement("label");
      l.innerHTML = '<input type="radio" name="nf"><span></span>';
      const input = l.querySelector("input");
      input.value = o[0];
      input.checked = filter === o[0];
      input.addEventListener("change", function () { filter = o[0]; renderNotes(); });
      l.querySelector("span").textContent = o[1];
      host.appendChild(l);
    });
  }

  function renderNotes() {
    const list = $("notes");
    list.innerHTML = "";
    $("notes-section").hidden = notes.length === 0;
    $("ideas").hidden = notes.length >= 3;
    notes.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); })
      .filter(function (n) { return filter === "all" || n.kind === filter; })
      .forEach(function (n) {
        const kind = KINDS[n.kind] || KINDS.other;
        const li = document.createElement("li");
        li.className = "note note-" + kind.tone;
        li.innerHTML = '<button type="button" class="note-btn"><span class="note-kind"></span><span class="note-text"></span><span class="note-meta"></span></button>';
        li.querySelector(".note-kind").textContent = kind.label;
        li.querySelector(".note-text").textContent = n.text;
        li.querySelector(".note-meta").textContent = [n.from, new Date(n.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ");
        li.querySelector(".note-btn").setAttribute("aria-label", "Edit: " + n.text.slice(0, 60));
        li.querySelector(".note-btn").addEventListener("click", function () { openNote(n); });
        list.appendChild(li);
      });
  }

  function render() {
    drawJar();
    renderCount();
    renderFilter();
    renderNotes();
  }

  // ---------------- Pick one ----------------
  function pool() {
    const fromTimeline = T.store.get("timeline.entries", [])
      .filter(function (e) { return (e.tags || []).indexOf("euphoria") >= 0 && (e.text || e.title); })
      .map(function (e) { return { id: e.id, text: e.text || e.title, at: e.at, timeline: true }; });
    return notes.concat(fromTimeline);
  }

  function pick() {
    const all = pool();
    if (!all.length) return;
    const seen = T.store.get("jar.seen", {});
    // Prefer moments you haven't seen for a while.
    const ranked = all.filter(function (n) { return n.id !== lastPicked || all.length === 1; })
      .sort(function (a, b) { return (seen[a.id] || 0) - (seen[b.id] || 0); });
    const half = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
    const n = half[Math.floor(Math.random() * half.length)];
    lastPicked = n.id;
    seen[n.id] = Date.now();
    T.store.set("jar.seen", seen);

    const kind = n.timeline ? { label: "From your timeline", tone: "purple" } : (KINDS[n.kind] || KINDS.other);
    const box = $("picked");
    box.hidden = false;
    box.className = "panel picked picked-" + kind.tone;
    void box.offsetWidth; // restart the reveal animation
    box.classList.add("reveal");
    $("picked-kind").textContent = kind.label;
    $("picked-text").textContent = n.text;
    const date = new Date(n.at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    $("picked-meta").textContent = (n.from ? n.from + ", " : "") + date;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------------- Editor ----------------
  function todayValue(d) {
    d = d ? new Date(d) : new Date();
    const pad = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function openNote(n) {
    editing = n || null;
    $("note-title").textContent = n ? "Edit moment" : "Add a moment";
    const host = $("kind-pills");
    host.innerHTML = "";
    Object.keys(KINDS).forEach(function (k, i) {
      const l = document.createElement("label");
      l.innerHTML = '<input type="radio" name="kind"><span></span>';
      const input = l.querySelector("input");
      input.value = k;
      input.checked = n ? n.kind === k : i === 0;
      l.querySelector("span").textContent = KINDS[k].label;
      host.appendChild(l);
    });
    $("note-text").value = n ? n.text : "";
    $("note-from").value = n ? n.from || "" : "";
    $("note-date").value = todayValue(n ? n.at : null);
    const del = $("note-delete");
    del.hidden = !n;
    del.textContent = "Delete";
    delete del.dataset.armed;
    $("note-sheet").showModal();
  }

  $("note-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const text = $("note-text").value.trim();
    if (!text) return;
    const kindInput = document.querySelector('#kind-pills input:checked');
    const day = $("note-date").value ? new Date($("note-date").value + "T12:00") : new Date();
    const data = { kind: kindInput ? kindInput.value : "other", text: text, from: $("note-from").value.trim(), at: day.toISOString() };
    if (editing) Object.assign(editing, data);
    else {
      const n = Object.assign({ id: "j" + T.uid() }, data);
      notes.push(n);
      justAdded = n.id;
    }
    save();
    $("note-sheet").close();
    render();
    T.toast(editing ? "Saved" : "In the jar");
    if (!editing) setTimeout(confetti, 180);
  });

  /* A soft pink, white and blue spray from the jar's mouth. */
  function confetti() {
    const jar = $("jar-svg").getBoundingClientRect();
    const visible = jar.width > 0 && jar.bottom > 0 && jar.top < innerHeight;
    window.TendrilDays.confetti(visible ? jar.left + jar.width / 2 : null, visible ? jar.top + jar.height * 0.14 : null);
  }

  $("note-delete").addEventListener("click", function () {
    const del = $("note-delete");
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    notes = notes.filter(function (x) { return x !== editing; });
    save();
    $("note-sheet").close();
    render();
    T.toast("Removed from the jar");
  });

  // ---------------- Wire up ----------------
  $("add-note").addEventListener("click", function () { openNote(null); });
  $("pick-note").addEventListener("click", pick);
  $("pick-again").addEventListener("click", pick);
  $("pick-close").addEventListener("click", function () { $("picked").hidden = true; });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });
  document.querySelectorAll("dialog.sheet").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
  });

  render();
});
