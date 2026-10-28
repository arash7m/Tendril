/* Tendril voice practice: live pitch graph, target range, prompts and session history.
   Depends on pitch.js and common.js. All processing happens on this device. */
Tendril.ready(function () {
  "use strict";

  const P = window.TendrilPitch;
  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };

  // ---------------- Target ranges ----------------
  // Commonly cited speaking ranges. They overlap, and no range "makes" a voice
  // read one way: resonance and intonation matter at least as much.
  const PRESETS = {
    lighter: { label: "Lighter", low: 165, high: 255 },
    between: { label: "In-between", low: 145, high: 175 },
    deeper: { label: "Deeper", low: 85, high: 155 }
  };

  const Y_MIN = 60, Y_MAX = 340;
  const LIVE_WINDOW = 12; // seconds visible while recording

  let target = T.store.get("voice.target", { preset: "lighter", low: 165, high: 255 });
  let sessionTarget = null; // set while viewing a past session
  let keepAudio = T.store.get("voice.keepAudio", true);
  let recorder = null, chunks = [];
  function activeTarget() { return sessionTarget || target; }

  // ---------------- Prompts ----------------
  const PROMPTS = [
    { kind: "Warm-up", text: "Hum gently on “mmm” for a few seconds, then let it open into “mmm-ahh”." },
    { kind: "Warm-up", text: "Do a slow siren: slide from low to high and back down, like a soft “wooo”." },
    { kind: "Sentence", text: "Could you pass me the blue mug on the top shelf?" },
    { kind: "Sentence", text: "I’m meeting a friend for coffee at half past four." },
    { kind: "Sentence", text: "The bus was late again, so I walked along the river instead." },
    { kind: "Sentence", text: "My favourite season is autumn, when the leaves turn gold." },
    { kind: "Question", text: "Have you already seen the new exhibition downtown?" },
    { kind: "Question", text: "Would you like tea, or would you rather have something cold?" },
    { kind: "Counting", text: "Count slowly from one to ten, keeping each number light and easy." },
    { kind: "Phone call", text: "Hi, I’d like to book a table for two this Friday at eight, please." },
    { kind: "Phone call", text: "Hello, I’m calling about my order. Could you check its status for me?" },
    { kind: "Free talk", text: "Describe what you had for breakfast and how you’d make it again." }
  ];
  let promptIndex = 0;

  // ---------------- State ----------------
  let points = [];          // { t: seconds, hz: number|null }
  let mode = "example";     // "example" | "live" | "recording"
  let audio = null;         // { ctx, stream, source, analyser, buf }
  let startedAt = 0;
  let rafId = 0;
  let frame = 0;
  let smooth = P.makeSmoother(5, 12);
  let gate = P.makeNoiseGate(), gateLevel = 0.006;
  const ease = window.TendrilTrace.easer(0.22);
  let heldHz = null, heldAt = 0;

  // ---------------- Elements ----------------
  const canvas = $("graph");
  const g = canvas.getContext("2d");
  const hzEl = $("hz"), noteEl = $("note"), statusEl = $("status");
  const startBtn = $("start"), stopBtn = $("stop"), fileInput = $("file");
  const timerEl = $("timer"), graphLabel = $("graph-label");
  const lowIn = $("low"), highIn = $("high");
  const notice = $("notice");

  // ---------------- Drawing ----------------
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

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

    const ink = cssVar("--muted"), line = cssVar("--line");
    const band = cssVar("--tone-band"), tone = cssVar("--tone");
    const surface = cssVar("--surface");

    g.clearRect(0, 0, w, h);
    g.fillStyle = surface;
    g.fillRect(0, 0, w, h);

    const y = function (hz) { return padT + plotH * (1 - (hz - Y_MIN) / (Y_MAX - Y_MIN)); };

    // Target band
    const tg = activeTarget();
    const lo = Math.max(Y_MIN, tg.low), hi = Math.min(Y_MAX, tg.high);
    g.fillStyle = band;
    g.fillRect(padL, y(hi), plotW, y(lo) - y(hi));

    // Grid + y labels
    g.font = "11px " + cssVar("--font-mono");
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (let hz = 100; hz <= 300; hz += 50) {
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(padL, Math.round(y(hz)) + 0.5);
      g.lineTo(w - padR, Math.round(y(hz)) + 0.5);
      g.stroke();
      g.fillStyle = ink;
      g.fillText(hz + "", padL - 8, y(hz));
    }
    g.save();
    g.translate(11, padT + plotH / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.fillText("Hz", 0, 0);
    g.restore();

    // Time window
    let t0, t1;
    const lastT = points.length ? points[points.length - 1].t : 0;
    const nowT = mode === "live" ? (performance.now() - startedAt) / 1000 : lastT;
    if (mode === "live") { t1 = Math.max(LIVE_WINDOW, nowT); t0 = t1 - LIVE_WINDOW; }
    else { t0 = 0; t1 = Math.max(lastT, 1); }
    const x = function (t) { return padL + plotW * ((t - t0) / (t1 - t0)); };

    // X labels (seconds)
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = ink;
    const span = t1 - t0;
    const step = span <= 15 ? 2 : span <= 40 ? 5 : span <= 120 ? 15 : 30;
    for (let s = Math.ceil(t0 / step) * step; s <= t1; s += step) {
      g.fillText(s + "s", x(s), h - padB + 6);
    }

    // Pitch trace in the target's color: one continuous line that follows
    // your voice and rests on the floor when you're quiet. Solid inside the
    // target band, faded outside it.
    const clampHz = function (hz) { return y(Math.max(Y_MIN, Math.min(Y_MAX, hz))); };
    const tip = window.TendrilTrace.draw(g, points, {
      key: "hz", t0: t0, x: x, y: clampHz, color: tone,
      left: padL, right: w - padR, floor: Y_MIN,
      extendTo: mode === "live" ? nowT : null,
      band: { top: y(hi), bottom: y(lo) }
    });

    // Playhead while listening back
    if (mode === "session" && playerUrl && !fixingDuration && player.currentTime > 0) {
      const px = x(Math.min(player.currentTime, t1));
      g.strokeStyle = cssVar("--deep");
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, padT);
      g.lineTo(px, padT + plotH);
      g.stroke();
    }

    // The line's leading dot, riding the line while live
    if (mode === "live" && tip) {
      const cx = x(nowT), cy = clampHz(tip.v);
      const speaking = heldHz != null;
      g.save();
      g.fillStyle = tone;
      g.globalAlpha = speaking ? 0.25 : 0.12;
      g.beginPath(); g.arc(cx, cy, speaking ? 11 : 8, 0, Math.PI * 2); g.fill();
      g.globalAlpha = speaking ? 1 : 0.6;
      g.strokeStyle = cssVar("--deep");
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, speaking ? 5.5 : 4, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
  }

  // ---------------- Readout + stats ----------------
  function setReadout(hz) {
    if (hz == null) {
      hzEl.textContent = "—";
      noteEl.textContent = "";
      statusEl.textContent = mode === "live" ? "Listening…" : "Ready";
      statusEl.dataset.state = "idle";
      return;
    }
    const tg = activeTarget();
    hzEl.textContent = Math.round(hz);
    noteEl.textContent = P.noteName(hz);
    if (hz < tg.low) { statusEl.textContent = "Below range"; statusEl.dataset.state = "low"; }
    else if (hz > tg.high) { statusEl.textContent = "Above range"; statusEl.dataset.state = "high"; }
    else { statusEl.textContent = "In range"; statusEl.dataset.state = "in"; }
  }

  function computeStats(pts) {
    const voiced = pts.filter(function (p) { return p.hz != null; }).map(function (p) { return p.hz; });
    if (voiced.length < 5) return null;
    const sorted = voiced.slice().sort(function (a, b) { return a - b; });
    const pick = function (q) { return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]; };
    const avg = voiced.reduce(function (a, b) { return a + b; }, 0) / voiced.length;
    const tg = activeTarget();
    const inRange = voiced.filter(function (hz) { return hz >= tg.low && hz <= tg.high; }).length / voiced.length;
    const span = pts.length > 1 ? pts[pts.length - 1].t / (pts.length - 1) : 0;
    // 5th and 95th percentiles ignore stray glitches.
    return { avg: avg, inRange: inRange, low: pick(0.05), high: pick(0.95), voicedSec: voiced.length * span };
  }

  function renderStats() {
    const s = computeStats(points);
    $("stat-avg").textContent = s ? Math.round(s.avg) + " Hz" : "—";
    $("stat-in").textContent = s ? Math.round(s.inRange * 100) + "%" : "—";
    $("stat-low").textContent = s ? Math.round(s.low) + " Hz" : "—";
    $("stat-high").textContent = s ? Math.round(s.high) + " Hz" : "—";
  }

  // ---------------- Example trace (shown before first use) ----------------
  function buildExample() {
    const pts = [];
    const phrases = [[0.4, 2.6, 196], [3.1, 5.2, 182], [5.8, 8.4, 205], [9.0, 11.2, 172]];
    for (let t = 0; t <= 11.8; t += 1 / 30) {
      let hz = null;
      for (const ph of phrases) {
        if (t >= ph[0] && t <= ph[1]) {
          const k = (t - ph[0]) / (ph[1] - ph[0]);
          hz = ph[2] + 22 * Math.sin(k * Math.PI * 1.6) - 18 * k + 3 * Math.sin(t * 23);
        }
      }
      pts.push({ t: t, hz: hz });
    }
    return pts;
  }

  // ---------------- Live microphone ----------------
  async function start() {
    hideNotice();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotice("This browser can’t use the microphone here. You can still analyze a recording you made with your phone’s voice memo app.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
      });
    } catch (err) {
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      showNotice(denied
        ? "Microphone access was blocked. Allow the microphone for this site in your browser settings, or analyze a recording instead."
        : "Couldn’t start the microphone (" + (err && err.name ? err.name : "unknown error") + "). Check that no other app is using it, or analyze a recording instead.");
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audio = { ctx: ctx, stream: stream, source: source, analyser: analyser, buf: new Float32Array(analyser.fftSize) };
    startRecorder(stream);

    mode = "live";
    smooth = P.makeSmoother(5, 12);
    gate = P.makeNoiseGate();
    gateLevel = 0.006;
    ease.reset();
    heldHz = null;
    leaveSession();
    $("example-chip").hidden = true;
    points = [];
    startedAt = performance.now();
    frame = 0;
    graphLabel.textContent = "Your voice, live";
    startBtn.hidden = true;
    stopBtn.hidden = false;
    setReadout(null);
    renderStats();
    loop();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    frame++;
    const t = (performance.now() - startedAt) / 1000;
    if (frame % 2 === 0) {
      // ~30 readings per second keeps phones cool; drawing runs every frame.
      const a = audio;
      a.analyser.getFloatTimeDomainData(a.buf);
      const r = P.detectPitch(a.buf, a.ctx.sampleRate, { minRms: gateLevel });
      const voiced = !!(r && r.clarity > 0.5);
      let rms = 0;
      for (let i = 0; i < a.buf.length; i += 4) rms += a.buf[i] * a.buf[i];
      gateLevel = gate.update(Math.sqrt(rms / (a.buf.length / 4)), voiced);
      const hz = smooth(voiced ? r.hz : null);
      points.push({ t: t, hz: hz });
      if (hz != null) { heldHz = hz; heldAt = t; }
      else if (t - heldAt > 0.45) heldHz = null; // keep showing the last pitch through short gaps
      timerEl.textContent = formatTime(t);
      if (frame % 20 === 0) renderStats();
    }
    const shown = ease.step(heldHz);
    setReadout(heldHz == null ? null : shown);
    draw();
  }

  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
    for (let i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return "";
  }

  function startRecorder(stream) {
    recorder = null;
    chunks = [];
    if (!keepAudio || !window.MediaRecorder) return;
    try {
      const mime = pickMime();
      const opts = { audioBitsPerSecond: 32000 };
      if (mime) opts.mimeType = mime;
      recorder = new MediaRecorder(stream, opts);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(1000); // hand over audio every second, so little is lost if the app closes
    } catch (e) {
      recorder = null;
    }
  }

  /** Stop the recorder and store its audio under the session id (or discard it). */
  function finishRecorder(entry) {
    const rec = recorder, got = chunks;
    recorder = null;
    chunks = [];
    if (!rec) return;
    const store = function () {
      if (!entry) return;
      const blob = new Blob(got, { type: rec.mimeType || "audio/webm" });
      if (!blob.size) return;
      T.blobs.put(entry.id, blob).then(function () {
        markAudio(entry.id);
        if (openId === entry.id) loadPlayer(entry.id);
      }).catch(function () { T.toast("The graph was saved, but the audio couldn’t be stored on this device"); });
    };
    if (rec.state !== "inactive") {
      rec.onstop = store;
      try { rec.stop(); } catch (e) { store(); }
    } else {
      store();
    }
  }

  function stop() {
    cancelAnimationFrame(rafId);
    const entry = saveSession("Live practice");
    finishRecorder(entry);
    if (audio) {
      audio.stream.getTracks().forEach(function (tr) { tr.stop(); });
      audio.ctx.close();
      audio = null;
    }
    startBtn.hidden = false;
    stopBtn.hidden = true;
    if (entry) {
      openSession(entry, { scroll: false });
      T.toast("Session saved");
    } else {
      mode = "recording-done";
      graphLabel.textContent = "Not saved: too short";
      setReadout(null);
      statusEl.textContent = "Stopped";
      renderStats();
      draw();
      T.toast("Too short to save. Talk for a few more seconds next time.");
    }
  }

  // ---------------- Analyze an uploaded recording ----------------
  const HOP = 1024;

  async function analyzeFile(file) {
    hideNotice();
    if (audio) stop();
    statusEl.textContent = "Analyzing…";
    statusEl.dataset.state = "idle";
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const data = await file.arrayBuffer();
      const decoded = await new Promise(function (resolve, reject) {
        const p = ctx.decodeAudioData(data, resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
      const ch = decoded.getChannelData(0);
      const sr = decoded.sampleRate;
      const size = 2048, hop = Math.round(HOP * sr / 44100);
      const sm = P.makeSmoother(5, 12);
      const ng = P.makeNoiseGate();
      let level = 0.004;
      const out = [];
      for (let i = 0; i + size < ch.length; i += hop) {
        const frameBuf = ch.subarray(i, i + size);
        const r = P.detectPitch(frameBuf, sr, { minRms: level });
        const voiced = !!(r && r.clarity > 0.5);
        let e = 0;
        for (let k = 0; k < frameBuf.length; k += 4) e += frameBuf[k] * frameBuf[k];
        level = ng.update(Math.sqrt(e / (frameBuf.length / 4)), voiced);
        out.push({ t: i / sr, hz: sm(voiced ? r.hz : null) });
      }
      ctx.close();
      mode = "recording";
      leaveSession();
      $("example-chip").hidden = true;
      points = out;
      graphLabel.textContent = "Recording: " + file.name;
      timerEl.textContent = formatTime(decoded.duration);
      const s = computeStats(points);
      setReadout(s ? s.avg : null);
      if (s) { statusEl.textContent = "Average"; statusEl.dataset.state = "idle"; }
      else showNotice("I couldn’t find enough voiced sound in that recording. Try one with clear speech and little background noise.");
      renderStats();
      draw();
      const entry = saveSession("Recording");
      if (entry) {
        if (keepAudio && file.size < 30 * 1024 * 1024) {
          T.blobs.put(entry.id, file).then(function () {
            markAudio(entry.id);
            if (openId === entry.id) loadPlayer(entry.id);
          }).catch(function () { /* graph is still saved */ });
        }
        openSession(entry, { scroll: false });
        T.toast("Recording saved");
      }
    } catch (err) {
      showNotice("That file couldn’t be read as audio. Try an .m4a, .mp3 or .wav voice memo.");
      setReadout(null);
    }
  }

  // ---------------- History ----------------
  // Each session keeps a compact copy of its pitch line: one value per time
  // step (whole Hz, 0 = silence), so it can be opened again later.
  const MAX_STEPS = 2400;

  function packTrace(pts) {
    const dur = pts.length ? pts[pts.length - 1].t : 0;
    let dt = 0.1;
    while (dur / dt > MAX_STEPS) dt *= 2;
    const n = Math.max(1, Math.ceil(dur / dt) + 1);
    const sum = new Float64Array(n), cnt = new Uint16Array(n);
    pts.forEach(function (p) {
      if (p.hz == null) return;
      const k = Math.min(n - 1, Math.round(p.t / dt));
      sum[k] += p.hz; cnt[k]++;
    });
    const hz = [];
    for (let k = 0; k < n; k++) hz.push(cnt[k] ? Math.round(sum[k] / cnt[k]) : 0);
    return { dt: dt, hz: hz };
  }

  function unpackTrace(tr) {
    return tr.hz.map(function (v, k) { return { t: k * tr.dt, hz: v ? v : null }; });
  }

  function saveSession(kind) {
    const s = computeStats(points);
    if (!s || s.voicedSec < 1) return null;
    const history = T.store.get("voice.history", []);
    const entry = {
      id: T.uid(),
      at: new Date().toISOString(),
      kind: kind,
      avg: Math.round(s.avg),
      inRange: Math.round(s.inRange * 100),
      target: [activeTarget().low, activeTarget().high],
      seconds: Math.round(points.length ? points[points.length - 1].t : 0),
      trace: packTrace(points)
    };
    history.unshift(entry);
    let trimmed = history.slice(0, 60);
    // If storage is full, drop the oldest graphs first, then the oldest sessions.
    while (!T.store.set("voice.history", trimmed) && trimmed.length > 1) {
      const withTrace = trimmed.map(function (h, i) { return h.trace ? i : -1; }).filter(function (i) { return i > 0; });
      if (withTrace.length) delete trimmed[withTrace[withTrace.length - 1]].trace;
      else trimmed = trimmed.slice(0, -1);
    }
    renderHistory();
    return entry;
  }

  function markAudio(id) {
    const history = T.store.get("voice.history", []);
    const h = history.find(function (x) { return x.id === id; });
    if (!h) return;
    h.hasAudio = true;
    T.store.set("voice.history", history);
    renderHistory();
  }

  let openId = null;

  function whenText(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function renderHistory() {
    const list = $("history");
    const history = T.store.get("voice.history", []);
    list.innerHTML = "";
    $("history-empty").hidden = history.length > 0;
    $("clear-history").hidden = history.length === 0;
    history.slice(0, 20).forEach(function (h) {
      const li = document.createElement("li");
      li.innerHTML =
        '<button type="button" class="h-open">' +
          '<span class="h-when"><strong></strong><span></span></span>' +
          '<span class="h-num"><span class="h-val"></span><span class="h-lab">average</span></span>' +
          '<span class="h-num"><span class="h-val"></span><span class="h-lab">in range</span></span>' +
          '<svg class="h-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>';
      const btn = li.querySelector(".h-open");
      if (h.id && h.id === openId) btn.setAttribute("aria-current", "true");
      if (!h.trace) btn.classList.add("no-trace");
      li.querySelector(".h-when strong").textContent = whenText(h.at);
      li.querySelector(".h-when > span").textContent = h.kind + " · " + formatTime(h.seconds);
      const vals = li.querySelectorAll(".h-val");
      vals[0].textContent = h.avg + " Hz";
      vals[1].textContent = h.inRange + "%";
      btn.setAttribute("aria-label", "Open session from " + whenText(h.at));
      btn.addEventListener("click", function () { openSession(h); });
      list.appendChild(li);
    });
  }

  function openSession(h, opts) {
    if (!h.trace) {
      T.toast("This session was saved before graphs were kept, so only its numbers exist");
      return;
    }
    if (audio) stop();
    hideNotice();
    mode = "session";
    openId = h.id;
    sessionTarget = { low: h.target[0], high: h.target[1] };
    points = unpackTrace(h.trace);
    $("example-chip").hidden = true;
    graphLabel.textContent = h.kind + ", " + whenText(h.at);
    timerEl.textContent = formatTime(h.seconds);
    const s = computeStats(points);
    setReadout(s ? s.avg : null);
    statusEl.textContent = "Average";
    statusEl.dataset.state = "idle";
    $("session-range").textContent = "Shaded zone is the range you had then: " + h.target[0] + "–" + h.target[1] + " Hz";
    $("session-range").hidden = false;
    renderStats();
    draw();
    renderHistory();
    $("player").hidden = false;
    loadPlayer(h.id);
    if (!opts || opts.scroll !== false) document.querySelector(".monitor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------- Playback ----------------
  const player = $("player-audio");
  let playerUrl = null, playRaf = 0, fixingDuration = false;

  function loadPlayer(id) {
    unloadPlayer();
    $("player-none").hidden = true;
    T.blobs.get(id).then(function (blob) {
      if (openId !== id) return;
      if (!blob) {
        player.hidden = true;
        $("player-none").hidden = false;
        $("player-none").textContent = keepAudio
          ? "No audio was saved for this session, only its graph."
          : "Audio saving is off, so only the graph was kept.";
        return;
      }
      playerUrl = URL.createObjectURL(blob);
      player.src = playerUrl;
      player.hidden = false;
      // Recordings made in Chrome don't state their length, so the player shows
      // no seek bar. Jumping far ahead once makes the browser work it out.
      player.addEventListener("loadedmetadata", function fixDuration() {
        player.removeEventListener("loadedmetadata", fixDuration);
        if (player.duration !== Infinity) return;
        fixingDuration = true;
        player.currentTime = 1e101;
        player.addEventListener("timeupdate", function back() {
          player.removeEventListener("timeupdate", back);
          player.currentTime = 0;
          fixingDuration = false;
          draw();
        });
      });
    }).catch(function () {
      player.hidden = true;
      $("player-none").hidden = false;
      $("player-none").textContent = "Audio can’t be played in this browser.";
    });
  }

  function unloadPlayer() {
    cancelAnimationFrame(playRaf);
    try { player.pause(); } catch (e) { /* ignore */ }
    player.removeAttribute("src");
    player.load();
    player.hidden = true;
    if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = null; }
  }

  function playheadLoop() {
    draw();
    if (!player.paused) playRaf = requestAnimationFrame(playheadLoop);
  }
  player.addEventListener("play", function () { cancelAnimationFrame(playRaf); playheadLoop(); });
  player.addEventListener("seeked", draw);
  player.addEventListener("pause", draw);
  player.addEventListener("ended", draw);

  const delBtn = $("delete-session");
  delBtn.addEventListener("click", function () {
    if (!delBtn.dataset.armed) {
      delBtn.dataset.armed = "1";
      delBtn.textContent = "Tap again to delete";
      delBtn.classList.add("danger");
      setTimeout(function () {
        delete delBtn.dataset.armed;
        delBtn.textContent = "Delete session";
        delBtn.classList.remove("danger");
      }, 3000);
      return;
    }
    const id = openId;
    T.store.set("voice.history", T.store.get("voice.history", []).filter(function (h) { return h.id !== id; }));
    T.blobs.del(id).catch(function () { /* nothing stored */ });
    delete delBtn.dataset.armed;
    delBtn.textContent = "Delete session";
    delBtn.classList.remove("danger");
    leaveSession();
    mode = "recording-done";
    points = [];
    graphLabel.textContent = "Session deleted";
    timerEl.textContent = "0:00";
    setReadout(null);
    renderStats();
    draw();
    T.toast("Session deleted");
  });

  function leaveSession() {
    sessionTarget = null;
    openId = null;
    unloadPlayer();
    $("player").hidden = true;
    $("session-range").hidden = true;
    renderHistory();
  }

  // ---------------- Target controls ----------------
  function applyTarget(next, save) {
    target = next;
    if (save && sessionTarget) { sessionTarget = null; $("session-range").hidden = true; }
    lowIn.value = target.low;
    highIn.value = target.high;
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.preset === target.preset ? "true" : "false");
    });
    document.documentElement.dataset.tone = toneFor(target);
    $("target-readout").textContent = target.low + "–" + target.high + " Hz (" + P.noteName(target.low) + " to " + P.noteName(target.high) + ")";
    if (save) T.store.set("voice.target", target);
    renderStats();
    draw();
  }

  // Each preset has its own color; a custom range takes the color of the
  // preset its middle is closest to.
  function toneFor(t) {
    if (t.preset !== "custom") return t.preset;
    const mid = (t.low + t.high) / 2;
    let best = "between", dist = Infinity;
    Object.keys(PRESETS).forEach(function (k) {
      const pm = (PRESETS[k].low + PRESETS[k].high) / 2;
      if (Math.abs(pm - mid) < dist) { dist = Math.abs(pm - mid); best = k; }
    });
    return best;
  }

  function onCustomInput() {
    let low = parseInt(lowIn.value, 10), high = parseInt(highIn.value, 10);
    if (!isFinite(low) || !isFinite(high)) return;
    low = Math.max(P.MIN_HZ, Math.min(400, low));
    high = Math.max(low + 5, Math.min(450, high));
    applyTarget({ preset: "custom", low: low, high: high }, true);
  }

  // ---------------- Helpers ----------------
  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function showNotice(msg) { notice.textContent = msg; notice.hidden = false; }
  function hideNotice() { notice.hidden = true; }

  function showPrompt() {
    const p = PROMPTS[promptIndex % PROMPTS.length];
    $("prompt-kind").textContent = p.kind;
    $("prompt-text").textContent = p.text;
    $("prompt-count").textContent = (promptIndex % PROMPTS.length + 1) + " of " + PROMPTS.length;
  }

  // ---------------- Wire up ----------------
  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) analyzeFile(fileInput.files[0]);
    fileInput.value = "";
  });
  document.querySelectorAll("[data-preset]").forEach(function (b) {
    b.addEventListener("click", function () {
      const p = PRESETS[b.dataset.preset];
      applyTarget({ preset: b.dataset.preset, low: p.low, high: p.high }, true);
    });
  });
  lowIn.addEventListener("change", onCustomInput);
  highIn.addEventListener("change", onCustomInput);
  $("next-prompt").addEventListener("click", function () { promptIndex++; showPrompt(); });

  const clearBtn = $("clear-history"), confirmBox = $("confirm-clear");
  clearBtn.addEventListener("click", function () { confirmBox.hidden = false; clearBtn.hidden = true; });
  $("confirm-no").addEventListener("click", function () { confirmBox.hidden = true; clearBtn.hidden = false; });
  $("confirm-yes").addEventListener("click", function () {
    T.store.get("voice.history", []).forEach(function (h) { if (h.id) T.blobs.del(h.id).catch(function () { /* none */ }); });
    T.store.remove("voice.history");
    if (openId) leaveSession();
    confirmBox.hidden = true;
    renderHistory();
  });

  const keepBox = $("keep-audio");
  keepBox.checked = keepAudio;
  keepBox.addEventListener("change", function () {
    keepAudio = keepBox.checked;
    T.store.set("voice.keepAudio", keepAudio);
  });

  // Leaving the page or switching apps mid-session saves it instead of losing it.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && audio) stop();
  });
  window.addEventListener("pagehide", function () { if (audio) stop(); });

  window.addEventListener("resize", resizeCanvas);
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", draw);
  }
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // First view: an example trace so the graph shows what it does.
  points = buildExample();
  promptIndex = Math.floor(Math.random() * PROMPTS.length);
  applyTarget(target, false);
  showPrompt();
  renderHistory();
  renderStats();
  const ex = computeStats(points);
  if (ex) { setReadout(ex.avg); statusEl.textContent = "Example"; statusEl.dataset.state = "idle"; }
  resizeCanvas();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
});
