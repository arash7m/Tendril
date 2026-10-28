/* Tendril voice games: Glide, Grow and Echo.
   Uses the pitch target from the Pitch page (tendril:voice.target).
   Scores: tendril:games.best, plays: tendril:games.plays */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };
  const canvas = $("game-canvas"), g = canvas.getContext("2d");
  const engine = window.TendrilVoiceEngine.create();

  const target = T.store.get("voice.target", { preset: "lighter", low: 165, high: 255 });
  const tone = toneFor(target);
  document.documentElement.dataset.tone = tone;

  function toneFor(t) {
    if (t.preset && t.preset !== "custom") return t.preset;
    const mid = (t.low + t.high) / 2;
    return mid > 175 ? "lighter" : mid > 140 ? "between" : "deeper";
  }
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  // Pitch scale shown in the games: a bit below and above the target range.
  const VIEW_LO = Math.max(65, target.low / 1.45), VIEW_HI = Math.min(480, target.high * 1.3);
  const L = Math.log;
  let W = 0, H = 0;
  function yOf(hz) { return H * 0.06 + (H * 0.88) * (1 - (L(hz) - L(VIEW_LO)) / (L(VIEW_HI) - L(VIEW_LO))); }
  function hzOf(y) { return Math.exp(L(VIEW_LO) + (1 - (y - H * 0.06) / (H * 0.88)) * (L(VIEW_HI) - L(VIEW_LO))); }
  function inRange(hz) { return hz != null && hz >= target.low && hz <= target.high; }
  function semis(a, b) { return 12 * Math.log2(a / b); }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------- Shared drawing ----------------
  const stars = Array.from({ length: 60 }, function (_, i) { return { x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28, s: 0.3 + Math.random() }; });
  function sky(t, speed) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0d1230");
    grad.addColorStop(1, "#070A1F");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    stars.forEach(function (s) {
      const x = ((s.x * W - t * speed * s.s * 12) % W + W) % W;
      g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + s.p);
      g.fillStyle = "#cfd6ff";
      g.beginPath(); g.arc(x, s.y * H, s.r, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
  }
  function band(alpha) {
    const top = yOf(target.high), bot = yOf(target.low);
    g.fillStyle = css("--tone-band");
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillRect(0, top, W, bot - top);
    g.globalAlpha = 1;
    g.strokeStyle = css("--tone");
    g.globalAlpha = 0.35;
    g.setLineDash([6, 8]);
    g.lineWidth = 1;
    [top, bot].forEach(function (y) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  function glowDot(x, y, r, color, on) {
    g.save();
    g.shadowColor = color;
    g.shadowBlur = on ? 22 : 8;
    g.fillStyle = color;
    g.globalAlpha = on ? 1 : 0.6;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = "#fff";
    g.globalAlpha = on ? 0.9 : 0.4;
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  function text(str, x, y, size, color, align, weight) {
    g.font = (weight || 600) + " " + size + "px " + css("--font-display");
    g.fillStyle = color || "#fff";
    g.textAlign = align || "center";
    g.textBaseline = "middle";
    g.fillText(str, x, y);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---------------- Game: Glide ----------------
  const Glide = {
    id: "glide", title: "Glide",
    intro: "Raise and lower your pitch to steer through the gaps. Hum or say “ooo” to start moving; when you’re quiet, you drift down.",
    start: function () {
      this.y = H * 0.75; this.vy = 0; this.t = 0; this.score = 0; this.lives = 3;
      this.gates = []; this.next = 1.2; this.hurt = 0; this.trail = []; this.sparks = [];
    },
    update: function (dt, hz) {
      this.t += dt;
      const speed = Math.min(230, 120 + this.score * 4) * (W / 400);
      if (hz != null) {
        const ty = yOf(hz);
        this.y += (ty - this.y) * (1 - Math.exp(-dt / 0.09));
        this.vy = 0;
      } else {
        this.vy = Math.min(this.vy + 260 * dt, 160);
        this.y = Math.min(H * 0.97, this.y + this.vy * dt);
      }
      this.y = Math.max(H * 0.03, this.y);
      this.trail.push({ x: W * 0.25, y: this.y });
      if (this.trail.length > 26) this.trail.shift();
      this.trail.forEach(function (p) { p.x -= speed * dt; });
      this.hurt = Math.max(0, this.hurt - dt);

      this.next -= dt;
      if (this.next <= 0) {
        const lo = L(target.low), hi = L(target.high);
        const gap = Math.max(H * 0.2, (yOf(target.low) - yOf(target.high)) * 0.42);
        const center = yOf(Math.exp(rand(lo + (hi - lo) * 0.15, hi - (hi - lo) * 0.15)));
        this.gates.push({ x: W + 30, c: center, gap: gap, w: 34, done: false, hit: false });
        this.next = Math.max(1.5, 2.6 - this.score * 0.04);
      }
      const px = W * 0.25, pr = 13;
      const self = this;
      this.gates.forEach(function (gt) {
        gt.x -= speed * dt;
        if (gt.done) return;
        const overlap = px + pr > gt.x - gt.w / 2 && px - pr < gt.x + gt.w / 2;
        if (overlap && !gt.hit && self.hurt <= 0) {
          if (self.y - pr < gt.c - gt.gap / 2 || self.y + pr > gt.c + gt.gap / 2) {
            gt.hit = true; self.lives--; self.hurt = 1.1;
            if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* ignore */ }
          }
        }
        if (gt.x + gt.w / 2 < px - pr) {
          gt.done = true;
          if (!gt.hit) {
            self.score++;
            for (let i = 0; i < 12; i++) self.sparks.push({ x: px, y: self.y, vx: rand(-90, 90), vy: rand(-120, 60), life: 0.7 });
          }
        }
      });
      this.gates = this.gates.filter(function (gt) { return gt.x > -60; });
      this.sparks.forEach(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * dt; s.life -= dt; });
      this.sparks = this.sparks.filter(function (s) { return s.life > 0; });
      return this.lives <= 0;
    },
    draw: function (hz) {
      sky(this.t, 4);
      band(0.55);
      const toneC = css("--tone");
      this.gates.forEach(function (gt) {
        const top = gt.c - gt.gap / 2, bot = gt.c + gt.gap / 2;
        g.fillStyle = gt.hit ? "#ff6b8a" : "#1A2050";
        g.strokeStyle = gt.hit ? "#ff6b8a" : toneC;
        g.lineWidth = 2;
        [[0, top], [bot, H]].forEach(function (seg) {
          g.beginPath();
          g.roundRect(gt.x - gt.w / 2, seg[0] - (seg[0] === 0 ? 20 : 0), gt.w, seg[1] - seg[0] + (seg[0] === 0 ? 20 : 20), 12);
          g.fill(); g.stroke();
        });
      });
      g.lineCap = "round";
      for (let i = 1; i < this.trail.length; i++) {
        g.strokeStyle = toneC;
        g.globalAlpha = i / this.trail.length * 0.5;
        g.lineWidth = 2 + 6 * i / this.trail.length;
        g.beginPath(); g.moveTo(this.trail[i - 1].x, this.trail[i - 1].y); g.lineTo(this.trail[i].x, this.trail[i].y); g.stroke();
      }
      g.globalAlpha = 1;
      this.sparks.forEach(function (s) { g.globalAlpha = s.life / 0.7; g.fillStyle = "#ffe066"; g.fillRect(s.x, s.y, 3, 3); });
      g.globalAlpha = 1;
      if (!(this.hurt > 0 && Math.floor(this.hurt * 10) % 2)) glowDot(W * 0.25, this.y, 13, toneC, hz != null);
      if (hz == null && this.t < 4) text("Hum to fly", W * 0.25 + 70, this.y, 15, "rgba(255,255,255,0.7)", "left", 500);
    },
    hud: function () { return { left: "♥".repeat(Math.max(0, this.lives)) + "♡".repeat(Math.max(0, 3 - this.lives)), score: this.score + (this.score === 1 ? " gate" : " gates") }; },
    result: function () { return { score: this.score, title: this.score ? this.score + (this.score === 1 ? " gate" : " gates") : "Nice try", text: this.score >= 10 ? "That’s smooth steering. Your voice moved all around your range." : "Each gate is somewhere in your range. Small, gentle changes in pitch steer best." }; },
    better: function (a, b) { return a > b; }
  };

  // ---------------- Game: Grow ----------------
  const GROW_TIME = 45;
  const Grow = {
    id: "grow", title: "Grow",
    intro: "Keep your voice inside your target range and your vine grows. Talk, read, hum or count; anything works as long as it stays in range. You have 45 seconds.",
    start: function () {
      this.t = 0; this.h = 0; this.inT = 0; this.voicedT = 0; this.leaves = []; this.flowers = []; this.won = false; this.wonAt = 0; this.pulse = 0; this.pitchY = null;
    },
    update: function (dt, hz) {
      this.t += dt;
      const ok = inRange(hz);
      if (hz != null) this.voicedT += dt;
      if (ok) { this.inT += dt; this.h = Math.min(1, this.h + dt / 22); this.pulse = Math.min(1, this.pulse + dt * 3); }
      else this.pulse = Math.max(0, this.pulse - dt * 2);
      if (hz != null) { const ty = yOf(hz); this.pitchY = this.pitchY == null ? ty : this.pitchY + (ty - this.pitchY) * 0.25; }
      const steps = Math.floor(this.h * 14);
      while (this.leaves.length < steps) this.leaves.push({ at: (this.leaves.length + 1) / 15, side: this.leaves.length % 2 ? 1 : -1, grow: 0 });
      this.leaves.forEach(function (l) { l.grow = Math.min(1, l.grow + dt * 2); });
      [0.25, 0.5, 0.75].forEach(function (m) {
        if (this.h >= m && !this.flowers.some(function (f) { return f.at === m; })) this.flowers.push({ at: m, grow: 0 });
      }, this);
      this.flowers.forEach(function (f) { f.grow = Math.min(1, f.grow + dt * 1.5); });
      if (this.h >= 1 && !this.won) { this.won = true; this.wonAt = this.t; }
      return this.won || this.t >= GROW_TIME;
    },
    draw: function (hz) {
      sky(this.t, 0.5);
      const ground = H * 0.94, topY = H * 0.08;
      const baseX = W * 0.5;
      const sway = Math.sin(this.t * 1.3) * 6 * (0.4 + this.pulse);
      const len = (ground - topY) * this.h;
      // ground
      g.fillStyle = "#11163A";
      g.beginPath(); g.ellipse(baseX, ground + 10, W * 0.42, 24, 0, 0, Math.PI * 2); g.fill();
      // goal line
      g.strokeStyle = "rgba(255,224,102,0.45)"; g.setLineDash([4, 6]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(W * 0.25, topY); g.lineTo(W * 0.75, topY); g.stroke(); g.setLineDash([]);
      text("Top", W * 0.75 + 20, topY, 12, "rgba(255,224,102,0.7)", "left", 500);
      // vine
      const pt = function (u) {
        const y = ground - len * u;
        return { x: baseX + Math.sin(u * 7 + 0.5) * 18 * u + sway * u, y: y };
      };
      const toneC = css("--tone");
      g.strokeStyle = this.pulse > 0.3 ? "#3DDC97" : "#2a8c66";
      g.lineWidth = 6; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const p = pt(i / 40); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.stroke();
      const hNow = this.h;
      this.leaves.forEach(function (l) {
        if (l.at > hNow) return;
        const p = pt(l.at / Math.max(hNow, 0.0001));
        g.save(); g.translate(p.x, p.y); g.rotate(l.side * -0.7); g.scale(l.grow, l.grow);
        g.fillStyle = "#3DDC97";
        g.beginPath(); g.ellipse(l.side * 14, 0, 14, 6.5, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      });
      this.flowers.forEach(function (f) {
        const p = pt(f.at / Math.max(hNow, 0.0001));
        g.save(); g.translate(p.x, p.y); g.scale(f.grow, f.grow);
        for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.fillStyle = toneC; g.beginPath(); g.ellipse(0, -9, 5, 9, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = "#ffe066"; g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
        g.restore();
      });
      const tip = pt(1);
      if (this.h > 0) glowDot(tip.x, tip.y, 6, "#3DDC97", this.pulse > 0.3);
      // pitch gauge on the right
      const gx = W - 26;
      g.fillStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.roundRect(gx - 7, H * 0.06, 14, H * 0.88, 7); g.fill();
      g.fillStyle = css("--tone-band"); g.fillRect(gx - 7, yOf(target.high), 14, yOf(target.low) - yOf(target.high));
      if (this.pitchY != null && hz != null) glowDot(gx, this.pitchY, 8, inRange(hz) ? toneC : "#9aa3c7", true);
      // hint
      let hint = "";
      if (hz == null) hint = this.t < 3 ? "Start talking or humming" : "";
      else if (hz < target.low) hint = "A little higher";
      else if (hz > target.high) hint = "A little lower";
      if (hint) text(hint, W * 0.5, H * 0.5 - 40, 16, "rgba(255,255,255,0.75)", "center", 500);
    },
    hud: function () { return { left: Math.max(0, Math.ceil(GROW_TIME - this.t)) + " s", score: Math.round(this.h * 100) + "%" }; },
    result: function () {
      const pct = this.voicedT ? Math.round(100 * this.inT / this.voicedT) : 0;
      if (this.won) return { score: Math.round(this.wonAt * 10) / 10, title: "Grown in " + this.wonAt.toFixed(1) + " s", text: "Your voice was in range " + pct + "% of the time you were speaking." };
      return { score: -Math.round(this.h * 100), title: Math.round(this.h * 100) + "% grown", text: "In range " + pct + "% of the time you were speaking. Try reading a sentence aloud in one steady, comfortable voice." };
    },
    // Lower time is better; unfinished rounds are stored as negative percentages.
    better: function (a, b) { if (a > 0 && b > 0) return a < b; if (a > 0) return true; if (b > 0) return false; return a < b; },
    bestText: function (v) { return v > 0 ? "Best: " + v + " s" : "Best: " + (-v) + "% grown"; }
  };

  // ---------------- Game: Echo ----------------
  const SHAPES = [
    { name: "Rising question", say: "Really?", f: function (u) { return -0.7 + 1.6 * u * u; } },
    { name: "Falling statement", say: "That sounds lovely.", f: function (u) { return 0.7 - 1.4 * u; } },
    { name: "Surprise", say: "Oh, wonderful!", f: function (u) { return Math.sin(Math.PI * Math.min(1, u * 1.1)) * 1.1 - 0.3; } },
    { name: "Unsure", say: "Well… maybe?", f: function (u) { return u < 0.5 ? 0.4 - 1.6 * u : -0.4 + 2 * (u - 0.5); } },
    { name: "Asking for more", say: "And then what happened?", f: function (u) { return -0.2 + 0.25 * Math.sin(u * 9) * (1 - u) + 1.1 * Math.pow(u, 3); } },
    { name: "Warm greeting", say: "Hi, how are you?", f: function (u) { return 0.5 * Math.sin(u * Math.PI * 2 + 0.6) + 0.5 * u - 0.2; } },
    { name: "Calm answer", say: "Yes, I think so.", f: function (u) { return 0.4 - 0.9 * u + 0.25 * Math.sin(u * Math.PI); } }
  ];
  const ROUNDS = 5, SWEEP = 2.6, PREVIEW = 2.2;
  const Echo = {
    id: "echo", title: "Echo",
    intro: "A phrase and its melody appear. When the marker starts moving, say the phrase and follow the shape with your voice. It doesn’t matter how high you start; what counts is the shape. Five rounds.",
    start: function () {
      this.round = 0; this.scores = []; this.order = SHAPES.slice().sort(function () { return Math.random() - 0.5; }).slice(0, ROUNDS);
      this.nextRound();
    },
    nextRound: function () {
      this.phase = "preview"; this.pt = 0; this.trace = []; this.last = null;
      this.shape = this.order[this.round];
      const c = Math.sqrt(target.low * target.high);
      this.center = c;
      this.amp = Math.min(5, Math.max(3, semis(target.high, target.low) / 2)); // semitones
    },
    targetHz: function (u) { return this.center * Math.pow(2, (this.shape.f(u) * this.amp) / 12); },
    update: function (dt, hz) {
      this.pt += dt;
      if (this.phase === "preview" && this.pt >= PREVIEW) { this.phase = "sweep"; this.pt = 0; }
      else if (this.phase === "sweep") {
        const u = this.pt / SWEEP;
        if (u <= 1) this.trace.push({ u: u, hz: hz });
        if (u >= 1.08) {
          this.last = this.scoreRound();
          this.scores.push(this.last);
          this.phase = "done"; this.pt = 0;
        }
      } else if (this.phase === "done" && this.pt >= 1.8) {
        this.round++;
        if (this.round >= ROUNDS) return true;
        this.nextRound();
      }
      return false;
    },
    scoreRound: function () {
      const self = this;
      const voiced = this.trace.filter(function (p) { return p.hz != null; });
      if (voiced.length < 5) return 0;
      // Compare the shape: remove the overall offset between your voice and the guide.
      const diffs = voiced.map(function (p) { return semis(p.hz, self.targetHz(p.u)); }).sort(function (a, b) { return a - b; });
      const offset = diffs[Math.floor(diffs.length / 2)];
      const close = voiced.filter(function (p) { return Math.abs(semis(p.hz, self.targetHz(p.u)) - offset) <= 2; }).length;
      const coverage = Math.min(1, voiced.length / (this.trace.length * 0.6));
      return Math.round(100 * (close / voiced.length) * coverage);
    },
    draw: function (hz) {
      sky(this.pt, 0.3);
      band(0.25);
      const x0 = W * 0.08, x1 = W * 0.92;
      const X = function (u) { return x0 + (x1 - x0) * u; };
      const self = this;
      // phrase
      text(this.shape.say, W / 2, H * 0.12, Math.min(30, W / 14), "#fff", "center", 600);
      text(this.shape.name, W / 2, H * 0.12 + 26, 13, "rgba(255,255,255,0.6)", "center", 500);
      // guide ribbon (tolerance) and center line
      const toneC = css("--tone");
      g.lineCap = "round"; g.lineJoin = "round";
      const ribbon = Math.abs(yOf(this.center * Math.pow(2, 2 / 12)) - yOf(this.center)) * 2;
      g.strokeStyle = toneC; g.globalAlpha = 0.18; g.lineWidth = ribbon;
      g.beginPath();
      for (let i = 0; i <= 60; i++) { const u = i / 60, p = [X(u), yOf(this.targetHz(u))]; if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
      g.globalAlpha = 0.9; g.lineWidth = 3; g.setLineDash([2, 8]);
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // your trace, shifted by your offset so the shape lines up
      if (this.trace.length) {
        const pts = this.trace.filter(function (p) { return p.hz != null; });
        let off = 0;
        if (pts.length > 4) {
          const d = pts.map(function (p) { return semis(p.hz, self.targetHz(p.u)); }).sort(function (a, b) { return a - b; });
          off = d[Math.floor(d.length / 2)];
        }
        g.strokeStyle = "#ffffff"; g.lineWidth = 4;
        let prev = null;
        this.trace.forEach(function (p) {
          if (p.hz == null) { prev = null; return; }
          const y = yOf(p.hz / Math.pow(2, off / 12));
          if (prev) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(X(p.u), y); g.stroke(); }
          prev = [X(p.u), y];
        });
      }
      // marker
      if (this.phase === "preview") {
        const n = Math.ceil(PREVIEW - this.pt);
        text(n > 0 ? String(n) : "", X(0), yOf(this.targetHz(0)) - 34, 26, "#ffe066");
        glowDot(X(0), yOf(this.targetHz(0)), 8, "#ffe066", false);
        text("Get ready…", W / 2, H * 0.9, 15, "rgba(255,255,255,0.7)", "center", 500);
      } else if (this.phase === "sweep") {
        const u = Math.min(1, this.pt / SWEEP);
        g.strokeStyle = "rgba(255,224,102,0.6)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(X(u), H * 0.2); g.lineTo(X(u), H * 0.96); g.stroke();
        glowDot(X(u), yOf(this.targetHz(u)), 9, "#ffe066", true);
        text("Say it now", W / 2, H * 0.9, 15, "#ffe066", "center", 600);
      } else if (this.phase === "done") {
        const sc = this.last;
        const stars = sc >= 80 ? 3 : sc >= 60 ? 2 : sc >= 35 ? 1 : 0;
        text("★".repeat(stars) + "☆".repeat(3 - stars), W / 2, H * 0.9, 26, "#ffe066");
        text(sc + "% match", W / 2, H * 0.9 - 32, 15, "#fff", "center", 600);
      }
    },
    hud: function () { return { left: "Round " + Math.min(ROUNDS, this.round + 1) + " of " + ROUNDS, score: this.scores.length ? Math.round(this.scores.reduce(function (a, b) { return a + b; }, 0) / this.scores.length) + "%" : "" }; },
    result: function () {
      const avg = Math.round(this.scores.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, this.scores.length));
      const stars = this.scores.map(function (sc) { return sc >= 80 ? 3 : sc >= 60 ? 2 : sc >= 35 ? 1 : 0; }).reduce(function (a, b) { return a + b; }, 0);
      return { score: avg, stars: stars, title: avg + "% match", text: stars + " of " + (ROUNDS * 3) + " stars. Questions rise, statements settle down; exaggerating the shape a little often helps." };
    },
    better: function (a, b) { return a > b; }
  };

  const GAMES = { glide: Glide, grow: Grow, echo: Echo };

  // ---------------- Flow ----------------
  let game = null, state = "menu", raf = 0, lastT = 0;

  function best() { return T.store.get("games.best", {}); }
  function bestText(gm, v) { if (v == null) return ""; return gm.bestText ? gm.bestText(v) : gm.id === "echo" ? "Best: " + v + "% match" : "Best: " + v + (v === 1 ? " gate" : " gates"); }

  function renderMenu() {
    const b = best();
    document.querySelectorAll("[data-best]").forEach(function (el) {
      const gm = GAMES[el.dataset.best];
      el.textContent = bestText(gm, b[gm.id]);
      el.hidden = b[gm.id] == null;
    });
    $("game-range").textContent = "Your target range: " + target.low + "–" + target.high + " Hz. Change it on the Pitch page.";
  }

  function overlay(title, txt, playLabel, stars) {
    $("go-title").textContent = title;
    $("go-text").textContent = txt;
    $("go-play").textContent = playLabel;
    $("go-stars").hidden = stars == null;
    if (stars != null) $("go-stars").textContent = "★".repeat(stars);
    $("game-overlay").hidden = false;
  }

  function openGame(id) {
    game = GAMES[id];
    state = "intro";
    $("game-menu").hidden = true;
    $("game-stage").hidden = false;
    $("hud-title").textContent = game.title;
    $("hud-left").textContent = "";
    $("hud-score").textContent = "";
    $("game-notice").hidden = true;
    resize();
    game.start();
    drawFrame(null);
    overlay(game.title, game.intro, "Start", null);
    $("game-stage").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function play() {
    $("game-notice").hidden = true;
    if (!engine.running()) {
      try { await engine.start(); }
      catch (e) {
        $("game-notice").textContent = e && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow the microphone for Tendril in your browser settings."
          : "The microphone couldn’t start. Check that no other app is using it.";
        $("game-notice").hidden = false;
        return;
      }
    }
    resize();
    game.start();
    state = "playing";
    $("game-overlay").hidden = true;
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function drawFrame(hz) {
    g.clearRect(0, 0, W, H);
    game.draw(hz);
    const h = game.hud();
    $("hud-left").textContent = h.left;
    $("hud-score").textContent = h.score;
  }

  function loop(now) {
    if (state !== "playing") return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const hz = engine.poll();
    const over = game.update(dt, hz);
    drawFrame(hz);
    if (over) finish();
  }

  function finish() {
    state = "over";
    cancelAnimationFrame(raf);
    const r = game.result();
    const b = best();
    const isBest = b[game.id] == null || game.better(r.score, b[game.id]);
    if (isBest) { b[game.id] = r.score; T.store.set("games.best", b); }
    const plays = T.store.get("games.plays", []);
    plays.unshift({ at: new Date().toISOString(), game: game.id, score: r.score });
    T.store.set("games.plays", plays.slice(0, 200));
    overlay(r.title + (isBest ? " · New best!" : ""), r.text, "Play again", r.stars != null ? r.stars : null);
  }

  function toMenu() {
    state = "menu";
    cancelAnimationFrame(raf);
    engine.stop();
    $("game-stage").hidden = true;
    $("game-menu").hidden = false;
    renderMenu();
  }

  document.querySelectorAll("[data-game]").forEach(function (b) { b.addEventListener("click", function () { openGame(b.dataset.game); }); });
  $("go-play").addEventListener("click", play);
  $("go-menu").addEventListener("click", toMenu);
  $("game-back").addEventListener("click", toMenu);
  window.addEventListener("resize", function () { if (game && state !== "menu") { resize(); if (state !== "playing") drawFrame(null); } });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && state === "playing") {
      state = "paused";
      cancelAnimationFrame(raf);
      engine.stop();
      overlay("Paused", "The game stopped when you left the app. Start a new round when you’re ready.", "Play again", null);
    }
  });

  renderMenu();

  // Opened with a game in the link, e.g. games.html#glide from the warm-up
  const fromHash = location.hash.slice(1);
  if (GAMES[fromHash]) { history.replaceState(null, "", location.pathname); openGame(fromHash); }
});
