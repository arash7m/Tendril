/* Tendril daily warm-up: a guided routine that moves through steps on its own.
   Relax → gentle hums → slides → resonance "ee" → speaking in range.
   Uses tendril:voice.target and tendril:resonance.target.
   Saves a summary of each warm-up in tendril:warmup.log (no audio). */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, D = window.TendrilDays, TR = window.TendrilTrace;
  const $ = function (id) { return document.getElementById(id); };
  const canvas = $("wu-canvas"), g = canvas.getContext("2d");
  const engine = window.TendrilVoiceEngine.create({ vowel: "ee" });

  // ---------------- Targets ----------------
  const target = T.store.get("voice.target", { preset: "lighter", low: 165, high: 255 });
  const tone = (function () {
    if (target.preset && target.preset !== "custom") return target.preset;
    const mid = (target.low + target.high) / 2;
    return mid > 175 ? "lighter" : mid > 140 ? "between" : "deeper";
  })();
  document.documentElement.dataset.tone = tone;
  const RZONES = {
    lighter: { low: 60, high: 101, word: "brighter" },
    between: { low: 38, high: 62, word: "in-between" },
    deeper: { low: -1, high: 40, word: "darker" }
  };
  const resPreset = (T.store.get("resonance.target", {}) || {}).preset;
  const rz = RZONES[resPreset] || RZONES[tone] || RZONES.lighter;
  const rzName = RZONES[resPreset] ? resPreset : tone;

  const VIEW_LO = Math.max(65, target.low / 1.6), VIEW_HI = Math.min(520, target.high * 1.45);
  const L = Math.log;
  function semis(a, b) { return 12 * Math.log2(a / b); }
  function inRange(hz) { return hz != null && hz >= target.low && hz <= target.high; }

  const SENTENCES = [
    "Good morning! How did you sleep?",
    "Could I get a small latte with oat milk, please?",
    "I’m running a few minutes late, sorry about that.",
    "It’s such a lovely day, let’s sit outside.",
    "Hi, this is me calling about my appointment on Friday.",
    "Do you know if the library is open on Sundays?",
    "Thank you so much, that’s really kind of you.",
    "I think I’ll take the train instead of the bus today.",
    "What are you up to this weekend?",
    "Nice to meet you, I’ve heard a lot about you."
  ];

  // ---------------- Drawing helpers ----------------
  let W = 0, H = 0, FONT = "system-ui, sans-serif";
  const C = {};
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function readColors() {
    C.tone = css("--tone") || "#FF4FA3";
    C.band = css("--tone-band") || "rgba(255,79,163,0.18)";
    C.ink = css("--ink") || "#fff";
    C.muted = css("--muted") || "#9aa";
    C.pink = "#FF4FA3"; C.blue = "#3DA9FC"; C.purple = "#9B5DE5";
    FONT = getComputedStyle(document.body).fontFamily || FONT;
  }
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function text(str, x, y, size, color, align, weight) {
    g.font = (weight || 700) + " " + size + "px " + FONT;
    g.fillStyle = color;
    g.textAlign = align || "left";
    g.textBaseline = "middle";
    g.fillText(str, x, y);
  }
  function yOf(hz) { return H * 0.08 + (H * 0.84) * (1 - (L(hz) - L(VIEW_LO)) / (L(VIEW_HI) - L(VIEW_LO))); }
  function grid() {
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, H * i / 5); g.lineTo(W, H * i / 5); g.stroke(); }
  }
  function band() {
    const top = yOf(target.high), bot = yOf(target.low);
    g.fillStyle = C.band;
    g.fillRect(0, top, W, bot - top);
    g.strokeStyle = C.tone; g.globalAlpha = 0.5; g.setLineDash([5, 6]); g.lineWidth = 1.5;
    [top, bot].forEach(function (y) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
    g.setLineDash([]); g.globalAlpha = 1;
    text(target.high + " Hz", 10, top - 10, 11, C.muted, "left", 700);
    text(target.low + " Hz", 10, bot + 11, 11, C.muted, "left", 700);
    return { top: top, bottom: bot };
  }
  function orb(x, y, r, color, on) {
    g.save();
    g.globalAlpha = on ? 1 : 0.35;
    g.shadowColor = color; g.shadowBlur = on ? 22 : 6;
    g.fillStyle = color;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.restore();
  }
  function corner(str) { if (str) text(str, W - 12, 18, 12, C.muted, "right", 800); }

  // Recent pitch readings for the trailing line: [{ t, hz }]
  let trail = [];
  function trailLine(xOf, opts) {
    return TR.draw(g, trail, Object.assign({
      key: "hz", x: xOf, y: yOf, t0: clock - 12, color: C.tone, left: 0, right: W,
      floor: VIEW_LO, extendTo: clock, band: { top: 0, bottom: H }, width: 3.5
    }, opts || {}));
  }

  // ---------------- Steps ----------------
  // Each step: name, seconds for full/short (0 = left out), mic, start(), update(dt, hz, res), draw(), result()
  const STEPS = {
    relax: {
      name: "Relax", full: 30, short: 0, mic: false,
      about: "Slow breathing, loose shoulders and jaw",
      start: function () { this.tip = -1; this.update(); },
      update: function () {
        const cyc = stepT % 10;
        setDo(cyc < 4 ? "Breathe in…" : "…and slowly out");
        const tips = ["Let your shoulders drop away from your ears.", "Unclench your jaw. Let your tongue rest.", "Roll your shoulders back, slowly, once or twice."];
        const i = Math.min(tips.length - 1, Math.floor(stepT / 10));
        if (i !== this.tip) { this.tip = i; setHow(tips[i]); }
      },
      draw: function () {
        const cyc = stepT % 10;
        const u = cyc < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * cyc / 4) : 0.5 + 0.5 * Math.cos(Math.PI * (cyc - 4) / 6);
        const cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.16, r = base + u * Math.min(W, H) * 0.2;
        for (let k = 3; k >= 1; k--) {
          g.globalAlpha = 0.08 * k;
          g.fillStyle = k % 2 ? C.blue : C.pink;
          g.beginPath(); g.arc(cx, cy, r + k * 14 * (0.6 + u), 0, 6.283); g.fill();
        }
        g.globalAlpha = 1;
        const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        grad.addColorStop(0, "#FFB3D6"); grad.addColorStop(0.55, C.pink); grad.addColorStop(1, C.purple);
        g.fillStyle = grad;
        g.shadowColor = C.pink; g.shadowBlur = 30;
        g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
        g.shadowBlur = 0;
        text(cyc < 4 ? "in" : "out", cx, cy, Math.max(16, r * 0.32), "#fff", "center", 800);
      },
      result: function () { return null; }
    },

    hum: {
      name: "Gentle hums", full: 45, short: 30, mic: true,
      about: "Wake the voice up on “mmm”, no target yet",
      start: function () {
        this.voiced = 0;
        setDo("Hum on “mmm”");
        setHow("Lips closed, light and easy. Feel the buzz on your lips and nose. Wander up and down if it feels nice.");
      },
      update: function (dt, hz) { if (hz != null) this.voiced += dt; },
      draw: function (hz) {
        grid();
        const X = W * 0.78, PX = X / 6;
        trailLine(function (t) { return X + (t - clock) * PX; });
        if (hz != null) orb(X, yOf(hz), 11, C.tone, true);
        else orb(X, yOf(VIEW_LO) - 4, 8, C.tone, false);
        corner(Math.round(this.voiced) + " s humming");
        if (phase === "run" && stepT > 4 && this.voiced < 0.5) text("Can’t hear you yet. Hum a little louder", W / 2, H - 22, 13, C.muted, "center");
      },
      result: function () { return "Hums: " + Math.round(this.voiced) + " s of humming"; },
      data: function () { return { secs: Math.round(this.voiced) }; }
    },

    slide: {
      name: "Slides", full: 60, short: 40, mic: true,
      about: "Follow a line that glides up and down, like a siren",
      start: function () {
        this.on = 0; this.voiced = 0;
        this.lo = Math.max(VIEW_LO * 1.1, target.low / 1.3);
        this.hi = Math.min(VIEW_HI * 0.92, target.high * 1.1);
        setDo("Slide like a siren: “wooo”");
        setHow("Follow the line up and down on “oo” or a lip trill. Keep it light; it doesn’t need to be perfect.");
      },
      guide: function (t) {
        const u = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.max(0, t) / 7);
        return this.lo * Math.pow(this.hi / this.lo, u);
      },
      update: function (dt, hz) {
        if (hz == null) return;
        this.voiced += dt;
        if (Math.abs(semis(hz, this.guide(stepT))) <= 3) this.on += dt;
      },
      draw: function (hz) {
        grid();
        const self = this, XP = W * 0.3, PX = W / 6.5, t0 = stepT;
        // The guide line, scrolling right to left
        g.lineCap = "round"; g.lineJoin = "round";
        [[22, 0.16], [4, 0.9]].forEach(function (s) {
          g.strokeStyle = s[0] > 10 ? C.blue : "#A8DBFF";
          g.globalAlpha = s[1];
          g.lineWidth = s[0];
          g.beginPath();
          for (let x = 0; x <= W; x += 4) {
            const tt = t0 + (x - XP) / PX;
            const y = yOf(self.guide(tt));
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        });
        g.globalAlpha = 1;
        // Playhead
        g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(XP, 0); g.lineTo(XP, H); g.stroke();
        // Your voice, trailing behind the playhead
        trailLine(function (t) { return XP + (t - clock) * PX; });
        const near = hz != null && Math.abs(semis(hz, this.guide(stepT))) <= 3;
        if (hz != null) orb(XP, yOf(hz), 10, near ? C.tone : "#fff", true);
        orb(XP, yOf(this.guide(stepT)), 5, "#A8DBFF", true);
        corner(this.voiced > 1 ? Math.round(100 * this.on / this.voiced) + "% on the line" : "");
      },
      result: function () { return this.voiced > 2 ? "Slides: " + Math.round(100 * this.on / this.voiced) + "% on the line" : "Slides: not enough voice to measure"; },
      data: function () { return { pct: this.voiced > 2 ? Math.round(100 * this.on / this.voiced) : null }; }
    },

    ee: {
      name: "Resonance “ee”", full: 45, short: 0, mic: true,
      about: "Hold an “ee” and find your resonance zone",
      start: function () {
        this.inZone = 0; this.measured = 0; this.shown = null;
        engine.measureResonance(true);
        const doText = { lighter: "Hold a bright, smiley “eee”", between: "Hold a relaxed, easy “eee”", deeper: "Hold a warm, open “eee”" };
        const how = {
          lighter: "Tongue high and forward, a little smile, like a small dog panting. Breathe whenever you need to.",
          between: "Find a comfortable middle between bright and dark. Breathe whenever you need to.",
          deeper: "Let the back of your throat open, like the start of a yawn. Breathe whenever you need to."
        };
        setDo(doText[rzName]); setHow(how[rzName]);
      },
      stop: function () { engine.measureResonance(false); },
      update: function (dt, hz, res) {
        if (res == null) return;
        this.measured += dt;
        if (res >= rz.low && res <= rz.high) this.inZone += dt;
      },
      draw: function (hz, res) {
        const pad = 26, x0 = pad, x1 = W - pad, y = H * 0.48, h = 26;
        const X = function (v) { return x0 + (x1 - x0) * Math.max(0, Math.min(100, v)) / 100; };
        const grad = g.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, C.blue); grad.addColorStop(0.5, C.purple); grad.addColorStop(1, C.pink);
        g.fillStyle = grad; g.globalAlpha = 0.35;
        roundRect(x0, y - h / 2, x1 - x0, h, h / 2); g.fill();
        g.globalAlpha = 1;
        // Target zone
        g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.setLineDash([6, 5]);
        roundRect(X(rz.low), y - h / 2 - 8, X(rz.high) - X(rz.low), h + 16, 10); g.stroke();
        g.setLineDash([]);
        text("your zone", (X(rz.low) + X(rz.high)) / 2, y - h / 2 - 22, 12, C.ink, "center", 800);
        text("Darker", x0, y + h / 2 + 22, 12, C.muted, "left", 800);
        text("Brighter", x1, y + h / 2 + 22, 12, C.muted, "right", 800);
        // Needle
        if (res != null) this.shown = this.shown == null ? res : this.shown + (res - this.shown) * 0.18;
        if (this.shown != null) {
          const nx = X(this.shown), on = res != null;
          g.globalAlpha = on ? 1 : 0.3;
          g.fillStyle = "#fff"; g.shadowColor = C.tone; g.shadowBlur = on ? 18 : 0;
          roundRect(nx - 4, y - h / 2 - 12, 8, h + 24, 4); g.fill();
          g.shadowBlur = 0; g.globalAlpha = 1;
        }
        const inside = res != null && res >= rz.low && res <= rz.high;
        text(res == null ? (this.measured < 0.5 && phase === "run" && stepT > 3 ? "Say a long “eeee”" : " ") : inside ? "In your zone" : (res < rz.low ? "A little " + (rzName === "deeper" ? "more open" : "brighter") : "A little darker"),
          W / 2, H * 0.78, 18, inside ? C.tone : C.ink, "center", 800);
        corner(this.measured > 1 ? Math.round(100 * this.inZone / this.measured) + "% in zone" : "");
      },
      result: function () { return this.measured > 2 ? "“Ee”: " + Math.round(100 * this.inZone / this.measured) + "% in your " + rz.word + " zone" : "“Ee”: not enough voice to measure"; },
      data: function () { return { pct: this.measured > 2 ? Math.round(100 * this.inZone / this.measured) : null }; }
    },

    speak: {
      name: "Speak in range", full: 60, short: 40, mic: true,
      about: "Read a few sentences while the graph shows your range",
      start: function () {
        this.voiced = 0; this.inside = 0; this.logSum = 0;
        this.every = plan.length > 3 ? 12 : 13;
        this.si = (new Date().getDate() * 3) % SENTENCES.length;
        this.shownAt = 0;
        setDo("Say it in your range");
        setHow("Read the sentence below in your target voice. Take your time; a new one appears every few seconds, or tap it for the next.");
        showSentence(this.si);
      },
      stop: function () { $("wu-sentence").hidden = true; },
      next: function () { this.si = (this.si + 1) % SENTENCES.length; this.shownAt = stepT; showSentence(this.si); },
      update: function (dt, hz) {
        if (stepT - this.shownAt >= this.every) this.next();
        if (hz == null) return;
        this.voiced += dt; this.logSum += Math.log(hz) * dt;
        if (inRange(hz)) this.inside += dt;
      },
      draw: function (hz) {
        grid();
        const b = band(), X = W - 16, PX = (W - 30) / 8;
        trailLine(function (t) { return X + (t - clock) * PX; }, { band: b });
        if (hz != null) orb(X, yOf(hz), 8, inRange(hz) ? C.tone : "#fff", true);
        corner(this.voiced > 1 ? Math.round(100 * this.inside / this.voiced) + "% in range" : "");
      },
      result: function () {
        if (this.voiced < 2) return "Speaking: not enough voice to measure";
        return "Speaking: " + Math.round(100 * this.inside / this.voiced) + "% in range · average " + Math.round(Math.exp(this.logSum / this.voiced)) + " Hz";
      },
      data: function () { return this.voiced < 2 ? { pct: null } : { pct: Math.round(100 * this.inside / this.voiced), avg: Math.round(Math.exp(this.logSum / this.voiced)) }; }
    }
  };
  const ORDER = ["relax", "hum", "slide", "ee", "speak"];

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---------------- Text on the page ----------------
  const shown = {};
  function setText(id, s) { if (shown[id] !== s) { shown[id] = s; $(id).textContent = s; } }
  function setDo(s) { setText("wu-do", s); }
  function setHow(s) { setText("wu-how", s); }
  function showSentence(i) { const el = $("wu-sentence"); el.hidden = false; el.textContent = SENTENCES[i]; el.classList.remove("fresh"); void el.offsetWidth; el.classList.add("fresh"); }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  // ---------------- Log, streak, calendar ----------------
  function log() { return T.store.get("warmup.log", []); }
  function dayKey(d) { const x = new Date(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); }
  function daysSet(list) { const s = {}; list.forEach(function (h) { s[dayKey(h.at)] = true; }); return s; }
  function streakInfo() {
    const set = daysSet(log());
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const doneToday = !!set[dayKey(today)];
    let n = 0;
    const d = new Date(today);
    if (!doneToday) d.setDate(d.getDate() - 1);
    while (set[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    // Longest run ever
    const keys = Object.keys(set).map(function (k) { const p = k.split("-"); return new Date(+p[0], p[1] - 1, +p[2], 12).getTime(); }).sort(function (a, b) { return a - b; });
    let best = 0, run = 0, prev = null;
    keys.forEach(function (t) { run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    return { n: n, doneToday: doneToday, best: best, total: keys.length };
  }

  const FLAME = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 1-9z" fill="url(#fl)"/><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3DA9FC"/><stop offset=".55" stop-color="#9B5DE5"/><stop offset="1" stop-color="#FF4FA3"/></linearGradient></defs></svg>';
  function renderStreak(host) {
    const s = streakInfo();
    host.innerHTML = '<span class="st-flame">' + FLAME + '</span><span class="st-n"></span><span class="st-sub"></span>';
    host.querySelector(".st-n").textContent = s.n + (s.n === 1 ? " day" : " days");
    host.querySelector(".st-sub").textContent = s.doneToday
      ? (s.n > 1 ? "Streak going strong. See you tomorrow" : "Done today. See you tomorrow")
      : s.n ? "Warm up today to keep your streak" : (s.total ? "Start a new streak today" : "Your first warm-up starts a streak");
    if (s.best > s.n && s.best > 1) host.querySelector(".st-sub").textContent += " · Longest: " + s.best + " days";
    host.classList.toggle("is-on", s.n > 0);
  }

  function renderCal(host) {
    const warm = daysSet(log());
    const other = daysSet(T.store.get("voice.history", []).concat(T.store.get("resonance.history", []), T.store.get("games.plays", [])));
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const start = new Date(monday); start.setDate(monday.getDate() - 21);
    host.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const h = document.createElement("span");
      h.className = "cal-h";
      h.textContent = d.toLocaleDateString(undefined, { weekday: "narrow" });
      host.appendChild(h);
    }
    for (let i = 0; i < 28; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dayKey(d), c = document.createElement("span");
      c.className = "cal-d" + (warm[k] ? " warm" : other[k] ? " other" : "") + (k === dayKey(today) ? " today" : "") + (d > today ? " future" : "");
      c.title = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + (warm[k] ? " · warm-up" : other[k] ? " · voice practice" : "");
      c.textContent = d.getDate();
      host.appendChild(c);
    }
  }

  // ---------------- Start screen ----------------
  let len = T.store.get("warmup.len", "full") === "short" ? "short" : "full";
  function planFor(l) { return ORDER.filter(function (id) { return STEPS[id][l] > 0; }).map(function (id) { return { id: id, dur: STEPS[id][l] }; }); }
  function renderStart() {
    document.querySelectorAll("[data-len]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.len === len ? "true" : "false"); });
    const list = $("wu-steps");
    list.innerHTML = "";
    let total = 0;
    planFor(len).forEach(function (p) {
      total += p.dur;
      const li = document.createElement("li");
      li.innerHTML = "<strong></strong><span></span><em></em>";
      li.querySelector("strong").textContent = STEPS[p.id].name;
      li.querySelector("span").textContent = STEPS[p.id].about;
      li.querySelector("em").textContent = p.dur + " s";
      list.appendChild(li);
    });
    const s = streakInfo();
    $("wu-today").innerHTML = "";
    const h = document.createElement("h2");
    h.textContent = s.doneToday ? "Done for today ✓" : "Today’s warm-up";
    const p = document.createElement("p");
    p.className = "small muted";
    p.textContent = (s.doneToday ? "Another round is always welcome. " : "") + "About " + Math.round(total / 60) + " minutes, with a short pause to get ready before each step.";
    $("wu-today").appendChild(h); $("wu-today").appendChild(p);
    $("wu-go").textContent = s.doneToday ? "Warm up again" : "Start warm-up";
    renderStreak($("wu-streak"));
    renderCal($("wu-cal"));
  }
  document.querySelectorAll("[data-len]").forEach(function (b) {
    b.addEventListener("click", function () { len = b.dataset.len; T.store.set("warmup.len", len); renderStart(); });
  });

  // ---------------- Running ----------------
  let plan = [], idx = 0, stepT = 0, readyT = 0, clock = 0, phase = "idle", raf = 0, lastT = 0, step = null, doneSecs = 0;

  async function begin() {
    $("wu-notice").hidden = true;
    plan = planFor(len);
    try { await engine.start(); }
    catch (e) {
      $("wu-notice").textContent = e && e.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow the microphone for Tendril in your browser settings."
        : "The microphone couldn’t start. Check that no other app is using it.";
      $("wu-notice").hidden = false;
      return;
    }
    $("wu-start").hidden = true;
    $("wu-done").hidden = true;
    $("wu-stage").hidden = false;
    readColors();
    resize();
    buildProgress();
    clock = 0; doneSecs = 0; trail = [];
    enterStep(0);
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    $("wu-stage").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildProgress() {
    const host = $("wu-progress");
    host.innerHTML = "";
    plan.forEach(function (p) {
      const s = document.createElement("span");
      s.style.flexGrow = p.dur;
      s.appendChild(document.createElement("i"));
      host.appendChild(s);
    });
  }
  function paintProgress() {
    const segs = $("wu-progress").children;
    for (let i = 0; i < segs.length; i++) {
      const f = i < idx ? 1 : i > idx ? 0 : Math.min(1, stepT / plan[idx].dur);
      segs[i].firstChild.style.transform = "scaleX(" + f + ")";
    }
  }

  function enterStep(i) {
    if (step && step.stop) step.stop();
    idx = i;
    if (idx >= plan.length) { complete(); return; }
    step = STEPS[plan[idx].id];
    stepT = 0;
    readyT = idx === 0 ? 2 : 3;
    phase = "ready";
    setText("wu-stepname", "Step " + (idx + 1) + " of " + plan.length + " · " + step.name);
    step.start();
    $("wu-skip").textContent = idx === plan.length - 1 ? "Finish" : "Next step";
  }

  function loop(now) {
    if (phase !== "ready" && phase !== "run") return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    clock += dt;
    const hz = step.mic ? engine.poll() : null;
    const res = step.mic ? engine.resonance() : null;
    if (step.mic) { trail.push({ t: clock, hz: hz }); if (trail.length > 900) trail.splice(0, trail.length - 900); }

    if (phase === "ready") {
      readyT -= dt;
      $("wu-ready").hidden = false;
      setText("wu-ready-n", String(Math.max(1, Math.ceil(readyT))));
      if (readyT <= 0) { phase = "run"; $("wu-ready").hidden = true; }
    } else {
      stepT += dt;
      doneSecs += dt;
      step.update(dt, hz, res);
    }
    setText("wu-time", mmss(plan[idx].dur - stepT));
    paintProgress();
    g.clearRect(0, 0, W, H);
    step.draw(hz, res);
    if (phase === "run" && stepT >= plan[idx].dur) enterStep(idx + 1);
  }

  function pause() {
    if (phase !== "ready" && phase !== "run") return;
    phase = "paused:" + phase;
    cancelAnimationFrame(raf);
    engine.stop();
    $("wu-pause").hidden = false;
  }
  async function resume() {
    if (phase.indexOf("paused:") !== 0) return;
    try { await engine.start(); } catch (e) { /* the mic steps will just show no voice */ }
    if (step === STEPS.ee) engine.measureResonance(true);
    $("wu-pause").hidden = true;
    phase = phase.slice(7);
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function results() {
    const lines = [], data = {};
    plan.slice(0, idx + 1).forEach(function (p) {
      const s = STEPS[p.id];
      const r = s.result();
      if (r) lines.push(r);
      if (s.data) data[p.id] = s.data();
    });
    return { lines: lines, data: data };
  }

  function complete() {
    phase = "done";
    cancelAnimationFrame(raf);
    engine.stop();
    const r = results();
    const entry = { at: new Date().toISOString(), len: len, secs: Math.round(doneSecs), steps: r.data };
    const l = log();
    l.unshift(entry);
    T.store.set("warmup.log", l.slice(0, 400));
    $("wu-stage").hidden = true;
    $("wu-done").hidden = false;
    const s = streakInfo();
    $("wu-done-h").textContent = s.n >= 7 ? "A whole week and more. Amazing" : s.n >= 3 ? "Look at you go" : "Nice work";
    renderStreak($("wu-done-streak"));
    const ul = $("wu-results");
    ul.innerHTML = "";
    r.lines.forEach(function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    renderCal($("wu-done-cal"));
    $("wu-done").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(function () { D.confettiFrom($("wu-done-streak"), { count: 70, stagger: 0.3 }); }, 350);
  }

  function quit() {
    // Count it if most of the warm-up was done; otherwise just go back.
    const total = plan.reduce(function (a, p) { return a + p.dur; }, 0);
    if (doneSecs >= total * 0.6) { if (step && step.stop) step.stop(); complete(); return; }
    if (step && step.stop) step.stop();
    phase = "idle";
    cancelAnimationFrame(raf);
    engine.stop();
    $("wu-pause").hidden = true;
    $("wu-stage").hidden = true;
    $("wu-start").hidden = false;
    renderStart();
    T.toast("Warm-up ended early, so it isn’t counted. Any practice still helps!");
  }

  $("wu-go").addEventListener("click", begin);
  $("wu-pausebtn").addEventListener("click", pause);
  $("wu-resume").addEventListener("click", resume);
  $("wu-quit").addEventListener("click", quit);
  $("wu-skip").addEventListener("click", function () {
    if (phase === "ready" || phase === "run") {
      doneSecs += Math.max(0, plan[idx].dur - stepT) * 0.5; // skipping still counts for something
      enterStep(idx + 1);
    }
  });
  $("wu-sentence").addEventListener("click", function () { if (step === STEPS.speak && phase === "run") STEPS.speak.next(); });
  $("wu-close").addEventListener("click", function () {
    $("wu-done").hidden = true;
    $("wu-start").hidden = false;
    renderStart();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener("resize", function () { if (!$("wu-stage").hidden) resize(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") pause(); });

  renderStart();
  // Opened from the home screen's "Start today's warm-up"
  if (location.hash === "#start") history.replaceState(null, "", location.pathname);
});
