/* Tendril resonance practice: live brighter/darker meter, target zone,
   guided exercises and session history (tendril:resonance.*).
   Depends on common.js, pitch.js and formants.js. All processing is on-device. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, P = window.TendrilPitch, F = window.TendrilFormants;
  const $ = function (id) { return document.getElementById(id); };

  // Zones on the 0-100 scale. They overlap a little on purpose: voices sit on a spectrum.
  const ZONES = {
    lighter: { label: "Brighter", low: 62, high: 130 },
    between: { label: "In-between", low: 35, high: 68 },
    deeper: { label: "Darker", low: -30, high: 38 }
  };
  const Y_MIN = -20, Y_MAX = 120, LIVE_WINDOW = 12;

  const EXERCISES = [
    { dir: "Brighter", vowel: "ee", title: "Big dog, small dog",
      steps: ["Pant like a big dog with your mouth open: slow and deep.", "Now pant like a tiny dog: quick and light. Notice your tongue and the back of your throat rise and the space inside gets smaller.", "Keep that small-dog shape and say a light “ee”. Watch the meter move toward Brighter."] },
    { dir: "Brighter", vowel: "ee", title: "Whisper slide",
      steps: ["Whisper “ee” and slide it from low to high, like a little siren.", "Feel the space in your throat shrink as it rises. Stop near the top where it still feels easy.", "Keep that shape and slowly add a little voice to the “ee”."] },
    { dir: "Brighter", vowel: "speech", title: "Forward hum",
      steps: ["Hum “mmm” and feel the buzz on your lips and nose.", "Open the hum into “mee, may, mah”, keeping the buzz up front.", "Say the sentence below, aiming to keep that forward feeling."],
      say: "My mom made me a lemon meringue pie." },
    { dir: "Any", vowel: "speech", title: "Hold it while talking",
      steps: ["Find your target zone on a held “ee” first.", "Without changing that feeling, read the sentence below slowly.", "Then read it again a bit faster. It’s normal for the meter to dip; aim to bring it back each time."],
      say: "Could you tell me where the nearest bookshop is, please?" },
    { dir: "Darker", vowel: "ah", title: "Yawn and sigh",
      steps: ["Start a yawn and notice the back of your throat opening and lowering.", "Before the yawn finishes, let out a relaxed sigh on “ah”.", "Keep that open space and say “ah” again without the yawn. Watch the meter move toward Darker."] },
    { dir: "Darker", vowel: "oo", title: "Round and low",
      steps: ["Round your lips slightly, as if saying “who”.", "Say a relaxed “oo”, letting your tongue sit low and back.", "Slide from “oo” to “oh” to “ah” while keeping that roomy, rounded feeling."] }
  ];

  // ---------------- State ----------------
  let target = T.store.get("resonance.target", { preset: "lighter" });
  let vowel = T.store.get("resonance.vowel", "ee");
  let points = [];   // { t, v } with v on the 0-100 scale, or null when silent
  let mode = "example";
  let sessionZone = null;
  let audio = null, rafId = 0, frame = 0, startedAt = 0;
  let pitchSmooth = P.makeSmoother(5), formSmooth = F.makeSmoother(7);
  let showNumbers = false;
  let exIndex = 0;

  const canvas = $("graph"), g = canvas.getContext("2d");

  function zone() { return sessionZone || ZONES[target.preset] || ZONES.lighter; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function wordFor(v) { return v >= 62 ? "Brighter" : v <= 38 ? "Darker" : "In-between"; }

  // ---------------- Drawing ----------------
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const padL = 44, padR = 10, padT = 10, padB = 24;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const y = function (v) { return padT + plotH * (1 - (Math.max(Y_MIN, Math.min(Y_MAX, v)) - Y_MIN) / (Y_MAX - Y_MIN)); };
    const z = zone();

    g.clearRect(0, 0, w, h);
    g.fillStyle = cssVar("--surface");
    g.fillRect(0, 0, w, h);
    g.fillStyle = cssVar("--tone-band");
    g.fillRect(padL, y(Math.min(Y_MAX, z.high)), plotW, y(Math.max(Y_MIN, z.low)) - y(Math.min(Y_MAX, z.high)));

    g.font = "11px " + cssVar("--font-mono");
    g.textAlign = "right";
    g.textBaseline = "middle";
    [0, 50, 100].forEach(function (v) {
      g.strokeStyle = cssVar("--line");
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(padL, Math.round(y(v)) + 0.5);
      g.lineTo(w - padR, Math.round(y(v)) + 0.5);
      g.stroke();
      g.fillStyle = cssVar("--muted");
      g.fillText(String(v), padL - 8, y(v));
    });

    let t0, t1;
    const lastT = points.length ? points[points.length - 1].t : 0;
    if (mode === "live") { t1 = Math.max(LIVE_WINDOW, lastT); t0 = t1 - LIVE_WINDOW; }
    else { t0 = 0; t1 = Math.max(lastT, 1); }
    const x = function (t) { return padL + plotW * ((t - t0) / (t1 - t0)); };

    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = cssVar("--muted");
    const span = t1 - t0;
    const step = span <= 15 ? 2 : span <= 40 ? 5 : span <= 120 ? 15 : 30;
    for (let s = Math.ceil(t0 / step) * step; s <= t1; s += step) g.fillText(s + "s", x(s), h - padB + 6);

    const tone = cssVar("--tone");
    g.lineWidth = 2.5;
    g.lineJoin = "round";
    g.lineCap = "round";
    let prev = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.t < t0 - 0.2 || p.v == null) { prev = null; continue; }
      if (prev && p.t - prev.t < 0.3) {
        g.strokeStyle = tone;
        g.globalAlpha = p.v >= z.low && p.v <= z.high ? 1 : 0.35;
        g.beginPath();
        g.moveTo(x(prev.t), y(prev.v));
        g.lineTo(x(p.t), y(p.v));
        g.stroke();
        g.globalAlpha = 1;
      }
      prev = p;
    }
  }

  // ---------------- Meter + readout ----------------
  function meterPos(v) { return Math.max(0, Math.min(100, v)); }

  function paintZone() {
    const z = zone();
    const lo = meterPos(z.low), hi = meterPos(z.high);
    $("meter-zone").style.left = lo + "%";
    $("meter-zone").style.width = (hi - lo) + "%";
  }

  function setReadout(v) {
    const status = $("status"), needle = $("meter-needle");
    if (v == null) {
      $("score").textContent = "—";
      $("res-word").textContent = mode === "live" ? "Listening…" : "Ready";
      $("res-word").dataset.word = "";
      status.textContent = mode === "live" ? "Listening…" : "Ready";
      status.dataset.state = "idle";
      needle.classList.add("off");
      return;
    }
    const z = zone();
    $("score").textContent = Math.round(meterPos(v));
    $("res-word").textContent = wordFor(v);
    $("res-word").dataset.word = v >= 62 ? "bright" : v <= 38 ? "dark" : "mid";
    needle.classList.remove("off");
    needle.style.left = meterPos(v) + "%";
    if (v < z.low) { status.textContent = "Darker than zone"; status.dataset.state = "low"; }
    else if (v > z.high) { status.textContent = "Brighter than zone"; status.dataset.state = "high"; }
    else { status.textContent = "In zone"; status.dataset.state = "in"; }
  }

  function computeStats(pts) {
    const vals = pts.filter(function (p) { return p.v != null; }).map(function (p) { return p.v; });
    if (vals.length < 5) return null;
    const z = zone();
    const sorted = vals.slice().sort(function (a, b) { return a - b; });
    const pick = function (q) { return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]; };
    const span = pts.length > 1 ? pts[pts.length - 1].t / (pts.length - 1) : 0;
    return {
      avg: vals.reduce(function (a, b) { return a + b; }, 0) / vals.length,
      inZone: vals.filter(function (v) { return v >= z.low && v <= z.high; }).length / vals.length,
      low: pick(0.05), high: pick(0.95), voicedSec: vals.length * span
    };
  }

  function renderStats() {
    const s = computeStats(points);
    const fmt = function (v) { return Math.round(meterPos(v)) + ""; };
    $("stat-avg").textContent = s ? fmt(s.avg) : "—";
    $("stat-in").textContent = s ? Math.round(s.inZone * 100) + "%" : "—";
    $("stat-low").textContent = s ? fmt(s.low) : "—";
    $("stat-high").textContent = s ? fmt(s.high) : "—";
  }

  // ---------------- Example (first view) ----------------
  function buildExample() {
    const pts = [];
    for (let t = 0; t <= 11.8; t += 1 / 30) {
      const on = (t % 3) < 2.4 && t > 0.3;
      pts.push({ t: t, v: on ? 64 + 14 * Math.sin(t * 1.3) + 3 * Math.sin(t * 9) - (t % 3) * 6 : null });
    }
    return pts;
  }

  // ---------------- Live analysis ----------------
  async function start() {
    $("notice").hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotice("This browser can’t use the microphone here.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      showNotice(err && err.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow the microphone for Tendril in your browser settings."
        : "Couldn’t start the microphone. Check that no other app is using it.");
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audio = { ctx: ctx, stream: stream, analyser: analyser, buf: new Float32Array(2048) };
    pitchSmooth = P.makeSmoother(5);
    formSmooth = F.makeSmoother(7);
    mode = "live";
    sessionZone = null;
    openId = null;
    paintZone();
    points = [];
    frame = 0;
    startedAt = performance.now();
    $("example-chip").hidden = true;
    $("graph-label").textContent = "Your voice, live";
    $("start").hidden = true;
    $("stop").hidden = false;
    setReadout(null);
    renderStats();
    renderHistory();
    loop();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    frame++;
    if (frame % 2) return;
    audio.analyser.getFloatTimeDomainData(audio.buf);
    const r = P.detectPitch(audio.buf, audio.ctx.sampleRate);
    const voiced = r && r.clarity > 0.8;
    const hz = pitchSmooth(voiced ? r.hz : null);
    const f = formSmooth(voiced ? F.analyze(audio.buf, audio.ctx.sampleRate) : null);
    const v = f ? F.brightness(f, vowel) * 100 : null;
    const t = (performance.now() - startedAt) / 1000;
    points.push({ t: t, v: v });
    setReadout(v);
    if (showNumbers && frame % 6 === 0) {
      $("res-details").textContent = f
        ? "Pitch " + (hz ? Math.round(hz) : "—") + " Hz · F1 " + Math.round(f[0]) + " · F2 " + Math.round(f[1]) + " · F3 " + Math.round(f[2])
        : "Pitch — · F1 — · F2 — · F3 —";
    }
    $("timer").textContent = formatTime(t);
    if (frame % 10 === 0) renderStats();
    draw();
  }

  function stop() {
    cancelAnimationFrame(rafId);
    const entry = saveSession();
    if (audio) {
      audio.stream.getTracks().forEach(function (tr) { tr.stop(); });
      audio.ctx.close();
      audio = null;
    }
    $("start").hidden = false;
    $("stop").hidden = true;
    if (entry) {
      openSession(entry, { scroll: false });
      T.toast("Session saved");
    } else {
      mode = "done";
      $("graph-label").textContent = "Not saved: too short";
      setReadout(null);
      $("status").textContent = "Stopped";
      renderStats();
      draw();
      T.toast("Too short to save. Hold a sound for a few seconds next time.");
    }
  }

  // ---------------- History ----------------
  let openId = null;

  function packTrace(pts) {
    const dur = pts.length ? pts[pts.length - 1].t : 0;
    let dt = 0.1;
    while (dur / dt > 2400) dt *= 2;
    const n = Math.max(1, Math.ceil(dur / dt) + 1);
    const sum = new Float64Array(n), cnt = new Uint16Array(n);
    pts.forEach(function (p) {
      if (p.v == null) return;
      const k = Math.min(n - 1, Math.round(p.t / dt));
      sum[k] += p.v; cnt[k]++;
    });
    const v = [];
    for (let k = 0; k < n; k++) v.push(cnt[k] ? Math.round(sum[k] / cnt[k]) : null);
    return { dt: dt, v: v };
  }

  function saveSession() {
    const s = computeStats(points);
    if (!s || s.voicedSec < 1) return null;
    const z = zone();
    const entry = {
      id: T.uid(), at: new Date().toISOString(), vowel: vowel,
      avg: Math.round(meterPos(s.avg)), inZone: Math.round(s.inZone * 100),
      zone: [z.low, z.high], zoneName: z.label,
      seconds: Math.round(points.length ? points[points.length - 1].t : 0),
      trace: packTrace(points)
    };
    const history = T.store.get("resonance.history", []);
    history.unshift(entry);
    T.store.set("resonance.history", history.slice(0, 60));
    return entry;
  }

  function whenText(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function renderHistory() {
    const list = $("history"), history = T.store.get("resonance.history", []);
    list.innerHTML = "";
    $("history-empty").hidden = history.length > 0;
    $("clear-history").hidden = history.length === 0;
    history.slice(0, 20).forEach(function (h) {
      const li = document.createElement("li");
      li.innerHTML =
        '<button type="button" class="h-open">' +
          '<span class="h-when"><strong></strong><span></span></span>' +
          '<span class="h-num"><span class="h-val"></span><span class="h-lab">average</span></span>' +
          '<span class="h-num"><span class="h-val"></span><span class="h-lab">in zone</span></span>' +
          '<svg class="h-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>';
      const btn = li.querySelector(".h-open");
      if (h.id === openId) btn.setAttribute("aria-current", "true");
      li.querySelector(".h-when strong").textContent = whenText(h.at);
      li.querySelector(".h-when > span").textContent = (F.REF[h.vowel] ? F.REF[h.vowel].label : "") + " · " + h.zoneName + " · " + formatTime(h.seconds);
      const vals = li.querySelectorAll(".h-val");
      vals[0].textContent = h.avg;
      vals[1].textContent = h.inZone + "%";
      btn.addEventListener("click", function () { openSession(h); });
      list.appendChild(li);
    });
  }

  function openSession(h, opts) {
    if (audio) stop();
    mode = "session";
    openId = h.id;
    sessionZone = { label: h.zoneName, low: h.zone[0], high: h.zone[1] };
    points = h.trace.v.map(function (v, k) { return { t: k * h.trace.dt, v: v }; });
    $("example-chip").hidden = true;
    $("graph-label").textContent = whenText(h.at);
    $("timer").textContent = formatTime(h.seconds);
    paintZone();
    const s = computeStats(points);
    setReadout(s ? s.avg : null);
    $("status").textContent = "Average";
    $("status").dataset.state = "idle";
    renderStats();
    draw();
    renderHistory();
    if (!opts || opts.scroll !== false) document.querySelector(".monitor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------- Target, vowel, exercises ----------------
  function applyTarget(preset, save) {
    target = { preset: preset };
    sessionZone = null;
    document.documentElement.dataset.tone = preset;
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.preset === preset ? "true" : "false");
    });
    const z = ZONES[preset];
    $("target-readout").textContent = z.label + " zone: " + Math.max(0, z.low) + " to " + Math.min(100, z.high) + " on the scale";
    if (save) T.store.set("resonance.target", target);
    paintZone();
    renderStats();
    draw();
  }

  function setVowel(v, save) {
    vowel = F.REF[v] ? v : "ee";
    document.querySelectorAll('#vowel-pills input').forEach(function (r) { r.checked = r.value === vowel; });
    formSmooth = F.makeSmoother(7);
    if (save) T.store.set("resonance.vowel", vowel);
  }

  function showExercise() {
    const ex = EXERCISES[exIndex];
    $("ex-dir").textContent = ex.dir === "Any" ? "Any direction" : "For " + ex.dir.toLowerCase();
    $("ex-title").textContent = ex.title;
    const steps = $("ex-steps");
    steps.innerHTML = "";
    ex.steps.forEach(function (s) { const li = document.createElement("li"); li.textContent = s; steps.appendChild(li); });
    $("ex-say").hidden = !ex.say;
    $("ex-say").textContent = ex.say || "";
    $("ex-count").textContent = (exIndex + 1) + " of " + EXERCISES.length;
    $("ex-prev").disabled = exIndex === 0;
    setVowel(ex.vowel, true);
  }

  function firstExerciseFor(preset) {
    const dir = preset === "deeper" ? "Darker" : "Brighter";
    const i = EXERCISES.findIndex(function (e) { return e.dir === dir; });
    return i < 0 ? 0 : i;
  }

  // ---------------- Helpers ----------------
  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function showNotice(msg) { $("notice").textContent = msg; $("notice").hidden = false; }

  // ---------------- Wire up ----------------
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", stop);
  document.querySelectorAll("[data-preset]").forEach(function (b) {
    b.addEventListener("click", function () {
      applyTarget(b.dataset.preset, true);
      exIndex = firstExerciseFor(b.dataset.preset);
      showExercise();
    });
  });
  document.querySelectorAll('#vowel-pills input').forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) setVowel(r.value, true); });
  });
  $("ex-next").addEventListener("click", function () { exIndex = (exIndex + 1) % EXERCISES.length; showExercise(); });
  $("ex-prev").addEventListener("click", function () { if (exIndex > 0) { exIndex--; showExercise(); } });
  $("details-btn").addEventListener("click", function () {
    showNumbers = !showNumbers;
    $("res-details").hidden = !showNumbers;
    $("details-btn").textContent = showNumbers ? "Hide numbers" : "Show numbers";
    $("details-btn").setAttribute("aria-pressed", showNumbers ? "true" : "false");
  });
  const clearBtn = $("clear-history"), confirmBox = $("confirm-clear");
  clearBtn.addEventListener("click", function () { confirmBox.hidden = false; clearBtn.hidden = true; });
  $("confirm-no").addEventListener("click", function () { confirmBox.hidden = true; clearBtn.hidden = false; });
  $("confirm-yes").addEventListener("click", function () {
    T.store.remove("resonance.history");
    confirmBox.hidden = true;
    openId = null;
    renderHistory();
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && audio) stop(); });
  window.addEventListener("pagehide", function () { if (audio) stop(); });
  window.addEventListener("resize", resizeCanvas);

  // First view
  points = buildExample();
  applyTarget(ZONES[target.preset] ? target.preset : "lighter", false);
  exIndex = firstExerciseFor(target.preset);
  showExercise();
  setVowel(vowel, false);
  renderHistory();
  renderStats();
  const ex = computeStats(points);
  if (ex) { setReadout(ex.avg); $("status").textContent = "Example"; $("status").dataset.state = "idle"; }
  resizeCanvas();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
});
